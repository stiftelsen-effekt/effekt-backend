import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ChevronLeftIcon, ChevronRightIcon, ListIcon } from "lucide-react";
import { useAuth } from "@/auth";
import { ErrorState } from "@/components/domain/error-state";
import { Callout } from "@/components/domain/callout";
import { DetailPage } from "@/components/templates";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { defaultOwner } from "@/features/donations/api";
import { formatAmount } from "@/features/donations/edit-model";
import {
  nextOpenId,
  previousOpenId,
  resolverName,
  sourceLabel,
  type ReviewItem,
} from "@/features/review-queue/model";
import { sourceParam, useRegistrationReferenceData } from "@/features/review-queue/queries";
import { ReviewWorkbench } from "@/features/review-queue/review-workbench";
import { useHotkey } from "@/hooks/use-hotkey";
import { notify } from "@/lib/notify";
import { useTRPC } from "@/lib/trpc";

type Search = { source?: string; owner?: string };

export const Route = createFileRoute("/_app/import/review/$id")({
  validateSearch: (raw: Record<string, unknown>): Search => ({
    source: sourceParam.encode(sourceParam.decode(raw.source)),
    owner:
      typeof raw.owner === "string" || typeof raw.owner === "number"
        ? String(raw.owner)
        : undefined,
  }),
  component: ReviewItemPage,
});

const breadcrumbs = [{ label: "Review queue", to: "/import/review" }];

function ReviewItemPage() {
  const params = Route.useParams();
  const search = Route.useSearch();
  const itemId = Number(params.id);
  const sources = sourceParam.decode(search.source);
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const reference = useRegistrationReferenceData();
  const { user } = useAuth();

  const item = useQuery(trpc.reports.reviewQueue.get.queryOptions({ id: itemId }));
  // Open items in the same filter, oldest first: the order the workbench goes through them.
  const open = useQuery({
    ...trpc.reports.reviewQueue.list.queryOptions({
      page: 0,
      limit: 1000,
      sort: { id: "id", desc: false },
      filter: { statuses: ["open"], sources },
    }),
    placeholderData: keepPreviousData,
  });
  const openIds = open.data?.rows.map((row) => row.id) ?? [];
  const openCount = open.data?.counts.open ?? 0;
  const position = openIds.indexOf(itemId);
  const next = nextOpenId(openIds, itemId);
  const previous = previousOpenId(openIds, itemId);

  const register = useMutation(trpc.reports.reviewQueue.register.mutationOptions());
  const ignore = useMutation(trpc.reports.reviewQueue.ignore.mutationOptions());
  const reopen = useMutation(trpc.reports.reviewQueue.reopen.mutationOptions());

  async function refresh(updated?: ReviewItem) {
    if (updated) {
      queryClient.setQueryData(trpc.reports.reviewQueue.get.queryKey({ id: updated.id }), (old) =>
        old ? { ...old, ...updated } : old,
      );
    }
    await queryClient.invalidateQueries({ queryKey: trpc.reports.reviewQueue.pathKey() });
  }

  function goTo(id: number | null) {
    if (id == null) {
      void navigate({ to: "/import/review", search: { source: search.source } });
      return;
    }
    void navigate({
      to: "/import/review/$id",
      params: { id: String(id) },
      search,
    });
  }

  function moveOn() {
    if (next == null) notify.success("The review queue is empty", "Every item has been handled.");
    goTo(next);
  }

  useHotkey("j", () => next != null && goTo(next));
  useHotkey("k", () => previous != null && goTo(previous));

  const header = {
    breadcrumbs,
    actions: (
      <div className="flex items-center gap-2">
        <span className="num text-sm text-muted-foreground" aria-live="polite">
          {position >= 0 ? `${position + 1} of ${openCount} open` : `${openCount} open`}
        </span>
        <Button
          size="icon-sm"
          variant="ghost"
          aria-label="Previous open item (K)"
          disabled={previous == null}
          onClick={() => goTo(previous)}
        >
          <ChevronLeftIcon />
        </Button>
        <Button
          size="icon-sm"
          variant="ghost"
          aria-label="Next open item (J)"
          disabled={next == null}
          onClick={() => goTo(next)}
        >
          <ChevronRightIcon />
        </Button>
        <Button size="sm" asChild>
          <Link to="/import/review" search={{ source: search.source }}>
            <ListIcon />
            All items
          </Link>
        </Button>
      </div>
    ),
  };

  const error = item.error ?? reference.error;
  if (error || !item.data || !reference.data) {
    return (
      <DetailPage title="Review item" {...header}>
        {error ? (
          <ErrorState
            error={error}
            onRetry={() => {
              void item.refetch();
              reference.refetch();
            }}
          />
        ) : (
          <div className="grid gap-6 lg:grid-cols-[22rem_minmax(0,1fr)]">
            <Skeleton className="h-96" />
            <Skeleton className="h-96" />
          </div>
        )}
      </DetailPage>
    );
  }

  const data = item.data;
  const { owners } = reference.data;
  // The owner chosen in the URL, else the one picked when the report was uploaded, else the
  // default owner.
  const known = (id: string | number | null | undefined) =>
    id != null && owners.some((o) => String(o.id) === String(id)) ? String(id) : undefined;
  const ownerId =
    known(search.owner) ?? known(data.metaOwnerId) ?? String(defaultOwner(owners)?.id ?? "");

  return (
    <DetailPage
      title={`${formatAmount(data.amount)} from ${sourceLabel(data.source)}`}
      meta={[`Item #${data.id}`, data.name ?? "Unknown payer"]}
      {...header}
    >
      {data.status !== "open" && next != null && (
        <Callout
          tone="neutral"
          title={`${openCount} open ${openCount === 1 ? "item" : "items"} left`}
          action={
            <Button size="sm" variant="primary" onClick={() => goTo(next)}>
              Next open item
              <ChevronRightIcon />
            </Button>
          }
        />
      )}
      <ReviewWorkbench
        key={`${data.id}:${data.status}`}
        item={data}
        raw={data.raw}
        {...reference.data}
        defaultOwnerId={ownerId}
        importInfo={
          data.importLogId != null ? (
            <Link
              to="/logs/$id"
              params={{ id: String(data.importLogId) }}
              className="text-accent hover:underline"
            >
              Import log #{data.importLogId}
            </Link>
          ) : (
            "Uploaded file (not in the import log)"
          )
        }
        donationLink={(donationId) => (
          <Button size="sm" asChild>
            <Link to="/donations/$id" params={{ id: String(donationId) }}>
              Open donation
            </Link>
          </Button>
        )}
        register={async (input) => {
          const result = await register.mutateAsync(input);
          await refresh(result.item);
          await queryClient.invalidateQueries({ queryKey: trpc.donations.pathKey() });
          notify.success(
            `Registered ${formatAmount(input.sum != null ? String(input.sum) : data.amount)}`,
            `Donation #${result.donationId}`,
            {
              label: "Open donation",
              onClick: () =>
                void navigate({
                  to: "/donations/$id",
                  params: { id: String(result.donationId) },
                }),
            },
          );
          moveOn();
        }}
        ignore={async (note) => {
          const updated = await ignore.mutateAsync({ id: data.id, note });
          await refresh(updated);
          notify.undo(`Ignored item #${data.id}`, () => {
            void reopen
              .mutateAsync({ id: data.id })
              .then((reopened) => refresh(reopened))
              .then(() => {
                notify.success(`Item #${data.id} is open again`);
                goTo(data.id);
              })
              .catch((err: unknown) => notify.error(err, "Couldn't reopen the item"));
          });
          moveOn();
        }}
        reopen={async () => {
          const reopened = await reopen.mutateAsync({ id: data.id });
          await refresh(reopened);
          notify.success(`Reopened item #${data.id}`);
        }}
        onSkip={next != null ? () => goTo(next) : undefined}
        onResolvedElsewhere={(message) => {
          void refresh().then(async () => {
            const latest = await queryClient.fetchQuery(
              trpc.reports.reviewQueue.get.queryOptions({ id: data.id }),
            );
            notify.info(
              `Someone else already resolved item #${data.id}`,
              latest.resolvedBy
                ? `${latest.status === "registered" ? "Registered" : "Ignored"} by ${resolverName(
                    latest.resolvedBy,
                    user,
                  )}.`
                : message,
            );
            moveOn();
          });
        }}
      />
    </DetailPage>
  );
}
