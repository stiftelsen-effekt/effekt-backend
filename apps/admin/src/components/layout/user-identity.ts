import type { AuthState } from "@/auth";
import { strings } from "@/lib/strings";

export type UserIdentity = {
  /** The main line: the person's name, else their email, else a state ("Signed in"). */
  label: string;
  /** The second line, only when it adds something to the label. */
  detail?: string;
  /** Up to two letters for the avatar; empty when there is no name or email to take them from. */
  initials: string;
};

function initialsOf(text: string) {
  const local = text.includes("@") ? (text.split("@")[0] ?? "") : text;
  return local
    .split(/[\s._-]+/)
    .filter(Boolean)
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

/**
 * What the sidebar's user menu shows. Being signed in is `isAuthenticated`, not whether the
 * identity token happened to carry a name: a token with only `sub` is still a signed-in user.
 */
export function userIdentity(
  auth: Pick<AuthState, "isAuthenticated" | "isLoading" | "user">,
): UserIdentity {
  if (auth.isLoading) return { label: strings.account.loading, initials: "" };
  if (!auth.isAuthenticated) return { label: strings.account.signedOut, initials: "" };

  const name = auth.user?.name?.trim() || undefined;
  const email = auth.user?.email?.trim() || undefined;
  // Auth0 sets name = email for password accounts; don't show it twice.
  const label = name ?? email ?? strings.account.signedIn;
  const detail = email && email !== label ? email : undefined;
  return { label, detail, initials: name || email ? initialsOf(label) : "" };
}
