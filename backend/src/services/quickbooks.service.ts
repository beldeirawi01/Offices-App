import jwt from "jsonwebtoken";
import { prisma } from "../db/prisma";
import { env } from "../config/env";

// Intuit runs entirely separate sandbox vs. production environments (not
// just different credentials against one host) for both OAuth and the
// accounting API.
const OAUTH_AUTHORIZE_URL = "https://appcenter.intuit.com/connect/oauth2";
const OAUTH_TOKEN_URL = "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer";
const OAUTH_REVOKE_URL = "https://developer.api.intuit.com/v2/oauth2/tokens/revoke";
const API_BASE_URL =
  env.quickbooksEnvironment === "production"
    ? "https://quickbooks.api.intuit.com"
    : "https://sandbox-quickbooks.api.intuit.com";

const SCOPE = "com.intuit.quickbooks.accounting";
const STATE_PURPOSE = "quickbooks_oauth_state";

function requireClientCredentials(): { clientId: string; clientSecret: string } {
  if (!env.quickbooksClientId || !env.quickbooksClientSecret) {
    throw new Error("QUICKBOOKS_CLIENT_ID / QUICKBOOKS_CLIENT_SECRET are not configured");
  }
  return { clientId: env.quickbooksClientId, clientSecret: env.quickbooksClientSecret };
}

function callbackUrl(): string {
  if (!env.apiPublicUrl) {
    throw new Error("API_PUBLIC_URL is not configured — required for the QuickBooks OAuth redirect");
  }
  return `${env.apiPublicUrl.replace(/\/+$/, "")}/api/organizations/me/quickbooks/callback`;
}

/**
 * A short-lived, signed token carrying the organizationId through Intuit's
 * OAuth redirect — the callback is a plain browser GET with no Authorization
 * header, so there's no other way to know which org's "Connect" click this
 * is answering. 10 minutes is generous for a human to complete the consent
 * screen but short enough that a leaked/logged callback URL is useless soon
 * after.
 */
export function createOAuthState(organizationId: string): string {
  return jwt.sign({ purpose: STATE_PURPOSE, organizationId }, env.jwtSecret, { expiresIn: "10m" });
}

export function verifyOAuthState(state: string): string {
  const payload = jwt.verify(state, env.jwtSecret) as { purpose: string; organizationId: string };
  if (payload.purpose !== STATE_PURPOSE) throw new Error("Invalid OAuth state token");
  return payload.organizationId;
}

export function getAuthorizationUrl(organizationId: string): string {
  const { clientId } = requireClientCredentials();
  const params = new URLSearchParams({
    client_id: clientId,
    scope: SCOPE,
    redirect_uri: callbackUrl(),
    response_type: "code",
    state: createOAuthState(organizationId),
  });
  return `${OAUTH_AUTHORIZE_URL}?${params.toString()}`;
}

interface TokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number; // seconds
}

function basicAuthHeader(): string {
  const { clientId, clientSecret } = requireClientCredentials();
  return `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`;
}

async function requestTokens(body: URLSearchParams): Promise<TokenResponse> {
  const res = await fetch(OAUTH_TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: basicAuthHeader(),
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`QuickBooks token request failed (${res.status}): ${text}`);
  }
  return res.json() as Promise<TokenResponse>;
}

/**
 * Exchanges the authorization code from Intuit's redirect for tokens and
 * stores them on the organization. Called once, from the OAuth callback
 * route.
 */
export async function connectOrganization(organizationId: string, code: string, realmId: string): Promise<void> {
  const tokens = await requestTokens(
    new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: callbackUrl() }),
  );
  await prisma.organization.update({
    where: { id: organizationId },
    data: {
      quickbooksRealmId: realmId,
      quickbooksAccessToken: tokens.access_token,
      quickbooksRefreshToken: tokens.refresh_token,
      quickbooksTokenExpiresAt: new Date(Date.now() + tokens.expires_in * 1000),
      quickbooksConnectedAt: new Date(),
    },
  });
}

/**
 * Returns a valid (non-expired) access token + realm id for this org,
 * refreshing first if the stored token is expired or about to be — every
 * QBO API call goes through this rather than reading the stored token
 * directly. Throws if the org has never connected QuickBooks.
 */
export async function getValidCredentials(organizationId: string): Promise<{ accessToken: string; realmId: string }> {
  const org = await prisma.organization.findUniqueOrThrow({ where: { id: organizationId } });
  if (!org.quickbooksRealmId || !org.quickbooksAccessToken || !org.quickbooksRefreshToken) {
    throw new Error("This organization has not connected QuickBooks yet");
  }

  // Refresh a bit early (60s of slack) rather than exactly at expiry, so a
  // token that's valid-but-about-to-expire when checked doesn't expire
  // mid-request.
  const stillValid = org.quickbooksTokenExpiresAt && org.quickbooksTokenExpiresAt.getTime() - 60_000 > Date.now();
  if (stillValid) {
    return { accessToken: org.quickbooksAccessToken, realmId: org.quickbooksRealmId };
  }

  const tokens = await requestTokens(
    new URLSearchParams({ grant_type: "refresh_token", refresh_token: org.quickbooksRefreshToken }),
  );
  await prisma.organization.update({
    where: { id: organizationId },
    data: {
      quickbooksAccessToken: tokens.access_token,
      quickbooksRefreshToken: tokens.refresh_token,
      quickbooksTokenExpiresAt: new Date(Date.now() + tokens.expires_in * 1000),
    },
  });
  return { accessToken: tokens.access_token, realmId: org.quickbooksRealmId };
}

/**
 * Disconnects QuickBooks — best-effort revokes the refresh token with
 * Intuit (so it can't be used if it ever leaked) and always clears the
 * stored tokens locally regardless of whether the revoke call succeeds,
 * since a business that clicks "Disconnect" expects this app to stop being
 * able to reach their QuickBooks either way.
 */
export async function disconnectOrganization(organizationId: string): Promise<void> {
  const org = await prisma.organization.findUniqueOrThrow({ where: { id: organizationId } });
  if (org.quickbooksRefreshToken) {
    try {
      await fetch(OAUTH_REVOKE_URL, {
        method: "POST",
        headers: {
          Authorization: basicAuthHeader(),
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({ token: org.quickbooksRefreshToken }),
      });
    } catch (err) {
      console.error(`Failed to revoke QuickBooks token for org ${organizationId} during disconnect`, err);
    }
  }
  await prisma.organization.update({
    where: { id: organizationId },
    data: {
      quickbooksRealmId: null,
      quickbooksAccessToken: null,
      quickbooksRefreshToken: null,
      quickbooksTokenExpiresAt: null,
      quickbooksConnectedAt: null,
    },
  });
}

/**
 * Low-level authenticated call against this org's QBO company file.
 * `minorversion` pins a specific API revision so Intuit rolling out a newer
 * default doesn't silently change response shapes under us.
 */
export async function qboRequest<T = any>(
  organizationId: string,
  method: "GET" | "POST",
  path: string,
  body?: unknown,
): Promise<T> {
  const { accessToken, realmId } = await getValidCredentials(organizationId);
  const url = `${API_BASE_URL}/v3/company/${realmId}/${path}${path.includes("?") ? "&" : "?"}minorversion=65`;
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json: any = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message = json?.Fault?.Error?.[0]?.Message ?? res.statusText;
    throw new Error(`QuickBooks API error (${res.status}): ${message}`);
  }
  return json as T;
}

export function isQuickbooksConfigured(): boolean {
  return Boolean(env.quickbooksClientId && env.quickbooksClientSecret);
}
