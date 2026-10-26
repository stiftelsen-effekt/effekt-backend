import {
  CircleAlertIcon,
  CircleCheckIcon,
  InfoIcon,
  LoaderIcon,
  TriangleAlertIcon,
} from "lucide-react";
import { Toaster as Sonner, type ToasterProps } from "sonner";
import { useTheme } from "@/hooks/use-theme";

export function Toaster(props: ToasterProps) {
  const { resolved } = useTheme();
  return (
    <Sonner
      theme={resolved}
      position="bottom-right"
      gap={8}
      icons={{
        success: <CircleCheckIcon className="size-4 text-success" />,
        info: <InfoIcon className="size-4 text-info" />,
        warning: <TriangleAlertIcon className="size-4 text-warning" />,
        error: <CircleAlertIcon className="size-4 text-destructive" />,
        loading: <LoaderIcon className="size-4 animate-spin text-muted-foreground" />,
      }}
      toastOptions={{
        unstyled: true,
        classNames: {
          toast:
            "group flex w-(--width) items-start gap-2.5 rounded-md border border-border bg-popover p-3 text-sm text-popover-foreground shadow-overlay",
          title: "font-semibold leading-5",
          description: "text-muted-foreground leading-5",
          icon: "mt-0.5 flex size-4 shrink-0 items-center",
          content: "flex flex-1 flex-col gap-0.5",
          actionButton:
            "ml-auto h-7 shrink-0 rounded-sm bg-primary px-2.5 text-xs font-semibold text-primary-foreground",
          cancelButton:
            "h-7 shrink-0 rounded-sm bg-secondary px-2.5 text-xs font-semibold text-foreground",
          closeButton: "border-border bg-popover text-muted-foreground",
          error: "border-l-2 border-l-destructive",
          success: "border-l-2 border-l-success",
          warning: "border-l-2 border-l-warning",
          info: "border-l-2 border-l-info",
        },
      }}
      {...props}
    />
  );
}
