import {
  FEATURE_DEPENDENCIES,
  FEATURE_KEYS,
  PERMISSION_DEFINITIONS,
  PERMISSION_PARENT_MAP,
  TIER_DEFAULT_FEATURES,
  type FeatureKey,
  type PermissionKey,
  type TenantRole,
  type TierKey,
} from "@/lib/constants/saas";
import type { AccessBlock, ProfileRow, SessionContext, TenantRow } from "@/types/database";

export interface FeatureResolutionInput {
  tier: TierKey;
  feature_overrides?: Partial<Record<FeatureKey, boolean>> | null;
}

/**
 * Resolves whether a feature is enabled for a tenant, checking:
 * 1) Direct flag (override ?? tier default)
 * 2) Recursive hard dependencies in FEATURE_DEPENDENCIES
 * NEVER check `tenant.tier` directly in application code!
 */
export function isFeatureEnabled(
  tenant: FeatureResolutionInput | null | undefined,
  featureKey: FeatureKey,
  visited: Set<FeatureKey> = new Set()
): boolean {
  if (!tenant) return false;
  if (visited.has(featureKey)) return true;
  visited.add(featureKey);

  const override = tenant.feature_overrides?.[featureKey];
  const directFlag =
    typeof override === "boolean"
      ? override
      : TIER_DEFAULT_FEATURES[tenant.tier].includes(featureKey);

  if (!directFlag) return false;

  const deps = FEATURE_DEPENDENCIES[featureKey] ?? [];
  for (const dep of deps) {
    if (!isFeatureEnabled(tenant, dep, visited)) {
      return false;
    }
  }
  return true;
}

export function resolveAllFeatures(
  tenant: FeatureResolutionInput | null | undefined
): Record<FeatureKey, boolean> {
  const out = {} as Record<FeatureKey, boolean>;
  for (const key of FEATURE_KEYS) {
    out[key] = isFeatureEnabled(tenant, key);
  }
  return out;
}

export const TIER_ORDER: readonly TierKey[] = ["tier_1", "tier_2", "tier_3", "tier_4"];

export const tierRank = (tier: TierKey): number => TIER_ORDER.indexOf(tier);

/** The tier a person actually works at: their own tier, never above the business plan. */
export function effectiveUserTier(planTier: TierKey, personalTier?: TierKey | null): TierKey {
  if (!personalTier) return planTier;
  return tierRank(personalTier) < tierRank(planTier) ? personalTier : planTier;
}

/**
 * Features for one signed-in person: the business's features, further limited by
 * the person's tier. A personal tier can only remove access, never add it.
 */
export function resolveUserFeatures(
  tenant: FeatureResolutionInput | null | undefined,
  personalTier?: TierKey | null
): Record<FeatureKey, boolean> {
  const business = resolveAllFeatures(tenant);
  if (!tenant || !personalTier || tierRank(personalTier) >= tierRank(tenant.tier)) {
    return business;
  }
  const allowed = new Set<FeatureKey>(TIER_DEFAULT_FEATURES[personalTier]);
  const out = {} as Record<FeatureKey, boolean>;
  for (const key of FEATURE_KEYS) {
    out[key] =
      business[key] && allowed.has(key) && getRequiredPrerequisites(key).every((d) => allowed.has(d));
  }
  return out;
}

/** Returns all hard prerequisite keys required to enable `featureKey`. */
export function getRequiredPrerequisites(featureKey: FeatureKey): FeatureKey[] {
  const result = new Set<FeatureKey>();
  const stack = [...(FEATURE_DEPENDENCIES[featureKey] ?? [])];
  while (stack.length > 0) {
    const dep = stack.pop()!;
    if (!result.has(dep)) {
      result.add(dep);
      for (const nested of FEATURE_DEPENDENCIES[dep] ?? []) {
        stack.push(nested);
      }
    }
  }
  return Array.from(result);
}

/** Returns all features that depend on `featureKey` (for cascade-disable warnings). */
export function getDependentFeatures(featureKey: FeatureKey): FeatureKey[] {
  const dependents = new Set<FeatureKey>();
  let changed = true;
  while (changed) {
    changed = false;
    for (const key of FEATURE_KEYS) {
      if (dependents.has(key)) continue;
      const deps = FEATURE_DEPENDENCIES[key] ?? [];
      if (deps.includes(featureKey) || deps.some((d) => dependents.has(d))) {
        dependents.add(key);
        changed = true;
      }
    }
  }
  return Array.from(dependents);
}

export function resolveRolePermissions(
  role: TenantRole,
  rows: Array<{ permission_key: string; allowed: boolean }>
): Record<PermissionKey, boolean> {
  const map = {} as Record<PermissionKey, boolean>;
  for (const def of PERMISSION_DEFINITIONS) {
    map[def.key] = def[role];
  }
  for (const row of rows) {
    if (row.permission_key in map) {
      map[row.permission_key as PermissionKey] = row.allowed;
    }
  }
  return map;
}

/** A business block takes priority over a block on one person. */
export function resolveAccessBlock(
  tenant: Partial<TenantRow> | null | undefined,
  user: Partial<ProfileRow> | null | undefined
): AccessBlock | null {
  const source = tenant?.access_blocked ? tenant : user?.access_blocked ? user : null;
  if (!source) return null;
  const amount = source.access_block_amount;
  return {
    scope: source === tenant ? "business" : "user",
    message: source.access_block_message ?? null,
    amountDue: amount === null || amount === undefined ? null : Number(amount),
    contact: source.access_block_contact ?? null,
    blockedAt: source.access_blocked_at ?? null,
  };
}

export interface AccessCheckResult {
  allowed: boolean;
  reason?:
    | "UNAUTHENTICATED"
    | "TENANT_SUSPENDED"
    | "ACCESS_BLOCKED"
    | "IMPERSONATION_READ_ONLY"
    | "FEATURE_DISABLED"
    | "PERMISSION_DENIED"
    | "BRANCH_FORBIDDEN";
}

export function canAccess(
  ctx: SessionContext | null | undefined,
  permissionKey: PermissionKey,
  options?: { branchId?: string | null; isMutation?: boolean }
): AccessCheckResult {
  if (!ctx || !ctx.user || !ctx.user.is_active) {
    return { allowed: false, reason: "UNAUTHENTICATED" };
  }
  if (!ctx.tenant) {
    return { allowed: false, reason: "UNAUTHENTICATED" };
  }

  // Suspended tenant blocks access (unless active platform impersonation)
  if (ctx.tenant.status === "suspended" && !ctx.impersonation) {
    return { allowed: false, reason: "TENANT_SUSPENDED" };
  }

  if (ctx.accessBlock && !ctx.impersonation) {
    return { allowed: false, reason: "ACCESS_BLOCKED" };
  }

  // Read-only impersonation strictly blocks mutations
  if (options?.isMutation && ctx.impersonation && ctx.impersonation.mode === "read") {
    return { allowed: false, reason: "IMPERSONATION_READ_ONLY" };
  }

  const parentFeature = PERMISSION_PARENT_MAP[permissionKey];
  if (!ctx.enabledFeatures[parentFeature]) {
    return { allowed: false, reason: "FEATURE_DISABLED" };
  }

  if (!ctx.permissions[permissionKey]) {
    return { allowed: false, reason: "PERMISSION_DENIED" };
  }

  if (options?.branchId && ctx.user.role !== "owner") {
    if (!ctx.assignedBranchIds.includes(options.branchId)) {
      return { allowed: false, reason: "BRANCH_FORBIDDEN" };
    }
  }

  return { allowed: true };
}

export function assertAccess(
  ctx: SessionContext | null | undefined,
  permissionKey: PermissionKey,
  options?: { branchId?: string | null; isMutation?: boolean }
): asserts ctx is SessionContext & { tenant: TenantRow } {
  const res = canAccess(ctx, permissionKey, options);
  if (!res.allowed) {
    throw new Error(`ACCESS_DENIED:${res.reason}`);
  }
}
