import { QueryClient } from "@tanstack/react-query";

export const serviceHealthQueryKey = ["service-health"] as const;

export function createAppQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      mutations: {
        retry: false,
      },
      queries: {
        gcTime: 5 * 60_000,
        refetchOnWindowFocus: false,
        retry: false,
        staleTime: 15_000,
      },
    },
  });
}
