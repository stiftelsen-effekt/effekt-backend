import { Tabs as TabsPrimitive } from "radix-ui";
import type * as React from "react";
import { SkeletonText } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export function Tabs({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Root>) {
  return (
    <TabsPrimitive.Root
      data-slot="tabs"
      className={cn("flex flex-col gap-4", className)}
      {...props}
    />
  );
}

export function TabsList({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.List>) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      className={cn(
        "flex w-full items-end gap-6 overflow-x-auto border-b border-border",
        className,
      )}
      {...props}
    />
  );
}

export function TabsTrigger({
  className,
  count,
  children,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Trigger> & {
  /**
   * Badge after the label. `null` while the count is loading: the badge's space is reserved
   * so the tabs don't move when it arrives. Leave undefined for no badge.
   */
  count?: number | null;
}) {
  return (
    <TabsPrimitive.Trigger
      data-slot="tabs-trigger"
      className={cn(
        "group relative -mb-px inline-flex h-9 shrink-0 items-center gap-1.5 border-b-2 border-transparent text-sm font-semibold whitespace-nowrap text-muted-foreground",
        "transition-colors outline-none hover:text-foreground",
        "focus-visible:rounded-xs focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring",
        "data-[state=active]:border-accent data-[state=active]:text-foreground",
        "disabled:pointer-events-none disabled:opacity-40",
        "[&_svg]:size-4 [&_svg]:shrink-0",
        className,
      )}
      {...props}
    >
      {children}
      {count === null ? (
        <SkeletonText className="min-w-5 rounded-sm px-1 text-xs leading-4">0</SkeletonText>
      ) : count !== undefined ? (
        <span className="num min-w-5 rounded-sm bg-pressed px-1 text-center text-xs leading-4 font-semibold text-muted-foreground group-data-[state=active]:text-foreground">
          {count}
        </span>
      ) : null}
    </TabsPrimitive.Trigger>
  );
}

export function TabsContent({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return (
    <TabsPrimitive.Content
      data-slot="tabs-content"
      className={cn("outline-none focus-visible:outline-2 focus-visible:outline-ring", className)}
      {...props}
    />
  );
}
