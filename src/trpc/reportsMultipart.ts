import type { NextFunction, Request, RequestHandler, Response } from "express";

/**
 * Express plumbing that lets tRPC procedures take `multipart/form-data` (FormData) input, used by
 * the report upload procedures.
 *
 * - express-fileupload is mounted globally and would consume multipart bodies before tRPC sees
 *   them, so it is skipped for /trpc.
 * - express.json() sets `req.body = {}` on every request it doesn't parse. tRPC's Express adapter
 *   uses `req.body` when it is present instead of reading the stream, so it is removed for
 *   multipart requests to /trpc and tRPC parses the FormData itself.
 */

/** Upload size limit for tRPC multipart requests, same as the REST file upload limit */
export const TRPC_MAX_BODY_SIZE = 10 * 1024 * 1024;

const isTrpcPath = (path: string) => path === "/trpc" || path.startsWith("/trpc/");

/** Wraps an app-level middleware so it doesn't run for /trpc requests */
export const skipForTrpc =
  (middleware: RequestHandler): RequestHandler =>
  (req, res, next) =>
    isTrpcPath(req.path) ? next() : middleware(req, res, next);

/** Mount before the tRPC middleware */
export const passMultipartBodyToTrpc = (req: Request, _res: Response, next: NextFunction) => {
  if (req.is("multipart/form-data")) delete req.body;
  next();
};
