import { MutationCache, QueryCache, QueryClient } from "@tanstack/react-query";
import { classifyError, shouldAutoRetry } from "@/lib/errors/classify";
import { notifyError } from "@/lib/errors/notify";

/**
 * Failure handling shared by every query and mutation:
 *  - transient failures (network, server, database) are retried twice, everything else at once: a 403 or a 400
 *    must not keep a skeleton on screen while it is "retried";
 *  - `networkMode: "always"` so an offline browser fails visibly instead of pausing forever behind a spinner;
 *  - a mutation that fails is always reported (a toast by kind of failure) unless the caller handles it itself with
 *    its own `onError`;
 *  - a refresh that fails behind data already on screen is reported with a toast; an initial load that fails is
 *    shown by the screen that asked for it (ErrorState / InlineError; `npm run check:states` makes sure it does);
 *  - an expired session is announced once, whatever asked, with a Sign in button.
 */
export function createQueryClient() {
  return new QueryClient({
    queryCache: new QueryCache({
      onError: (error, query) => {
        if (classifyError(error).kind === "unauthenticated" || query.state.data !== undefined) notifyError(error);
      },
    }),
    mutationCache: new MutationCache({
      onError: (error, _variables, _context, mutation) => {
        if (!mutation.options.onError) notifyError(error);
        else if (classifyError(error).kind === "unauthenticated") notifyError(error);
      },
    }),
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        refetchOnWindowFocus: false,
        networkMode: "always",
        retry: shouldAutoRetry,
      },
      mutations: { networkMode: "always", retry: false },
    },
  });
}
