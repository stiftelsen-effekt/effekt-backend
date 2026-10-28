import { Link, type LinkProps } from "@tanstack/react-router";
import {
  ArrowLeftIcon,
  CircleAlertIcon,
  CloudOffIcon,
  LockIcon,
  RotateCwIcon,
  SearchXIcon,
  WifiOffIcon,
} from "lucide-react";
import { strings } from "@/lib/strings";
import { errorCode } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

/** Maps any thrown error to plain-language copy. Used by ErrorState and notify.error. */
export function describeError(error: unknown) {
  const code = errorCode(error);
  const message = error instanceof Error ? error.message : String(error ?? "");
  if (code === "UNAUTHORIZED")
    return {
      icon: LockIcon,
      title: strings.errors.unauthorized,
      hint: strings.errors.unauthorizedHint,
    };
  if (code === "FORBIDDEN")
    return { icon: LockIcon, title: strings.errors.forbidden, hint: strings.errors.forbiddenHint };
  if (code === "NOT_FOUND")
    return { icon: SearchXIcon, title: strings.errors.notFound, hint: strings.errors.notFoundHint };
  if (code === "BAD_REQUEST" || code === "CONFLICT")
    // Server validation messages are written for people; show them as the hint.
    return { icon: CircleAlertIcon, title: "That didn't work", hint: message };
  if (code === "BAD_GATEWAY")
    // A payment provider (Vipps) refused or couldn't be reached; the server names the action.
    return {
      icon: CloudOffIcon,
      title: message || strings.errors.upstream,
      hint: strings.errors.upstreamHint,
    };
  if (/fetch|network|load failed/i.test(message))
    return { icon: WifiOffIcon, title: strings.errors.network, hint: strings.errors.networkHint };
  return { icon: CircleAlertIcon, title: strings.errors.generic, hint: strings.errors.genericHint };
}

/**
 * A failed load, in place of the content that failed. Always offer a retry when possible. A
 * record that doesn't exist (deleted, merged) won't appear on retry, so NOT_FOUND shows `back`
 * (a link to the list) instead.
 */
export function ErrorState({
  error,
  title,
  onRetry,
  back,
  className,
}: {
  error: unknown;
  title?: string;
  onRetry?: () => void;
  /** Where to go when the record doesn't exist, e.g. { to: "/donors", label: "All donors" }. */
  back?: { to: string; label: string };
  className?: string;
}) {
  const info = describeError(error);
  const notFound = errorCode(error) === "NOT_FOUND";
  const Icon = info.icon;
  const message = error instanceof Error ? error.message : undefined;
  return (
    <div
      role="alert"
      data-slot="error-state"
      className={cn("flex items-start gap-3 rounded-md bg-danger-subtle p-4", className)}
    >
      <Icon className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden />
      <div className="grid min-w-0 flex-1 gap-1">
        <p className="font-semibold text-foreground">{title ?? info.title}</p>
        {info.hint && <p className="text-sm text-foreground/80">{info.hint}</p>}
        {message && message !== info.hint && message !== (title ?? info.title) && (
          <p className="truncate font-mono text-xs text-muted-foreground" title={message}>
            {message}
          </p>
        )}
      </div>
      {notFound
        ? back && (
            <Button size="sm" asChild>
              <Link to={back.to as LinkProps["to"]}>
                <ArrowLeftIcon />
                {back.label}
              </Link>
            </Button>
          )
        : onRetry && (
            <Button size="sm" onClick={onRetry}>
              <RotateCwIcon />
              {strings.actions.retry}
            </Button>
          )}
    </div>
  );
}
