import { TRPCError } from "@trpc/server";
import { DAO } from "../../custom_modules/DAO";
import permissions from "../../enums/authorizationPermissions";
import { donorProfileOutput } from "../shared/minside";
import { donorProcedure, router } from "../trpc";

/**
 * Procedures for the website's Min Side, called with the donor's own Auth0 token. Each mirrors a
 * REST route the Danish backend also implements; apps/web maps the paths to those routes for the
 * Danish site (apps/web/lib/trpc/restLink.ts). See docs/web-trpc.md.
 */
export const minsideRouter = router({
  /** The donor's profile, like GET /donors/:id */
  profile: donorProcedure(permissions.read_donations)
    .output(donorProfileOutput)
    .query(async ({ input }) => {
      const donor = await DAO.donors.getByID(input.donorId);
      if (!donor) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "No donor found with ID " + input.donorId,
        });
      }
      // DAO's Donor type marks these optional, but getByID always sets them (registered is a
      // Date at runtime); the output schema rejects anything else
      return {
        id: donor.id,
        name: donor.name,
        email: donor.email,
        newsletter: donor.newsletter === true,
        registered: donor.registered as unknown as Date | string,
      };
    }),
});
