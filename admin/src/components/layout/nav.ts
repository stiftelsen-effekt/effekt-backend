import {
  ActivityIcon,
  AwardIcon,
  FileTextIcon,
  HouseIcon,
  LayoutTemplateIcon,
  ListIcon,
  PaletteIcon,
  PanelRightIcon,
  PieChartIcon,
  SmartphoneIcon,
  TagIcon,
  TargetIcon,
  UploadIcon,
  UserIcon,
  type LucideIcon,
} from "lucide-react";
import type { Locale } from "@/lib/config";

export type NavItem = { to: string; label: string; icon: LucideIcon; exact?: boolean };
export type NavGroup = { label: string; items: NavItem[] };

const overview: NavGroup = {
  label: "Overview",
  items: [
    { to: "/", label: "Home", icon: HouseIcon, exact: true },
    { to: "/donors", label: "Donors", icon: UserIcon },
    { to: "/donations", label: "Donations", icon: ListIcon },
    { to: "/distributions", label: "Distributions", icon: PieChartIcon },
    { to: "/fundraisers", label: "Fundraisers", icon: AwardIcon },
  ],
};

const agreements: Record<Locale, NavGroup> = {
  NO: {
    label: "Agreements",
    items: [
      { to: "/vipps", label: "Vipps", icon: SmartphoneIcon },
      { to: "/avtalegiro", label: "AvtaleGiro", icon: FileTextIcon },
    ],
  },
  SV: {
    label: "Agreements",
    items: [{ to: "/autogiro", label: "AutoGiro", icon: FileTextIcon }],
  },
};

const reporting: NavGroup = {
  label: "Reporting",
  items: [
    { to: "/register", label: "Register", icon: UploadIcon },
    { to: "/logs", label: "Logs", icon: ActivityIcon },
  ],
};

const configuration: NavGroup = {
  label: "Configuration",
  items: [
    { to: "/referral-types", label: "Referrals", icon: TagIcon },
    { to: "/cause-areas", label: "Cause areas", icon: TargetIcon },
  ],
};

export const designNav: NavGroup = {
  label: "Design system",
  items: [
    { to: "/design", label: "Style guide", icon: PaletteIcon, exact: true },
    { to: "/design/list", label: "List page", icon: PanelRightIcon },
    { to: "/design/detail", label: "Detail page", icon: LayoutTemplateIcon },
  ],
};

export function navGroups(locale: Locale, { includeDesign = false } = {}): NavGroup[] {
  const groups = [overview, agreements[locale], reporting, configuration];
  return includeDesign ? [...groups, designNav] : groups;
}
