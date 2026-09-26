"use client";

import { useCallback, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { normalizeFeedQuery, updateFeedUrl } from "@/lib/feed-url-state";

export function useFeedUrlState() {
  const params = useSearchParams();
  const pathname = usePathname();
  const committedQuery = normalizeFeedQuery(params.get("q") ?? "");
  const identity = `${pathname}?${params.toString()}`;
  const [input, setInput] = useState({ identity, value: committedQuery });
  // URL navigation discards unapplied input; going Back must restore the shared query.
  if (input.identity !== identity) setInput({ identity, value: committedQuery });
  const query = input.identity === identity ? input.value : committedQuery;

  const updateParams = useCallback((values: Record<string, string | null>) => {
    const href = updateFeedUrl(window.location.href, values);
    const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    if (href !== current) window.history.pushState(null, "", href);
  }, []);

  return {
    params, committedQuery, query, updateParams,
    setQuery: (value: string) => setInput({ identity, value }),
    setCommittedQuery: (value: string) => {
      const normalized = normalizeFeedQuery(value);
      setInput({ identity, value: normalized });
      updateParams({ q: normalized || null });
    },
  };
}
