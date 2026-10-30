import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { config } from "@/lib/config";
import {
  AuthContext,
  type AuthState,
  type PreviewInfo,
  type PreviewSession,
  type PreviewUser,
} from "./context";

/**
 * Preview environments only (one per pull request, synthetic data): no login, the tester picks
 * who to continue as and the preview API (PREVIEW_MODE) issues a session token for them.
 * Only the chosen person is remembered; a fresh token is fetched on every load, so sessions
 * survive the preview being redeployed with a new signing secret.
 */

const STORAGE_KEY = "effekt-admin-preview-user";

/** Shown until /preview/info answers; the API's list is the source of truth. */
const fallbackUsers: PreviewUser[] = [
  { id: "ops", label: "Ops", email: "ops@example.org", description: "" },
  { id: "finance", label: "Finance", email: "finance@example.org", description: "" },
  { id: "approver", label: "Approver", email: "approver@example.org", description: "" },
];

type Session = { user: PreviewUser; accessToken: string; expiresAt: number };

function readStoredUserId(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function storeUserId(id: string | null) {
  try {
    if (id) localStorage.setItem(STORAGE_KEY, id);
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // storage unavailable; the choice lasts until reload
  }
}

async function requestSession(userId: string): Promise<Session> {
  const response = await fetch(`${config.apiUrl}/preview/session`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ as: userId }),
  });
  if (!response.ok) throw new Error(`Could not start a preview session (${response.status})`);
  const body = (await response.json()) as {
    accessToken: string;
    expiresIn: number;
    user: PreviewUser;
  };
  return {
    user: body.user,
    accessToken: body.accessToken,
    expiresAt: Date.now() + body.expiresIn * 1000,
  };
}

export function PreviewAuthProvider({
  children,
  onRedirect,
}: {
  children: ReactNode;
  onRedirect: (path: string) => void;
}) {
  const [session, setSession] = useState<Session | null>(null);
  const [restoring, setRestoring] = useState(() => readStoredUserId() !== null);
  const [error, setError] = useState<Error | null>(null);
  const [users, setUsers] = useState<PreviewUser[]>(fallbackUsers);
  const [info, setInfo] = useState<PreviewInfo | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`${config.apiUrl}/preview/info`)
      .then((response) => (response.ok ? response.json() : null))
      .then((body: (PreviewInfo & { users: PreviewUser[] }) | null) => {
        if (cancelled || !body) return;
        setUsers(body.users);
        setInfo({ pr: body.pr, sha: body.sha, seededAt: body.seededAt });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  // Continue as whoever was chosen before the reload
  useEffect(() => {
    const stored = readStoredUserId();
    if (!stored) return;
    requestSession(stored)
      .then(setSession)
      .catch((err: unknown) => {
        storeUserId(null);
        setError(err instanceof Error ? err : new Error(String(err)));
      })
      .finally(() => setRestoring(false));
  }, []);

  const continueAs = useCallback(
    async (userId: string, { returnTo }: { returnTo?: string } = {}) => {
      try {
        setError(null);
        const next = await requestSession(userId);
        storeUserId(next.user.id);
        setSession(next);
        if (returnTo) onRedirect(returnTo);
      } catch (err) {
        setError(err instanceof Error ? err : new Error(String(err)));
      }
    },
    [onRedirect],
  );

  const logout = useCallback(() => {
    storeUserId(null);
    setSession(null);
    onRedirect("/login");
  }, [onRedirect]);

  const getAccessToken = useCallback(async () => {
    if (!session) throw new Error("No preview session");
    if (session.expiresAt > Date.now() + 30_000) return session.accessToken;
    const fresh = await requestSession(session.user.id);
    setSession(fresh);
    return fresh.accessToken;
  }, [session]);

  const preview = useMemo<PreviewSession>(
    () => ({ users, current: session?.user ?? null, info, continueAs }),
    [users, session, info, continueAs],
  );

  const value = useMemo<AuthState>(
    () => ({
      isAuthenticated: session !== null,
      isLoading: restoring,
      error,
      user: session
        ? {
            id: `preview|${session.user.id}`,
            name: session.user.label,
            givenName: session.user.label,
            email: session.user.email,
          }
        : null,
      // The login page offers the people to continue as; a plain login() picks the first.
      login: ({ returnTo } = {}) =>
        continueAs(users[0]?.id ?? "ops", { returnTo: returnTo ?? "/" }),
      logout,
      getAccessToken,
      preview,
    }),
    [session, restoring, error, users, continueAs, logout, getAccessToken, preview],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
