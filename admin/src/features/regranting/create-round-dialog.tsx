import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { XIcon } from "lucide-react";
import { useState, type ReactNode } from "react";
import { DateTime, Money } from "@/components/domain/format";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ChoiceCards } from "@/components/ui/choice-cards";
import { DateInput } from "@/components/ui/date-input";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Updating } from "@/components/ui/pending";
import { parseMoneyInput } from "@/features/donations/form";
import { RecordDialog, textError } from "@/features/settings/record-dialog";
import { addDays, osloDay } from "@/lib/dates";
import { formatDate } from "@/lib/format";
import { notify } from "@/lib/notify";
import { usePageQuery } from "@/lib/query";
import { useTRPC } from "@/lib/trpc";
import { roundKindDescriptions, roundKindLabels, roundKinds, type RoundKind } from "./model";

type ChosenDonation = { id: number; donor: string; sum: string; timestamp: string };

type RoundForm = {
  kind: RoundKind;
  name: string;
  cutoff: string;
  minTransfer: string;
  donations: ChosenDonation[];
};

/** The last day of the previous month: the usual cutoff for a regular round. */
function lastMonthEnd(today = osloDay()) {
  return addDays(`${today.slice(0, 8)}01`, -1);
}

const monthName = (day: string) =>
  new Date(`${day}T12:00:00Z`).toLocaleString("en-GB", { month: "long", year: "numeric" });

export function validateRound(values: RoundForm) {
  return {
    name: textError(values.name, { label: "a name", max: 255, required: true }),
    cutoff: values.cutoff ? undefined : "Enter the cutoff date",
    minTransfer:
      values.minTransfer.trim() === "" || parseMoneyInput(values.minTransfer) !== null
        ? undefined
        : "Enter an amount in kroner, like 1000 or 249,50",
    donationIds:
      values.kind === "major_donor" && values.donations.length === 0
        ? "Choose the donations this round passes on"
        : undefined,
  };
}

/** New round: kind, name, cutoff, minimum transfer, and for major donor rounds the donations. */
export function CreateRoundDialog({ trigger }: { trigger: ReactNode }) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const create = useMutation(trpc.regranting.rounds.create.mutationOptions());

  return (
    <RecordDialog<RoundForm>
      trigger={trigger}
      title="New round"
      description="The round starts as a draft with the proposed amounts. Nothing is paid until someone else approves it."
      contentClassName="sm:max-w-2xl"
      initial={() => {
        const cutoff = lastMonthEnd();
        return {
          kind: "regular",
          name: `${monthName(cutoff)} regular round`,
          cutoff,
          minTransfer: "",
          donations: [],
        };
      }}
      validate={validateRound}
      saveLabel="Create draft"
      onSave={async (values) => {
        const builder = await create.mutateAsync({
          kind: values.kind,
          name: values.name.trim(),
          cutoff: values.cutoff,
          minTransfer: Number(parseMoneyInput(values.minTransfer) ?? "0"),
          donationIds:
            values.kind === "major_donor" ? values.donations.map((d) => d.id) : undefined,
        });
        await queryClient.invalidateQueries({ queryKey: trpc.regranting.pathKey() });
        notify.success("Draft round created", builder.round.name);
        void navigate({ to: "/regranting/rounds/$id", params: { id: String(builder.round.id) } });
      }}
    >
      {({ values, set, errors }) => (
        <>
          <ChoiceCards
            label="Kind of round"
            value={values.kind}
            onValueChange={(kind) =>
              set({
                kind,
                name: `${monthName(values.cutoff || lastMonthEnd())} ${roundKindLabels[
                  kind
                ].toLowerCase()} round`,
              })
            }
            options={roundKinds.map((kind) => ({
              value: kind,
              label: roundKindLabels[kind],
              description: roundKindDescriptions[kind],
            }))}
          />
          <Field label="Name" required error={errors.name}>
            <Input value={values.name} onChange={(e) => set({ name: e.target.value })} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Cutoff"
              required
              error={errors.cutoff}
              hint="Money dated on or before this day counts"
            >
              <DateInput value={values.cutoff} onValueChange={(cutoff) => set({ cutoff })} />
            </Field>
            <Field
              label="Minimum transfer"
              error={errors.minTransfer}
              hint="Recipients owed less than this are left for a later round"
            >
              <Input
                inputMode="decimal"
                className="num"
                placeholder="0"
                value={values.minTransfer}
                onChange={(e) => set({ minTransfer: e.target.value })}
              />
            </Field>
          </div>
          {values.kind === "major_donor" && (
            <DonationChooser
              chosen={values.donations}
              onChange={(donations) => set({ donations })}
              error={errors.donationIds}
            />
          )}
        </>
      )}
    </RecordDialog>
  );
}

/** Search donations (id, KID, donor name or email, dates) and pick the ones to pass on. */
export function DonationChooser({
  chosen,
  onChange,
  error,
}: {
  chosen: ChosenDonation[];
  onChange: (donations: ChosenDonation[]) => void;
  error?: string;
}) {
  const trpc = useTRPC();
  const [query, setQuery] = useState("");
  const [from, setFrom] = useState(addDays(osloDay(), -90));
  // Typing keeps the current matches (dimmed) until the new ones are in.
  const results = usePageQuery(
    trpc.donations.list.queryOptions({
      page: 0,
      limit: 8,
      sort: { id: "sum", desc: true },
      filter: { ...(query.trim() ? { query: query.trim() } : {}), date: { from } },
    }),
  );
  const chosenIds = new Set(chosen.map((d) => d.id));
  const toggle = (d: ChosenDonation) =>
    onChange(chosenIds.has(d.id) ? chosen.filter((c) => c.id !== d.id) : [...chosen, d]);

  return (
    <fieldset className="grid gap-2" aria-describedby={error ? "donations-error" : undefined}>
      <legend className="mb-1 text-sm font-semibold">Donations to pass on</legend>
      <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_10rem]">
        <Field label="Find donations" hint="Donation ID, KID, donor name or email">
          <Input value={query} onChange={(e) => setQuery(e.target.value)} />
        </Field>
        <Field label="Received from">
          <DateInput value={from} onValueChange={setFrom} />
        </Field>
      </div>
      <Updating active={results.isPlaceholderData}>
        <ul
          aria-label="Matching donations, largest first"
          aria-busy={results.isFetching || undefined}
          className="grid max-h-56 overflow-y-auto rounded-md border border-border"
        >
          {(results.data?.rows ?? []).map((row) => {
            const donation = {
              id: row.id,
              donor: row.donor ?? "",
              sum: row.sum,
              timestamp: row.timestamp,
            };
            return (
              <li key={row.id} className="border-b border-border last:border-b-0">
                <label className="flex cursor-pointer items-center gap-3 px-3 py-1.5 text-sm hover:bg-hover">
                  <Checkbox
                    checked={chosenIds.has(row.id)}
                    onCheckedChange={() => toggle(donation)}
                  />
                  <span className="num w-16 text-muted-foreground">#{row.id}</span>
                  <span className="min-w-0 flex-1 truncate">{row.donor}</span>
                  <DateTime value={row.timestamp} />
                  <Money value={row.sum} className="w-28 text-right font-semibold" />
                </label>
              </li>
            );
          })}
          {results.data && results.data.rows.length === 0 && (
            <li className="px-3 py-4 text-sm text-muted-foreground">
              No donations match since {formatDate(from)}.
            </li>
          )}
        </ul>
      </Updating>
      {chosen.length > 0 && (
        <ul aria-label="Chosen donations" className="flex flex-wrap gap-1.5">
          {chosen.map((d) => (
            <li
              key={d.id}
              className="inline-flex items-center gap-1 rounded-sm bg-pressed py-0.5 pr-0.5 pl-2 text-xs"
            >
              <span className="num">#{d.id}</span> · {d.donor} · <Money value={d.sum} />
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="size-5"
                aria-label={`Remove donation ${d.id}`}
                onClick={() => toggle(d)}
              >
                <XIcon />
              </Button>
            </li>
          ))}
        </ul>
      )}
      {error && (
        <p id="donations-error" className="text-sm font-semibold text-danger">
          {error}
        </p>
      )}
    </fieldset>
  );
}
