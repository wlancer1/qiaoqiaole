/**
 * Local identity guard for split-image work.  Split previews do not belong in
 * Redux: they hold ImageData and can be invalidated by navigation at any
 * point.  A completion is usable only for the exact image and route that
 * started it.
 */
export function createSplitAsyncScope() {
  let sequence = 0;
  let imageIdentity: unknown;
  let routeScope = '';

  return {
    begin(nextImageIdentity: unknown, nextRouteScope: string) {
      sequence += 1;
      imageIdentity = nextImageIdentity;
      routeScope = nextRouteScope;
      return sequence;
    },
    leave(nextRouteScope: string) {
      sequence += 1;
      routeScope = nextRouteScope;
    },
    isCurrent(job: number, expectedImageIdentity: unknown, expectedRouteScope: string) {
      return sequence === job && imageIdentity === expectedImageIdentity && routeScope === expectedRouteScope;
    },
  };
}
