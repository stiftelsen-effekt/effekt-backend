import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { ChevronsUpDownIcon, FlaskConicalIcon } from "lucide-react";
import { useAuth } from "@/auth";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

function formatSeededAt(value: string | null) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleString("nb-NO", { dateStyle: "short", timeStyle: "short" });
}

/**
 * In preview environments, at the bottom of the sidebar: says the data is synthetic, who you
 * are, and lets you switch person (two-person flows such as regranting approval need two
 * people). Part of the layout, not floating, so it never covers page controls.
 */
export function PreviewBanner() {
  const auth = useAuth();
  const queryClient = useQueryClient();
  const router = useRouter();
  const preview = auth.preview;
  if (!preview) return null;

  const { current, users, info } = preview;
  const seededAt = formatSeededAt(info?.seededAt ?? null);
  const details = [
    info?.pr ? `PR #${info.pr}` : null,
    info?.sha ? info.sha.slice(0, 7) : null,
    seededAt ? `seeded ${seededAt}` : null,
  ].filter(Boolean);

  async function switchTo(userId: string) {
    if (userId === current?.id) return;
    await preview!.continueAs(userId);
    // Everything cached was fetched as the previous person
    queryClient.clear();
    void router.invalidate();
  }

  return (
    <div
      role="status"
      aria-label="Preview environment"
      data-testid="preview-banner"
      className={cn(
        "grid gap-1.5 rounded-sm border border-warning/30 bg-warning-subtle p-2 text-xs text-warning",
      )}
    >
      <span className="flex items-center gap-1.5 font-semibold">
        <FlaskConicalIcon className="size-3.5 shrink-0" aria-hidden />
        Preview · synthetic data
      </span>
      {details.length > 0 && <span className="truncate opacity-80">{details.join(" · ")}</span>}
      {current ? (
        <DropdownMenu>
          <DropdownMenuTrigger
            className={cn(
              "flex h-6 items-center justify-between gap-1 rounded-sm bg-surface px-2 font-semibold text-foreground",
              "hover:bg-hover focus-ring",
            )}
            aria-label={`You are ${current.label} (${current.email}). Switch user`}
          >
            You are {current.label}
            <ChevronsUpDownIcon className="size-3" aria-hidden />
          </DropdownMenuTrigger>
          <DropdownMenuContent side="right" align="end" className="w-64">
            <DropdownMenuLabel>Switch user</DropdownMenuLabel>
            <DropdownMenuRadioGroup value={current.id} onValueChange={(id) => void switchTo(id)}>
              {users.map((user) => (
                <DropdownMenuRadioItem key={user.id} value={user.id}>
                  <span className="grid leading-tight">
                    <span>{user.label}</span>
                    <span className="text-xs text-muted-foreground">{user.email}</span>
                  </span>
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
            <DropdownMenuSeparator />
            <p className="px-2 py-1.5 text-xs text-muted-foreground">
              Everyone here is an admin. Nothing leaves this preview: no emails, payments or syncs.
            </p>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : (
        <span className="pr-2 opacity-80">Not signed in</span>
      )}
    </div>
  );
}
