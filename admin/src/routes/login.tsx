import { createFileRoute, redirect } from "@tanstack/react-router";
import { ArrowRightIcon, TerminalIcon } from "lucide-react";
import { useState } from "react";
import { z } from "zod";
import { useAuth } from "@/auth";
import { ErrorState } from "@/components/domain/error-state";
import { Button } from "@/components/ui/button";
import { config } from "@/lib/config";
import { org } from "@/lib/org";

export const Route = createFileRoute("/login")({
  validateSearch: z.object({ redirect: z.string().optional() }),
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
        <img src={org.logo} alt={org.name} className="w-28 invert dark:invert-0" />
        <div className="grid gap-1">
          <h1 className="font-display text-2xl">Sign in</h1>
          <p className="text-sm text-muted-foreground">
            Use your {org.name} account. Admin access is required.
          </p>
        </div>

        {auth.error && <ErrorState error={auth.error} title="Sign-in failed" />}

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
      </div>
    </main>
  );
}
