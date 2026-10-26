import { Section } from "@/components/layout/page";
import { cn } from "@/lib/utils";
import { Specimen } from "./specimen";

const neutrals = [
  ["0", "bg-neutral-0", "#ffffff"],
  ["25", "bg-neutral-25", "#fafafa"],
  ["50", "bg-neutral-50", "#f5f5f5"],
  ["100", "bg-neutral-100", "#ededed"],
  ["150", "bg-neutral-150", "#e3e3e3"],
  ["200", "bg-neutral-200", "#d6d6d6"],
  ["300", "bg-neutral-300", "#bdbdbd"],
  ["400", "bg-neutral-400", "#969696"],
  ["500", "bg-neutral-500", "#737373"],
  ["600", "bg-neutral-600", "#575757"],
  ["700", "bg-neutral-700", "#3d3d3d"],
  ["800", "bg-neutral-800", "#282828"],
  ["850", "bg-neutral-850", "#1e1e1e"],
  ["900", "bg-neutral-900", "#151515"],
  ["950", "bg-neutral-950", "#0c0c0c"],
  ["1000", "bg-neutral-1000", "#000000"],
] as const;

const surfaces = [
  ["background", "bg-background"],
  ["surface / card", "bg-surface"],
  ["muted", "bg-muted"],
  ["subtle", "bg-subtle"],
  ["border", "bg-border"],
  ["border-strong", "bg-border-strong"],
  ["foreground", "bg-foreground"],
  ["muted-foreground", "bg-muted-foreground"],
  ["primary", "bg-primary"],
  ["sidebar", "bg-sidebar"],
] as const;

const semantic = [
  ["accent", "bg-accent", "bg-accent-subtle", "text-accent"],
  ["success", "bg-success", "bg-success-subtle", "text-success"],
  ["warning", "bg-warning", "bg-warning-subtle", "text-warning"],
  ["destructive", "bg-destructive", "bg-destructive-subtle", "text-destructive"],
  ["info", "bg-info", "bg-info-subtle", "text-info"],
] as const;

const typeScale = [
  ["3xl · 36/40", "text-3xl"],
  ["2xl · 28/34", "text-2xl"],
  ["xl · 22/28", "text-xl"],
  ["lg · 18/26", "text-lg"],
  ["md · 16/24", "text-md"],
  ["base · 14/22", "text-base"],
  ["sm · 13/20", "text-sm"],
  ["xs · 12/16", "text-xs"],
  ["2xs · 11/16", "text-2xs"],
] as const;

const radii = [
  ["none · 0", "rounded-none"],
  ["xs · 1px", "rounded-xs"],
  ["sm · 2px", "rounded-sm"],
  ["md · 3px", "rounded-md"],
  ["lg · 4px", "rounded-lg"],
] as const;

const spacing = [
  ["1 · 4px", "w-1"],
  ["2 · 8px", "w-2"],
  ["3 · 12px", "w-3"],
  ["4 · 16px", "w-4"],
  ["6 · 24px", "w-6"],
  ["8 · 32px", "w-8"],
  ["10 · 40px", "w-10"],
  ["16 · 64px", "w-16"],
] as const;

function Swatch({ className, label, hint }: { className: string; label: string; hint?: string }) {
  return (
    <div className="grid min-w-0 gap-1.5">
      <div className={cn("h-10 border border-border", className)} />
      <div className="min-w-0 leading-tight">
        <div className="truncate text-xs font-semibold">{label}</div>
        {hint && <div className="num truncate text-2xs text-muted-foreground">{hint}</div>}
      </div>
    </div>
  );
}

export function TokensSection() {
  return (
    <Section
      title="Tokens"
      description="All colours, sizes and shadows come from these. Tailwind's default palette is removed."
    >
      <div className="grid gap-8">
        <Specimen
          title="Neutral scale"
          description="Replaces the old admin's ad-hoc greys. Raw scale; components use the semantic layer."
          bodyClassName="grid grid-cols-4 gap-3 sm:grid-cols-8 xl:grid-cols-16"
        >
          {neutrals.map(([name, className, hex]) => (
            <Swatch key={name} className={className} label={name} hint={hex} />
          ))}
        </Specimen>

        <Specimen
          title="Semantic surfaces"
          description="Swap per colour scheme. Toggle dark mode in the sidebar to compare."
          bodyClassName="grid grid-cols-2 gap-3 sm:grid-cols-5"
        >
          {surfaces.map(([name, className]) => (
            <Swatch key={name} className={className} label={name} />
          ))}
        </Specimen>

        <Specimen
          title="Accent and status"
          description="One restrained accent (selection, links, focus of attention). Status colours each have a subtle background for badges."
          bodyClassName="grid gap-3 sm:grid-cols-5"
        >
          {semantic.map(([name, solid, subtle, text]) => (
            <div key={name} className="grid gap-1.5">
              <div className="grid h-16 grid-rows-2 border border-border">
                <div className={solid} />
                <div className={cn(subtle, text, "flex items-center px-2 text-xs font-semibold")}>
                  {name}
                </div>
              </div>
              <div className="text-xs font-semibold">{name}</div>
            </div>
          ))}
        </Specimen>

        <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
          <Specimen
            title="Type scale"
            description="ES Klarheit Grotesk for UI; Kurrent for page and section titles."
            bodyClassName="grid gap-2"
          >
            <p className="font-display text-3xl">Kurrent display · Donasjoner</p>
            <p className="font-display text-xl">Section title in Kurrent</p>
            <div className="mt-2 grid gap-1 border-t border-border pt-3">
              {typeScale.map(([label, className]) => (
                <div key={label} className="flex items-baseline gap-4">
                  <span className="num w-24 shrink-0 text-2xs text-muted-foreground">{label}</span>
                  <span className={cn(className, "truncate")}>Gi Effektivt 1 234 567 kr</span>
                </div>
              ))}
            </div>
            <div className="flex items-center gap-4 border-t border-border pt-3">
              <span className="label-caps text-muted-foreground">label-caps</span>
              <span className="font-semibold">Semibold 600</span>
              <span>Regular 400</span>
              <span className="italic">Italic</span>
            </div>
          </Specimen>

          <Specimen
            title="Tabular numerals"
            description="The num utility switches on tnum; columns of money line up without a monospace font."
            bodyClassName="grid grid-cols-2 gap-6"
          >
            <div className="grid gap-0.5 text-right">
              <span className="label-caps text-muted-foreground">Proportional</span>
              <span>1 111 111 kr</span>
              <span>888 080 kr</span>
              <span>41 007 kr</span>
            </div>
            <div className="num grid gap-0.5 text-right">
              <span className="label-caps text-muted-foreground">Tabular</span>
              <span>1 111 111 kr</span>
              <span>888 080 kr</span>
              <span>41 007 kr</span>
            </div>
          </Specimen>
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          <Specimen
            title="Radius"
            description="Near-square. Controls use sm, overlays md/lg."
            bodyClassName="flex gap-4"
          >
            {radii.map(([label, className]) => (
              <div key={label} className="grid justify-items-center gap-1.5">
                <div className={cn("size-10 border-2 border-foreground bg-subtle", className)} />
                <span className="num text-2xs text-muted-foreground">{label}</span>
              </div>
            ))}
          </Specimen>
          <Specimen
            title="Shadow"
            description="raised for subtle lift; overlay for menus, dialogs, toasts."
            bodyClassName="flex gap-6 bg-muted p-6"
          >
            <div className="grid size-20 place-content-center bg-surface text-xs shadow-raised">
              raised
            </div>
            <div className="grid size-20 place-content-center rounded-md bg-surface text-xs shadow-overlay">
              overlay
            </div>
          </Specimen>
          <Specimen title="Spacing" description="4px grid." bodyClassName="grid gap-1.5">
            {spacing.map(([label, className]) => (
              <div key={label} className="flex items-center gap-3">
                <span className="num w-16 text-2xs text-muted-foreground">{label}</span>
                <span className={cn("h-2 bg-foreground", className)} />
              </div>
            ))}
          </Specimen>
        </div>
      </div>
    </Section>
  );
}
