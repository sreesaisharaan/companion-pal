import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PropsWithChildren, useState } from 'react';

export function AppQueryProvider({ children }: PropsWithChildren) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            gcTime: 10 * 60_000,
            // Queries pause while offline (networkMode: 'online') and silently
            // refetch on reconnect — the day's data catches up without an
            // error wall, and completions retry once before surfacing.
            networkMode: 'online',
            refetchOnReconnect: true,
            refetchOnWindowFocus: true,
            retry: 1,
          },
          // Mutations (task complete, save transaction…) also pause while
          // offline and retry once on reconnect, so a drop mid-write doesn't
          // immediately surface an error and the user isn't double-submitting.
          mutations: {
            networkMode: 'online',
            retry: 1,
          },
        },
      }),
  );

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
