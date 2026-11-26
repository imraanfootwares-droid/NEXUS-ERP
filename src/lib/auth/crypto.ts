import { randomBytes, scryptSync, timingSafeEqual } from "crypto";
import { SignJWT, jwtVerify } from "jose";
import { getAuthSecret } from "@/lib/env";
import type { TenantRole } from "@/lib/constants/saas";

export const SESSION_COOKIE_NAME = "nexus_session";
export const PLATFORM_SESSION_COOKIE_NAME = "nexus_platform_session";
export const IMPERSONATE_COOKIE_NAME = "nexus_impersonate";
export const SESSION_TTL_SECONDS = 12 * 60 * 60; // 12 hours
export const IMPERSONATE_TTL_SECONDS = 30 * 60; // 30 minutes

const SCRYPT_N_NODE = 16384;
// Cloudflare Workers Free tier enforces a 10ms CPU limit; N=2048 stays ~3.5ms CPU while keeping strong scrypt KDF.
const SCRYPT_N_WORKERS = 2048;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const SCRYPT_KEYLEN = 64;

function isWorkersRuntime(): boolean {
  return typeof navigator !== "undefined" && navigator.userAgent === "Cloudflare-Workers";
}

export function hashPassword(password: string): string {
  const N = isWorkersRuntime() ? SCRYPT_N_WORKERS : SCRYPT_N_NODE;
  const salt = randomBytes(16).toString("hex");
  const derived = scryptSync(password, salt, SCRYPT_KEYLEN, {
    N,
    r: SCRYPT_R,
    p: SCRYPT_P,
  }).toString("hex");
  return `scrypt$${N}$${SCRYPT_R}$${SCRYPT_P}$${salt}$${derived}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  const parts = storedHash.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [, nStr, rStr, pStr, salt, expectedHex] = parts;
  const N = parseInt(nStr, 10);
  const r = parseInt(rStr, 10);
  const p = parseInt(pStr, 10);
  if (!N || !r || !p || !salt || !expectedHex) return false;

  const derived = scryptSync(password, salt, expectedHex.length / 2, { N, r, p });
  const expected = Buffer.from(expectedHex, "hex");
  if (derived.length !== expected.length) return false;
  return timingSafeEqual(derived, expected);
}

const TEMP_PW_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";

export function generateTempPassword(length = 10): string {
  const bytes = randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i++) {
    out += TEMP_PW_CHARS[bytes[i] % TEMP_PW_CHARS.length];
  }
  return out;
}

export interface SessionJwtPayload {
  sub: string;
  tid: string | null;
  role: TenantRole;
  pa: boolean;
  sv: number;
  exp?: number;
  iat?: number;
}

export async function signSessionToken(payload: Omit<SessionJwtPayload, "exp" | "iat">): Promise<string> {
  return new SignJWT({
    tid: payload.tid,
    role: payload.role,
    pa: payload.pa,
    sv: payload.sv,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(payload.sub)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(getAuthSecret());
}

export async function verifySessionToken(token: string): Promise<SessionJwtPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getAuthSecret(), { algorithms: ["HS256"] });
    if (!payload.sub) return null;
    return {
      sub: payload.sub,
      tid: (payload.tid as string | null) ?? null,
      role: (payload.role as TenantRole) ?? "worker",
      pa: Boolean(payload.pa),
      sv: Number(payload.sv ?? 1),
      exp: payload.exp,
      iat: payload.iat,
    };
  } catch {
    return null;
  }
}

export interface ImpersonationJwtPayload {
  tenantId: string;
  adminId: string;
  mode: "read" | "write";
  exp?: number;
}

export async function signImpersonationToken(
  payload: Omit<ImpersonationJwtPayload, "exp">
): Promise<string> {
  return new SignJWT({
    tenantId: payload.tenantId,
    adminId: payload.adminId,
    mode: payload.mode,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${IMPERSONATE_TTL_SECONDS}s`)
    .sign(getAuthSecret());
}

export async function verifyImpersonationToken(
  token: string
): Promise<ImpersonationJwtPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getAuthSecret(), { algorithms: ["HS256"] });
    if (!payload.tenantId || !payload.adminId) return null;
    return {
      tenantId: String(payload.tenantId),
      adminId: String(payload.adminId),
      mode: payload.mode === "write" ? "write" : "read",
      exp: payload.exp,
    };
  } catch {
    return null;
  }
}

/** Verifies Origin header matches Host header on mutating API routes to prevent CSRF. */
export function isSameOriginRequest(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true; // non-browser or same-origin fetch without Origin header
  const host = (request.headers.get("x-forwarded-host") || request.headers.get("host") || "").toLowerCase();
  if (!host) return false;
  try {
    const originHost = new URL(origin).host.toLowerCase();
    return originHost === host;
  } catch {
    return false;
  }
}
