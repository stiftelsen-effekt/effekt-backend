import { XIcon } from "lucide-react";
import { Dialog as DialogPrimitive } from "radix-ui";
import type * as React from "react";
import { cn } from "@/lib/utils";
import { overlayClasses } from "./overlay";

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogPortal = DialogPrimitive.Portal;
export const DialogClose = DialogPrimitive.Close;

export function DialogOverlay({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Overlay>) {
  return (
    <DialogPrimitive.Overlay
      data-slot="dialog-overlay"
      className={cn(overlayClasses, className)}
      {...props}
    />
  );
}

/**
 * ⌘/Ctrl+Enter in a dialog: submits its form, or presses its primary button when it has
 * no form (a confirm step). Disabled or pending buttons stay unpressed.
 */
function submitOnModEnter(event: React.KeyboardEvent<HTMLDivElement>) {
  if (event.key !== "Enter" || !(event.metaKey || event.ctrlKey) || event.defaultPrevented) return;
  const content = event.currentTarget;
  if (!content.contains(event.target as Node)) return; // a portal inside (a popover) has its own keys
  const form = content.querySelector("form");
  // The form's own submit button (possibly in the footer, `form="…"`), else the primary one.
  const button = form
    ? [...content.querySelectorAll<HTMLButtonElement>("button[type=submit]")].find(
        (b) => b.form === form,
      )
    : [...content.querySelectorAll<HTMLButtonElement>("button[data-variant=primary]")].at(-1);
  if (!form && !button) return;
  event.preventDefault();
  if (button && (button.disabled || button.dataset.pending !== undefined)) return;
  if (form) form.requestSubmit(button ?? undefined);
  else button?.click();
}

export function DialogContent({
  className,
  children,
  showCloseButton = true,
  onKeyDown,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content> & { showCloseButton?: boolean }) {
  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Content
        data-slot="dialog-content"
        className={cn(
          "fixed top-1/2 left-1/2 z-50 grid max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2",
          "gap-4 overflow-y-auto rounded-lg border border-border bg-popover p-6 text-popover-foreground shadow-overlay outline-none",
          "data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-[0.98]",
          "data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-[0.98]",
          className,
        )}
        onKeyDown={(event) => {
          onKeyDown?.(event);
          submitOnModEnter(event);
        }}
        {...props}
      >
        {children}
        {showCloseButton && (
          <DialogPrimitive.Close
            data-slot="dialog-close"
            className="absolute top-4 right-4 grid size-7 place-content-center rounded-sm text-muted-foreground transition-colors focus-ring hover:bg-hover hover:text-foreground"
          >
            <XIcon className="size-4" />
            <span className="sr-only">Close</span>
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Content>
    </DialogPortal>
  );
}

export function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div data-slot="dialog-header" className={cn("grid gap-1.5 pr-8", className)} {...props} />
  );
}

export function DialogFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn("flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end", className)}
      {...props}
    />
  );
}

export function DialogTitle({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn("text-lg font-semibold", className)}
      {...props}
    />
  );
}

export function DialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  );
}
