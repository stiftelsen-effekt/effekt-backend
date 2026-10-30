// Runtime schemas shared with the backend. The source is in the backend so its build (rootDir src)
// keeps working; that file may only import zod.
export * from "../../src/trpc/shared/minside";
