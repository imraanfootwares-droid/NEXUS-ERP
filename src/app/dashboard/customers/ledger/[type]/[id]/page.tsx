import { notFound } from "next/navigation";
import { TierLockOverlay } from "@/components/ui/kpi-grid";
import { canAccess } from "@/lib/auth/access";
import { getServerSessionContext } from "@/lib/auth/session";
import { withTenantTx } from "@/lib/db";
import { resolveLedgerConfig } from "@/lib/ledger/defaults";
import { loadPartyLedger, type PartyType } from "@/lib/ledger/party-ledger";
import { PartyActionsBar, type PartyDetails } from "@/components/ledger/party-actions-bar";
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
      return { statement, details };
    }
  );

  if (!loaded) notFound();
  const { statement, details } = loaded;

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
          />
        ) : null
      }
    />
  );
}
