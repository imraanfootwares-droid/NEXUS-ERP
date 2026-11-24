import { notFound } from "next/navigation";
import { TierLockOverlay } from "@/components/ui/kpi-grid";
import { canAccess } from "@/lib/auth/access";
import { getServerSessionContext } from "@/lib/auth/session";
import { withTenantTx } from "@/lib/db";
import { resolveLedgerConfig } from "@/lib/ledger/defaults";
import { loadPartyLedger, type PartyType } from "@/lib/ledger/party-ledger";
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

  const statement = await withTenantTx(
    { tenantId: ctx.tenant.id, isPlatformAdmin: ctx.user.is_platform_admin },
    (client) => loadPartyLedger(client, ctx.tenant!.id, partyType, id)
  );

  if (!statement) notFound();

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
    />
  );
}
