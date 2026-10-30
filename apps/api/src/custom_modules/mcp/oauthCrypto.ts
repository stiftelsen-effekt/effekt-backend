import * as crypto from "crypto";
import config from "../../config";

function signingKey(): Buffer {
  const secret = config.auth0_mcp_client_secret || config.mcp_secret;
  if (!secret) {
    throw new Error("AUTH0_MCP_CLIENT_SECRET is required for MCP OAuth");
  }
  return crypto.createHash("sha256").update(String(secret)).digest();
}

export function seal(payload: object, ttlSec: number): string {
  const body = Buffer.from(JSON.stringify({ ...payload, exp: Date.now() + ttlSec * 1000 }));
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", signingKey(), iv);
  const enc = Buffer.concat([cipher.update(body), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), enc]).toString("base64url");
}

export function open<T = any>(token: string): T {
  const buf = Buffer.from(token, "base64url");
  if (buf.length < 29) throw new Error("invalid token");
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const enc = buf.subarray(28);
  const decipher = crypto.createDecipheriv("aes-256-gcm", signingKey(), iv);
  decipher.setAuthTag(tag);
  const data = JSON.parse(Buffer.concat([decipher.update(enc), decipher.final()]).toString());
  if (typeof data.exp !== "number" || data.exp < Date.now()) {
    throw new Error("expired");
  }
  return data as T;
}

export function pkceS256(verifier: string): string {
  return crypto.createHash("sha256").update(verifier).digest("base64url");
}

export function verifyPkceS256(verifier: string, challenge: string): boolean {
  if (!verifier || !challenge) return false;
  const expected = pkceS256(verifier);
  if (expected.length !== challenge.length) return false;
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(challenge));
}

export function isAllowedRedirectUri(uri: string): boolean {
  try {
    const url = new URL(uri);
    if (url.username || url.password) return false;
    const loopback = url.hostname === "localhost" || url.hostname === "127.0.0.1";
    if (loopback) return url.protocol === "http:" || url.protocol === "https:";
    return (
      url.protocol === "https:" && (url.hostname === "claude.ai" || url.hostname === "claude.com")
    );
  } catch {
    return false;
  }
}
