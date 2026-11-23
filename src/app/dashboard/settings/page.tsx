import { getServerSessionContext } from "@/lib/auth/session";
import { isFeatureEnabled } from "@/lib/auth/access";
import { withTenantTx } from "@/lib/db";
import type { CustomFieldRow, VariantAxisRow } from "@/types/database";
import { SettingsHubClient } from "./_client";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const ctx = await getServerSessionContext();
  if (!ctx || !ctx.tenant) return null;

  const data = await withTenantTx(
    { tenantId: ctx.tenant.id, isPlatformAdmin: ctx.user.is_platform_admin },
    async (client) => {
      const [axes, fields, staff, resets, perms, devices, backups] = await Promise.all([
        client.query<VariantAxisRow>(
          "SELECT * FROM public.variant_axis_definitions WHERE tenant_id = $1 ORDER BY sort_order, name",
          [ctx.tenant!.id]
        ),
        client.query<CustomFieldRow>(
          "SELECT * FROM public.custom_field_definitions WHERE tenant_id = $1 ORDER BY sort_order, label",
          [ctx.tenant!.id]
        ),
        client.query<{
          id: string;
          full_name: string;
          username: string | null;
          email: string | null;
          role: "owner" | "branch_admin" | "worker";
          is_active: boolean;
        }>("SELECT id, full_name, username, email, role, is_active FROM public.profiles WHERE tenant_id = $1 ORDER BY role, full_name", [
          ctx.tenant!.id,
        ]),
        client.query<{
          id: string;
          user_id: string;
          identifier_submitted: string;
          note: string | null;
          created_at: string;
          full_name: string | null;
          role: string | null;
        }>(
          `SELECT r.id, r.user_id, r.identifier_submitted, r.note, r.created_at, p.full_name, p.role
           FROM public.password_reset_requests r
           JOIN public.profiles p ON p.id = r.user_id
           WHERE r.tenant_id = $1 AND r.status = 'pending' AND p.role <> 'owner'
           ORDER BY r.created_at DESC`,
          [ctx.tenant!.id]
        ),
        client.query<{ role: "branch_admin" | "worker"; permission_key: string; allowed: boolean }>(
          "SELECT role, permission_key, allowed FROM public.tenant_role_permissions WHERE tenant_id = $1 AND role IN ('branch_admin','worker')",
          [ctx.tenant!.id]
        ),
        client.query<{
          id: string;
          branch_id: string;
          device_no: number;
          label: string;
          last_seq: number;
          is_active: boolean;
        }>("SELECT id, branch_id, device_no, label, last_seq, is_active FROM public.devices WHERE tenant_id = $1 ORDER BY branch_id, device_no", [
          ctx.tenant!.id,
        ]),
        client.query<{
          id: string;
          file_size_bytes: string;
          trigger_type: string;
          checksum_sha256: string;
          created_at: string;
        }>("SELECT id, file_size_bytes, trigger_type, checksum_sha256, created_at FROM public.tenant_backups WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT 14", [
          ctx.tenant!.id,
        ]),
      ]);

      return {
        axes: axes.rows,
        fields: fields.rows,
        staff: staff.rows,
        resets: resets.rows,
        perms: perms.rows,
        devices: devices.rows,
        backups: backups.rows,
      };
    }
  );

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-display text-2xl font-bold text-slate-900">Workspace Settings</h1>
        <p className="text-sm text-slate-600">
          Configure brand style, dynamic product schema, tax/HSN, branches, staff, permissions &amp; backups.
        </p>
      </div>
      <SettingsHubClient
        tenant={ctx.tenant}
        branches={ctx.branches}
        userRole={ctx.user.role}
        permissions={ctx.permissions}
        axes={data.axes}
        fields={data.fields}
        staff={data.staff}
        resets={data.resets}
        rolePermRows={data.perms}
        devices={data.devices}
        backups={data.backups}
        stockEnabled={isFeatureEnabled(ctx.tenant, "dynamic_stock_matrix")}
        backupsEnabled={isFeatureEnabled(ctx.tenant, "daily_backups")}
      />
    </div>
  );
}
