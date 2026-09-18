/**
 * Auth0 Management API utilities
 */

const config = require("../config");

const AUTH0_DOMAIN = "gieffektivt.eu.auth0.com";
const DEFAULT_DONOR_ID_METADATA_KEY = "gieffektivt-user-id";

interface Auth0Token {
  access_token: string;
  token_type: string;
  expires_in: number;
}

interface Auth0User {
  user_id: string;
  email: string;
  email_verified: boolean;
  name?: string;
  nickname?: string;
  picture?: string;
  user_metadata?: {
    [key: string]: any;
  };
}

// Cache for the management API token
let cachedToken: { token: string; expiresAt: number } | null = null;

function getDonorIdMetadataKey(): string {
  return config.authUserMetadataKey || DEFAULT_DONOR_ID_METADATA_KEY;
}

function metadataHasDonorId(user: Auth0User, donorId: number): boolean {
  const value = user.user_metadata?.[getDonorIdMetadataKey()];
  if (value === undefined || value === null || value === "") {
    return false;
  }
  return Number(value) === donorId;
}

/**
 * Fetches a fresh Auth0 Management API token
 * Uses client credentials grant
 */
async function getManagementToken(): Promise<string> {
  // Return cached token if still valid (with 5 minute buffer)
  if (cachedToken && cachedToken.expiresAt > Date.now() + 5 * 60 * 1000) {
    return cachedToken.token;
  }

  const response = await fetch(`https://${AUTH0_DOMAIN}/oauth/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      client_id: process.env.AUTH0_CLIENT_ID,
      client_secret: process.env.AUTH0_CLIENT_SECRET,
      audience: `https://${AUTH0_DOMAIN}/api/v2/`,
      grant_type: "client_credentials",
    }),
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch Auth0 token: ${response.status} ${response.statusText}`);
  }

  const tokenData: Auth0Token = await response.json();

  // Cache the token
  cachedToken = {
    token: tokenData.access_token,
    expiresAt: Date.now() + tokenData.expires_in * 1000,
  };

  return tokenData.access_token;
}

/**
 * Looks up Auth0 users by email.
 * An email can map to more than one user (e.g. password + Google).
 */
export async function getUsersByEmail(email: string): Promise<Auth0User[]> {
  const token = await getManagementToken();

  const response = await fetch(
    `https://${AUTH0_DOMAIN}/api/v2/users-by-email?email=${encodeURIComponent(email)}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
  );

  if (!response.ok) {
    throw new Error(`Auth0 API error: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

/**
 * Checks if a user with the given email exists in Auth0
 * @param email The email to check
 * @returns True if the user exists, false otherwise
 */
export async function isUserRegisteredInAuth0(email: string): Promise<boolean> {
  try {
    const users = await getUsersByEmail(email);
    return users.length > 0;
  } catch (error) {
    console.error("Failed to check Auth0 user existence:", error);
    return false;
  }
}

/**
 * Merges keys into an Auth0 user's user_metadata.
 * Requires the Management API M2M app to have the update:users scope.
 */
async function updateUserMetadata(
  auth0UserId: string,
  metadata: Record<string, unknown>,
): Promise<void> {
  const token = await getManagementToken();

  const response = await fetch(
    `https://${AUTH0_DOMAIN}/api/v2/users/${encodeURIComponent(auth0UserId)}`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ user_metadata: metadata }),
    },
  );

  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `Auth0 PATCH user failed: ${response.status} ${response.statusText}${body ? ` ${body}` : ""}`,
    );
  }
}

/**
 * After an admin merge the origin donor is deleted. If that donor had a Min
 * side login, Auth0 still has the old donor id in user_metadata and the JWT
 * claim is minted from it on next login. Re-point matching Auth0 users to the
 * surviving donor.
 *
 * Auth0 failures are logged and swallowed so they never block the DB merge.
 */
export async function repointAuth0DonorIdOnMerge(
  loserDonorId: number,
  winnerDonorId: number,
  loserEmail: string,
): Promise<{ updated: string[]; skipped: string[] }> {
  const updated: string[] = [];
  const skipped: string[] = [];

  try {
    if (!loserEmail) {
      console.warn(`Skipping Auth0 re-point for donor ${loserDonorId}: no email`);
      return { updated, skipped };
    }

    const users = await getUsersByEmail(loserEmail);
    const metadataKey = getDonorIdMetadataKey();

    for (const user of users) {
      if (!metadataHasDonorId(user, loserDonorId)) {
        skipped.push(user.user_id);
        continue;
      }

      try {
        await updateUserMetadata(user.user_id, { [metadataKey]: winnerDonorId });
        updated.push(user.user_id);
      } catch (error) {
        console.error(`Failed to re-point Auth0 user ${user.user_id}:`, error);
      }
    }

    if (updated.length > 0) {
      console.log(
        `Re-pointed ${
          updated.length
        } Auth0 user(s) from donor ${loserDonorId} to ${winnerDonorId}: ${updated.join(", ")}`,
      );
    }
  } catch (error) {
    console.error(
      `Failed to re-point Auth0 users from donor ${loserDonorId} to ${winnerDonorId}:`,
      error,
    );
  }

  return { updated, skipped };
}

/** Clears the cached Management API token. Used by tests. */
export function resetAuth0TokenCache(): void {
  cachedToken = null;
}

/**
 * Generates the appropriate profile page URL based on whether the user is registered in Auth0
 * @param email The user's email address (used to pre-fill the login/signup form)
 * @param isRegistered Whether the user is registered in Auth0
 * @returns Object containing the profile page URL and link title
 */
export function getProfilePageLink(
  email: string,
  isRegistered: boolean,
): { url: string; title: string } {
  const baseUrl = config.minside_url;
  const encodedEmail = encodeURIComponent(email);

  if (isRegistered) {
    // User is registered - send them to login which will redirect to profile
    // login_hint pre-fills the email field in Auth0
    return {
      url: `${baseUrl}?login_hint=${encodedEmail}`,
      title: "Logg inn",
    };
  } else {
    // User is not registered - send them to signup with screen_hint
    // login_hint pre-fills the email field, screen_hint shows signup form
    return {
      url: `${baseUrl}?screen_hint=signup&login_hint=${encodedEmail}`,
      title: "Opprett bruker",
    };
  }
}
