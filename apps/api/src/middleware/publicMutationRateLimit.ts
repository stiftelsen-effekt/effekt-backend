import rateLimit from "express-rate-limit";
import type { RequestHandler } from "express";

/**
 * A stricter per-IP limit for the public mutations that need no login: the widget's tRPC
 * mutations (widget.registerDonation, the agreement drafts, the bank transfer email, the referral
 * answer) and the public REST donation routes. One donation through the widget makes a handful of
 * these calls (register, a draft or bank email, a few referral clicks), so 60 per 15 minutes
 * leaves room for retries and a few donors behind one address, while keeping scripted use slow.
 * PUBLIC_MUTATION_RATE_LIMIT overrides the 60 (e.g. for load tests).
 */
export const PUBLIC_MUTATION_WINDOW_MS = 15 * 60 * 1000;
export const PUBLIC_MUTATION_MAX = Number(process.env.PUBLIC_MUTATION_RATE_LIMIT) || 60;

export const createPublicMutationLimiter = (max = PUBLIC_MUTATION_MAX): RequestHandler =>
  rateLimit({
    windowMs: PUBLIC_MUTATION_WINDOW_MS,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    validate: { trustProxy: false },
    handler: (req, res) => {
      const message = "Too many requests, try again later";
      if (req.originalUrl.startsWith("/trpc")) {
        // The shape tRPC clients read errors from
        res.status(429).json({
          error: { message, code: -32029, data: { code: "TOO_MANY_REQUESTS", httpStatus: 429 } },
        });
        return;
      }
      res.status(429).json({ status: 429, content: message });
    },
  });
