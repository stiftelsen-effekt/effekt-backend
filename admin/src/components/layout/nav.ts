/**
 * Information architecture. Grouped by job, not by database table:
 *   Home         – what needs attention today
 *   Donors       – people and what they give through (fundraisers)
 *   Money in     – every krone that arrives: donations, the KIDs they use, imports, review
 *   Agreements   – recurring giving, one model across Vipps / AvtaleGiro
 *   Regranting   – money out: balances, rounds, projects, adjustments, payees & funds
 *   Analysis     – how much has been given through time, with open pledges (tilsagn)
 *   Records      – reports and the import log
 *   Settings     – cause areas, organizations, referral types, matching rules
 * See DESIGN.md › Information architecture.
 */
import {
  ArrowDownToLineIcon,
  BookOpenIcon,
  CoinsIcon,
  FolderKanbanIcon,
  HandshakeIcon,
  LandmarkIcon,
  ScaleIcon,
  SlidersHorizontalIcon,
  CalendarCheckIcon,
  CircleOffIcon,
  FlagIcon,
  HandCoinsIcon,
  HourglassIcon,
  HouseIcon,
  InboxIcon,
  KeyRoundIcon,
  RepeatIcon,
  ScrollTextIcon,
  SettingsIcon,
  SmartphoneIcon,
  TrendingUpIcon,
  UsersIcon,
  type LucideIcon,
  ListChecksIcon,
} from "lucide-react";
import { config } from "@/lib/config";

export type NavItem = {
  to: string;
  label: string;
  icon: LucideIcon;
  exact?: boolean;
  /** Live count shown next to the label. */
  badge?: "reviewQueue";
  /** Words the command palette also matches on. */
  keywords?: string[];
  /** The second key of its go-to shortcut: g then this key. */
  goKey?: string;
};
export type NavGroup = { label?: string; items: NavItem[] };

const allNavGroups: NavGroup[] = [
  {
    items: [
      { to: "/", label: "Home", goKey: "h", icon: HouseIcon, exact: true, keywords: ["dashboard"] },
    ],
  },
  {
    label: "Donors",
    items: [
      {
        to: "/donors",
        goKey: "d",
        label: "Donors",
        icon: UsersIcon,
        keywords: ["people", "givere"],
      },
      {
        to: "/fundraisers",
        goKey: "f",
        label: "Fundraisers",
        icon: FlagIcon,
        keywords: ["innsamling"],
      },
    ],
  },
  {
    label: "Money in",
    items: [
      {
        to: "/donations",
        goKey: "o",
        label: "Donations",
        icon: HandCoinsIcon,
        keywords: ["donasjoner"],
      },
      {
        to: "/distributions",
        goKey: "k",
        label: "Distributions",
        icon: KeyRoundIcon,
        keywords: ["kid", "split", "fordeling"],
      },
      {
        to: "/intents",
        label: "Intents",
        icon: HourglassIcon,
        keywords: ["intent", "intensjon", "awaiting", "first payment", "unpaid", "follow-up"],
      },
      {
        to: "/import",
        goKey: "i",
        label: "Import",
        icon: ArrowDownToLineIcon,
        // The review queue lives under /import/review and has its own item.
        exact: true,
        keywords: ["register", "upload", "ocr", "report", "bank"],
      },
      {
        to: "/import/review",
        goKey: "r",
        label: "Review queue",
        icon: InboxIcon,
        badge: "reviewQueue",
        keywords: ["manual", "invalid", "unmatched"],
      },
    ],
  },
  {
    label: "Agreements",
    items: [
      {
        to: "/agreements",
        goKey: "a",
        label: "Agreements",
        icon: RepeatIcon,
        // Cancelled agreements live under /agreements/cancelled and have their own item.
        exact: true,
        keywords: ["recurring", "vipps", "avtalegiro", "avtaler"],
      },
      {
        to: "/agreements/cancelled",
        label: "Cancelled agreements",
        icon: CircleOffIcon,
        keywords: ["cancelled", "stopped", "avsluttet", "stoppet", "churn", "reasons", "årsak"],
      },
      {
        to: "/charges",
        goKey: "c",
        label: "Vipps charges",
        icon: SmartphoneIcon,
        keywords: ["refund"],
      },
      {
        to: "/avtalegiro-check",
        label: "AvtaleGiro check",
        icon: CalendarCheckIcon,
        keywords: ["validation", "missing", "expected"],
      },
    ],
  },
  {
    label: "Regranting",
    items: [
      {
        to: "/regranting",
        goKey: "b",
        label: "Balances",
        icon: ScaleIcon,
        exact: true,
        keywords: ["regranting", "tildelinger", "owed", "ikke overført"],
      },
      {
        to: "/regranting/rounds",
        label: "Rounds",
        icon: CoinsIcon,
        keywords: ["regranting", "tildeling", "transfers", "payout", "fund grant"],
      },
      {
        to: "/regranting/check",
        label: "Check numbers",
        icon: ListChecksIcon,
        keywords: ["reconciliation", "kontroll", "overview", "samlefila", "avstemming"],
      },
      {
        to: "/regranting/projects",
        label: "Projects",
        icon: FolderKanbanIcon,
        keywords: ["prosjekt"],
      },
      {
        to: "/regranting/adjustments",
        label: "Adjustments",
        icon: SlidersHorizontalIcon,
        keywords: ["correction", "fee", "opening balance", "fronted", "reallocation"],
      },
      {
        to: "/regranting/settings",
        label: "Payees & funds",
        icon: LandmarkIcon,
        keywords: ["payee", "routing", "own fund", "hold", "mottaker"],
      },
    ],
  },
  {
    label: "Analysis",
    items: [
      {
        to: "/analysis",
        label: "Overview",
        icon: TrendingUpIcon,
        // Pledges live under /analysis/pledges and have their own item.
        exact: true,
        keywords: ["analysis", "analyse", "through time", "gjennom tidene", "milestone", "ticker"],
      },
      {
        to: "/analysis/pledges",
        label: "Pledges",
        icon: HandshakeIcon,
        keywords: ["tilsagn", "pledge", "promised", "decided gift"],
      },
    ],
  },
  {
    label: "Records",
    items: [
      {
        to: "/reports",
        label: "Reports",
        icon: BookOpenIcon,
        keywords: ["transaction report", "accounting"],
      },
      { to: "/logs", goKey: "l", label: "Import log", icon: ScrollTextIcon, keywords: ["logs"] },
    ],
  },
];

export const navGroups = allNavGroups.filter(
  (group) => group.label !== "Regranting" || config.features.regranting,
);

export const settingsItem: NavItem = {
  to: "/settings",
  goKey: "s",
  label: "Settings",
  icon: SettingsIcon,
  keywords: ["cause areas", "organizations", "referral types", "matching rules"],
};
