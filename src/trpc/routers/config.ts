import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { DAO } from "../../custom_modules/DAO";
import { mapOrganization } from "../../custom_modules/DAO_modules/organizations";
import {
  buildNewCauseArea,
  buildNewOrganization,
  getAllCauseAreasWithOrganizations,
  mergeCauseAreaUpdate,
  mergeOrganizationUpdate,
  toggleCauseAreaActive,
  toggleOrganizationActive,
} from "../../custom_modules/configService";
import { adminProcedure, router } from "../trpc";

const id = z.number().int().positive();
const byId = z.strictObject({ id });
const share = z.number().int().min(0).max(100);
const ordering = z.number().int();

/** DAO.causeareas.getById throws instead of returning null when the row is missing. */
const findCauseArea = async (causeAreaId: number) => {
  try {
    return await DAO.causeareas.getById(causeAreaId);
  } catch (ex) {
    if (ex instanceof Error && ex.message === "Cause area not found") {
      throw new TRPCError({ code: "NOT_FOUND", message: "Cause area not found" });
    }
    throw ex;
  }
};

const findOrganizationRow = async (organizationId: number) => {
  const row = await DAO.organizations.getByID(organizationId);
  if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Organization not found" });
  return row;
};

const getOrganization = async (organizationId: number) =>
  mapOrganization(await findOrganizationRow(organizationId));

const findReferralType = async (referralTypeId: number) => {
  const type = await DAO.referrals.getTypeById(referralTypeId);
  if (!type) throw new TRPCError({ code: "NOT_FOUND", message: "Referral type not found" });
  return type;
};

const causeAreaCreateInput = z.strictObject({
  name: z.string().min(1),
  shortDescription: z.string().optional(),
  longDescription: z.string().optional(),
  informationUrl: z.string().optional(),
  ordering: ordering.optional(),
  standardPercentageShare: share.optional(),
});

const causeAreaUpdateInput = z.strictObject({
  id,
  name: z.string().min(1).optional(),
  shortDescription: z.string().nullable().optional(),
  longDescription: z.string().nullable().optional(),
  informationUrl: z.string().nullable().optional(),
  isActive: z.boolean().optional(),
  ordering: ordering.nullable().optional(),
  standardPercentageShare: share.nullable().optional(),
});

const causeAreasRouter = router({
  /** Active cause areas with their active organizations (GET /causeareas/active). */
  listActive: adminProcedure.query(() => DAO.causeareas.getActiveWithOrganizations()),
  /** All cause areas with all their organizations (GET /causeareas/all). */
  listAll: adminProcedure.query(() => getAllCauseAreasWithOrganizations()),
  get: adminProcedure.input(byId).query(({ input }) => findCauseArea(input.id)),
  /** POST /causeareas/. Returns nothing: the DAO does not expose the new ID. */
  create: adminProcedure.input(causeAreaCreateInput).mutation(async ({ input }) => {
    await DAO.causeareas.add(buildNewCauseArea(input));
  }),
  /** PUT /causeareas/:id */
  update: adminProcedure.input(causeAreaUpdateInput).mutation(async ({ input }) => {
    const { id: causeAreaId, ...patch } = input;
    const existing = await findCauseArea(causeAreaId);
    await DAO.causeareas.updateById(mergeCauseAreaUpdate(causeAreaId, existing, patch));
    return findCauseArea(causeAreaId);
  }),
  /** PUT /causeareas/:id/toggle-active */
  toggleActive: adminProcedure.input(byId).mutation(async ({ input }) => {
    const existing = await findCauseArea(input.id);
    await DAO.causeareas.updateById(toggleCauseAreaActive(existing));
    return findCauseArea(input.id);
  }),
});

const organizationCreateInput = z.strictObject({
  name: z.string().min(1),
  abbreviation: z.string().min(1),
  shortDescription: z.string().optional(),
  longDescription: z.string().optional(),
  informationUrl: z.string().optional(),
  ordering: ordering.optional(),
  standardShare: share.optional(),
  causeAreaId: id,
});

const organizationUpdateInput = z.strictObject({
  id,
  name: z.string().min(1).optional(),
  abbreviation: z.string().min(1).optional(),
  shortDescription: z.string().nullable().optional(),
  longDescription: z.string().nullable().optional(),
  informationUrl: z.string().nullable().optional(),
  isActive: z.boolean().optional(),
  ordering: ordering.nullable().optional(),
  standardShare: share.nullable().optional(),
  causeAreaId: id.optional(),
});

const organizationsRouter = router({
  /** GET /organizations/active */
  listActive: adminProcedure.query(() => DAO.organizations.getActive()),
  /** GET /organizations/all */
  listAll: adminProcedure.query(() => DAO.organizations.getAll()),
  /** All organizations (active and inactive) of one cause area, sorted by ordering. */
  listByCauseArea: adminProcedure
    .input(z.strictObject({ causeAreaId: id }))
    .query(async ({ input }) => {
      const organizations = await DAO.organizations.getAll();
      return organizations
        .filter((org) => org.causeAreaId === input.causeAreaId)
        .sort((a, b) => (a.ordering ?? 0) - (b.ordering ?? 0));
    }),
  get: adminProcedure.input(byId).query(({ input }) => getOrganization(input.id)),
  /** POST /organizations/. Returns nothing: the DAO does not expose the new ID. */
  create: adminProcedure.input(organizationCreateInput).mutation(async ({ input }) => {
    await DAO.organizations.add(buildNewOrganization(input));
  }),
  /** PUT /organizations/:id */
  update: adminProcedure.input(organizationUpdateInput).mutation(async ({ input }) => {
    const { id: organizationId, ...patch } = input;
    const existing = await findOrganizationRow(organizationId);
    await DAO.organizations.updateById(mergeOrganizationUpdate(organizationId, existing, patch));
    return getOrganization(organizationId);
  }),
  /** PUT /organizations/:id/toggle-active */
  toggleActive: adminProcedure.input(byId).mutation(async ({ input }) => {
    const existing = await findOrganizationRow(input.id);
    await DAO.organizations.updateById(toggleOrganizationActive(input.id, existing));
    return getOrganization(input.id);
  }),
});

const referralTypesRouter = router({
  /** GET /referrals/types */
  listActive: adminProcedure.query(() => DAO.referrals.getTypes()),
  /** GET /referrals/types/all */
  listAll: adminProcedure.query(() => DAO.referrals.getAllTypes()),
  /** POST /referrals/types */
  create: adminProcedure
    .input(z.strictObject({ name: z.string().min(1), ordering }))
    .mutation(({ input }) => DAO.referrals.createType(input.name, input.ordering)),
  /** PUT /referrals/types/:id */
  update: adminProcedure
    .input(
      z.strictObject({
        id,
        name: z.string().min(1).optional(),
        ordering: ordering.optional(),
        isActive: z.boolean().optional(),
      }),
    )
    .mutation(async ({ input }) => {
      if (
        input.name === undefined &&
        input.ordering === undefined &&
        input.isActive === undefined
      ) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Nothing to update" });
      }
      const success = await DAO.referrals.updateType(input.id, {
        name: input.name,
        ordering: input.ordering,
        is_active: input.isActive,
      });
      if (!success) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Referral type not found or no changes made",
        });
      }
      return findReferralType(input.id);
    }),
  /** PUT /referrals/types/:id/toggle-active */
  toggleActive: adminProcedure.input(byId).mutation(async ({ input }) => {
    const success = await DAO.referrals.toggleTypeActive(input.id);
    if (!success) throw new TRPCError({ code: "NOT_FOUND", message: "Referral type not found" });
    return findReferralType(input.id);
  }),
});

const paymentMethodsRouter = router({
  /** GET /payment/methods */
  list: adminProcedure.query(async () => (await DAO.payment.getMethods()) ?? []),
});

export const configRouter = router({
  causeAreas: causeAreasRouter,
  organizations: organizationsRouter,
  referralTypes: referralTypesRouter,
  paymentMethods: paymentMethodsRouter,
});
