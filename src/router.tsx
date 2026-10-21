import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

// Singleton QueryClient — do NOT recreate per router instance.
// In SSR, create a fresh one per request via `createRequestScopedQueryClient()`.
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Consider data fresh for 30 seconds before re-fetching on window focus.
      staleTime: 1000 * 30,
      // Cache time — how long to keep unused data in memory (5 minutes).
      gcTime: 1000 * 60 * 5,
      // Do not retry aggressively; simple network errors are usually transient.
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

export const getRouter = () => {
  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    // Allow stale data for 30s after preload; 0 means always revalidate.
    defaultPreloadStaleTime: 1000 * 30,
  });

  return router;
};

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
