import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowUpRightIcon, FolderIcon, PencilIcon, Trash2Icon } from "lucide-react";
import { ConfirmDialog } from "@/components/domain/confirm-dialog";
import { EmptyState } from "@/components/domain/empty-state";
import { ErrorState } from "@/components/domain/error-state";
import { DateTime, Money } from "@/components/domain/format";
import { Property, PropertyList } from "@/components/domain/property-list";
import { Stat, StatGroup } from "@/components/domain/stat";
import { Status } from "@/components/domain/status";
import { DetailPage, DetailPanel, PageSection } from "@/components/templates";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Pending } from "@/components/ui/pending";
import { SkeletonText } from "@/components/ui/skeleton";
import { adjustmentTypeLabels } from "@/features/regranting/model";
import { ProjectDialog } from "@/features/regranting/project-dialog";
import { RecipientLink, RoundLink } from "@/features/regranting/ui";
import { sumMoney } from "@/lib/money";
import { notify } from "@/lib/notify";
import { loadPage } from "@/lib/route-data";
import { projectStatus, roundStatus } from "@/lib/status";
import { errorCode, useTRPC } from "@/lib/trpc";

export const Route = createFileRoute("/_app/regranting/projects/$id")({
  loader: ({ context: { queryClient, trpc }, params, cause }) => {
    const projectId = Number(params.id);
    if (!Number.isInteger(projectId) || projectId <= 0) return;
    return loadPage(
      queryClient,
      cause,
      trpc.regranting.projects.get.queryOptions({ id: projectId }),
    );
  },
  component: ProjectRoute,
});

function ProjectRoute() {
  const { id } = Route.useParams();
  const projectId = Number(id);
  if (!Number.isInteger(projectId) || projectId <= 0)
    return (
      <EmptyState
        icon={FolderIcon}
        title="No such project"
        description={`“${id}” isn't a project ID.`}
        className="flex-1"
      />
    );
  return <ProjectPage projectId={projectId} />;
}

const th = "text-left text-xs text-muted-foreground [&>th]:px-3 [&>th]:py-2 [&>th]:font-semibold";
const td = "[&>td]:border-t [&>td]:border-border [&>td]:px-3 [&>td]:py-1.5";

function ProjectPage({ projectId }: { projectId: number }) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const query = useQuery(trpc.regranting.projects.get.queryOptions({ id: projectId }));
  const remove = useMutation(trpc.regranting.projects.delete.mutationOptions());

  if (query.isError)
    return (
      <div className="p-6">
        <ErrorState
          back={{ to: "/regranting/projects", label: "All projects" }}
          error={query.error}
          title={
            errorCode(query.error) === "NOT_FOUND"
              ? `No project #${projectId}`
              : "Couldn't load the project"
          }
          onRetry={() => void query.refetch()}
        />
      </div>
    );

  const page = query.data;
  const p = page?.project;
  const f = page?.figures;
  const sent = page
    ? sumMoney(page.transferLines.filter((l) => l.roundStatus === "paid").map((l) => l.amountNok))
    : null;
  const hasEntries = page
    ? page.transferLines.length + page.fundGrantLines.length + page.adjustments.length > 0
    : true;

  return (
    <DetailPage
      breadcrumbs={[{ label: "Projects", to: "/regranting/projects" }]}
      title={p?.name ?? <SkeletonText>Cash transfers in Malawi</SkeletonText>}
      adornment={p && <Status catalog={projectStatus} value={p.status} />}
      meta={
        p
          ? [
              <RecipientLink key="org" organizationId={p.organizationId}>
                {p.organizationName}
              </RecipientLink>,
              p.country && <span key="country">{p.country}</span>,
              page?.hold && (
                <Badge key="hold" tone="warning" title={page.hold.reason}>
                  On hold
                </Badge>
              ),
            ]
          : [<SkeletonText key="org">GiveDirectly</SkeletonText>]
      }
      actions={
        p && (
          <>
            <ProjectDialog
              project={p}
              trigger={
                <Button>
                  <PencilIcon />
                  Edit
                </Button>
              }
            />
            <ConfirmDialog
              trigger={
                <Button
                  variant="ghost"
                  aria-label="Delete project"
                  disabled={hasEntries}
                  title={
                    hasEntries
                      ? "It has lines or adjustments; set its status to cancelled instead"
                      : undefined
                  }
                >
                  <Trash2Icon />
                </Button>
              }
              tone="danger"
              title={`Delete the project ${p.name}?`}
              consequences={["Nothing points at it yet, so no balance changes"]}
              confirmLabel="Delete project"
              onConfirm={async () => {
                await remove.mutateAsync({ id: p.id });
                await queryClient.invalidateQueries({ queryKey: trpc.regranting.pathKey() });
                notify.success("Project deleted", p.name);
                void navigate({ to: "/regranting/projects" });
              }}
            />
          </>
        )
      }
      stats={
        // No hint lines, so the values alone are placeholders (Stat pending reserves a hint).
        <StatGroup>
          <Stat
            label="Balance today"
            value={f ? <Money value={f.balance} signed /> : <SkeletonText>00 000 kr</SkeletonText>}
          />
          <Stat
            label="Committed"
            value={f ? <Money value={f.committed} /> : <SkeletonText>00 000 kr</SkeletonText>}
          />
          <Stat
            label="Fund grants in"
            value={f ? <Money value={f.fundGrantsIn} /> : <SkeletonText>00 000 kr</SkeletonText>}
          />
          <Stat
            label="Paid to the project"
            value={sent !== null ? <Money value={sent} /> : <SkeletonText>00 000 kr</SkeletonText>}
          />
        </StatGroup>
      }
      aside={
        <DetailPanel title="Project">
          {!p ? (
            <PropertyList labelWidth="8rem">
              <Property label="Recipient" pending placeholder="GiveDirectly" />
              <Property label="Country" pending placeholder="Malawi" />
              <Property label="Period" pending placeholder="00.00.0000 – 00.00.0000" />
              <Property label="Status" pending placeholder="Active" />
              <Property label="Agreement" pending placeholder="GD-2026-07" />
              <Property label="Next report due" pending placeholder="00.00.0000" />
              <Property label="Documents" pending placeholder="Open" />
              <Property label="Hold" pending placeholder="–" />
              <Property label="Description" pending placeholder="A short description" />
            </PropertyList>
          ) : (
            <PropertyList labelWidth="8rem">
              <Property label="Recipient">
                {p && (
                  <RecipientLink organizationId={p.organizationId}>
                    {p.organizationName}
                  </RecipientLink>
                )}
              </Property>
              <Property label="Country">{p.country}</Property>
              <Property label="Period">
                {p && (p.startDate || p.endDate) && (
                  <span>
                    <DateTime value={p.startDate} /> – <DateTime value={p.endDate} />
                  </span>
                )}
              </Property>
              <Property label="Status">
                {p && <Status catalog={projectStatus} value={p.status} />}
              </Property>
              <Property label="Agreement">{p?.agreementRef}</Property>
              <Property label="Next report due">
                {p?.reportDue && <DateTime value={p.reportDue} />}
              </Property>
              <Property label="Documents">
                {p?.documentsUrl && (
                  <a
                    href={p.documentsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-0.5 rounded-xs text-accent hover:underline focus-ring"
                  >
                    Open
                    <ArrowUpRightIcon className="size-3.5" aria-hidden />
                    <span className="sr-only">(opens in a new tab)</span>
                  </a>
                )}
              </Property>
              <Property label="Hold">{page?.hold?.reason}</Property>
              <Property label="Description">{p?.description}</Property>
            </PropertyList>
          )}
        </DetailPanel>
      }
    >
      {/* Three tables of unknown length: their space is reserved until they arrive together. */}
      {!page ? (
        <Pending className="min-h-96" label="Loading the project" />
      ) : (
        <>
          <PageSection
            title="Transfers"
            description="Every transfer line to this project, in any round."
          >
            {page.transferLines.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nothing sent to this project yet.</p>
            ) : (
              <div className="overflow-x-auto rounded-md border border-border">
                <table className="w-full text-sm" aria-label="Transfer lines">
                  <thead>
                    <tr className={th}>
                      <th scope="col">Round</th>
                      <th scope="col">Status</th>
                      <th scope="col">Payee</th>
                      <th scope="col">Transfer</th>
                      <th scope="col">Paid</th>
                      <th scope="col" className="text-right">
                        Amount
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {page.transferLines.map((l) => (
                      <tr key={l.lineId} className={td}>
                        <td>
                          <RoundLink id={l.roundId}>{l.roundName}</RoundLink>
                        </td>
                        <td>
                          <Status catalog={roundStatus} value={l.roundStatus} />
                        </td>
                        <td>{l.payee.name}</td>
                        <td className="num text-muted-foreground">#{l.transferId}</td>
                        <td>
                          <DateTime value={l.paidAt} />
                        </td>
                        <td className="text-right font-semibold">
                          <Money value={l.amountNok} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </PageSection>
          <PageSection title="Fund grants" description="Grants from our own funds to this project.">
            {page.fundGrantLines.length === 0 ? (
              <p className="text-sm text-muted-foreground">No fund grants to this project.</p>
            ) : (
              <div className="overflow-x-auto rounded-md border border-border">
                <table className="w-full text-sm" aria-label="Fund grant lines">
                  <thead>
                    <tr className={th}>
                      <th scope="col">Round</th>
                      <th scope="col">Status</th>
                      <th scope="col">Fund</th>
                      <th scope="col">Cutoff</th>
                      <th scope="col">Rationale</th>
                      <th scope="col" className="text-right">
                        Amount
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {page.fundGrantLines.map((l) => (
                      <tr key={l.lineId} className={td}>
                        <td>
                          <RoundLink id={l.roundId}>{l.roundName}</RoundLink>
                        </td>
                        <td>
                          <Status catalog={roundStatus} value={l.roundStatus} />
                        </td>
                        <td>
                          <RecipientLink organizationId={l.fundId}>{l.fundName}</RecipientLink>
                        </td>
                        <td>
                          <DateTime value={l.cutoff} />
                        </td>
                        <td className="max-w-md truncate" title={l.rationale}>
                          {l.rationale}
                        </td>
                        <td className="text-right font-semibold">
                          <Money value={l.amount} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </PageSection>
          <PageSection title="Adjustments">
            {page.adjustments.length === 0 ? (
              <p className="text-sm text-muted-foreground">No adjustments.</p>
            ) : (
              <div className="overflow-x-auto rounded-md border border-border">
                <table className="w-full text-sm" aria-label="Adjustments">
                  <thead>
                    <tr className={th}>
                      <th scope="col">Date</th>
                      <th scope="col">Type</th>
                      <th scope="col">Reason</th>
                      <th scope="col">By</th>
                      <th scope="col" className="text-right">
                        Amount
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {page.adjustments.map((a) => (
                      <tr key={a.id} className={td}>
                        <td>
                          <DateTime value={a.effectiveAt} />
                        </td>
                        <td>{adjustmentTypeLabels[a.type]}</td>
                        <td className="max-w-md truncate" title={a.reason}>
                          {a.reason}
                        </td>
                        <td className="text-muted-foreground">{a.createdBy}</td>
                        <td className="text-right">
                          <Money value={a.amount} signed />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </PageSection>
        </>
      )}
    </DetailPage>
  );
}
