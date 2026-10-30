import { HourglassIcon } from "lucide-react";
import type { AttentionItem } from "@/components/domain/attention-list";
import { awaitingFirstPaymentSearch } from "./model";

/**
 * Home: new donors who said they'd give by bank transfer or AvtaleGiro and haven't paid yet
 * (`intents.attention`). Links to the Intents list showing exactly those intents.
 */
export function awaitingFirstPaymentAttention(
  counts: { donors: number; days: number } | undefined,
): AttentionItem[] {
  if (!counts?.donors) return [];
  return [
    {
      id: "intents-awaiting",
      icon: HourglassIcon,
      tone: "warning",
      title:
        counts.donors === 1
          ? "New donor waiting on their first bank/AvtaleGiro payment"
          : "New donors waiting on their first bank/AvtaleGiro payment",
      count: counts.donors,
      description: `Said they'd give in the last ${counts.days} days; nothing received yet.`,
      href: "/intents",
      search: { ...awaitingFirstPaymentSearch },
      action: "See intents",
    },
  ];
}
