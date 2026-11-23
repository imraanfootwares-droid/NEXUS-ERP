export const DEV_ROLE_COOKIE = "nexus_dev_role";

export type DevPreviewRole = "platform_admin" | "owner" | "branch_admin" | "worker";

export const VALID_DEV_ROLES: readonly DevPreviewRole[] = [
  "platform_admin",
  "owner",
  "branch_admin",
  "worker",
] as const;

export function isDevPreviewAllowed(): boolean {
  return process.env.NODE_ENV !== "production" || process.env.ENABLE_DEV_PREVIEW === "true";
}

export function parseDevPreviewRole(raw: string | undefined | null): DevPreviewRole | null {
  if (!raw) return null;
  return (VALID_DEV_ROLES as readonly string[]).includes(raw) ? (raw as DevPreviewRole) : null;
}
