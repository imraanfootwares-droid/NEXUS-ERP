"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { MessageCircle, PackagePlus, Pencil, Trash2, Wallet } from "lucide-react";
import { toast } from "sonner";
import { deleteCustomerAction, deleteSupplierAction, updateCustomerAction, updateSupplierAction } from "@/actions/inventory";
import { GstinInput } from "@/components/ui/dynamic-fields";
import { Button, Dialog, Form, Input, Label, Select, friendlyErrorMessage } from "@/components/ui/primitives";
import { INDIAN_STATES } from "@/lib/constants/saas";
import { PartyMoneyDialog, type PartyMoneyTarget } from "./party-money-dialog";
import { PurchaseBillDialog, type PurchaseCatalogVariant, type SizeRatioPreset } from "./purchase-bill-dialog";

export type PartyDetails =
  | {
      type: "customer";
      id: string;
      name: string;
      phone: string | null;
      email: string | null;
      gstin: string | null;
      state_code: string | null;
      address: string | null;
      customer_type: "retail" | "wholesale";
      default_discount_pct: number;
      credit_limit: number;
      credit_days: number;
    }
  | {
      type: "supplier";
      id: string;
      name: string;
      phone: string | null;
      gstin: string | null;
      state_code: string | null;
      address: string | null;
      material_type: string | null;
      supplied_products: string[];
    };

function waNumber(phone: string | null): string | null {
  if (!phone) return null;
  const d = phone.replace(/\D/g, "");
  if (d.length === 10) return `91${d}`;
  if (d.length === 12 && d.startsWith("91")) return d;
  return null;
}

/** All customer / supplier actions, shown at the top of their ledger page. */
export function PartyActionsBar({
  details,
  currentDue,
  tenantName,
  canEdit,
  purchase,
}: {
  details: PartyDetails;
  currentDue: number;
  tenantName: string;
  canEdit: boolean;
  /** Suppliers only: data for the New Purchase Bill popup. */
  purchase?: {
    branches: Array<{ id: string; name: string }>;
    catalog: PurchaseCatalogVariant[];
    ratioPresets: SizeRatioPreset[];
  } | null;
}) {
  const router = useRouter();
  const isSup = details.type === "supplier";
  const [moneyTarget, setMoneyTarget] = useState<PartyMoneyTarget | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [purchaseOpen, setPurchaseOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [name, setName] = useState(details.name);
  const [phone, setPhone] = useState(details.phone ?? "");
  const [gstin, setGstin] = useState(details.gstin ?? "");
  const [stateCode, setStateCode] = useState(details.state_code ?? "33");
  const [address, setAddress] = useState(details.address ?? "");
  const [custType, setCustType] = useState<"retail" | "wholesale">(details.type === "customer" ? details.customer_type : "retail");
  const [creditLimit, setCreditLimit] = useState(details.type === "customer" ? String(details.credit_limit || "") : "");
  const [material, setMaterial] = useState(details.type === "supplier" ? details.material_type ?? "" : "");

  const wa = waNumber(details.phone);
  const remindText = `Hello ${details.name}, this is a reminder from ${tenantName}: your pending balance is ₹${currentDue.toLocaleString("en-IN")}. Please pay when possible. Thank you!`;

  const btn =
    "inline-flex min-h-[40px] items-center gap-1.5 rounded-lg px-3.5 text-[13px] font-semibold transition-colors cursor-pointer";

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        {isSup && canEdit && purchase && (
          <button
            type="button"
            onClick={() => setPurchaseOpen(true)}
            className={`${btn} bg-emerald-600 text-white hover:bg-emerald-700`}
          >
            <PackagePlus className="h-4 w-4" /> New Purchase Bill
          </button>
        )}
        {canEdit && (
          <button
            type="button"
            onClick={() => setMoneyTarget({ partyType: details.type, id: details.id, name: details.name, currentDue })}
            className={`${btn} bg-[#171717] text-white hover:bg-[#2a2a2a]`}
          >
            <Wallet className="h-4 w-4" /> Add / Deduct ₹
          </button>
        )}
        {!isSup && currentDue > 0 && wa && (
          <a
            href={`https://wa.me/${wa}?text=${encodeURIComponent(remindText)}`}
            target="_blank"
            rel="noreferrer"
            className={`${btn} border border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100`}
          >
            <MessageCircle className="h-4 w-4" /> Remind on WhatsApp
          </a>
        )}
        {canEdit && (
          <button type="button" onClick={() => setEditOpen(true)} className={`${btn} border border-slate-300 bg-white text-slate-800 hover:bg-slate-50`}>
            <Pencil className="h-4 w-4" /> Edit Details
          </button>
        )}
        {canEdit && (
          <button
            type="button"
            disabled={deleting}
            onClick={async () => {
              const ok = confirm(
                isSup
                  ? `Delete supplier "${details.name}"? This cannot be undone.`
                  : `Remove customer "${details.name}" from the list? Old bills stay safe.`
              );
              if (!ok) return;
              setDeleting(true);
              try {
                if (isSup) {
                  const res = await deleteSupplierAction(details.id);
                  if (!res.ok) {
                    toast.error(res.error);
                    return;
                  }
                } else {
                  await deleteCustomerAction(details.id);
                }
                toast.success(isSup ? "Supplier deleted." : "Customer removed.");
                router.push(`/dashboard/customers?tab=${isSup ? "suppliers" : "customers"}`);
                router.refresh();
              } catch (err) {
                toast.error(friendlyErrorMessage(err, "Could not delete. Please try again."));
              } finally {
                setDeleting(false);
              }
            }}
            className={`${btn} border border-rose-200 bg-white text-rose-700 hover:bg-rose-50 disabled:opacity-50`}
          >
            <Trash2 className="h-4 w-4" /> {isSup ? "Delete" : "Remove"}
          </button>
        )}
      </div>

      {isSup && purchase && (
        <PurchaseBillDialog
          open={purchaseOpen}
          onClose={() => setPurchaseOpen(false)}
          supplierId={details.id}
          supplierName={details.name}
          branches={purchase.branches}
          catalog={purchase.catalog}
          ratioPresets={purchase.ratioPresets}
        />
      )}

      <PartyMoneyDialog key={moneyTarget?.id ?? "none"} target={moneyTarget} onClose={() => setMoneyTarget(null)} showHistoryLink={false} />

      <Dialog open={editOpen} onClose={() => setEditOpen(false)} title={isSup ? "Edit Supplier" : "Edit Customer"}>
        <Form
          onSubmit={async (e) => {
            e.preventDefault();
            if (!name.trim()) {
              toast.error("Name is required.");
              return;
            }
            try {
              if (details.type === "customer") {
                await updateCustomerAction({
                  id: details.id,
                  name,
                  phone,
                  email: details.email ?? undefined,
                  gstin,
                  stateCode,
                  address,
                  customerType: custType,
                  defaultDiscountPct: details.default_discount_pct,
                  creditLimit: Math.max(0, Number(creditLimit || 0)),
                  creditDays: custType === "wholesale" ? details.credit_days || 30 : 0,
                });
              } else {
                await updateSupplierAction({
                  id: details.id,
                  name,
                  phone,
                  gstin,
                  stateCode,
                  address,
                  materialType: material,
                  suppliedProducts: details.supplied_products,
                });
              }
              toast.success("Details saved.");
              setEditOpen(false);
              router.refresh();
            } catch (err) {
              toast.error(friendlyErrorMessage(err, "Could not save. Please try again."));
            }
          }}
          className="space-y-3"
        >
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <Label>Name *</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} required />
            </div>
            <div>
              <Label>Phone</Label>
              <Input value={phone} inputMode="tel" onChange={(e) => setPhone(e.target.value)} placeholder="10-digit number" />
            </div>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <Label>GSTIN (Optional)</Label>
              <GstinInput value={gstin} onChange={setGstin} onStateDetected={setStateCode} />
            </div>
            <div>
              <Label>State</Label>
              <Select value={stateCode} onChange={(e) => setStateCode(e.target.value)}>
                {Object.entries(INDIAN_STATES).map(([c, n]) => (
                  <option key={c} value={c}>{c} — {n}</option>
                ))}
              </Select>
            </div>
          </div>
          <div>
            <Label>Address (Optional)</Label>
            <Input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Shop / street / city" />
          </div>
          {details.type === "customer" ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <Label>Customer Type</Label>
                <Select value={custType} onChange={(e) => setCustType(e.target.value as "retail" | "wholesale")}>
                  <option value="retail">Retail (shop customer)</option>
                  <option value="wholesale">Wholesale (dealer)</option>
                </Select>
              </div>
              <div>
                <Label>Credit Limit ₹ (Optional)</Label>
                <Input inputMode="decimal" value={creditLimit} onChange={(e) => setCreditLimit(e.target.value.replace(/[^0-9.]/g, ""))} placeholder="0 = no limit" />
              </div>
            </div>
          ) : (
            <div>
              <Label>What they supply (Optional)</Label>
              <Input value={material} onChange={(e) => setMaterial(e.target.value)} placeholder="e.g. Shoes, Soles, Boxes" />
            </div>
          )}
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="outline" onClick={() => setEditOpen(false)}>Cancel</Button>
            <Button type="submit">Save</Button>
          </div>
        </Form>
      </Dialog>
    </>
  );
}
