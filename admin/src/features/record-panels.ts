import type { PanelRoute } from "@/components/panels";

/**
 * Record pages that open as panels over a list (components/panels). A row or a link inside a
 * panel whose target is one of these paths opens it on top; anything else navigates. The
 * review workbench is a flow with its own next/previous, so it stays a page.
 */
export const recordPanels: PanelRoute[] = [
  {
    kind: "donor",
    routeId: "/_app/donors/$id",
    path: "/donors/$id",
    label: ([id]) => `Donor #${id}`,
  },
  {
    kind: "donation",
    routeId: "/_app/donations/$id/",
    path: "/donations/$id",
    label: ([id]) => `Donation #${id}`,
  },
  {
    kind: "kid",
    routeId: "/_app/distributions/$kid",
    path: "/distributions/$kid",
    label: ([kid]) => `KID ${kid}`,
  },
  {
    kind: "agreement",
    routeId: "/_app/agreements/$provider/$id",
    path: "/agreements/$provider/$id",
    label: ([provider, id]) =>
      `${provider === "avtalegiro" ? "AvtaleGiro" : "Vipps"} agreement ${id}`,
  },
  {
    kind: "fundraiser",
    routeId: "/_app/fundraisers/$id",
    path: "/fundraisers/$id",
    label: ([id]) => `Fundraiser #${id}`,
  },
  {
    kind: "log",
    routeId: "/_app/logs/$id",
    path: "/logs/$id",
    label: ([id]) => `Log entry #${id}`,
  },
  {
    kind: "round",
    routeId: "/_app/regranting/rounds/$id",
    path: "/regranting/rounds/$id",
    label: ([id]) => `Round #${id}`,
  },
  {
    kind: "project",
    routeId: "/_app/regranting/projects/$id",
    path: "/regranting/projects/$id",
    label: ([id]) => `Project #${id}`,
  },
  {
    kind: "recipient",
    routeId: "/_app/regranting/recipients/$organizationId",
    path: "/regranting/recipients/$organizationId",
    label: ([id]) => `Recipient statement #${id}`,
  },
];
