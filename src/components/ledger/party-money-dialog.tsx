"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { recordPartyMoneyTransactionAction } from "@/actions/party-ledger";
import { Button, Dialog, Form, Input, Label, Select, friendlyErrorMessage } from "@/components/ui/primitives";
type PaymentMode = "cash" | "upi" | "bank_transfer" | "card";

export interface PartyMoneyTarget {
  partyType: "customer" | "supplier";
  id: string;
  name: string;
  currentDue: number;
}

/**
 * "Add / Deduct ₹" popup for a customer or supplier.
 * Render with key={target?.id} so the form resets for each party.
 */
export function PartyMoneyDialog({
  target,
  onClose,
  showHistoryLink = true,
}: {
  target: PartyMoneyTarget | null;
  onClose: () => void;
  showHistoryLink?: boolean;
}) {
  const router = useRouter();
  const [direction, setDirection] = useState<"add" | "deduct">(target && target.currentDue > 0 ? "deduct" : "add");
  const [amount, setAmount] = useState("");
  const [mode, setMode] = useState<PaymentMode>("cash");
  const [voucher, setVoucher] = useState("");
  const [note, setNote] = useState("");

  const isSup = target?.partyType === "supplier";
  const amtNum = Number(amount || 0);
  const nextBal = target ? Math.max(0, target.currentDue + (direction === "add" ? amtNum : -amtNum)) : 0;

  return (
    <Dialog
      open={Boolean(target)}
      onClose={onClose}
      title={target ? `Add / Deduct Money — ${target.name}` : "Add / Deduct Money"}
      subtitle={target ? `Balance now: ₹${target.currentDue.toLocaleString("en-IN")}` : undefined}
    >
      {target && (
        <Form
          onSubmit={async (e) => {
            e.preventDefault();
            if (!amtNum || amtNum <= 0) {
              toast.error("Enter the amount.");
              return;
            }
            try {
              await recordPartyMoneyTransactionAction({
                partyType: target.partyType,
                partyId: target.id,
                direction,
                amount: amtNum,
                mode,
                voucherNo: voucher || undefined,
                note: note || undefined,
              });
              toast.success(
                direction === "add"
                  ? `Added ₹${amtNum.toLocaleString("en-IN")} to ${target.name}.`
                  : `Saved ₹${amtNum.toLocaleString("en-IN")} ${isSup ? "paid to supplier" : "received from customer"}.`
              );
              onClose();
              router.refresh();
            } catch (err) {
              toast.error(friendlyErrorMessage(err, "Could not save. Please try again."));
            }
          }}
          className="space-y-4"
        >
          <div className="grid grid-cols-2 gap-1 rounded-xl bg-[#f1f1f2] p-1">
            <button
              type="button"
              onClick={() => setDirection("deduct")}
              className={`min-h-[40px] cursor-pointer rounded-lg px-3 py-2 text-[13px] font-semibold transition-all ${
                direction === "deduct" ? "bg-white text-emerald-700 shadow-[0_1px_2px_rgba(0,0,0,.08)]" : "text-[#55555b] hover:text-[#171717]"
              }`}
            >
              {isSup ? "− I Paid Supplier" : "− Customer Paid Me"}
            </button>
            <button
              type="button"
              onClick={() => setDirection("add")}
              className={`min-h-[40px] cursor-pointer rounded-lg px-3 py-2 text-[13px] font-semibold transition-all ${
                direction === "add" ? "bg-white text-rose-700 shadow-[0_1px_2px_rgba(0,0,0,.08)]" : "text-[#55555b] hover:text-[#171717]"
              }`}
            >
              {isSup ? "+ New Goods / Bill" : "+ New Bill / Due"}
            </button>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <Label>Amount (₹) *</Label>
              <Input
                type="text"
                inputMode="decimal"
                autoFocus
                value={amount}
                onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
                placeholder="e.g. 5000"
                required
              />
            </div>
            <div>
              <Label>Paid By</Label>
              <Select value={mode} onChange={(e) => setMode(e.target.value as PaymentMode)}>
                <option value="cash">Cash</option>
                <option value="upi">UPI</option>
                <option value="bank_transfer">Bank Transfer / NEFT</option>
                <option value="card">Card</option>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <Label>Bill / Receipt No. (Optional)</Label>
              <Input value={voucher} onChange={(e) => setVoucher(e.target.value)} placeholder={direction === "deduct" ? "e.g. R1" : "e.g. B.No. 99"} />
            </div>
            <div>
              <Label>Note (Optional)</Label>
              <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Paid by cash / 10 cartons" />
            </div>
          </div>

          {amtNum > 0 && (
            <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-[13px]">
              <span className="text-slate-600">New balance</span>
              <span className="font-mono font-bold text-slate-900">
                ₹{target.currentDue.toLocaleString("en-IN")} → ₹{nextBal.toLocaleString("en-IN")}
              </span>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
            {showHistoryLink ? (
              <Link href={`/dashboard/customers/ledger/${target.partyType}/${target.id}`} className="text-xs font-semibold text-sky-700 hover:underline">
                See all transactions →
              </Link>
            ) : (
              <span />
            )}
            <div className="flex items-center gap-2">
              <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
              <Button type="submit">Save</Button>
            </div>
          </div>
        </Form>
      )}
    </Dialog>
  );
}
