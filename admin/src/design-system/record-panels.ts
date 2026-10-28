import type { PanelRoute } from "@/components/panels";

/** The /design record panels: the donation demo and the donor detail template. */
export const designPanels: PanelRoute[] = [
  {
    kind: "donation",
    routeId: "/design/donations/$id",
    path: "/design/donations/$id",
    label: ([id]) => `Donation #${id}`,
  },
  { kind: "donor", routeId: "/design/detail", path: "/design/detail", label: () => "Donor #1387" },
];
