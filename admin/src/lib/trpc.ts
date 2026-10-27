import type { AppRouter } from "@effekt/api";
import { QueryClient } from "@tanstack/react-query";
import {
  createTRPCClient,
  httpBatchLink,
  httpLink,
  isNonJsonSerializable,
  splitLink,
  TRPCClientError,
} from "@trpc/client";
import { createTRPCContext } from "@trpc/tanstack-react-query";
import type { inferRouterInputs, inferRouterOutputs } from "@trpc/server";
import { config } from "./config";

export type { AppRouter };
export type RouterInputs = inferRouterInputs<AppRouter>;
export type RouterOutputs = inferRouterOutputs<AppRouter>;

export const { TRPCProvider, useTRPC, useTRPCClient } = createTRPCContext<AppRouter>();

export function createApiClient(getAccessToken: () => Promise<string | null>) {
  const url = `${config.apiUrl}/trpc`;
  async function headers() {
    const token = await getAccessToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
  }
  return createTRPCClient<AppRouter>({
    links: [
      // File uploads (FormData) can't be batched; everything else is.
      splitLink({
        condition: (op) => isNonJsonSerializable(op.input),
        true: httpLink({ url, headers }),
        false: httpBatchLink({ url, headers }),
      }),
    ],
  });
}

export function errorCode(error: unknown): string | undefined {
  return error instanceof TRPCClientError
    ? (error.data as { code?: string } | undefined)?.code
    : undefined;
}

/** Per-field server validation messages (`error.data.fieldErrors`), keyed by input field. */
export function fieldErrors(error: unknown): Record<string, string[] | undefined> {
  return error instanceof TRPCClientError
    ? (error.data as { fieldErrors?: Record<string, string[]> } | undefined)?.fieldErrors ?? {}
    : {};
}

const noRetryCodes = new Set(["UNAUTHORIZED", "FORBIDDEN", "NOT_FOUND", "BAD_REQUEST"]);

export function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        refetchOnWindowFocus: false,
        retry: (failureCount, error) => {
          const code = errorCode(error);
          return !(code && noRetryCodes.has(code)) && failureCount < 2;
        },
      },
    },
  });
}
