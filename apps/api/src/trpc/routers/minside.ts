import { fnr } from "@navikt/fnrvalidator";
import { TRPCError } from "@trpc/server";
import type { z } from "zod";
import {
  replaceAvtaleGiroDistribution,
  setAvtaleGiroStatus,
  updateAvtaleGiroAmount,
  updateAvtaleGiroPaymentDate,
} from "../../custom_modules/avtalegiro";
import { DAO } from "../../custom_modules/DAO";
import { validateDistribution } from "../../custom_modules/distribution";
import {
  archiveTaxUnit,
  createTaxUnitForDonor,
  DonorServiceError,
} from "../../custom_modules/donorService";
import permissions from "../../enums/authorizationPermissions";
import { getYearlyTaxReports } from "../../custom_modules/taxReports";
import * as vippsService from "../../custom_modules/vippsService";
import { RequestLocale } from "../../middleware/locale";
import type { DistributionInput } from "../../schemas/types";
import {
  type AgreementDistribution,
  autoGiroAgreementsOutput,
  avtaleGiroAgreementInput,
  avtaleGiroAgreementsOutput,
  changedTaxUnitOutput,
  createTaxUnitInput,
  deleteTaxUnitInput,
  distributionsInput,
  distributionsOutput,
  donationsAggregatedOutput,
  donationsOutput,
  donorProfileOutput,
  mutationOkOutput,
  taxReportsInput,
  taxReportsOutput,
  taxUnitsInput,
  taxUnitsOutput,
  updateAvtaleGiroAmountInput,
  updateAvtaleGiroDistributionInput,
  updateAvtaleGiroPaymentDateInput,
  updateProfileInput,
  updateTaxUnitInput,
  updateVippsAgreementChargeDayInput,
  updateVippsAgreementDistributionInput,
  updateVippsAgreementDistributionOutput,
  updateVippsAgreementPriceInput,
  vippsAgreementInput,
  vippsAgreementsOutput,
} from "../shared/minside";
import { donorProcedure, router } from "../trpc";

const notFound = (message: string) => new TRPCError({ code: "NOT_FOUND", message });
const badRequest = (message: string) => new TRPCError({ code: "BAD_REQUEST", message });
const failed = (message: string) => new TRPCError({ code: "INTERNAL_SERVER_ERROR", message });

/** The fødselsnummer check of the REST tax unit routes (9 digit organization numbers aren't checked) */
const assertValidSsn = (ssn: string) => {
  if (ssn.length !== 11) return;
  const validation = fnr(ssn);
  if (validation.status !== "valid") {
    throw badRequest(
      "Invalid ssn (failed fnr validation) " +
        ("reasons" in validation ? validation.reasons.join(", ") : ""),
    );
  }
};

/** The donor's tax unit, or NOT_FOUND (also for another donor's unit) */
const getOwnTaxUnit = async (donorId: number, taxUnitId: number) => {
  const taxUnit = await DAO.tax.getById(taxUnitId);
  if (!taxUnit || taxUnit.donorId !== donorId) {
    throw notFound("No tax unit found with ID " + taxUnitId + " for donor " + donorId);
  }
  return taxUnit;
};

/**
 * The Vipps agreement, if it is the donor's; NOT_FOUND otherwise, like REST's
 * checkVippsAgreementBelongsToDonor
 */
const getOwnVippsAgreement = async (donorId: number, agreementId: string) => {
  const agreement = await DAO.vipps.getAgreement(agreementId);
  if (!agreement || Number(agreement.donorID) !== donorId) throw notFound("Agreement not found");
  return agreement;
};

/**
 * NOT_FOUND unless the KID's distribution is the donor's (REST: checkDonorOwnsDistribution) and
 * it has an AvtaleGiro agreement
 */
const assertOwnAvtaleGiro = async (donorId: number, KID: string) => {
  const owner = await DAO.donors.getByKID(KID);
  if (!owner || owner.id !== donorId) throw notFound("Agreement not found");
  if (!(await DAO.avtalegiroagreements.getByKID(KID))) throw notFound("Agreement not found");
};

/**
 * The distribution REST receives, with the donor set to the agreement's owner. Its tax unit must
 * be one of the donor's (REST doesn't check this).
 */
const toDonorDistribution = async (
  donorId: number,
  split: AgreementDistribution,
): Promise<DistributionInput> => {
  if (split.taxUnitId !== null) await getOwnTaxUnit(donorId, split.taxUnitId);
  return { donorId, ...split } as DistributionInput;
};

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
  /** Saves the donor's name and newsletter choice, like PUT /donors/:id (the email is kept) */
  updateProfile: donorProcedure(permissions.write_profile, updateProfileInput)
    .output(mutationOkOutput)
    .mutation(async ({ input }) => {
      const donor = await DAO.donors.getByID(input.donorId);
      if (!donor) throw notFound("Couldn't find donor by id");
      // As REST: a missing newsletter is stored as NULL, and trash is kept
      const updated = await DAO.donors.update(
        input.donorId,
        input.name,
        donor.email,
        input.newsletter ?? null,
        undefined,
      );
      if (!updated) throw failed("Could not update donor");
      return true as const;
    }),

  /** Adds a tax unit, like POST /donors/:id/taxunits(?locale=) */
  createTaxUnit: donorProcedure(permissions.write_profile, createTaxUnitInput)
    .output(changedTaxUnitOutput)
    .mutation(async ({ input }) => {
      assertValidSsn(input.ssn);
      const donor = await DAO.donors.getByID(input.donorId);
      if (!donor) throw notFound("No donor found with ID " + input.donorId);
      const taxUnit = await createTaxUnitForDonor(
        donor.id,
        input.ssn,
        input.name,
        (input.locale ?? "NO") as RequestLocale,
      );
      if (!taxUnit) throw failed("Failed to create tax unit");
      return taxUnit as z.input<typeof changedTaxUnitOutput>;
    }),

  /** Changes a tax unit's name and ssn, like PUT /donors/:id/taxunits/:taxunitid */
  updateTaxUnit: donorProcedure(permissions.write_profile, updateTaxUnitInput)
    .output(changedTaxUnitOutput)
    .mutation(async ({ input }) => {
      assertValidSsn(input.ssn);
      const donor = await DAO.donors.getByID(input.donorId);
      if (!donor) throw notFound("No donor found with ID " + input.donorId);
      const existing = await getOwnTaxUnit(donor.id, input.taxUnitId);
      const taxUnit = { ...existing, name: input.name, ssn: input.ssn };
      const changed = await DAO.tax.updateTaxUnit(input.taxUnitId, taxUnit);
      if (!changed) throw failed("Could not update tax unit");
      return taxUnit as z.input<typeof changedTaxUnitOutput>;
    }),

  /**
   * Archives a tax unit, like DELETE /donors/:id/taxunits/:taxunitid, optionally moving this
   * year's donations to another of the donor's units
   */
  deleteTaxUnit: donorProcedure(permissions.write_profile, deleteTaxUnitInput)
    .output(mutationOkOutput)
    .mutation(async ({ input }) => {
      // REST passes transferId on unchecked; only allow the donor's own units
      if (input.transferTaxUnitId != null) {
        await getOwnTaxUnit(input.donorId, input.transferTaxUnitId);
      }
      let deleted: number;
      try {
        deleted = await archiveTaxUnit(
          input.donorId,
          input.taxUnitId,
          input.transferTaxUnitId ?? undefined,
        );
      } catch (ex) {
        if (ex instanceof DonorServiceError) {
          throw new TRPCError({ code: ex.kind, message: ex.message });
        }
        throw ex;
      }
      if (!deleted) throw failed("Failed to delete tax unit");
      return true as const;
    }),

  /** Stops a Vipps agreement, like PUT /donors/:id/recurring/vipps/:agreementId/cancel */
  cancelVippsAgreement: donorProcedure(permissions.write_agreements, vippsAgreementInput)
    .output(mutationOkOutput)
    .mutation(async ({ input }) => {
      await getOwnVippsAgreement(input.donorId, input.agreementId);
      // Vipps first; our DB and the email only when Vipps accepted it
      if (!(await vippsService.cancelAgreement(input.agreementId))) {
        throw failed("Could not cancel agreement");
      }
      return true as const;
    }),

  /** Changes a Vipps agreement's monthly amount, like PUT …/vipps/:agreementId/price */
  updateVippsAgreementPrice: donorProcedure(
    permissions.write_agreements,
    updateVippsAgreementPriceInput,
  )
    .output(mutationOkOutput)
    .mutation(async ({ input }) => {
      await getOwnVippsAgreement(input.donorId, input.agreementId);
      if (!(await vippsService.updateAgreementPrice(input.agreementId, input.amount * 100))) {
        throw failed("Could not update agreement price");
      }
      return true as const;
    }),

  /** Changes a Vipps agreement's charge day, like PUT …/vipps/:agreementId/chargeday */
  updateVippsAgreementChargeDay: donorProcedure(
    permissions.write_agreements,
    updateVippsAgreementChargeDayInput,
  )
    .output(mutationOkOutput)
    .mutation(async ({ input }) => {
      await getOwnVippsAgreement(input.donorId, input.agreementId);
      // REST answers 200 whatever the DAO returns
      await vippsService.updateAgreementChargeDay(input.agreementId, input.chargeDay);
      return true as const;
    }),

  /** Changes a Vipps agreement's distribution, like PUT …/vipps/:agreementId/distribution */
  updateVippsAgreementDistribution: donorProcedure(
    permissions.write_agreements,
    updateVippsAgreementDistributionInput,
  )
    .output(updateVippsAgreementDistributionOutput)
    .mutation(async ({ input }) => {
      await getOwnVippsAgreement(input.donorId, input.agreementId);
      const distribution = await toDonorDistribution(input.donorId, input.distribution);
      const result = await vippsService.updateAgreementDistribution(
        input.agreementId,
        distribution,
      );
      if (!result.ok) {
        throw result.status === 404 ? notFound(result.message) : badRequest(result.message);
      }
      return { KID: result.KID };
    }),

  /** Changes an AvtaleGiro agreement's monthly amount, like POST /avtalegiro/:KID/amount */
  updateAvtaleGiroAmount: donorProcedure(permissions.write_agreements, updateAvtaleGiroAmountInput)
    .output(mutationOkOutput)
    .mutation(async ({ input }) => {
      await assertOwnAvtaleGiro(input.donorId, input.KID);
      // Stored in øre, which REST receives from Min Side
      await updateAvtaleGiroAmount(input.KID, input.amount * 100);
      return true as const;
    }),

  /** Changes an AvtaleGiro agreement's payment day, like POST /avtalegiro/:KID/paymentdate */
  updateAvtaleGiroPaymentDate: donorProcedure(
    permissions.write_agreements,
    updateAvtaleGiroPaymentDateInput,
  )
    .output(mutationOkOutput)
    .mutation(async ({ input }) => {
      await assertOwnAvtaleGiro(input.donorId, input.KID);
      await updateAvtaleGiroPaymentDate(input.KID, input.paymentDate);
      return true as const;
    }),

  /**
   * Replaces an AvtaleGiro agreement's distribution (the agreement gets a new KID), like
   * POST /avtalegiro/:KID/distribution
   */
  updateAvtaleGiroDistribution: donorProcedure(
    permissions.write_agreements,
    updateAvtaleGiroDistributionInput,
  )
    .output(mutationOkOutput)
    .mutation(async ({ input }) => {
      await assertOwnAvtaleGiro(input.donorId, input.KID);
      const distribution = await toDonorDistribution(input.donorId, input.distribution);
      let validated: DistributionInput;
      try {
        validated = validateDistribution(distribution) as DistributionInput;
      } catch (ex) {
        throw badRequest((ex as Error).message);
      }
      await replaceAvtaleGiroDistribution(input.KID, validated);
      return true as const;
    }),

  /** Cancels an AvtaleGiro agreement, like POST /avtalegiro/:KID/status with active 0 */
  cancelAvtaleGiroAgreement: donorProcedure(permissions.write_agreements, avtaleGiroAgreementInput)
    .output(mutationOkOutput)
    .mutation(async ({ input }) => {
      await assertOwnAvtaleGiro(input.donorId, input.KID);
      await setAvtaleGiroStatus(input.KID, 0);
      return true as const;
    }),
});
