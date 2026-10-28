import { CheckIcon, TriangleAlertIcon } from "lucide-react";
import { useEffect, useId, useState, type KeyboardEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  fillRemaining,
  setOrganizationShare,
  setShare,
  setStandardSplit,
  standardDraft,
  validateDraft,
  type CauseAreaConfig,
  type DistributionDraft,
} from "@/features/distribution/model";
import { orgSlices, showCauseAreas, type OrgSlice } from "@/features/distribution/orgs";
import { formatNumber } from "@/lib/format";
import type { MoneyInput } from "@/lib/money";
import { cn } from "@/lib/utils";
import { formatShare as pct, OrgSplitBar, OrgSplitLegend, OrgSwatch } from "./org-split";

/**
 * Stacked bar of the organizations a split gives to, in their colours. Unplaced share shows
 * as a hatched gap, overflow in red.
 */
export function AllocationBar({
  draft,
  config,
  className,
}: {
  draft: DistributionDraft;
  config: CauseAreaConfig[];
  className?: string;
}) {
  const total = draft.causeAreas.reduce((sum, area) => sum + area.share, 0);
  return (
    <OrgSplitBar
      slices={orgSlices(draft, config)}
      unplaced={Math.max(0, 100 - total)}
      overflow={Math.max(0, total - 100)}
      className={className}
    />
  );
}

/**
 * A percentage field: accepts "33,3" and "33.3", ↑/↓ step by 1 (Shift: 10), clamps to
 * 0–100. Commits on every valid keystroke so the bar and totals update live.
 */
export function PercentInput({
  value,
  onChange,
  label,
  disabled,
  invalid,
  className,
}: {
  value: number;
  onChange: (value: number) => void;
  label: string;
  disabled?: boolean;
  invalid?: boolean;
  className?: string;
}) {
  const [text, setText] = useState(formatNumber(value, { decimals: value % 1 ? 2 : 0 }));
  useEffect(() => {
    setText((current) =>
      parse(current) === value ? current : formatNumber(value, { decimals: value % 1 ? 2 : 0 }),
    );
  }, [value]);

  function parse(raw: string) {
    const parsed = Number(raw.replace(/[\s  %]/g, "").replace(",", "."));
    return raw.trim() === "" ? 0 : Number.isFinite(parsed) ? parsed : null;
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
    event.preventDefault();
    const step = (event.shiftKey ? 10 : 1) * (event.key === "ArrowUp" ? 1 : -1);
    onChange(Math.min(100, Math.max(0, Math.round(value + step))));
  }

  return (
    <div className={cn("relative w-20 shrink-0", className)}>
      <Input
        inputMode="decimal"
        aria-label={label}
        aria-invalid={invalid || undefined}
        disabled={disabled}
        value={text}
        className="num pr-6 text-right"
        onFocus={(event) => event.currentTarget.select()}
        onChange={(event) => {
          setText(event.target.value);
          const parsed = parse(event.target.value);
          if (parsed !== null) onChange(Math.min(100, Math.max(0, parsed)));
        }}
        onBlur={() => setText(formatNumber(value, { decimals: value % 1 ? 2 : 0 }))}
        onKeyDown={onKeyDown}
      />
      <span className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 text-sm text-muted-foreground">
        %
      </span>
    </div>
  );
}

/** Organizations and their share of the whole split, on one wrapping line. */
function InlineLegend({ slices, className }: { slices: OrgSlice[]; className?: string }) {
  return (
    <ul className={cn("flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground", className)}>
      {slices.map((slice) => (
        <li key={slice.id ?? "other"} className="inline-flex items-center gap-1.5">
          <OrgSwatch slice={slice} />
          <span className="text-foreground">{slice.name}</span>
          <span className="num">{pct(slice.share)}</span>
        </li>
      ))}
    </ul>
  );
}

/**
 * The one way to edit a distribution, wherever it appears (registering a donation, editing
 * a donation or agreement, creating a KID, the review queue). Live totals at both levels,
 * standard split per cause area, keyboard steppers, one-click fixes for the remainder.
 * Controlled: keep the draft in the form and convert with draftToApi on submit.
 */
export function DistributionEditor({
  value,
  onChange,
  config,
  disabled,
  className,
}: {
  value: DistributionDraft;
  onChange: (draft: DistributionDraft) => void;
  config: CauseAreaConfig[];
  disabled?: boolean;
  className?: string;
}) {
  const validation = validateDraft(value);
  const statusId = useId();
  const tone = validation.valid ? "success" : validation.total > 100 ? "danger" : "warning";
  const status =
    validation.total === 0
      ? "Nothing placed yet: give each cause area a share"
      : validation.error ??
        (validation.valid ? "All 100 % placed" : "Organization shares don't add up");

  const slices = orgSlices(value, config);
  const colorOf = new Map(slices.map((slice) => [slice.id, slice.color]));
  const total = validation.total;

  return (
    <fieldset
      data-slot="distribution-editor"
      disabled={disabled}
      aria-describedby={statusId}
      className={cn("grid gap-0 rounded-md border border-border bg-surface", className)}
    >
      <legend className="sr-only">Distribution</legend>
      <div className="grid gap-2.5 border-b border-border px-4 py-3">
        <OrgSplitBar
          slices={slices}
          unplaced={Math.max(0, 100 - total)}
          overflow={Math.max(0, total - 100)}
        />
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <p
            id={statusId}
            aria-live="polite"
            className={cn(
              "flex flex-1 items-center gap-1.5 text-sm",
              tone === "success" && "text-success",
              tone === "warning" && "text-warning",
              tone === "danger" && "text-danger",
            )}
          >
            {validation.valid ? (
              <CheckIcon className="size-4" aria-hidden />
            ) : (
              <TriangleAlertIcon className="size-4" aria-hidden />
            )}
            <span className="num font-semibold">{status}</span>
          </p>
          <Button size="sm" variant="ghost" onClick={() => onChange(standardDraft(config))}>
            Use recommended split
          </Button>
        </div>
      </div>

      <ul className="divide-y divide-border">
        {value.causeAreas.map((area) => {
          const areaConfig = config.find((c) => c.id === area.id);
          if (!areaConfig) return null;
          const areaValidation = validation.causeAreas[area.id];
          const used = area.share > 0;
          return (
            <li
              key={area.id}
              className={cn("group/area grid gap-2 px-4 py-2.5", !used && "bg-muted/50")}
            >
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                <span
                  className={cn(
                    "min-w-0 flex-1 text-sm",
                    used ? "font-semibold" : "text-muted-foreground",
                  )}
                >
                  {areaConfig.name}
                </span>
                {validation.remaining > 0 && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="num h-6 px-1.5 text-xs text-muted-foreground opacity-0 group-hover/area:opacity-100 focus-visible:opacity-100"
                    onClick={() => onChange(fillRemaining(value, area.id))}
                  >
                    + {pct(validation.remaining)}
                  </Button>
                )}
                <PercentInput
                  label={`${areaConfig.name} share`}
                  value={area.share}
                  onChange={(share) => onChange(setShare(value, area.id, share))}
                />
                <label
                  className={cn(
                    "flex w-36 items-center justify-end gap-2 text-sm text-muted-foreground max-sm:w-full max-sm:justify-start",
                    !used && "invisible",
                  )}
                >
                  Standard split
                  <Switch
                    checked={area.standardSplit}
                    disabled={!used}
                    onCheckedChange={(checked) =>
                      onChange(setStandardSplit(value, config, area.id, checked))
                    }
                  />
                </label>
              </div>
              {used && area.standardSplit && (
                <InlineLegend
                  className="ml-1.5 border-l border-border pl-4"
                  slices={slices.filter((slice) => slice.causeAreaId === area.id)}
                />
              )}
              {used && !area.standardSplit && (
                <div className="ml-1.5 grid gap-1.5 border-l border-border pl-4">
                  {area.organizations.map((org) => {
                    const orgConfig = areaConfig.organizations.find((o) => o.id === org.id);
                    return (
                      <div key={org.id} className="flex items-center gap-3">
                        {colorOf.has(org.id) ? (
                          <OrgSwatch slice={{ color: colorOf.get(org.id)! }} />
                        ) : (
                          <span
                            className="size-2.5 shrink-0 rounded-xs border border-border-strong"
                            aria-hidden
                          />
                        )}
                        <span className="min-w-0 flex-1 truncate text-sm">
                          {orgConfig?.name ?? org.id}
                        </span>
                        <PercentInput
                          label={`${orgConfig?.name ?? org.id} share of ${areaConfig.name}`}
                          value={org.share}
                          invalid={Boolean(areaValidation?.error)}
                          onChange={(share) =>
                            onChange(setOrganizationShare(value, area.id, org.id, share))
                          }
                        />
                        <span className="w-36 max-sm:hidden" />
                      </div>
                    );
                  })}
                  {areaValidation?.error && (
                    <p className="text-xs text-danger" role="alert">
                      {areaValidation.error}
                    </p>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </fieldset>
  );
}

/**
 * Read-only distribution for detail pages and peeks: one bar of organizations and a legend
 * with each one's share (and part of `amount`, when given). Cause areas appear, as small
 * group headers, only when they add something: more than one, or one that isn't Global
 * Health. For list cells use `OrgSparkline`.
 */
export function DistributionSummary({
  draft,
  config,
  amount,
  className,
}: {
  draft: DistributionDraft;
  config: CauseAreaConfig[];
  /** The donation or agreement amount, to show each organization's part. */
  amount?: MoneyInput | null;
  className?: string;
}) {
  const slices = orgSlices(draft, config, amount);
  const used = draft.causeAreas.filter((area) => area.share > 0);
  const grouped = showCauseAreas(draft, config);
  const standard = used.length > 0 && used.every((area) => area.standardSplit);
  return (
    <div data-slot="distribution-summary" className={cn("grid gap-3", className)}>
      <OrgSplitBar slices={slices} />
      {grouped ? (
        <div className="grid gap-3">
          {used.map((area) => (
            <section key={area.id} className="grid gap-1.5">
              <h4 className="flex items-baseline gap-2 text-xs text-muted-foreground">
                <span className="font-semibold text-foreground">
                  {config.find((c) => c.id === area.id)?.name ?? `Cause area ${area.id}`}
                </span>
                <span className="num">{pct(area.share)}</span>
                {area.standardSplit && <span>· standard split</span>}
              </h4>
              <OrgSplitLegend slices={slices.filter((slice) => slice.causeAreaId === area.id)} />
            </section>
          ))}
        </div>
      ) : (
        <OrgSplitLegend slices={slices} />
      )}
      {!grouped && standard && <p className="text-xs text-muted-foreground">Standard split</p>}
    </div>
  );
}
