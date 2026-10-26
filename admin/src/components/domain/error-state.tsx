import { CircleAlertIcon, LockIcon, RotateCwIcon, WifiOffIcon } from "lucide-react";
import { errorCode } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

function describe(error: unknown) {
  const code = errorCode(error);
  if (code === "UNAUTHORIZED")
    return {
      icon: LockIcon,
      title: "Not signed in",
      hint: "Your session has expired. Sign in again.",
    };
  if (code === "FORBIDDEN")
    return {
      icon: LockIcon,
      title: "No access",
      hint: "Your account lacks the admin permission for this.",
    };
  const message = error instanceof Error ? error.message : String(error ?? "");
  if (/fetch|network|load failed/i.test(message))
    return {
      icon: WifiOffIcon,
      title: "Can't reach the API",
      hint: "Check that the backend is running and VITE_API_URL is correct.",
    };
  return { icon: CircleAlertIcon, title: "Something went wrong", hint: undefined };
}

export function ErrorState({
  error,
  title,
  onRetry,
  className,
}: {
  error: unknown;
  title?: string;
  onRetry?: () => void;
  className?: string;
}) {
  const info = describe(error);
  const Icon = info.icon;
  const message = error instanceof Error ? error.message : undefined;
  return (
    <div
      role="alert"
      data-slot="error-state"
      className={cn(
        "flex items-start gap-3 border border-destructive/30 border-l-2 border-l-destructive bg-destructive-subtle p-4",
        className,
      )}
    >
      <Icon className="mt-0.5 size-4 shrink-0 text-destructive" />
      <div className="grid min-w-0 flex-1 gap-1">
        <p className="font-semibold text-foreground">{title ?? info.title}</p>
        {info.hint && <p className="text-sm text-foreground/80">{info.hint}</p>}
        {message && (
          <p className="truncate font-mono text-xs text-muted-foreground" title={message}>
            {message}
          </p>
        )}
      </div>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry} className="bg-background">
          <RotateCwIcon />
          Retry
        </Button>
      )}
    </div>
  );
}
