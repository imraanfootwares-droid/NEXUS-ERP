"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, ExternalLink, Mail, MessageCircle, Phone } from "lucide-react";
import { toast } from "sonner";
import { setTenantEnquiryStatusAction, updateEnquirySettingsAction } from "@/actions/enquiries";
import { DataTable, type ColumnDef } from "@/components/ui/data-table";
import { Form, Badge, Button, Card, CardContent, CardHeader, Label, Select } from "@/components/ui/primitives";
import { Segmented, StatTray } from "@/components/ui/spark";
import { WhatsAppPhoneInput } from "@/components/ui/whatsapp-phone-input";
import type { EnquiryChannel, TenantEnquiryRow, TenantRow } from "@/types/database";

const FILTERS = ["All", "New", "Contacted", "Closed"] as const;

export function DashboardEnquiriesClient({
  tenant,
  enquiries,
  canManage,
}: {
  tenant: TenantRow;
  enquiries: TenantEnquiryRow[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("All");
  const [savingId, setSavingId] = useState<string | null>(null);

  const [whatsapp, setWhatsapp] = useState(tenant.storefront_config?.whatsapp_number ?? "");
  const [channel, setChannel] = useState<EnquiryChannel>(
    tenant.storefront_config?.enquiry_channel ??
      (tenant.storefront_config?.whatsapp_number ? "both" : "inbox")
  );
  const [savingSettings, setSavingSettings] = useState(false);

  const [origin, setOrigin] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  const cataloguePath = `/s/${tenant.slug}/catalogue`;
  const publicCatalogueLink = origin ? `${origin}${cataloguePath}` : cataloguePath;

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(publicCatalogueLink);
      setCopied(true);
      toast.success("Public catalogue link copied!");
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Could not copy link.");
    }
  };

  const count = (s: TenantEnquiryRow["status"]) => enquiries.filter((e) => e.status === s).length;
  const visible =
    filter === "All"
      ? enquiries
      : enquiries.filter((e) => e.status === filter.toLowerCase());

  const changeStatus = async (id: string, status: TenantEnquiryRow["status"]) => {
    setSavingId(id);
    try {
      await setTenantEnquiryStatusAction(id, status);
      toast.success("Enquiry status updated.");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update enquiry.");
    } finally {
      setSavingId(null);
    }
  };

  const saveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingSettings(true);
    try {
      await updateEnquirySettingsAction({
        whatsappNumber: whatsapp,
        enquiryChannel: channel,
      });
      toast.success("Enquiry routing settings saved.");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save settings.");
    } finally {
      setSavingSettings(false);
    }
  };

  const columns: ColumnDef<TenantEnquiryRow>[] = [
    {
      key: "customer",
      header: "Customer",
      mobilePrimary: true,
      sortValue: (e) => e.customer_name.toLowerCase(),
      render: (e) => (
        <div className="space-y-0.5">
          <div className="font-medium text-[#171717]">{e.customer_name}</div>
          <div className="flex items-center gap-1.5">
            <Badge variant="default">{e.source}</Badge>
            <span className="text-[10.5px] text-[#77777d]">via {e.channel}</span>
          </div>
        </div>
      ),
    },
    {
      key: "contact",
      header: "Contact",
      render: (e) => {
        const isEmail = e.customer_contact.includes("@");
        const Icon = isEmail ? Mail : Phone;
        const cleanDigits = e.customer_contact.replace(/\D/g, "");
        return (
          <div className="flex flex-wrap items-center gap-2">
            <a
              href={isEmail ? `mailto:${e.customer_contact}` : `tel:${e.customer_contact.replace(/[^\d+]/g, "")}`}
              className="inline-flex items-center gap-1.5 text-[#27272a] hover:underline"
            >
              <Icon className="h-3 w-3 text-[#a3a3a8]" />
              {e.customer_contact}
            </a>
            {!isEmail && cleanDigits.length >= 10 && (
              <a
                href={`https://wa.me/${cleanDigits}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-1.5 py-0.5 text-[10.5px] font-medium text-emerald-700 hover:bg-emerald-100"
                title="Reply on WhatsApp"
              >
                <MessageCircle className="h-3 w-3" /> WA
              </a>
            )}
          </div>
        );
      },
    },
    {
      key: "items",
      header: "Items & Message",
      render: (e) => {
        const items = Array.isArray(e.items) ? e.items : [];
        return (
          <div className="max-w-[320px] space-y-1 text-xs">
            {items.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {items.map((it, idx) => (
                  <span
                    key={idx}
                    className="inline-flex items-center rounded-md bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium text-slate-800"
                  >
                    {it.name}
                    {it.model_code || it.sku ? ` (${it.model_code || it.sku})` : ""} × {it.qty}
                  </span>
                ))}
              </div>
            )}
            {e.message && <p className="text-[#55555b]">{e.message}</p>}
            {items.length === 0 && !e.message && <span className="text-[#a3a3a8]">General enquiry</span>}
          </div>
        );
      },
    },
    {
      key: "date",
      header: "Received",
      sortValue: (e) => new Date(e.created_at).getTime(),
      render: (e) => (
        <span className="font-mono text-[11px] text-[#77777d]" suppressHydrationWarning>
          {new Date(e.created_at).toLocaleString("en-IN", {
            timeZone: "Asia/Kolkata",
            dateStyle: "medium",
            timeStyle: "short",
          })}
        </span>
      ),
    },
    {
      key: "status",
      header: "Status",
      sortValue: (e) => e.status,
      render: (e) =>
        canManage ? (
          <Select
            aria-label={`Status for ${e.customer_name}`}
            value={e.status}
            disabled={savingId === e.id}
            onChange={(ev) => changeStatus(e.id, ev.target.value as TenantEnquiryRow["status"])}
            className="!min-h-[30px] !w-[122px] !py-1 !text-xs"
          >
            <option value="new">New</option>
            <option value="contacted">Contacted</option>
            <option value="closed">Closed</option>
          </Select>
        ) : (
          <Badge variant={e.status === "new" ? "info" : e.status === "contacted" ? "warning" : "success"}>
            {e.status}
          </Badge>
        ),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1>Customer Enquiries</h1>
          <p className="mt-0.5 text-[12.5px] text-[#77777d]">
            Customer enquiries from your public PDF catalogue and storefront — visible to your entire team.
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs">
          <code className="max-w-[200px] truncate font-mono text-[11px] text-slate-700 sm:max-w-[280px]">
            {publicCatalogueLink}
          </code>
          <button
            type="button"
            onClick={copyLink}
            className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-slate-200 text-slate-700 hover:bg-slate-100"
            title="Copy public catalogue link"
            aria-label="Copy public catalogue link"
          >
            {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
          </button>
          <a
            href={cataloguePath}
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-slate-200 text-slate-700 hover:bg-slate-100"
            title="Open public catalogue"
            aria-label="Open public catalogue"
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTray label="Total" value={enquiries.length} unit="Enquiries" footnote="Catalogue & storefront" />
        <StatTray label="New" value={count("new")} unit="Waiting" footnote="Need a first reply" />
        <StatTray label="Contacted" value={count("contacted")} unit="Active" footnote="In conversation" />
        <StatTray label="Closed" value={count("closed")} unit="Done" footnote="Completed" />
      </div>

      {canManage && (
        <Card>
          <CardHeader>
            <h3 className="text-sm font-semibold">Enquiry Delivery &amp; WhatsApp Routing</h3>
          </CardHeader>
          <CardContent>
            <Form onSubmit={saveSettings} className="grid grid-cols-1 items-end gap-3 sm:grid-cols-3">
              <div>
                <Label>Inquiry WhatsApp Number</Label>
                <WhatsAppPhoneInput
                  value={whatsapp}
                  onChange={setWhatsapp}
                  placeholder="9876543210"
                />
              </div>
              <div>
                <Label>Where should customer enquiries go?</Label>
                <Select
                  value={channel}
                  onChange={(e) => setChannel(e.target.value as EnquiryChannel)}
                >
                  <option value="inbox">Inbox Only (Team Enquiries Page)</option>
                  <option value="whatsapp">WhatsApp Only (Direct Message)</option>
                  <option value="both">Both (Inbox + WhatsApp)</option>
                </Select>
              </div>
              <div>
                <Button type="submit" disabled={savingSettings} className="w-full sm:w-auto">
                  {savingSettings ? "Saving..." : "Save Enquiry Settings"}
                </Button>
              </div>
            </Form>
          </CardContent>
        </Card>
      )}

      <DataTable
        data={visible}
        columns={columns}
        rowKey={(e) => e.id}
        pageSize={15}
        searchPlaceholder="Search customer, contact, or product..."
        searchFilter={(e, q) =>
          [
            e.customer_name,
            e.customer_contact,
            e.message ?? "",
            ...(Array.isArray(e.items) ? e.items.map((i) => `${i.name} ${i.model_code ?? ""} ${i.sku ?? ""}`) : []),
          ].some((v) => v.toLowerCase().includes(q))
        }
        emptyMessage={
          enquiries.length === 0
            ? "No customer enquiries yet. Share your public catalogue link to receive enquiries here."
            : "No enquiries match this filter."
        }
        actions={<Segmented label="Filter by status" options={FILTERS} value={filter} onChange={setFilter} />}
      />
    </div>
  );
}
