import { createFileRoute, redirect } from "@tanstack/react-router";
import { ArrowRightIcon, TerminalIcon } from "lucide-react";
import { useState } from "react";
import { useAuth, type PreviewUser } from "@/auth";
import { ErrorState } from "@/components/domain/error-state";
import { Button } from "@/components/ui/button";
import { config } from "@/lib/config";
import { org } from "@/lib/org";

export const Route = createFileRoute("/login")({
  // A plain function rather than a zod schema: this route is in the first chunk, and zod would
  // add about 75 kB to it.
  validateSearch: (search: Record<string, unknown>): { redirect?: string } =>
    typeof search.redirect === "string" ? { redirect: search.redirect } : {},
  beforeLoad: ({ context, search }) => {
    if (context.auth.isAuthenticated) throw redirect({ href: safeRedirect(search.redirect) });
  },
  component: LoginPage,
});

function safeRedirect(target: string | undefined) {
  return target && target.startsWith("/") && !target.startsWith("//") ? target : "/";
}

function LoginPage() {
  const auth = useAuth();
  const search = Route.useSearch();
  const [pending, setPending] = useState(false);
  const devMode = config.auth.mode === "dev";
  const preview = auth.preview;

  async function signIn() {
    setPending(true);
    try {
      await auth.login({ returnTo: safeRedirect(search.redirect) });
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="grid min-h-dvh place-items-center bg-canvas p-6">
      <div className="grid w-full max-w-sm gap-6 rounded-lg border border-border bg-surface p-8">
        <img
          src={org.logo}
          alt={org.name}
          width={org.logoSize.width}
          height={org.logoSize.height}
          className="h-auto w-28 invert dark:invert-0"
        />
        <div className="grid gap-1">
          <h1 className="font-display text-2xl">{preview ? "Preview" : "Sign in"}</h1>
          {!preview && (
            <p className="text-sm text-muted-foreground">
              Use your {org.name} account. Admin access is required.
            </p>
          )}
        </div>

        {auth.error && <ErrorState error={auth.error} title="Sign-in failed" />}

        {preview ? (
          <PreviewChoices
            users={preview.users}
            onChoose={(userId) =>
              preview.continueAs(userId, { returnTo: safeRedirect(search.redirect) })
            }
          />
        ) : (
          <div className="grid gap-3">
            <Button
              variant="primary"
              size="lg"
              onClick={() => void signIn()}
              pending={pending}
              className="w-full justify-between"
            >
              {devMode ? "Sign in with dev token" : "Continue to sign in"}
              <ArrowRightIcon />
            </Button>
            {devMode && (
              <p className="flex items-center gap-2 text-xs text-muted-foreground">
                <TerminalIcon className="size-3.5" />
                Dev auth: token from the local mock OIDC server.
              </p>
            )}
          </div>
        )}
      </div>
    </main>
  );
}

/** Preview environments: no login, pick who to be (all admins, synthetic data). */
function PreviewChoices({
  users,
  onChoose,
}: {
  users: PreviewUser[];
  onChoose: (userId: string) => Promise<void>;
}) {
  const [pending, setPending] = useState<string | null>(null);
  async function choose(userId: string) {
    setPending(userId);
    try {
      await onChoose(userId);
    } finally {
      setPending(null);
    }
  }
  return (
    <div className="grid gap-3">
      <p className="text-sm text-muted-foreground">
        This is a preview with synthetic data. Nothing here is real and nothing leaves it. Pick who
        you are; you can switch at any time.
      </p>
      {users.map((user, index) => (
        <Button
          key={user.id}
          variant={index === 0 ? "primary" : "secondary"}
          size="lg"
          onClick={() => void choose(user.id)}
          pending={pending === user.id}
          disabled={pending !== null && pending !== user.id}
          className="h-auto w-full justify-between py-2 text-left"
        >
          <span className="grid leading-tight">
            <span>Continue as {user.label}</span>
            <span className="text-xs font-normal opacity-80">{user.email}</span>
          </span>
          <ArrowRightIcon />
        </Button>
      ))}
    </div>
  );
}
