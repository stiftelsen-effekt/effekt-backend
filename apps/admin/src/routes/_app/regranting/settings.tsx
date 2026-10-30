import { useQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { SettingsPage, useScrollTopOn } from "@/components/templates";
import {
  FundsSection,
  HoldsSection,
  PayeesSection,
  RoutingSection,
} from "@/features/regranting/settings-sections";
import { useTRPC } from "@/lib/trpc";

const sectionIds = ["payees", "routing", "funds", "holds"] as const;
type SectionId = (typeof sectionIds)[number];

export const Route = createFileRoute("/_app/regranting/settings")({
  validateSearch: (search: Record<string, unknown>): { section?: SectionId } =>
    typeof search.section === "string" && (sectionIds as readonly string[]).includes(search.section)
      ? { section: search.section as SectionId }
      : {},
  component: RegrantingSettings,
});

function RegrantingSettings() {
  const { section = "payees" } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  useScrollTopOn(section);
  const trpc = useTRPC();
  const payees = useQuery(trpc.regranting.payees.list.queryOptions());
  const routings = useQuery(trpc.regranting.routings.list.queryOptions());
  const funds = useQuery(trpc.regranting.funds.list.queryOptions());
  const holds = useQuery(trpc.regranting.holds.list.queryOptions());

  return (
    <SettingsPage
      title="Payees & funds"
      description="Who receives the money, our own funds and holds. Rounds read these at their cutoff."
      nav={[
        { id: "payees", label: "Payees", count: payees.data?.length },
        { id: "routing", label: "Routing", count: routings.data?.length },
        { id: "funds", label: "Own funds", count: funds.data?.length },
        { id: "holds", label: "Holds", count: holds.data?.length },
      ]}
      value={section}
      onValueChange={(id) =>
        void navigate({
          search: id === "payees" ? {} : { section: id as SectionId },
          replace: true,
        })
      }
    >
      {section === "payees" && <PayeesSection />}
      {section === "routing" && <RoutingSection />}
      {section === "funds" && <FundsSection />}
      {section === "holds" && <HoldsSection />}
    </SettingsPage>
  );
}
