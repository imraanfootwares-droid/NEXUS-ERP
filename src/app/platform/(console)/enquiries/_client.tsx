"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { Mail, Phone } from "lucide-react";
import { toast } from "sonner";
import { setEnquiryStatusAction } from "@/actions/platform-org";
import { DataTable, type ColumnDef } from "@/components/ui/data-table";
import { Select } from "@/components/ui/primitives";
import { Segmented, StatTray } from "@/components/ui/spark";

export type EnquiryStatus = "new" | "contacted" | "closed";

export interface EnquiryRow {
  id: string;
  contact: string;
  business: string;
  interest: string | null;
  status: EnquiryStatus;
  created_at: string;
}

const FILTERS = ["All", "New", "Contacted", "Closed"] as const;

export function EnquiriesClient({ enquiries }: { enquiries: EnquiryRow[] }) {
  const router = useRouter();
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("All");
  const [savingId, setSavingId] = useState<string | null>(null);

  const count = (s: EnquiryStatus) => enquiries.filter((e) => e.status === s).length;
  const visible = filter === "All" ? enquiries : enquiries.filter((e) => e.status === filter.toLowerCase());

  const changeStatus = async (id: string, status: EnquiryStatus) => {
    setSavingId(id);
    try {
      await setEnquiryStatusAction(id, status);
      toast.success("Enquiry updated.");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update enquiry.");
    } finally {
      setSavingId(null);
    }
  };

  const columns: ColumnDef<EnquiryRow>[] = [
    {
      key: "business",
      header: "Business",
      mobilePrimary: true,
      sortValue: (e) => e.business.toLowerCase(),
      render: (e) => <span className="font-medium text-[#171717]">{e.business}</span>,
    },
    {
      key: "contact",
      header: "Contact",
      render: (e) => {
        const email = e.contact.includes("@");
        const Icon = email ? Mail : Phone;
        return (
          <a
            href={email ? `mailto:${e.contact}` : `tel:${e.contact.replace(/[^\d+]/g, "")}`}
            className="inline-flex items-center gap-1.5 text-[#27272a] hover:underline"
          >
            <Icon className="h-3 w-3 text-[#a3a3a8]" />
            {e.contact}
          </a>
        );
      },
    },
    { key: "interest", header: "Interested In", render: (e) => <span className="text-[#55555b]">{e.interest || "General"}</span> },
    {
      key: "date",
      header: "Received",
      sortValue: (e) => new Date(e.created_at).getTime(),
      render: (e) => (
        <span className="font-mono text-[11px] text-[#77777d]" suppressHydrationWarning>
          {new Date(e.created_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" })}
        </span>
      ),
    },
    {
      key: "status",
      header: "Status",
      sortValue: (e) => e.status,
      render: (e) => (
        <Select
          aria-label={`Status for ${e.business}`}
          value={e.status}
          disabled={savingId === e.id}
          onChange={(ev) => changeStatus(e.id, ev.target.value as EnquiryStatus)}
          className="!min-h-[30px] !w-[122px] !py-1 !text-xs"
        >
          <option value="new">New</option>
          <option value="contacted">Contacted</option>
          <option value="closed">Closed</option>
        </Select>
      ),
    },
  ];

  return (
    <div className="space-y-3.5">
      <h1>Enquiries</h1>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTray label="Total" value={enquiries.length} unit="Leads" footnote="From the landing page" />
        <StatTray label="New" value={count("new")} unit="Waiting" footnote="Need a first reply" />
        <StatTray label="Contacted" value={count("contacted")} unit="Leads" footnote="In conversation" />
        <StatTray label="Closed" value={count("closed")} unit="Leads" footnote="Finished" />
      </div>
      <DataTable
        data={visible}
        columns={columns}
        rowKey={(e) => e.id}
        pageSize={15}
        searchPlaceholder="Search business or contact..."
        searchFilter={(e, q) => [e.business, e.contact, e.interest ?? ""].some((v) => v.toLowerCase().includes(q))}
        emptyMessage={enquiries.length === 0 ? "No enquiries yet." : "No enquiries match this filter."}
        actions={<Segmented label="Filter by status" options={FILTERS} value={filter} onChange={setFilter} />}
      />
    </div>
  );
}
