import { TRPCError } from "@trpc/server";

// MySQL errors that mean the input was bad, not that the server failed
const mysqlInputErrors: Record<number, { code: TRPCError["code"]; message: string }> = {
  1048: { code: "BAD_REQUEST", message: "A required value is missing" },
  1062: { code: "CONFLICT", message: "A record with this value already exists" },
  1264: { code: "BAD_REQUEST", message: "A value is out of range" },
  1366: { code: "BAD_REQUEST", message: "A value has the wrong format" },
  1406: { code: "BAD_REQUEST", message: "A value is too long" },
  1451: { code: "CONFLICT", message: "The record is still referenced by other records" },
  1452: { code: "BAD_REQUEST", message: "A referenced record does not exist" },
};

const findMysqlErrno = (error: unknown): number | undefined => {
  for (let current = error, depth = 0; current && depth < 5; depth++) {
    const errno = (current as { errno?: unknown }).errno;
    if (typeof errno === "number") return errno;
    current = (current as { cause?: unknown }).cause;
  }
  return undefined;
};

export const toInputError = (error: unknown): TRPCError | undefined => {
  const errno = findMysqlErrno(error);
  const mapped = errno !== undefined ? mysqlInputErrors[errno] : undefined;
  return mapped && new TRPCError({ ...mapped, cause: error });
};
