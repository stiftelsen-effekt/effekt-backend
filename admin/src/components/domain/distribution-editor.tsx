import { CheckIcon, CornerDownRightIcon, TriangleAlertIcon } from "lucide-react";
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
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

const swatches = ["bg-chart-1", "bg-chart-2", "bg-chart-3", "bg-chart-4", "bg-chart-5"];
const swatch = (index: number) => swatches[index % swatches.length]!;

const pct = (value: number) => `${formatNumber(value, { decimals: value % 1 ? 1 : 0 })}\u00a0%`;

/** Stacked bar of cause area shares. Unplaced share shows as a hatched gap, overflow in red. */
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
  const scale = Math.max(total, 100);
  return (
    <div
      role="img"
      aria-label={draft.causeAreas
        .filter((area) => area.share > 0)
        .map((area) => `${config.find((c) => c.id === area.id)?.name}: ${pct(area.share)}`)
        .join(", ")}
      className={cn("flex h-2.5 w-full gap-px overflow-hidden rounded-full bg-border", className)}
    >
      {draft.causeAreas.map((area, index) =>
        area.share > 0 ? (
          <div
            key={area.id}
            className={cn("h-full transition-[width] duration-(--duration-base)", swatch(index))}
            style={{ width: `${(area.share / scale) * 100}%` }}
          />
        ) : null,
      )}
      {total < 100 && (
        <div
          className="h-full flex-1 bg-[repeating-linear-gradient(135deg,var(--border-strong)_0_3px,transparent_3px_6px)]"
          aria-hidden
        />
      )}
      {total > 100 && (
        <div className="h-full bg-danger" style={{ width: `${((total - 100) / scale) * 100}%` }} />
      )}
    </div>
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
    validation.error ??
    (validation.valid ? "All 100 % placed" : "Organization shares don't add up");

  return (
    <fieldset
      data-slot="distribution-editor"
      disabled={disabled}
      aria-describedby={statusId}
      className={cn("grid gap-0 rounded-md border border-border bg-surface", className)}
    >
      <legend className="sr-only">Distribution</legend>
      <div className="grid gap-2.5 border-b border-border px-4 py-3">
        <AllocationBar draft={value} config={config} />
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
        {value.causeAreas.map((area, index) => {
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
                <span className={cn("size-2.5 shrink-0 rounded-full", swatch(index))} aria-hidden />
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
              {used && !area.standardSplit && (
                <div className="ml-1.5 grid gap-1.5 border-l border-border pl-4">
                  {area.organizations.map((org) => {
                    const orgConfig = areaConfig.organizations.find((o) => o.id === org.id);
                    return (
                      <div key={org.id} className="flex items-center gap-3">
                        <CornerDownRightIcon
                          className="size-3.5 text-faint-foreground"
                          aria-hidden
                        />
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

/** Read-only distribution for detail pages and the peek panel. */
export function DistributionSummary({
  draft,
  config,
  className,
}: {
  draft: DistributionDraft;
  config: CauseAreaConfig[];
  className?: string;
}) {
  return (
    <div data-slot="distribution-summary" className={cn("grid gap-3", className)}>
      <AllocationBar draft={draft} config={config} />
      <ul className="grid gap-2 text-sm">
        {draft.causeAreas.map((area, index) => {
          if (area.share <= 0) return null;
          const areaConfig = config.find((c) => c.id === area.id);
          return (
            <li key={area.id} className="grid gap-1">
              <div className="flex items-center gap-2">
                <span className={cn("size-2 shrink-0 rounded-full", swatch(index))} aria-hidden />
                <span className="flex-1 font-semibold">{areaConfig?.name}</span>
                <span className="num font-semibold">{pct(area.share)}</span>
              </div>
              <p className="pl-4 text-xs text-muted-foreground">
                {area.standardSplit
                  ? "Standard split"
                  : area.organizations
                      .filter((org) => org.share > 0)
                      .map(
                        (org) =>
                          `${
                            areaConfig?.organizations.find((o) => o.id === org.id)?.name ?? org.id
                          } ${pct(org.share)}`,
                      )
                      .join(" · ")}
              </p>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
