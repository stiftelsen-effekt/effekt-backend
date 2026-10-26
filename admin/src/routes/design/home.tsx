import { createFileRoute } from "@tanstack/react-router";
import { ArrowDownToLineIcon, SmartphoneIcon } from "lucide-react";
import { BarChart } from "@/components/charts";
import { Money, Num } from "@/components/domain/format";
import { Stat, StatGroup } from "@/components/domain/stat";
import { PageSection } from "@/components/templates";
import { Button } from "@/components/ui/button";
import { importLogs, monthlyTotals, reviewItems } from "@/design-system/fake-data";
import {
  avtaleGiroCheckAttention,
  HomeView,
  reviewQueueAttention,
} from "@/features/home/home-view";
import { formatDate } from "@/lib/format";

export const Route = createFileRoute("/design/home")({
  component: HomeDemo,
});

function HomeDemo() {
  const thisMonth = monthlyTotals.at(-1)!;
  const lastMonth = monthlyTotals.at(-2)!;
  return (
    <HomeView
      greeting="Good morning, Johanna"
      actions={
        <Button variant="primary">
          <ArrowDownToLineIcon />
          Import payments
        </Button>
      }
      attention={[
        ...reviewQueueAttention(reviewItems.length),
        avtaleGiroCheckAttention(3),
        {
          id: "vipps-failed",
          icon: SmartphoneIcon,
          tone: "danger",
          title: "Failed Vipps charges",
          count: 2,
          description: "Charged on the 20th, both donors have expired cards.",
          href: "/design/agreements?status=active",
          action: "See charges",
        },
      ]}
      stats={
        <StatGroup>
          <Stat
            label="Donations in October"
            value={<Money value={thisMonth.total} />}
            delta={thisMonth.total / lastMonth.total - 1}
            deltaLabel="vs. September"
          />
          <Stat label="Donors" value={<Num value={thisMonth.donors} />} hint="gave this month" />
          <Stat
            label="Active agreements"
            value={<Num value={1284} />}
            hint={<Money value={612_400} />}
          />
          <Stat
            label="Transaction costs"
            value={<Money value={8_912} />}
            hint="0.9 % of donations"
          />
        </StatGroup>
      }
      chart={
        <PageSection title="Last 12 months" description="By cause area">
          <BarChart
            data={monthlyTotals}
            xKey="month"
            stacked
            format="money"
            xFormatter={(month) => formatDate(`${month}-01`, "month")}
            series={[
              { key: "health", label: "Global health" },
              { key: "animals", label: "Animal welfare" },
              { key: "climate", label: "Climate" },
              { key: "operations", label: "Operations" },
            ]}
            className="h-60"
          />
        </PageSection>
      }
      recentImports={importLogs}
    />
  );
}
