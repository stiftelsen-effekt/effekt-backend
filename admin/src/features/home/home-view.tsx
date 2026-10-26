import { CalendarCheckIcon, InboxIcon, SparklesIcon } from "lucide-react";
import type { ReactNode } from "react";
import { AttentionList, type AttentionItem } from "@/components/domain/attention-list";
import { DateTime } from "@/components/domain/format";
import { EmptyState } from "@/components/domain/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PageHeader, PageSection } from "@/components/templates";
import type { RouterOutputs } from "@/lib/trpc";

export type ImportLogRow = RouterOutputs["reports"]["logs"]["list"]["rows"][number];

/**
 * Home: attention first, numbers second, recent activity last. Used by the real route
 * and by the /design demo, which passes fake data of the same shapes.
 */
export function HomeView({
  greeting,
  attention,
  stats,
  chart,
  recentImports,
  actions,
}: {
  greeting: string;
  attention: AttentionItem[];
  stats?: ReactNode;
  chart?: ReactNode;
  recentImports: ImportLogRow[] | undefined;
  actions?: ReactNode;
}) {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <PageHeader title={greeting} actions={actions} />
      <div className="grid gap-8 px-4 pb-10 sm:px-6">
        <PageSection title="Needs attention">
          <AttentionList
            items={attention}
            empty={
              <EmptyState
                icon={SparklesIcon}
                size="sm"
                title="Nothing needs you right now"
                description="No open review items or failed charges."
                className="rounded-md border border-border"
              />
            }
          />
        </PageSection>
        {stats && <PageSection title="This month">{stats}</PageSection>}
        <div className="grid gap-8 xl:grid-cols-2">
          {chart}
          <PageSection title="Recent imports">
            {recentImports === undefined ? (
              <div className="grid gap-2">
                <Skeleton className="h-8" />
                <Skeleton className="h-8" />
                <Skeleton className="h-8" />
              </div>
            ) : recentImports.length === 0 ? (
              <EmptyState icon={InboxIcon} size="sm" title="No imports yet" />
            ) : (
              <div className="overflow-hidden rounded-md border border-border">
                <Table aria-label="Recent imports">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Source</TableHead>
                      <TableHead className="text-right">Log</TableHead>
                      <TableHead className="text-right">When</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {recentImports.map((log) => (
                      <TableRow key={log.ID}>
                        <TableCell className="font-semibold">{log.label ?? "Unknown"}</TableCell>
                        <TableCell className="num text-right text-muted-foreground">
                          #{log.ID}
                        </TableCell>
                        <TableCell className="text-right">
                          <DateTime value={log.timestamp} format="relative" />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </PageSection>
        </div>
      </div>
    </div>
  );
}

export function reviewQueueAttention(open: number): AttentionItem[] {
  return open > 0
    ? [
        {
          id: "review",
          icon: InboxIcon,
          tone: "warning",
          title: "Transactions to review",
          count: open,
          description: "From imported payment reports that could not be matched to a KID.",
          href: "/review",
          action: "Review",
        },
      ]
    : [];
}

export const avtaleGiroCheckAttention = (missing: number): AttentionItem => ({
  id: "avtalegiro",
  icon: CalendarCheckIcon,
  tone: "danger",
  title: "AvtaleGiro payments missing",
  count: missing,
  description: "Expected today but not in the OCR file.",
  href: "/avtalegiro-check",
  action: "Check",
});
