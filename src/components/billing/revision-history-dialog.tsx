"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Clock, History, Loader2, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import {
  getRecentActivityHistoryAction,
  getRevisionHistoryAction,
  revertInvoiceToVersionAction,
  revertLedgerEntryToVersionAction,
  revertPurchaseOrderToVersionAction,
} from "@/actions/bill-revisions";
import { Badge, Button, Dialog } from "@/components/ui/primitives";
import type { RevisionEntityType, RevisionRow } from "@/lib/billing/revisions";

export function RevisionHistoryDialog({
  open,
  onClose,
  entityType,
  entityId,
  title,
  canRevert = true,
  mode = "entity",
}: {
  open: boolean;
  onClose: () => void;
  entityType: RevisionEntityType;
  entityId?: string | null;
  title: string;
  canRevert?: boolean;
  mode?: "entity" | "activity";
}) {
  const router = useRouter();
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const [rows, setRows] = useState<RevisionRow[]>([]);
  const [revertingId, setRevertingId] = useState<string | null>(null);
  const [reloadTick, setReloadTick] = useState(0);

  const requestKey = open ? `${mode}:${entityType}:${entityId ?? ""}:${reloadTick}` : null;
  const loading = Boolean(requestKey) && loadedKey !== requestKey;

  useEffect(() => {
    if (!requestKey) return;
    let active = true;
    const promise =
      mode === "activity"
        ? getRecentActivityHistoryAction(entityType)
        : entityId
        ? getRevisionHistoryAction(entityType, entityId)
        : Promise.resolve<RevisionRow[]>([]);
    promise
      .then((data) => {
        if (!active) return;
        setRows(data);
        setLoadedKey(requestKey);
      })
      .catch((err) => {
        if (!active) return;
        toast.error(err instanceof Error ? err.message : "Could not load edit history.");
        setLoadedKey(requestKey);
      });
    return () => {
      active = false;
    };
  }, [requestKey, mode, entityType, entityId]);

  const handleRevert = async (rev: RevisionRow) => {
    const label =
      entityType === "invoice"
        ? "bill"
        : entityType === "purchase"
        ? "purchase bill"
        : "ledger entry";
    if (
      !confirm(
        `Revert this ${label} to how it was BEFORE Version ${rev.version_no}?\n\nStock and account balances will be updated automatically, and this revert will also be saved in history.`
      )
    ) {
      return;
    }
    setRevertingId(rev.id);
    try {
      if (rev.entity_type === "invoice") {
        await revertInvoiceToVersionAction(rev.entity_id, rev.id);
      } else if (rev.entity_type === "purchase") {
        await revertPurchaseOrderToVersionAction(rev.entity_id, rev.id);
      } else {
        await revertLedgerEntryToVersionAction(rev.entity_id, rev.id);
      }
      toast.success(`Reverted ${label} back to before Version ${rev.version_no}!`);
      router.refresh();
      setReloadTick((t) => t + 1);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not revert this version.");
    } finally {
      setRevertingId(null);
    }
  };

  const actionVariant = (action: RevisionRow["action"]) => {
    if (action === "deleted" || action === "cancelled") return "danger" as const;
    if (action === "reverted") return "warning" as const;
    if (action === "edited") return "info" as const;
    return "success" as const;
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      subtitle={
        mode === "activity"
          ? "Recent edits, reverts, and deleted records."
          : "Every change made to this record is saved here. You can revert to any previous version in one click."
      }
      maxWidth="max-w-2xl"
    >
      <div className="space-y-3">
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-12 text-xs text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading edit history...
          </div>
        ) : rows.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 py-10 text-center">
            <History className="mx-auto h-7 w-7 text-slate-300" />
            <p className="mt-2 text-xs font-semibold text-slate-700">No changes recorded yet</p>
            <p className="mt-0.5 text-[11px] text-slate-500">
              Whenever you edit, revert, or delete this record, every change will appear here automatically.
            </p>
          </div>
        ) : (
          <div className="max-h-[62vh] space-y-3 overflow-y-auto pr-1">
            {rows.map((rev) => {
              const diffs = Array.isArray(rev.changes_json) ? rev.changes_json : [];
              const canRevertRow = canRevert && mode === "entity" && rev.action !== "deleted";
              return (
                <div
                  key={rev.id}
                  className="rounded-xl border border-slate-200 bg-white p-3.5 space-y-2.5 shadow-2xs"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="space-y-0.5">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="font-mono text-xs font-bold text-[#171717]">
                          v{rev.version_no}
                        </span>
                        {rev.entity_label && (
                          <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10.5px] font-semibold text-slate-700">
                            {rev.entity_label}
                          </span>
                        )}
                        <Badge variant={actionVariant(rev.action)}>{rev.action}</Badge>
                      </div>
                      <p className="flex items-center gap-1.5 text-[11px] text-slate-500">
                        <Clock className="h-3 w-3" />
                        <span>
                          {new Date(rev.created_at).toLocaleString("en-IN", {
                            timeZone: "Asia/Kolkata",
                            dateStyle: "medium",
                            timeStyle: "short",
                          })}
                        </span>
                        {rev.actor_name && (
                          <>
                            <span>·</span>
                            <span className="font-medium text-slate-700">by {rev.actor_name}</span>
                          </>
                        )}
                      </p>
                    </div>

                    {canRevertRow && (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={revertingId !== null}
                        onClick={() => handleRevert(rev)}
                      >
                        {revertingId === rev.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <RotateCcw className="h-3.5 w-3.5" />
                        )}
                        {revertingId === rev.id ? "Reverting..." : "Revert to Before v" + rev.version_no}
                      </Button>
                    )}
                  </div>

                  <p className="text-xs font-medium text-slate-800">{rev.summary}</p>

                  {diffs.length > 0 && (
                    <div className="overflow-hidden rounded-lg border border-slate-200/80 bg-slate-50/70">
                      <table className="w-full border-collapse text-left text-[11px]">
                        <thead>
                          <tr className="border-b border-slate-200 text-[10px] font-bold uppercase text-slate-500">
                            <th className="px-2.5 py-1.5">What Changed</th>
                            <th className="px-2.5 py-1.5">Before</th>
                            <th className="w-6 px-1 py-1.5 text-center" />
                            <th className="px-2.5 py-1.5">After</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200/70">
                          {diffs.map((d, i) => (
                            <tr key={i}>
                              <td className="px-2.5 py-1.5 font-semibold text-slate-800">{d.field}</td>
                              <td className="px-2.5 py-1.5 text-rose-700 line-through">{d.before}</td>
                              <td className="px-1 py-1.5 text-center text-slate-400">
                                <ArrowRight className="inline h-3 w-3" />
                              </td>
                              <td className="px-2.5 py-1.5 font-semibold text-emerald-700">{d.after}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <div className="flex justify-end pt-1">
          <Button type="button" variant="outline" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
