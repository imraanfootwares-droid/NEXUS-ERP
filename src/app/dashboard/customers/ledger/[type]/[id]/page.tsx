import { notFound } from "next/navigation";
import { TierLockOverlay } from "@/components/ui/kpi-grid";
import { canAccess } from "@/lib/auth/access";
import { getBranchScope } from "@/lib/auth/active-branch";
import { getServerSessionContext } from "@/lib/auth/session";
import { withTenantTx } from "@/lib/db";
import { resolveLedgerConfig } from "@/lib/ledger/defaults";
import { loadPartyLedger, type PartyType } from "@/lib/ledger/party-ledger";
import { PartyActionsBar, type PartyDetails } from "@/components/ledger/party-actions-bar";
import type { PurchaseCatalogVariant, SizeRatioPreset } from "@/components/ledger/purchase-bill-dialog";
import { PartyLedgerClient } from "./page-client";

export const dynamic = "force-dynamic";

export default async function PartyLedgerPage({
  params,
}: {
  params: Promise<{ type: string; id: string }>;
}) {
  const { type, id } = await params;
  if (type !== "customer" && type !== "supplier") notFound();
  const partyType: PartyType = type;

  const ctx = await getServerSessionContext();
  if (!ctx || !ctx.tenant) return null;

  if (partyType === "customer") {
    if (!canAccess(ctx, "customers.view").allowed) {
      return <TierLockOverlay featureKey="customer_crm" />;
    }
  } else {
    if (!canAccess(ctx, "suppliers.manage").allowed) {
      return <TierLockOverlay featureKey="supplier_and_production" />;
    }
  }

  const loaded = await withTenantTx(
    { tenantId: ctx.tenant.id, isPlatformAdmin: ctx.user.is_platform_admin },
    async (client) => {
      const statement = await loadPartyLedger(client, ctx.tenant!.id, partyType, id);
      if (!statement) return null;
      let details: PartyDetails | null = null;
      if (partyType === "customer") {
        const r = await client.query(
          `SELECT id, name, phone, email, gstin, state_code, address, customer_type,
                  default_discount_pct::float8 AS default_discount_pct, credit_limit::float8 AS credit_limit,
                  COALESCE(credit_days, 0) AS credit_days
           FROM public.customers WHERE id = $1 AND tenant_id = $2`,
          [id, ctx.tenant!.id]
        );
        if (r.rows[0]) details = { type: "customer", ...r.rows[0] };
      } else {
        const r = await client.query(
          `SELECT id, name, phone, gstin, state_code, address, material_type,
                  COALESCE(supplied_products, '{}'::text[]) AS supplied_products
           FROM public.suppliers WHERE id = $1 AND tenant_id = $2`,
          [id, ctx.tenant!.id]
        );
        if (r.rows[0]) details = { type: "supplier", ...r.rows[0] };
      }
      let catalog: PurchaseCatalogVariant[] = [];
      let ratioPresets: SizeRatioPreset[] = [];
      if (partyType === "supplier") {
        const v = await client.query<PurchaseCatalogVariant>(
          `SELECT pv.id AS variant_id, p.id AS product_id, p.name AS product_name, p.model_code,
                  p.supplier_id, pv.attributes, pv.cost_price::float8 AS cost_price, p.gst_rate::float8 AS gst_rate
           FROM public.product_variants pv
           JOIN public.products p ON p.id = pv.product_id
           WHERE pv.tenant_id = $1 AND pv.is_active = true AND p.is_active = true
           ORDER BY p.name, pv.sku
           LIMIT 3000`,
          [ctx.tenant!.id]
        );
        catalog = v.rows;
        const ax = await client.query<{ ratio_presets: SizeRatioPreset[] | null }>(
          "SELECT ratio_presets FROM public.variant_axis_definitions WHERE tenant_id = $1",
          [ctx.tenant!.id]
        );
        ratioPresets = ax.rows.flatMap((a) => (Array.isArray(a.ratio_presets) ? a.ratio_presets : []));
      }
      return { statement, details, catalog, ratioPresets };
    }
  );

  if (!loaded) notFound();
  const { statement, details, catalog, ratioPresets } = loaded;
  const purchase =
    partyType === "supplier"
      ? {
          branches: (await getBranchScope(ctx)).ordered
            .filter((b) => !b.is_read_only)
            .map((b) => ({ id: b.id, name: b.name })),
          catalog,
          ratioPresets,
        }
      : null;

  const ledgerConfig = resolveLedgerConfig(ctx.tenant.brand_config);
  const canEdit =
    partyType === "customer"
      ? canAccess(ctx, "customers.manage", { isMutation: true }).allowed
      : canAccess(ctx, "suppliers.manage", { isMutation: true }).allowed;

  return (
    <PartyLedgerClient
      tenantName={ctx.tenant.name}
      statement={statement}
      ledgerConfig={ledgerConfig}
      canEdit={canEdit}
      actions={
        details ? (
          <PartyActionsBar
            key={`${details.id}-${statement.party.currentDue}`}
            details={details}
            currentDue={statement.party.currentDue}
            tenantName={ctx.tenant.name}
            canEdit={canEdit}
            purchase={purchase}
          />
        ) : null
      }
    />
  );
}
