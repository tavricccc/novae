export type NavigationOrigin = 'notifications';

type HierarchyRoute = {
  meta: {
    navigationDepth?: number;
  };
  name?: string | symbol | null;
  params: Record<string, unknown>;
};

const ROOT_NAVIGATION_DEPTH = 0;
const CHILD_NAVIGATION_DEPTH = 1;
const NESTED_DETAIL_NAVIGATION_DEPTH = 2;
export const NOTIFICATION_NAVIGATION_STATE = { navigationOrigin: 'notifications' as const };

function routeName(route: HierarchyRoute) {
  return typeof route.name === 'string' ? route.name : '';
}

function routeParam(route: HierarchyRoute, key: string) {
  const value = route.params[key];
  return Array.isArray(value) ? value[0] : value;
}

export function getRouteNavigationDepth(route: HierarchyRoute) {
  const name = routeName(route);
  const isMyProposals = routeParam(route, 'filter') === 'my-proposals';

  if (name === 'issue-detail' && isMyProposals) return NESTED_DETAIL_NAVIGATION_DEPTH;
  if (name === 'issues' && isMyProposals) return CHILD_NAVIGATION_DEPTH;
  return route.meta.navigationDepth ?? ROOT_NAVIGATION_DEPTH;
}

export function returnToNavigationOrigin(router: { back(): void }) {
  if (typeof window === 'undefined') return false;
  const state = window.history.state as { navigationOrigin?: NavigationOrigin } | null;
  if (state?.navigationOrigin !== 'notifications') return false;

  router.back();
  return true;
}
