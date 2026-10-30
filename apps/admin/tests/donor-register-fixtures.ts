/**
 * Fixtures for registering a donation from the donor page (donor 569 with two KIDs), shaped
 * like the router outputs. Used by the donors a11y spec and the donor-register interaction spec.
 */
const org = (id: number, causeAreaId: number, name: string, abbreviation: string) => ({
  id,
  causeAreaId,
  name,
  abbreviation,
  standardShare: 50,
  isActive: true,
  ordering: id,
});

export const causeAreas = [
  {
    id: 1,
    name: "Global health",
    standardPercentageShare: 100,
    shortDescription: null,
    longDescription: null,
    informationUrl: null,
    isActive: true,
    ordering: 1,
    organizations: [
      org(1, 1, "Against Malaria Foundation", "AMF"),
      org(2, 1, "GiveDirectly", "GD"),
    ],
  },
];

export const donor = {
  id: 569,
  name: "Kari Nordmann",
  email: "kari.nordmann@example.org",
  registered: "2023-08-12T17:27:19.000Z",
  newsletter: true,
  trash: false,
};

/** The donor's KIDs: the second is used most, so it is preselected. */
export const donorKids = [
  { KID: "000569937638223", sum: "700.00", count: 1, full_name: donor.name, email: donor.email },
  { KID: "000569112233445", sum: "6000.00", count: 12, full_name: donor.name, email: donor.email },
];

const splits: Record<string, unknown> = {
  "000569937638223": {
    kid: "000569937638223",
    donorId: 569,
    taxUnitId: null,
    causeAreas: [
      {
        id: 1,
        percentageShare: "100",
        standardSplit: false,
        organizations: [{ id: 1, percentageShare: "100" }],
      },
    ],
  },
  "000569112233445": {
    kid: "000569112233445",
    donorId: 569,
    taxUnitId: null,
    causeAreas: [
      {
        id: 1,
        percentageShare: "100",
        standardSplit: false,
        organizations: [
          { id: 1, percentageShare: "60" },
          { id: 2, percentageShare: "40" },
        ],
      },
    ],
  },
};

/** donations.distributions.get answers per KID. */
export const splitFor = (input: unknown) => {
  const kid = (input as { kid: string }).kid;
  return { ...(splits[kid] as object), donor, taxUnit: null };
};

export const registerReference: Record<string, unknown> = {
  "config.causeAreas.listAll": causeAreas,
  "config.causeAreas.listActive": causeAreas,
  "config.paymentMethods.list": [
    { id: 2, name: "Bank", abbriviation: "Bank" },
    { id: 4, name: "Vipps KID", abbriviation: "Vipps KID" },
  ],
  "meta.owners": [
    { id: 1, name: "Effekt", default: false },
    { id: 3, name: "EAN + Effekt", default: true },
  ],
};
