import { useQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { SettingsPage, useScrollTopOn } from "@/components/templates";
import { CauseAreasSection } from "@/features/settings/cause-areas-section";
import { DataOwnersSection, MatchingRulesSection } from "@/features/settings/other-sections";
import { ReferralTypesSection } from "@/features/settings/referral-types-section";
import { config } from "@/lib/config";
import { useTRPC } from "@/lib/trpc";

const isNorway = config.locale === "NO";
const sectionIds = ["cause-areas", "referrals", "owners", ...(isNorway ? ["matching"] : [])];
type SectionId = "cause-areas" | "referrals" | "owners" | "matching";

export const Route = createFileRoute("/_app/settings")({
  validateSearch: (search: Record<string, unknown>): { section?: SectionId } =>
    typeof search.section === "string" && sectionIds.includes(search.section)
      ? { section: search.section as SectionId }
      : {},
  component: SettingsRoute,
});

function SettingsRoute() {
  const { section = "cause-areas" } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  useScrollTopOn(section);
  const trpc = useTRPC();
  // Counts for the section list; the sections share these queries.
  const areas = useQuery(trpc.config.causeAreas.listAll.queryOptions());
  const referrals = useQuery(trpc.config.referralTypes.listAll.queryOptions());
  const owners = useQuery(trpc.meta.owners.queryOptions());
  const rules = useQuery({ ...trpc.vipps.matchingRules.list.queryOptions(), enabled: isNorway });

  const nav = [
    { id: "cause-areas", label: "Cause areas", count: areas.data?.length },
    { id: "referrals", label: "Referral types", count: referrals.data?.length },
    { id: "owners", label: "Data owners", count: owners.data?.length },
    ...(isNorway
      ? [{ id: "matching", label: "Vipps matching rules", count: rules.data?.length }]
      : []),
  ];

  return (
    <SettingsPage
      nav={nav}
      value={section}
      description="Changes here affect what donors see in the donation widget and how imports are matched."
      onValueChange={(id) =>
        void navigate({
          search: id === "cause-areas" ? {} : { section: id as SectionId },
          replace: true,
        })
      }
    >
      {section === "cause-areas" && <CauseAreasSection />}
      {section === "referrals" && <ReferralTypesSection />}
      {section === "owners" && <DataOwnersSection />}
      {section === "matching" && isNorway && <MatchingRulesSection />}
    </SettingsPage>
  );
}
