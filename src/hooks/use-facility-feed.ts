"use client";

import * as React from "react";
import { toast } from "sonner";
import { useI18n } from "@/i18n";
import { useSession } from "@/hooks/use-session";
import {
  findFacilityCategory,
  getDefaultFacilityCategoryId,
  useCategories,
} from "@/hooks/use-categories";
import { listFacilities, toggleFacilityAffected } from "@/services/facilities";
import type {
  FacilityCursor,
  FacilitySortOption,
  FacilityStatus,
  FacilitySummary,
} from "@/types";
import {
  beginContentEntityRead,
  getContentEntity,
  mergeContentEntityRead,
  patchContentEntity,
} from "@/lib/content-entity-store";
import { canContinuePage, mergePageById } from "@/lib/pagination";
import { usePagedRequestGuard } from "@/hooks/use-paged-request-guard";
import { useFeedUrlState } from "@/hooks/use-feed-url-state";
import { readFacilityFeedFilters } from "@/lib/feed-url-state";
import { useContentEntityDomainVersion } from "@/hooks/use-content-entity";
import { useContentInvalidationRefresh } from "@/hooks/use-content-invalidation-refresh";
import { getViewMemory, setViewMemory } from "@/lib/view-memory-cache";
import { useColdDataReveal } from "@/hooks/use-cold-data-reveal";
import { toggleReactionState } from "@/lib/reaction-state";
import { advanceFeedPageCount, canLoadAnotherFeedPage } from "@/lib/feed-page-limit";
import { toFacilityStatusCounts, type FacilityStatusCounts } from "@/constants/statuses";

const FACILITY_LIST_CACHE_PREFIXES = ["facility-list-page|"] as const;

interface FacilityFeed {
  cursor: FacilityCursor | null;
  facilities: FacilitySummary[];
  hasMore: boolean;
  pageCount: number;
  statusCounts: FacilityStatusCounts;
}

interface FacilityFeedViewMemory {
  bucket: "active" | "closed";
  category: string;
  committedQuery: string;
  feed: FacilityFeed;
  query: string;
  sort: FacilitySortOption;
  status: FacilityStatus | "";
}

export function useFacilityFeed() {
  const { params: searchParams, committedQuery, query, setCommittedQuery, setQuery, updateParams } = useFeedUrlState();
  const { bucket, sort, status } = readFacilityFeedFilters(searchParams);
  const categories = useCategories();
  const session = useSession();
  const { t } = useI18n();
  const requestedCategory = searchParams.get("category");
  const category = requestedCategory && findFacilityCategory(requestedCategory)
    ? requestedCategory : getDefaultFacilityCategoryId();
  const remembered = getViewMemory<FacilityFeedViewMemory>(
    session.user?.uid,
    "facility-feed",
  );
  const viewMemory = remembered?.bucket === bucket && remembered.category === category
    && remembered.sort === sort && remembered.status === status
    && remembered.committedQuery === committedQuery ? remembered : null;
  const [coldRead] = React.useState(() => !viewMemory);
  const [feed, setFeed] = React.useState<FacilityFeed>({
    cursor: viewMemory?.feed.cursor ?? null,
    facilities: viewMemory?.feed.facilities ?? [],
    hasMore: viewMemory?.feed.hasMore ?? false,
    pageCount: viewMemory?.feed.pageCount ?? (viewMemory?.feed.facilities.length ? 1 : 0),
    statusCounts: viewMemory?.feed.statusCounts ?? toFacilityStatusCounts({}),
  });
  const [loading, setLoading] = React.useState(!viewMemory);
  const revealFields = useColdDataReveal(coldRead, loading);
  const [loadingMore, setLoadingMore] = React.useState(false);
  const [error, setError] = React.useState("");
  const [affectingId, setAffectingId] = React.useState<string | null>(null);
  const affectingRef = React.useRef<string | null>(null);
  const [affectBurstById, setAffectBurstById] = React.useState<Record<string, number>>({});
  const requestGuard = usePagedRequestGuard();
  const entityVersion = useContentEntityDomainVersion(session.user?.uid, "facility");
  const queryKey = [
    session.user?.uid ?? "",
    category,
    bucket,
    sort,
    status,
    committedQuery,
  ].join("|");

  async function toggleAffected(facilityId: string) {
    if (affectingRef.current) return;
    const facility =
      getContentEntity<FacilitySummary>(
        session.user?.uid,
        "facility",
        facilityId,
      ) ?? feed.facilities.find((item) => item.id === facilityId);
    if (!facility) return;
    const previous = {
      active: facility.currentUserAffected,
      count: facility.affected_count,
    };
    const optimistic = toggleReactionState(previous);
    affectingRef.current = facilityId;
    setAffectingId(facilityId);
    patchContentEntity<FacilitySummary>(
      session.user?.uid,
      "facility",
      facilityId,
      {
        affected_count: optimistic.count,
        currentUserAffected: optimistic.active,
      },
    );
    if (optimistic.active) {
      setAffectBurstById((current) => ({
        ...current,
        [facilityId]: (current[facilityId] ?? 0) + 1,
      }));
    }
    try {
      const result = await toggleFacilityAffected(facilityId);
      patchContentEntity<FacilitySummary>(
        session.user?.uid,
        "facility",
        facilityId,
        {
          affected_count: result.affected_count,
          currentUserAffected: result.affected,
        },
      );
    } catch (caught) {
      patchContentEntity<FacilitySummary>(
        session.user?.uid,
        "facility",
        facilityId,
        {
          affected_count: previous.count,
          currentUserAffected: previous.active,
        },
      );
      toast.error(caught instanceof Error ? caught.message : t("ui.facility.affectedFailed"));
    } finally {
      affectingRef.current = null;
      setAffectingId(null);
    }
  }

  const load = React.useCallback(
    async (cursor: FacilityCursor | null = null, restart = false) => {
      if (!category) return;
      if (restart) requestGuard.restart(queryKey);
      const requestToken = requestGuard.begin(queryKey);
      if (!requestToken) return;
      const entityReadRevision = beginContentEntityRead();
      cursor ? setLoadingMore(true) : setLoading(true);
      setError("");
      try {
        const result = await listFacilities({
          bucket,
          categoryId: category,
          cursor,
          query: committedQuery,
          sort,
          status,
        });
        if (!requestGuard.isCurrent(requestToken)) return;
        const facilities = result.facilities.map((facility) =>
          mergeContentEntityRead(
            session.user?.uid,
            "facility",
            facility,
            entityReadRevision,
            "summary",
          ),
        );
        setFeed((current) => {
          const pageCount = advanceFeedPageCount(current.pageCount, Boolean(cursor));
          return {
            ...result,
            hasMore: canLoadAnotherFeedPage(
              pageCount,
              canContinuePage(cursor, result.cursor, result.hasMore),
            ),
            facilities: cursor
              ? mergePageById(current.facilities, facilities)
              : facilities,
            pageCount,
            // The counts describe the whole category; a later page never carries them.
            statusCounts: cursor ? current.statusCounts : result.statusCounts,
          };
        });
      } catch (caught) {
        if (requestGuard.isCurrent(requestToken))
          setError(caught instanceof Error ? caught.message : t("ui.common.loadFailed"));
      } finally {
        if (requestGuard.finish(requestToken)) {
          setLoading(false);
          setLoadingMore(false);
        }
      }
    },
    [
      bucket,
      category,
      committedQuery,
      queryKey,
      requestGuard,
      session.user?.uid,
      sort,
      status,
      t,
    ],
  );

  React.useEffect(() => {
    void load();
  }, [load]);

  React.useEffect(() => {
    if (loading) return;
    setViewMemory<FacilityFeedViewMemory>(
      session.user?.uid,
      "facility-feed",
      {
        bucket,
        category,
        committedQuery,
        feed,
        query,
        sort,
        status,
      },
      FACILITY_LIST_CACHE_PREFIXES,
    );
  }, [bucket, category, committedQuery, feed, loading, query, session.user?.uid, sort, status]);

  useContentInvalidationRefresh(FACILITY_LIST_CACHE_PREFIXES, () => load(null, true));

  const synchronizedFeed = {
    ...feed,
    facilities: feed.facilities.map(
      (facility) =>
        getContentEntity<FacilitySummary>(
          session.user?.uid,
          "facility",
          facility.id,
        ) ?? facility,
    ).filter((facility) => !facility.deleting),
  };
  void entityVersion;

  return {
    bucket,
    affectBurstById,
    affectingId,
    categories: categories.activeFacilityCategories,
    category,
    changeCategory: (value: string) => {
      if (findFacilityCategory(value)) updateParams({ category: value });
    },
    committedQuery,
    error,
    feed: synchronizedFeed,
    load,
    loading,
    loadingMore,
    query,
    revealFields,
    setBucket: (value: "active" | "closed") => updateParams({ bucket: value === "active" ? null : value, status: null }),
    setCommittedQuery,
    setQuery,
    setSort: (value: FacilitySortOption) => updateParams({ sort: value === "latest" ? null : value }),
    setStatus: (value: FacilityStatus | "") => updateParams({ status: value || null }),
    sort,
    toggleAffected,
  };
}
