/**
 * Lookup data for the local database: cause areas, organizations, payment methods, data owners,
 * referral types and stop reasons. These mirror the shape of the production configuration
 * (public organization names, fee structure), not any donor data.
 */

export const CAUSE_AREAS = [
  // ID 1 is inserted by the 20230731130928_multiple_cause_areas migration; the seed updates it.
  {
    ID: 1,
    name: "Global helse",
    short_desc: "Global helse",
    long_desc: "Global helse",
    info_url: "https://gieffektivt.no/",
    is_active: 1,
    ordering: 1,
    std_percentage_share: 100,
    widget_display_name: "Global helse",
  },
  {
    ID: 2,
    name: "Dyrevelferd",
    short_desc: "Dyrevelferd",
    long_desc: "Dyrevelferd",
    info_url: "https://gieffektivt.no/",
    is_active: 1,
    ordering: 2,
    std_percentage_share: 0,
    widget_display_name: "Dyrevelferd",
  },
  {
    ID: 3,
    name: "Klima",
    short_desc: "Klima",
    long_desc: "Klima",
    info_url: "https://gieffektivt.no/",
    is_active: 1,
    ordering: 3,
    std_percentage_share: 0,
    widget_display_name: "Klima",
  },
];

type Org = {
  ID: number;
  cause_area_ID: number;
  full_name: string;
  abbriv: string;
  std_percentage_share: number;
  is_active: number;
  ordering: number;
  /** Weight when picked for a custom split (prod: distinct KIDs per organization, last year) */
  customWeight: number;
};

export const ORGANIZATIONS: Org[] = [
  {
    ID: 1,
    cause_area_ID: 1,
    full_name: "GiveWell All Grants Fund",
    abbriv: "AGF",
    std_percentage_share: 100,
    is_active: 1,
    ordering: 1,
    customWeight: 300,
  },
  {
    ID: 2,
    cause_area_ID: 1,
    full_name: "GiveWell Top Charities Fund",
    abbriv: "TCF",
    std_percentage_share: 0,
    is_active: 1,
    ordering: 2,
    customWeight: 146,
  },
  {
    ID: 3,
    cause_area_ID: 1,
    full_name: "Helen Keller International",
    abbriv: "HKI",
    std_percentage_share: 0,
    is_active: 1,
    ordering: 3,
    customWeight: 369,
  },
  {
    ID: 4,
    cause_area_ID: 1,
    full_name: "New Incentives",
    abbriv: "NI",
    std_percentage_share: 0,
    is_active: 1,
    ordering: 4,
    customWeight: 211,
  },
  {
    ID: 5,
    cause_area_ID: 1,
    full_name: "Malaria Consortium",
    abbriv: "MC",
    std_percentage_share: 0,
    is_active: 1,
    ordering: 5,
    customWeight: 585,
  },
  {
    ID: 6,
    cause_area_ID: 1,
    full_name: "Against Malaria Foundation",
    abbriv: "AMF",
    std_percentage_share: 0,
    is_active: 1,
    ordering: 6,
    customWeight: 119,
  },
  {
    ID: 7,
    cause_area_ID: 1,
    full_name: "GiveDirectly",
    abbriv: "GD",
    std_percentage_share: 0,
    is_active: 1,
    ordering: 7,
    customWeight: 315,
  },
  {
    ID: 8,
    cause_area_ID: 1,
    full_name: "Give Directly - Moms and Babies",
    abbriv: "GD MB",
    std_percentage_share: 0,
    is_active: 1,
    ordering: 8,
    customWeight: 140,
  },
  {
    ID: 9,
    cause_area_ID: 1,
    full_name: "Family Empowerment Media",
    abbriv: "FEM",
    std_percentage_share: 0,
    is_active: 0,
    ordering: 9,
    customWeight: 55,
  },
  {
    ID: 10,
    cause_area_ID: 1,
    full_name: "GiveDirectly Zakat-fond",
    abbriv: "GDZF",
    std_percentage_share: 0,
    is_active: 0,
    ordering: 10,
    customWeight: 14,
  },
  {
    ID: 11,
    cause_area_ID: 1,
    full_name: "Drift av Gi Effektivt",
    abbriv: "Drift",
    std_percentage_share: 0,
    is_active: 1,
    ordering: 98,
    customWeight: 0,
  },
  {
    ID: 12,
    cause_area_ID: 1,
    full_name: "Annet",
    abbriv: "Other",
    std_percentage_share: 0,
    is_active: 1,
    ordering: 99,
    customWeight: 0,
  },
  {
    ID: 13,
    cause_area_ID: 2,
    full_name: "The Humane League",
    abbriv: "THL",
    std_percentage_share: 50,
    is_active: 1,
    ordering: 1,
    customWeight: 3,
  },
  {
    ID: 14,
    cause_area_ID: 2,
    full_name: "Good Food Institute",
    abbriv: "GFI",
    std_percentage_share: 50,
    is_active: 1,
    ordering: 2,
    customWeight: 2,
  },
  {
    ID: 15,
    cause_area_ID: 2,
    full_name: "Animal Charity Evaluators",
    abbriv: "ACE",
    std_percentage_share: 0,
    is_active: 1,
    ordering: 3,
    customWeight: 1,
  },
  {
    ID: 16,
    cause_area_ID: 3,
    full_name: "Clean Air Task Force",
    abbriv: "CATF",
    std_percentage_share: 100,
    is_active: 1,
    ordering: 1,
    customWeight: 3,
  },
  {
    ID: 17,
    cause_area_ID: 3,
    full_name: "Cool Earth",
    abbriv: "CE",
    std_percentage_share: 0,
    is_active: 1,
    ordering: 2,
    customWeight: 1,
  },
  {
    // Own fund (regranting `Funds`): Gi Effektivt decides its grants round by round
    ID: 18,
    cause_area_ID: 1,
    full_name: "Gi Effektivt Bistandsfond",
    abbriv: "GEBF",
    std_percentage_share: 0,
    is_active: 1,
    ordering: 11,
    customWeight: 150,
  },
];

export const ORG = {
  AGF: 1,
  TCF: 2,
  DRIFT: 11,
} as const;

/** Production fee structure (flat fee NOK + percentage) */
export const PAYMENT_METHODS = [
  {
    ID: 2,
    payment_name: "Bank",
    abbriv: "Bank",
    flat_fee: 2,
    percentage_fee: 0,
    lastUpdated: "2017-10-28 20:13:29",
  },
  {
    ID: 3,
    payment_name: "PayPal",
    abbriv: "PayPal",
    flat_fee: 2.8,
    percentage_fee: 1.9,
    lastUpdated: "2018-02-03 15:54:40",
  },
  {
    ID: 4,
    payment_name: "Vipps KID",
    abbriv: "Vipps KID",
    flat_fee: 0,
    percentage_fee: 1.5,
    lastUpdated: "2021-11-09 13:29:38",
  },
  {
    ID: 5,
    payment_name: "Bank u/KID",
    abbriv: "Bank u/KID",
    flat_fee: 0,
    percentage_fee: 0,
    lastUpdated: "2019-11-11 15:58:23",
  },
  {
    ID: 6,
    payment_name: "Vipps",
    abbriv: "Vipps",
    flat_fee: 1,
    percentage_fee: 2.99,
    lastUpdated: "2020-08-27 22:40:12",
  },
  {
    ID: 7,
    payment_name: "AvtaleGiro",
    abbriv: "AvtaleGiro",
    flat_fee: 2,
    percentage_fee: 0,
    lastUpdated: "2021-05-25 12:51:19",
  },
  {
    ID: 8,
    payment_name: "Vipps Recurring",
    abbriv: "Vipps Recurring",
    flat_fee: 1,
    percentage_fee: 2.99,
    lastUpdated: "2021-07-25 20:27:43",
  },
  {
    ID: 9,
    payment_name: "Facebook",
    abbriv: "Facebook",
    flat_fee: 0,
    percentage_fee: 0,
    lastUpdated: "2022-05-22 21:37:12",
  },
  {
    ID: 10,
    payment_name: "Crypto",
    abbriv: "Crypto",
    flat_fee: 0,
    percentage_fee: 0,
    lastUpdated: "2022-12-18 17:59:41",
  },
  {
    ID: 12,
    payment_name: "Autogiro",
    abbriv: "AutoGiro",
    flat_fee: 0,
    percentage_fee: 0,
    lastUpdated: "2023-10-13 12:41:53",
  },
  {
    ID: 13,
    payment_name: "Innsamling (Vipps)",
    abbriv: "Innsamling",
    flat_fee: 1,
    percentage_fee: 2.99,
    lastUpdated: "2023-11-24 14:47:50",
  },
  {
    ID: 14,
    payment_name: "Gavekort (Vipps)",
    abbriv: "Gavekort",
    flat_fee: 1,
    percentage_fee: 2.99,
    lastUpdated: "2023-11-24 14:47:50",
  },
  {
    ID: 15,
    payment_name: "Influenced",
    abbriv: "Influenced",
    flat_fee: 0,
    percentage_fee: 0,
    lastUpdated: "2024-03-01 13:37:44",
  },
  {
    ID: 16,
    payment_name: "AMF direkte",
    abbriv: "AMF",
    flat_fee: 0,
    percentage_fee: 0,
    lastUpdated: "2024-03-01 13:37:44",
  },
  {
    ID: 17,
    payment_name: "Lønnsdonasjon",
    abbriv: "Lønn",
    flat_fee: 0,
    percentage_fee: 0,
    lastUpdated: "2025-01-01 12:00:00",
  },
];

export const PAYMENT = {
  BANK: 2,
  PAYPAL: 3,
  VIPPS_KID: 4,
  BANK_NO_KID: 5,
  VIPPS: 6,
  AVTALEGIRO: 7,
  VIPPS_RECURRING: 8,
  FACEBOOK: 9,
  INNSAMLING: 13,
  GAVEKORT: 14,
  INFLUENCED: 15,
  PAYROLL: 17,
} as const;

export const DATA_OWNERS = [
  { ID: 1, owner: "Effekt", default: 0 },
  { ID: 2, owner: "EA Norge", default: 0 },
  { ID: 3, owner: "EAN + Effekt", default: 1 },
];

/** Active referral types with the weight they get among answers (prod, last year) */
export const REFERRAL_TYPES = [
  { ID: 1, name: "Bekjent", is_active: 1, ordering: 1, weight: 205 },
  { ID: 2, name: "Facebook", is_active: 0, ordering: 0, weight: 0 },
  { ID: 3, name: "Twitter", is_active: 0, ordering: 0, weight: 0 },
  { ID: 4, name: "Norsk podkast", is_active: 0, ordering: 0, weight: 0 },
  { ID: 5, name: "TV / Radio", is_active: 1, ordering: 6, weight: 48 },
  { ID: 6, name: "Internettsøk", is_active: 1, ordering: 2, weight: 114 },
  { ID: 7, name: "Effektiv altruisme", is_active: 1, ordering: 3, weight: 161 },
  { ID: 8, name: "Annet", is_active: 1, ordering: 9, weight: 189 },
  { ID: 9, name: "Dagens Næringsliv", is_active: 1, ordering: 7, weight: 19 },
  { ID: 10, name: "Podkast", is_active: 1, ordering: 4, weight: 71 },
  { ID: 11, name: "Avis", is_active: 1, ordering: 8, weight: 18 },
  { ID: 12, name: "Sosiale medier", is_active: 1, ordering: 5, weight: 106 },
  { ID: 13, name: "Sommer i P2", is_active: 1, ordering: 0, weight: 110 },
];

export const REFERRAL_OTHER_COMMENTS = [
  "Jobben",
  "Leste om det på nett",
  "Hørte om det på et foredrag",
  "Venn anbefalte det",
  "Studentforening",
  "Bok om effektiv altruisme",
  "Kollega",
  "Familie",
];

export const STOP_REASONS = [
  { ID: 1, name: "Økonomiske grunner", isOther: 0, order: 1 },
  { ID: 2, name: "Vil støtte andre formål", isOther: 0, order: 3 },
  { ID: 3, name: "Midlertidig pause", isOther: 0, order: 4 },
  { ID: 4, name: "Usikker effekt", isOther: 0, order: 6 },
  { ID: 5, name: "Tekniske problemer", isOther: 0, order: 5 },
  { ID: 10, name: "Bytter bank", isOther: 0, order: 2 },
  { ID: 11, name: "Annet", isOther: 1, order: 99 },
];

export const STOP_OTHER_COMMENTS = [
  "Flytter utenlands",
  "Gir heller direkte til organisasjonen",
  "Ønsker å gi årlig i stedet",
  "Endrer beløp senere",
  "Studerer nå",
];

export const FUNDRAISER_MESSAGES = [
  "Gratulerer med dagen!",
  "God jul!",
  "For en god sak",
  "Heia!",
  "Så fint initiativ",
  "Gleder meg til å se hvor mye dere samler inn",
  "Til minne om en god venn",
  "Godt jobbet!",
];
