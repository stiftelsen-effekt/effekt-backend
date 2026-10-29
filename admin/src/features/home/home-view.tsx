import { CalendarCheckIcon, InboxIcon, SparklesIcon } from "lucide-react";
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import {
  AttentionClear,
  AttentionList,
  type AttentionItem,
} from "@/components/domain/attention-list";
import { DateTime } from "@/components/domain/format";
import { EmptyState } from "@/components/domain/empty-state";
import { SkeletonText } from "@/components/ui/skeleton";
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

/** Home asks for the six most recent imports; the placeholder has as many rows. */
export const RECENT_IMPORTS = 6;
const placeholderRows = Array.from({ length: RECENT_IMPORTS }, (_, index) => index);

export type ImportLogRow = RouterOutputs["reports"]["logs"]["list"]["rows"][number];

/**
 * Home: attention first, numbers second, recent activity last. Used by the real route
 * and by the /design demo, which passes fake data of the same shapes.
 */
export function HomeView({
  greeting,
  attention,
  attentionLoading = false,
  stats,
  chart,
  recentImports,
  recentImportsError,
  actions,
}: {
  greeting: string;
  attention: AttentionItem[];
  /**
   * While the checks behind `attention` are loading: placeholder rows (a number: that many,
   * e.g. as many as last time), so neither a partial list nor "nothing needs you" shows
   * before all checks are in.
   */
  attentionLoading?: boolean | number;
  stats?: ReactNode;
  chart?: ReactNode;
  recentImports: ImportLogRow[] | undefined;
  /** Shown in place of the recent imports when they failed to load. */
  recentImportsError?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div data-page-scroll className="min-h-0 flex-1 overflow-y-auto">
      <PageHeader title={greeting} actions={actions} />
      <div className="grid gap-8 px-4 pb-10 sm:px-6">
        <PageSection title="Needs attention">
          <AttentionList
            pending={attentionLoading}
            items={attention}
            empty={
              <AttentionClear
                icon={SparklesIcon}
                title="Nothing needs you right now"
                description="No open review items, missing AvtaleGiro payments or failed Vipps charges."
              />
            }
          />
        </PageSection>
        {stats && <PageSection title="This month">{stats}</PageSection>}
        <div className="grid gap-8 xl:grid-cols-2">
          {chart}
          <PageSection
            title="Recent imports"
            actions={
              <Link
                to="/logs"
                className="rounded-xs text-sm font-semibold text-accent hover:underline focus-ring"
              >
                Import log
              </Link>
            }
          >
            {recentImportsError ? (
              recentImportsError
            ) : recentImports?.length === 0 ? (
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
                  <TableBody aria-busy={!recentImports || undefined}>
                    {!recentImports &&
                      placeholderRows.map((index) => (
                        <TableRow key={index}>
                          <TableCell>
                            <SkeletonText>Import source name</SkeletonText>
                          </TableCell>
                          <TableCell className="text-right">
                            <SkeletonText>#0000</SkeletonText>
                          </TableCell>
                          <TableCell className="text-right">
                            <SkeletonText>2 days ago</SkeletonText>
                          </TableCell>
                        </TableRow>
                      ))}
                    {recentImports?.map((log) => (
                      <TableRow key={log.ID}>
                        <TableCell className="font-semibold">
                          <Link
                            to="/logs/$id"
                            params={{ id: String(log.ID) }}
                            className="rounded-xs hover:underline focus-ring"
                          >
                            {log.label ?? "Unknown"}
                          </Link>
                        </TableCell>
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
          href: "/import/review",
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
