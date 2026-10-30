import type { LucideIcon } from "lucide-react";
import { RadioGroup as RadioGroupPrimitive } from "radix-ui";
import { cn } from "@/lib/utils";

/**
 * A single choice where each option needs a sentence of explanation (import source, report
 * type). Arrow keys move between cards, like any radio group.
 */
export function ChoiceCards<V extends string>({
  value,
  onValueChange,
  options,
  label,
  className,
}: {
  value: V | undefined;
  onValueChange: (value: V) => void;
  options: { value: V; label: string; description?: string; icon?: LucideIcon; meta?: string }[];
  label: string;
  className?: string;
}) {
  return (
    <RadioGroupPrimitive.Root
      aria-label={label}
      // "" keeps the group controlled while nothing is chosen
      value={value ?? ""}
      onValueChange={(next) => onValueChange(next as V)}
      className={cn("grid gap-2 sm:grid-cols-2", className)}
    >
      {options.map((option) => {
        const Icon = option.icon;
        return (
          <RadioGroupPrimitive.Item
            key={option.value}
            value={option.value}
            className={cn(
              "group flex items-start gap-3 rounded-md border border-border-strong bg-surface p-3 text-left transition-colors focus-ring",
              "hover:border-input data-[state=checked]:border-accent data-[state=checked]:bg-accent-subtle/60 data-[state=checked]:shadow-[inset_0_0_0_1px_var(--accent)]",
            )}
          >
            {Icon && (
              <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground group-data-[state=checked]:text-accent" />
            )}
            <span className="grid min-w-0 flex-1 gap-0.5">
              <span className="flex items-center gap-2 text-sm font-semibold">
                {option.label}
                {option.meta && (
                  <span className="text-xs font-normal text-muted-foreground">{option.meta}</span>
                )}
              </span>
              {option.description && (
                <span className="text-sm text-muted-foreground">{option.description}</span>
              )}
            </span>
            <span
              aria-hidden
              className="mt-0.5 grid size-4 shrink-0 place-content-center rounded-full border border-input group-data-[state=checked]:border-accent"
            >
              <span className="size-2 rounded-full bg-accent opacity-0 group-data-[state=checked]:opacity-100" />
            </span>
          </RadioGroupPrimitive.Item>
        );
      })}
    </RadioGroupPrimitive.Root>
  );
}
