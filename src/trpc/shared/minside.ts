/**
 * Input and output schemas of the Min Side procedures (routers/minside.ts).
 *
 * apps/web imports this file at runtime (through @effekt/api/minside): the Danish site has no tRPC
 * backend, so its REST link validates REST responses with these same output schemas. Keep this
 * file free of backend imports; it may only import zod. src/__test__/trpc.minside.spec.ts checks.
 */
import { z } from "zod";

/** A donor id, as in the REST routes' integer `:id` param */
export const donorIdSchema = z.number().int().positive();

export const donorInput = z.strictObject({ donorId: donorIdSchema });

/**
 * The backend returns dates as Date objects, which JSON sends as ISO strings; REST and tRPC
 * responses arrive as strings. Accept both and always output the ISO string.
 */
const isoDateTime = z
  .union([z.date(), z.iso.datetime({ offset: true })])
  .transform((value) => (value instanceof Date ? value.toISOString() : value));

/** GET /donors/:id (Min Side profile). Undeclared fields, such as `trash`, are stripped. */
export const donorProfileOutput = z.object({
  // The Danish backend answers with 0: it identifies the donor by the token's email claim
  id: z.number().int().nonnegative(),
  name: z.string().nullable(),
  email: z.string(),
  newsletter: z.boolean(),
  registered: isoDateTime,
});

export type DonorProfile = z.output<typeof donorProfileOutput>;
