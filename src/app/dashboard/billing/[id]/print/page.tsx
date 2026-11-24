import { notFound } from "next/navigation";
import { InvoiceRenderer, PrintShareToolbar } from "@/components/billing/invoice-renderer";
import { getServerSessionContext } from "@/lib/auth/session";
import { loadInvoiceRenderProps } from "@/lib/billing/invoice-render-props";
import { withTenantTx } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function InvoicePrintPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await getServerSessionContext();
  if (!ctx || !ctx.tenant) return null;
  const tenant = ctx.tenant;

  const props = await withTenantTx(
    { tenantId: tenant.id, isPlatformAdmin: ctx.user.is_platform_admin },
    (client) => loadInvoiceRenderProps(client, tenant, id)
  );
  if (!props) notFound();

  return (
    <div className="space-y-4">
      <PrintShareToolbar
        backHref="/dashboard/billing"
        backLabel="← Back to Invoices"
        pdfUrl={`/api/documents/invoice/${props.invoiceId}`}
        docTitle={props.data.invoiceNumber || "Invoice"}
      />
      <InvoiceRenderer format={props.format} config={props.config} data={props.data} />
    </div>
  );
}
