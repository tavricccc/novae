import { FACILITY_BUCKET_STATUSES } from "@/constants/statuses";
import { getOperationPolicy } from "@/lib/operation-policies";
import type { FacilitySortOption, FacilityStatus, IssueSortOption, IssueStatusBucket } from "@/types";

type SearchParams = Pick<URLSearchParams, "get">;

export function normalizeFeedQuery(value: string) {
  return value.trim().slice(0, getOperationPolicy("searchLength"));
}

export function readIssueFeedFilters(params: SearchParams) {
  const bucket: IssueStatusBucket = params.get("bucket") === "closed" ? "closed" : "active";
  const requestedSort = params.get("sort");
  const sort: IssueSortOption = requestedSort === "most-supported" || requestedSort === "ending-soon"
    ? requestedSort : "latest";
  return { bucket, sort };
}

export function readFacilityFeedFilters(params: SearchParams) {
  const bucket: IssueStatusBucket = params.get("bucket") === "closed" ? "closed" : "active";
  const sort: FacilitySortOption = params.get("sort") === "most-affected" ? "most-affected" : "latest";
  const requestedStatus = params.get("status") as FacilityStatus;
  const status: FacilityStatus | "" = FACILITY_BUCKET_STATUSES[bucket].includes(requestedStatus) ? requestedStatus : "";
  return { bucket, sort, status };
}

/** Patch only owned fields, retaining campaign/deep-link parameters and fragments. */
export function updateFeedUrl(href: string, values: Record<string, string | null>) {
  const url = new URL(href);
  for (const [key, value] of Object.entries(values)) {
    if (value) url.searchParams.set(key, value);
    else url.searchParams.delete(key);
  }
  return `${url.pathname}${url.search}${url.hash}`;
}
