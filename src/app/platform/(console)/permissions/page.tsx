import { withPlatformTx } from "@/lib/db";
import type { HsnCodeRow } from "@/types/database";
import { PlatformPermissionsAndHsnClient } from "@/app/platform/_client";

export const dynamic = "force-dynamic";

export default async function PlatformPermissionsPage() {
  const data = await withPlatformTx(async (client) => {
    const [tenantsRes, globalRes, tenantPermsRes, hsnRes] = await Promise.all([
      client.query<{ id: string; name: string }>("SELECT id, name FROM public.tenants ORDER BY name"),
      client.query<{
        permission_key: string;
        default_owner: boolean;
        default_branch_admin: boolean;
        default_worker: boolean;
      }>("SELECT permission_key, default_owner, default_branch_admin, default_worker FROM public.permission_definitions"),
      client.query<{
        tenant_id: string;
        role: "owner" | "branch_admin" | "worker";
        permission_key: string;
        allowed: boolean;
      }>("SELECT tenant_id, role, permission_key, allowed FROM public.tenant_role_permissions"),
      client.query<HsnCodeRow>("SELECT * FROM public.hsn_codes WHERE tenant_id IS NULL ORDER BY code"),
    ]);

    const globalDefaults: Record<string, { owner: boolean; branch_admin: boolean; worker: boolean }> = {};
    for (const r of globalRes.rows) {
      globalDefaults[r.permission_key] = {
        owner: r.default_owner,
        branch_admin: r.default_branch_admin,
        worker: r.default_worker,
      };
    }

    const tenantOverrides: Record<
      string,
      Record<string, { owner: boolean; branch_admin: boolean; worker: boolean }>
    > = {};
    for (const r of tenantPermsRes.rows) {
      tenantOverrides[r.tenant_id] ??= {};
      tenantOverrides[r.tenant_id][r.permission_key] ??= {
        ...(globalDefaults[r.permission_key] ?? { owner: true, branch_admin: false, worker: false }),
      };
      tenantOverrides[r.tenant_id][r.permission_key][r.role] = r.allowed;
    }

    return {
      tenants: tenantsRes.rows,
      globalDefaults,
      tenantOverrides,
      hsnCodes: hsnRes.rows,
    };
  });

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-2xl font-bold text-slate-900">
          Permission Matrix &amp; HSN Master
        </h1>
        <p className="text-sm text-slate-600">
          Configure global defaults, override any tenant role&apos;s permissions, and manage Indian GST HSN codes.
        </p>
      </div>
      <PlatformPermissionsAndHsnClient
        tenants={data.tenants}
        globalDefaults={data.globalDefaults}
        tenantOverrides={data.tenantOverrides}
        hsnCodes={data.hsnCodes}
      />
    </div>
  );
}
