"use client";

import React, { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Clock, RotateCcw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  emptyTrashAction,
  permanentlyDeleteTrashItemAction,
  restoreTrashItemAction,
} from "@/actions/trash";
import { Button, Card, CardContent } from "@/components/ui/primitives";
import type { TrashEntityType, TrashItemRow } from "@/lib/trash/service";

const TYPE_LABEL: Record<TrashEntityType, string> = {
  invoice: "Sales Bill",
  purchase: "Purchase Bill",
  expense: "Expense / Report",
  ledger_entry: "Ledger Entry",
};

const FILTERS: Array<{ id: "all" | TrashEntityType; label: string }> = [
  { id: "all", label: "All" },
  { id: "invoice", label: "Sales Bills" },
  { id: "purchase", label: "Purchase Bills" },
  { id: "expense", label: "Expenses" },
];

function daysRemaining(expiresAt: string): number {
  const ms = new Date(expiresAt).getTime() - Date.now();
  return Math.max(1, Math.ceil(ms / (1000 * 60 * 60 * 24)));
}

export function TrashClient({ items }: { items: TrashItemRow[] }) {
  const router = useRouter();
  const [filter, setFilter] = useState<"all" | TrashEntityType>("all");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [emptying, setEmptying] = useState(false);

  const visible = useMemo(
    () => (filter === "all" ? items : items.filter((i) => i.entity_type === filter)),
    [items, filter]
  );

  const handleRestore = async (item: TrashItemRow) => {
    setBusyId(item.id);
    try {
      await restoreTrashItemAction(item.id);
      toast.success(`Restored "${item.title}"!`);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not restore item.");
    } finally {
      setBusyId(null);
    }
  };

  const handleDeleteForever = async (item: TrashItemRow) => {
    if (!confirm(`Permanently delete "${item.title}"? This cannot be undone.`)) return;
    setBusyId(item.id);
    try {
      await permanentlyDeleteTrashItemAction(item.id);
      toast.success("Removed permanently.");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not delete item.");
    } finally {
      setBusyId(null);
    }
  };

  const handleEmptyTrash = async () => {
    if (!confirm(`Empty all ${items.length} item(s) in Trash? This cannot be undone.`)) return;
    setEmptying(true);
    try {
      await emptyTrashAction();
      toast.success("Trash emptied.");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not empty trash.");
    } finally {
      setEmptying(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="inline-flex flex-wrap items-center gap-1 rounded-xl border border-[#ececee] bg-[#f4f4f5] p-1">
          {FILTERS.map((f) => {
            const count = f.id === "all" ? items.length : items.filter((i) => i.entity_type === f.id).length;
            const active = filter === f.id;
            return (
              <button
                key={f.id}
                type="button"
                onClick={() => setFilter(f.id)}
                className={`cursor-pointer rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                  active ? "bg-white text-[#171717] shadow-2xs" : "text-[#77777d] hover:text-[#171717]"
                }`}
              >
                {f.label} ({count})
              </button>
            );
          })}
        </div>

        {items.length > 0 && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={emptying}
            onClick={handleEmptyTrash}
            className="text-rose-600 hover:bg-rose-50 hover:text-rose-700"
          >
            <Trash2 className="h-3.5 w-3.5" />
            {emptying ? "Emptying..." : "Empty Trash"}
          </Button>
        )}
      </div>

      {visible.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-[#f4f4f5] text-[#77777d]">
              <Trash2 className="h-5 w-5" />
            </div>
            <p className="mt-3 text-sm font-semibold text-[#171717]">Trash is empty</p>
            <p className="mt-1 text-xs text-[#77777d]">
              When you delete a bill, purchase bill, or expense, it stays here safely for 15 days so you can restore it anytime.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2.5">
          {visible.map((item) => {
            const daysLeft = daysRemaining(item.expires_at);
            const busy = busyId === item.id;
            return (
              <Card key={item.id}>
                <CardContent className="flex flex-wrap items-center justify-between gap-3 py-3.5">
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-md bg-[#171717] px-2 py-0.5 text-[10px] font-semibold text-white">
                        {TYPE_LABEL[item.entity_type]}
                      </span>
                      <p className="text-sm font-semibold text-[#171717] truncate">{item.title}</p>
                      <span className="font-mono text-xs font-semibold text-[#171717]">
                        ₹{Number(item.amount || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                    </div>
                    {item.subtitle && <p className="text-xs text-[#52525b]">{item.subtitle}</p>}
                    <div className="flex flex-wrap items-center gap-2 text-[11px] text-[#77777d]">
                      <span>
                        Deleted by <strong className="text-[#171717]">{item.deleted_by_name || "Staff"}</strong> on{" "}
                        {new Date(item.deleted_at).toLocaleDateString("en-IN", {
                          day: "2-digit",
                          month: "short",
                          year: "numeric",
                        })}
                      </span>
                      <span>·</span>
                      <span
                        className={`inline-flex items-center gap-1 font-medium ${
                          daysLeft <= 3 ? "text-rose-600" : "text-[#52525b]"
                        }`}
                      >
                        <Clock className="h-3 w-3" />
                        Auto-clears in {daysLeft} {daysLeft === 1 ? "day" : "days"}
                      </span>
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center gap-2">
                    <Button
                      type="button"
                      size="sm"
                      disabled={busy}
                      onClick={() => handleRestore(item)}
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                      {busy ? "Restoring..." : "Restore"}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      onClick={() => handleDeleteForever(item)}
                      className="text-rose-600 hover:bg-rose-50 hover:text-rose-700"
                    >
                      Delete Forever
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
