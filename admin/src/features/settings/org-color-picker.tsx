import { useId } from "react";
import { swatchClasses } from "@/components/charts/chart";
import { ORG_COLORS, orgColor, type ColoredOrg, type OrgColor } from "@/features/distribution/orgs";
import { cn } from "@/lib/utils";

/** Names for the organization palette, in its order (docs/admin-design.md › Tokens › Charts). */
export const orgColorNames: Record<OrgColor, string> = {
  "chart-1": "Ink",
  "chart-2": "Blue",
  "chart-3": "Ochre",
  "chart-4": "Teal",
  "chart-10": "Violet",
  "chart-11": "Rose",
  "chart-12": "Olive",
  "chart-6": "Soft ink",
  "chart-7": "Soft blue",
  "chart-8": "Soft ochre",
  "chart-9": "Soft teal",
  "chart-13": "Soft violet",
  "chart-14": "Soft rose",
  "chart-15": "Soft olive",
};

type NamedOrg = ColoredOrg & { name: string; abbreviation?: string; isActive: boolean };

/** Which organizations (other than `selfId`) use each colour, active ones first. */
export function colorUsage(orgs: readonly NamedOrg[], selfId?: number) {
  const usage = new Map<OrgColor, NamedOrg[]>(ORG_COLORS.map((color) => [color, []]));
  for (const org of orgs) {
    if (org.id === selfId) continue;
    usage.get(orgColor(org))!.push(org);
  }
  for (const list of usage.values()) list.sort((a, b) => Number(b.isActive) - Number(a.isActive));
  return usage;
}

/** The first colour no active organization uses, for a new organization. */
export function freeOrgColor(orgs: readonly NamedOrg[]): OrgColor {
  const used = new Set(orgs.filter((org) => org.isActive).map(orgColor));
  return ORG_COLORS.find((color) => !used.has(color)) ?? ORG_COLORS[0];
}

/**
 * The organization's chart colour: one swatch per palette colour (arrow keys move between
 * them, like any radio group), each with the other organizations already using it.
 */
export function OrgColorPicker({
  value,
  onChange,
  organizations,
  selfId,
}: {
  value: OrgColor;
  onChange: (color: OrgColor) => void;
  /** All organizations, to show which colours are taken. */
  organizations: readonly NamedOrg[];
  /** The organization being edited, left out of "used by". */
  selfId?: number;
}) {
  const name = useId();
  const usage = colorUsage(organizations, selfId);
  return (
    <fieldset className="grid gap-1.5">
      <legend className="mb-1.5 text-sm font-semibold">Chart colour</legend>
      <div
        className="grid grid-cols-2 gap-1 sm:grid-cols-7"
        role="radiogroup"
        aria-label="Chart colour"
      >
        {ORG_COLORS.map((color) => {
          const users = usage.get(color)!;
          const label = users.length
            ? `${orgColorNames[color]}, used by ${users.map((org) => org.name).join(", ")}`
            : `${orgColorNames[color]}, unused`;
          return (
            <label
              key={color}
              title={label}
              className={cn(
                "grid min-w-0 cursor-pointer justify-items-center gap-1 rounded-sm p-1.5 hover:bg-hover",
                "has-[:checked]:bg-accent-subtle has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-ring",
              )}
            >
              <input
                type="radio"
                name={name}
                value={color}
                checked={value === color}
                onChange={() => onChange(color)}
                aria-label={label}
                className="sr-only"
              />
              <span
                aria-hidden
                data-color={color}
                className={cn(
                  "size-6 rounded-sm ring-offset-2 ring-offset-background",
                  swatchClasses[color],
                  value === color && "ring-2 ring-foreground",
                )}
              />
              <span
                aria-hidden
                className={cn(
                  "w-full truncate text-center text-xs",
                  users.length ? "text-muted-foreground" : "text-faint-foreground",
                )}
              >
                {users.length
                  ? users.map((org) => org.abbreviation || org.name).join(", ")
                  : "Free"}
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
