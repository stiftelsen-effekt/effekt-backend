import { createFileRoute, redirect } from "@tanstack/react-router";
import { ArrowRightIcon, TerminalIcon } from "lucide-react";
import { useState } from "react";
import { z } from "zod";
import { useAuth } from "@/auth";
import { ErrorState } from "@/components/domain/error-state";
import { Button } from "@/components/ui/button";
import { config } from "@/lib/config";
import { appLocale } from "@/lib/locale";

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
    <div className="grid min-h-dvh lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      <div className="relative hidden flex-col justify-between overflow-hidden bg-sidebar p-12 text-sidebar-foreground lg:flex">
        <img src={appLocale.logo} alt={appLocale.orgName} className="w-44" />
        <div className="grid gap-4">
          <p className="max-w-sm font-display text-3xl">
            Donations, donors and agreements in one place.
          </p>
          <p className="label-caps text-sidebar-muted">{appLocale.orgName} · Admin</p>
        </div>
      </div>

      <main className="flex items-center justify-center p-6">
        <div className="grid w-full max-w-sm gap-8">
          <div className="grid gap-3 lg:hidden">
            <div className="w-fit bg-sidebar p-3">
              <img src={appLocale.logo} alt={appLocale.orgName} className="w-28" />
            </div>
          </div>
          <div className="border-l-6 border-foreground py-1 pl-5">
            <h1 className="font-display text-2xl">Sign in</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Use your {appLocale.orgName} account. Admin access is required.
            </p>
          </div>

          {auth.error && <ErrorState error={auth.error} title="Sign-in failed" />}

          <div className="grid gap-3">
            <Button
              size="lg"
              onClick={() => void signIn()}
              disabled={pending}
              className="w-full justify-between"
            >
              {pending
                ? "Redirecting…"
                : devMode
                ? "Sign in with dev token"
                : "Continue to sign in"}
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
    </div>
  );
}
