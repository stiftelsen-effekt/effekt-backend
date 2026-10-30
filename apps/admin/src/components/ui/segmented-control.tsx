import { RadioGroup as RadioGroupPrimitive } from "radix-ui";
import { cn } from "@/lib/utils";

/**
 * Two to four mutually exclusive modes shown side by side ("Existing KID" / "New
 * distribution"). For longer option lists use Select; for on/off use Switch.
 */
export function SegmentedControl<V extends string>({
  value,
  onValueChange,
  options,
  label,
  className,
}: {
  value: V;
  onValueChange: (value: V) => void;
  options: { value: V; label: string }[];
  label: string;
  className?: string;
}) {
  return (
    <RadioGroupPrimitive.Root
      aria-label={label}
      value={value}
      onValueChange={(next) => onValueChange(next as V)}
      orientation="horizontal"
      className={cn(
        "inline-flex w-fit h-control items-center gap-0.5 rounded-sm bg-pressed p-0.5",
        className,
      )}
    >
      {options.map((option) => (
        <RadioGroupPrimitive.Item
          key={option.value}
          value={option.value}
          className={cn(
            "h-full rounded-xs px-3 text-sm font-semibold text-muted-foreground transition-colors focus-ring",
            "hover:text-foreground data-[state=checked]:bg-surface data-[state=checked]:text-foreground",
            "data-[state=checked]:shadow-[0_1px_2px_rgb(0_0_0/0.12)]",
          )}
        >
          {option.label}
        </RadioGroupPrimitive.Item>
      ))}
    </RadioGroupPrimitive.Root>
  );
}
