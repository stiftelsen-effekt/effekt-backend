/**
 * Information architecture. Grouped by job, not by database table:
 *   Home         – what needs attention today
 *   Donors       – people and what they give through (fundraisers)
 *   Money in     – every krone that arrives: donations, the KIDs they use, imports, review
 *   Agreements   – recurring giving, one model across Vipps / AvtaleGiro / AutoGiro
 *   Records      – reports and the import log
 *   Settings     – cause areas, organizations, referral types, matching rules
 * See DESIGN.md › Information architecture.
 */
import {
  ArrowDownToLineIcon,
  BookOpenIcon,
  CalendarCheckIcon,
  FileTextIcon,
  FlagIcon,
  HandCoinsIcon,
  HouseIcon,
  InboxIcon,
  KeyRoundIcon,
  RepeatIcon,
  ScrollTextIcon,
  SettingsIcon,
  SmartphoneIcon,
  TruckIcon,
  UsersIcon,
  type LucideIcon,
} from "lucide-react";
import type { Locale } from "@/lib/config";

export type NavItem = {
  to: string;
  label: string;
  icon: LucideIcon;
  exact?: boolean;
  /** Live count shown next to the label. */
  badge?: "reviewQueue";
  /** Only in these builds; all when omitted. */
  locales?: Locale[];
  /** Words the command palette also matches on. */
  keywords?: string[];
};
export type NavGroup = { label?: string; items: NavItem[] };

export const navGroups: NavGroup[] = [
  { items: [{ to: "/", label: "Home", icon: HouseIcon, exact: true, keywords: ["dashboard"] }] },
  {
    label: "Donors",
    items: [
      { to: "/donors", label: "Donors", icon: UsersIcon, keywords: ["people", "givere"] },
      { to: "/fundraisers", label: "Fundraisers", icon: FlagIcon, keywords: ["innsamling"] },
    ],
  },
  {
    label: "Money in",
    items: [
      { to: "/donations", label: "Donations", icon: HandCoinsIcon, keywords: ["donasjoner"] },
      {
        to: "/distributions",
        label: "Distributions",
        icon: KeyRoundIcon,
        keywords: ["kid", "split", "fordeling"],
      },
      {
        to: "/import",
        label: "Import",
        icon: ArrowDownToLineIcon,
        keywords: ["register", "upload", "ocr", "report", "bank", "totalin"],
      },
      {
        to: "/import/review",
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
        label: "Agreements",
        icon: RepeatIcon,
        keywords: ["recurring", "vipps", "avtalegiro", "autogiro", "avtaler"],
      },
      {
        to: "/charges",
        label: "Vipps charges",
        icon: SmartphoneIcon,
        locales: ["NO"],
        keywords: ["refund"],
      },
      {
        to: "/avtalegiro-check",
        label: "AvtaleGiro check",
        icon: CalendarCheckIcon,
        locales: ["NO"],
        keywords: ["validation", "missing", "expected"],
      },
      { to: "/mandates", label: "Mandates", icon: FileTextIcon, locales: ["SV"] },
      { to: "/shipments", label: "Shipments", icon: TruckIcon, locales: ["SV"] },
    ],
  },
  {
    label: "Records",
    items: [
      {
        to: "/reports",
        label: "Reports",
        icon: BookOpenIcon,
        keywords: ["ku65", "transaction report", "tax"],
      },
      { to: "/logs", label: "Import log", icon: ScrollTextIcon, keywords: ["logs"] },
    ],
  },
];

export const settingsItem: NavItem = {
  to: "/settings",
  label: "Settings",
  icon: SettingsIcon,
  keywords: ["cause areas", "organizations", "referral types", "matching rules"],
};

export function navFor(locale: Locale): NavGroup[] {
  return navGroups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => !item.locales || item.locales.includes(locale)),
    }))
    .filter((group) => group.items.length > 0);
}
