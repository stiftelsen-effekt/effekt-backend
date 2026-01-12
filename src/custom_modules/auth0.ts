/**
 * Auth0 Management API utilities
 */

const config = require("../config");

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

/**
 * Fetches a fresh Auth0 Management API token
 * Uses client credentials grant
 */
async function getManagementToken(): Promise<string> {
  // Return cached token if still valid (with 5 minute buffer)
  if (cachedToken && cachedToken.expiresAt > Date.now() + 5 * 60 * 1000) {
    return cachedToken.token;
  }

  const response = await fetch("https://gieffektivt.eu.auth0.com/oauth/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      client_id: process.env.AUTH0_CLIENT_ID,
      client_secret: process.env.AUTH0_CLIENT_SECRET,
      audience: "https://gieffektivt.eu.auth0.com/api/v2/",
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
 * Checks if a user with the given email exists in Auth0
 * @param email The email to check
 * @returns True if the user exists, false otherwise
 */
export async function isUserRegisteredInAuth0(email: string): Promise<boolean> {
  try {
    const token = await getManagementToken();

    // Use the users-by-email endpoint for efficient lookup
    const response = await fetch(
      `https://gieffektivt.eu.auth0.com/api/v2/users-by-email?email=${encodeURIComponent(email)}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    );

    if (!response.ok) {
      console.error(`Auth0 API error: ${response.status} ${response.statusText}`);
      return false;
    }

    const users: Auth0User[] = await response.json();
    return users.length > 0;
  } catch (error) {
    console.error("Failed to check Auth0 user existence:", error);
    return false;
  }
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
