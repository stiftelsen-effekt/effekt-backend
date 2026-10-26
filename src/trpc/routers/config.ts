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
import { idSchema as id } from "../schemas/common";
import { adminProcedure, router } from "../trpc";

const byId = z.strictObject({ id });
const share = z.number().int().min(0).max(100);
/** ordering columns are TINYINT */
const ordering = z.number().int().min(-128).max(127);

/** Column lengths of Cause_areas / Organizations */
const nameText = z.string().min(1).max(45);
const shortDescriptionText = z.string().max(255);
const longDescriptionText = z.string().max(45);
const urlText = z.string().max(156);

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

/**
 * Organizations are returned mapped to camelCase (like the list endpoints), unlike
 * GET /organizations/:id which returns the raw database row.
 */
const getOrganization = async (organizationId: number) =>
  mapOrganization(await findOrganizationRow(organizationId));

/** Fails with BAD_REQUEST (not NOT_FOUND: the cause area is an input reference) */
const assertCauseAreaExists = async (causeAreaId: number) => {
  try {
    await findCauseArea(causeAreaId);
  } catch (ex) {
    if (ex instanceof TRPCError && ex.code === "NOT_FOUND") {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: `Cause area ${causeAreaId} does not exist`,
      });
    }
    throw ex;
  }
};

type ReferralType = { id: number; name: string; ordering: number | null; isActive: boolean };

const mapReferralType = (type: {
  id: number;
  name: string;
  ordering: number | null;
  is_active: boolean | 0 | 1;
}): ReferralType => ({
  id: type.id,
  name: type.name,
  ordering: type.ordering,
  isActive: Boolean(type.is_active),
});

const findReferralType = async (referralTypeId: number): Promise<ReferralType> => {
  const type = await DAO.referrals.getTypeById(referralTypeId);
  if (!type) throw new TRPCError({ code: "NOT_FOUND", message: "Referral type not found" });
  return mapReferralType(type);
};

const causeAreaCreateInput = z.strictObject({
  name: nameText,
  shortDescription: shortDescriptionText.optional(),
  longDescription: longDescriptionText.optional(),
  informationUrl: urlText.optional(),
  ordering: ordering.optional(),
  standardPercentageShare: share.optional(),
});

const causeAreaUpdateInput = z.strictObject({
  id,
  name: nameText.optional(),
  shortDescription: shortDescriptionText.nullable().optional(),
  longDescription: longDescriptionText.nullable().optional(),
  informationUrl: urlText.nullable().optional(),
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
  /** POST /causeareas/. Returns the created cause area. */
  create: adminProcedure.input(causeAreaCreateInput).mutation(async ({ input }) => {
    const causeAreaId = await DAO.causeareas.add(buildNewCauseArea(input));
    return findCauseArea(causeAreaId);
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

const abbreviationText = z.string().min(1).max(10);

const organizationCreateInput = z.strictObject({
  name: nameText,
  abbreviation: abbreviationText,
  shortDescription: shortDescriptionText.optional(),
  longDescription: longDescriptionText.optional(),
  informationUrl: urlText.optional(),
  ordering: ordering.optional(),
  standardShare: share.optional(),
  causeAreaId: id,
});

const organizationUpdateInput = z.strictObject({
  id,
  name: nameText.optional(),
  abbreviation: abbreviationText.optional(),
  shortDescription: shortDescriptionText.nullable().optional(),
  /** Organizations.long_desc is NOT NULL */
  longDescription: longDescriptionText.optional(),
  informationUrl: urlText.nullable().optional(),
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
  /** POST /organizations/. Returns the created organization. */
  create: adminProcedure.input(organizationCreateInput).mutation(async ({ input }) => {
    await assertCauseAreaExists(input.causeAreaId);
    const organizationId = await DAO.organizations.add(buildNewOrganization(input));
    return getOrganization(organizationId);
  }),
  /** PUT /organizations/:id */
  update: adminProcedure.input(organizationUpdateInput).mutation(async ({ input }) => {
    const { id: organizationId, ...patch } = input;
    const existing = await findOrganizationRow(organizationId);
    if (patch.causeAreaId !== undefined && patch.causeAreaId !== existing.cause_area_ID) {
      await assertCauseAreaExists(patch.causeAreaId);
    }
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

/** Referral_types.name is VARCHAR(256), ordering INT */
const referralTypeName = z.string().min(1).max(256);
const referralTypeOrdering = z.number().int().min(-2147483648).max(2147483647);

/** All referral type procedures return { id, name, ordering, isActive } */
const referralTypesRouter = router({
  /** GET /referrals/types */
  listActive: adminProcedure.query(
    async (): Promise<ReferralType[]> =>
      (await DAO.referrals.getTypes()).map((type) => ({ ...type, isActive: true })),
  ),
  /** GET /referrals/types/all */
  listAll: adminProcedure.query(async () =>
    (await DAO.referrals.getAllTypes()).map(mapReferralType),
  ),
  /** POST /referrals/types */
  create: adminProcedure
    .input(z.strictObject({ name: referralTypeName, ordering: referralTypeOrdering }))
    .mutation(async ({ input }) =>
      mapReferralType(await DAO.referrals.createType(input.name, input.ordering)),
    ),
  /** PUT /referrals/types/:id */
  update: adminProcedure
    .input(
      z.strictObject({
        id,
        name: referralTypeName.optional(),
        ordering: referralTypeOrdering.optional(),
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
  /** GET /payment/methods. flatFee and percentageFee are decimal strings (e.g. "2.50") or null. */
  list: adminProcedure.query(async () => (await DAO.payment.getMethods()) ?? []),
});

export const configRouter = router({
  causeAreas: causeAreasRouter,
  organizations: organizationsRouter,
  referralTypes: referralTypesRouter,
  paymentMethods: paymentMethodsRouter,
});
