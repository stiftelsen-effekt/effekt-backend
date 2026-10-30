import type { CauseArea } from "../../components/shared/components/Widget/types/CauseArea";
import type { Organization } from "../../components/shared/components/Widget/types/Organization";
import type { RouterOutputs } from "./client";

type TrpcOrganization = RouterOutputs["site"]["organizations"][number];
type TrpcCauseArea = RouterOutputs["widget"]["causeAreas"][number];

/**
 * The website's Organization and CauseArea types (Widget/types) predate the tRPC schemas, which
 * accept null for the texts both backends may leave out. These map the procedures' output to them:
 * null becomes undefined for optional fields, "" for required texts, 0 for a missing ordering.
 */
export const toOrganization = (org: TrpcOrganization): Organization => ({
  id: org.id,
  causeAreaId: org.causeAreaId,
  name: org.name,
  isActive: org.isActive,
  ordering: org.ordering ?? 0,
  standardShare: org.standardShare ?? undefined,
  widgetDisplayName: org.widgetDisplayName ?? undefined,
  widgetContext: org.widgetContext ?? undefined,
  abbreviation: org.abbreviation ?? undefined,
  shortDescription: org.shortDescription ?? undefined,
  longDescription: org.longDescription ?? undefined,
  informationUrl: org.informationUrl ?? undefined,
});

export const toCauseArea = (causeArea: TrpcCauseArea): CauseArea => ({
  id: causeArea.id,
  name: causeArea.name,
  isActive: causeArea.isActive,
  ordering: causeArea.ordering ?? 0,
  standardPercentageShare: causeArea.standardPercentageShare ?? undefined,
  widgetDisplayName: causeArea.widgetDisplayName ?? undefined,
  widgetContext: causeArea.widgetContext ?? undefined,
  shortDescription: causeArea.shortDescription ?? "",
  longDescription: causeArea.longDescription ?? "",
  informationUrl: causeArea.informationUrl ?? "",
  organizations: causeArea.organizations.map(toOrganization),
});
