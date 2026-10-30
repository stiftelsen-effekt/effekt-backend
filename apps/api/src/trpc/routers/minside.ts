import { TRPCError } from "@trpc/server";
import type { z } from "zod";
import { DAO } from "../../custom_modules/DAO";
import permissions from "../../enums/authorizationPermissions";
import { getYearlyTaxReports } from "../../custom_modules/taxReports";
import { RequestLocale } from "../../middleware/locale";
import {
  autoGiroAgreementsOutput,
  avtaleGiroAgreementsOutput,
  distributionsInput,
  distributionsOutput,
  donationsAggregatedOutput,
  donationsOutput,
  donorProfileOutput,
  taxReportsInput,
  taxReportsOutput,
  taxUnitsInput,
  taxUnitsOutput,
  vippsAgreementsOutput,
} from "../shared/minside";
import { donorProcedure, router } from "../trpc";

/**
 * Procedures for the website's Min Side, called with the donor's own Auth0 token. Each mirrors a
 * REST route; apps/web maps the paths the Danish backend also implements to its routes for the
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

  /** The donor's tax units with yearly deductions, like GET /donors/:id/taxunits */
  taxUnits: donorProcedure(permissions.read_profile, taxUnitsInput)
    .output(taxUnitsOutput)
    .query(async ({ input }) => {
      const units = await DAO.tax.getByDonorId(
        input.donorId,
        (input.locale ?? "NO") as RequestLocale,
      );
      // The DAO's TaxUnit type (from the OpenAPI spec) marks every field optional, but
      // getTaxUnitsWithDeductions sets them all; the output schema rejects anything else
      return units as unknown as z.input<typeof taxUnitsOutput>;
    }),

  /** The donor's donations per organization and year, like GET /donors/:id/donations/aggregated */
  donationsAggregated: donorProcedure(permissions.read_donations)
    .output(donationsAggregatedOutput)
    .query(({ input }) => DAO.donations.getYearlyAggregateByDonorId(input.donorId)),

  /** The donor's donations, like GET /donors/:id/donations */
  donations: donorProcedure(permissions.read_donations)
    .output(donationsOutput)
    .query(async ({ input }) => {
      const donations = await DAO.donations.getByDonorId(input.donorId);
      // As for tax units: the DAO's Donation type marks fields optional that the query always sets
      return donations as unknown as z.input<typeof donationsOutput>;
    }),

  /**
   * The donor's distributions, like GET /donors/:id/distributions/?kids=…: only those with the
   * given KIDs when `kids` is set
   */
  distributions: donorProcedure(permissions.read_donations, distributionsInput)
    .output(distributionsOutput)
    .query(async ({ input }) => {
      const { distributions } = await DAO.distributions.getAllByDonor(input.donorId);
      if (!input.kids) return distributions;
      const kids = new Set(input.kids);
      return distributions.filter((distribution) => kids.has(distribution.kid));
    }),

  /** The donor's Vipps recurring agreements, like GET /donors/:id/recurring/vipps */
  vippsAgreements: donorProcedure(permissions.read_donations)
    .output(vippsAgreementsOutput)
    .query(async ({ input }) => {
      // agreement_url_code (the Vipps agreement link's code) and the other undeclared fields are
      // stripped by the output schema, as REST leaves the url code out
      const agreements = await DAO.vipps.getAgreementsByDonorId(input.donorId);
      return agreements as unknown as z.input<typeof vippsAgreementsOutput>;
    }),

  /** The donor's AvtaleGiro agreements, like GET /donors/:id/recurring/avtalegiro */
  avtaleGiroAgreements: donorProcedure(permissions.read_donations)
    .output(avtaleGiroAgreementsOutput)
    .query(async ({ input }) => {
      const agreements = await DAO.avtalegiroagreements.getByDonorId(input.donorId);
      // The query selects ROUND(amount / 100) (a DECIMAL string) and TINYINT active, where the
      // Prisma row type says number and boolean
      return agreements as unknown as z.input<typeof avtaleGiroAgreementsOutput>;
    }),

  /** The donor's AutoGiro agreements, like GET /donors/:id/recurring/autogiro */
  autoGiroAgreements: donorProcedure(permissions.read_donations)
    .output(autoGiroAgreementsOutput)
    .query(async ({ input }) => {
      const agreements = await DAO.autogiroagreements.getAgreementsByDonorId(input.donorId);
      return agreements as unknown as z.input<typeof autoGiroAgreementsOutput>;
    }),

  /**
   * The donor's yearly tax reports, like GET /donors/:id/taxreports (same code:
   * custom_modules/taxReports.ts). The deduction rules follow `locale`; the default is NO.
   */
  taxReports: donorProcedure(permissions.read_donations, taxReportsInput)
    .output(taxReportsOutput)
    .query(async ({ input }) => {
      const reports = await getYearlyTaxReports(
        input.donorId,
        (input.locale ?? "NO") as RequestLocale,
      );
      return reports as unknown as z.input<typeof taxReportsOutput>;
    }),
});
