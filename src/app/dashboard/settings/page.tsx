import { redirect } from "next/navigation";
import { getServerSessionContext } from "@/lib/auth/session";
import { withTenantTx } from "@/lib/db";
import type { CustomFieldRow, VariantAxisRow } from "@/types/database";
import { SettingsHubClient } from "./_client";

export const dynamic = "force-dynamic";

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const ctx = await getServerSessionContext();
  if (!ctx || !ctx.tenant) return null;
  const sp = await searchParams;
  if (sp.tab === "branches" || sp.tab === "staff" || sp.tab === "permissions") {
    redirect(`/dashboard/organisation?tab=${sp.tab}`);
  }
  const validTabs = new Set(["profile", "brand", "schema", "devices", "backups"]);
  const requestedTab = sp.tab === "tax" ? "profile" : sp.tab;
  const initialTab = requestedTab && validTabs.has(requestedTab) ? requestedTab : "profile";

  const data = await withTenantTx(
    { tenantId: ctx.tenant.id, isPlatformAdmin: ctx.user.is_platform_admin },
    async (client) => {
      const [meRes, axes, fields, devices, backups] = await Promise.all([
        client.query<{
          id: string;
          full_name: string;
          username: string | null;
          email: string | null;
          phone: string | null;
          role: "owner" | "branch_admin" | "worker";
        }>("SELECT id, full_name, username, email, phone, role FROM public.profiles WHERE id = $1", [
          ctx.user.id,
        ]),
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
        me: meRes.rows[0] ?? {
          id: ctx.user.id,
          full_name: ctx.user.full_name,
          username: ctx.user.username,
          email: ctx.user.email,
          phone: null,
          role: ctx.user.role,
        },
        axes: axes.rows,
        fields: fields.rows,
        devices: devices.rows,
        backups: backups.rows,
      };
    }
  );

  return (
    <div className="space-y-4">
      <div>
        <h1>Settings &amp; Profile</h1>
        <p className="mt-0.5 text-[12.5px] text-[#77777d]">
          Set up your shop address, GST number, bank details, product options, and backups. Manage branches and staff under Shops &amp; Team.
        </p>
      </div>
      <SettingsHubClient
        tenant={ctx.tenant}
        branches={ctx.branches}
        userRole={ctx.user.role}
        currentUser={data.me}
        initialTab={initialTab}
        permissions={ctx.permissions}
        axes={data.axes}
        fields={data.fields}
        devices={data.devices}
        backups={data.backups}
        stockEnabled={ctx.enabledFeatures.dynamic_stock_matrix}
        categoryPresetsEnabled={ctx.enabledFeatures.category_size_presets}
        visualBuilderEnabled={ctx.enabledFeatures.visual_product_builder}
        backupsEnabled={ctx.enabledFeatures.daily_backups}
      />
    </div>
  );
}
