/**
 * Payment intents: what a donor said they'd give in the donation widget, and whether it
 * arrived. The status is decided by the API (`intents.*`); this module holds the list's URL
 * state, its translation into the API filter, and the sentences the donor page shows.
 */
import { defineList, param, type FilterValues } from "@/components/filters";
import { formatDate, formatMoney } from "@/lib/format";
import { intentStatus, type IntentStatus } from "@/lib/status";
import type { RouterInputs, RouterOutputs } from "@/lib/trpc";

export type Intent = RouterOutputs["intents"]["forDonor"][number];
export type IntentListRow = RouterOutputs["intents"]["list"]["rows"][number];
export type IntentApiFilter = NonNullable<RouterInputs["intents"]["list"]["filter"]>;

export const intentStatuses = [
  "awaiting",
  "received",
  "expired",
] as const satisfies readonly IntentStatus[];

/** The widget's payment methods, by Payment.ID */
export const intentMethods = {
  bank: { id: 2, label: "Bank transfer", phrase: "by bank transfer" },
  avtalegiro: { id: 7, label: "AvtaleGiro", phrase: "by AvtaleGiro" },
  vipps: { id: 6, label: "Vipps", phrase: "with Vipps" },
  "vipps-recurring": { id: 8, label: "Vipps recurring", phrase: "with Vipps recurring" },
} as const;
export type IntentMethod = keyof typeof intentMethods;
export const intentMethodKeys = Object.keys(intentMethods) as IntentMethod[];

const methodById = new Map<number, IntentMethod>(
  Object.entries(intentMethods).map(([key, method]) => [method.id, key as IntentMethod]),
);
export const methodKeyOf = (id: number | null) => (id === null ? undefined : methodById.get(id));
export const methodLabel = (id: number | null, name: string | null) => {
  const key = methodKeyOf(id);
  return key ? intentMethods[key].label : (name ?? "–");
};

export const intentsList = defineList({
  id: "intents",
  filters: {
    /** Donor name or email; all digits is a KID */
    q: param.text,
    status: param.list(intentStatuses),
    method: param.list(intentMethodKeys),
    created: param.dateRange,
    /** Only donors with no donation before the intent */
    newDonor: param.boolean,
  },
  sortable: ["created", "amount", "donorName"],
  defaultSort: { id: "created", desc: true },
});

export type IntentListFilters = FilterValues<typeof intentsList.filters>;

/** The Home attention item's view of the list: new donors' bank/AvtaleGiro intents, unpaid */
export const awaitingFirstPaymentSearch = {
  status: "awaiting",
  method: "bank,avtalegiro",
  newDonor: "true",
} as const;

/** URL filters → intents.list filter. All digits in the search box is a KID. */
export function toIntentFilter(filters: IntentListFilters): IntentApiFilter {
  const q = filters.q?.trim();
  const qIsKid = Boolean(q && /^\d{1,20}$/.test(q));
  const filter: IntentApiFilter = {
    statuses: filters.status?.length ? filters.status : undefined,
    methodIds: filters.method?.length ? filters.method.map((m) => intentMethods[m].id) : undefined,
    created: filters.created,
    newDonorsOnly: filters.newDonor ? true : undefined,
    donor: q && !qIsKid ? q : undefined,
    KID: qIsKid ? q : undefined,
  };
  return Object.fromEntries(
    Object.entries(filter).filter(([, value]) => value !== undefined),
  ) as IntentApiFilter;
}

/** Awaiting intents first (newest first), then the rest; the donor page's split */
export function splitIntents(intents: readonly Intent[] | undefined) {
  const all = intents ?? [];
  return {
    awaiting: all.filter((intent) => intent.status === "awaiting"),
    history: all.filter((intent) => intent.status !== "awaiting"),
  };
}

/**
 * One intent as a sentence, e.g. "Said they'd give 5 000,00 kr by bank transfer on 12.10.2026"
 * plus its outcome parts ("not received yet", "reminder sent 19.10.2026").
 */
export function describeIntent(intent: Intent) {
  const key = methodKeyOf(intent.methodId);
  const how = key ? ` ${intentMethods[key].phrase}` : intent.method ? ` (${intent.method})` : "";
  const said = `Said they'd give ${formatMoney(intent.amount)}${how} on ${formatDate(
    intent.created,
  )}`;
  const parts: string[] = [];
  if (intent.status === "received" && intent.matchedDonation) {
    parts.push(
      `received ${formatMoney(intent.matchedDonation.sum)} on ${formatDate(
        intent.matchedDonation.date,
      )}`,
    );
  } else if (intent.status === "awaiting") {
    parts.push("not received yet");
  } else {
    parts.push(intentStatus.expired.label.toLowerCase());
  }
  if (intent.followUps.count > 0 && intent.followUps.last) {
    const times = intent.followUps.count > 1 ? ` (${intent.followUps.count}×)` : "";
    parts.push(`reminder sent ${formatDate(intent.followUps.last)}${times}`);
  }
  return { said, parts };
}
