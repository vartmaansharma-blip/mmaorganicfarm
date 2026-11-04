// Explicit test-process preload only. Production code has no fake provider mode.
const actual = globalThis.fetch;
globalThis.fetch = async (input, options) => {
  const url =
    typeof input === "string"
      ? input
      : input instanceof URL
        ? input.href
        : input.url;
  if (url === "https://routes.googleapis.com/directions/v2:computeRoutes") {
    const request = JSON.parse(options.body);
    const count = request.intermediates.length;
    return Response.json({
      routes: [
        {
          duration: request.optimizeWaypointOrder ? "600s" : "900s",
          distanceMeters: request.optimizeWaypointOrder ? 3000 : 4000,
          optimizedIntermediateWaypointIndex: Array.from(
            { length: count },
            (_, i) => count - i - 1,
          ),
          legs: Array.from({ length: count + 1 }, () => ({ duration: "150s" })),
        },
      ],
    });
  }
  return actual(input, options);
};
