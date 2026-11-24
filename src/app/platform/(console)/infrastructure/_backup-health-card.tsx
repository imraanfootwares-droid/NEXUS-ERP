"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { runBackupNowAction } from "@/actions/backups";
import { Button } from "@/components/ui/primitives";
import { StatusPill } from "@/components/ui/spark";
import type { BackupHealth } from "@/lib/backups/scheduler";

const when = (iso?: string) =>
  iso ? new Date(iso).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" }) : "Not yet";

export function BackupHealthCard({ health, intervalHours }: { health: BackupHealth | null; intervalHours: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const failed = health?.failed?.length ?? 0;
  const hasError = failed > 0 || Boolean(health?.platform_error);

  const run = async () => {
    setBusy(true);
    try {
      const r = await runBackupNowAction();
      if (!r.ran) toast.info("A backup is already running.");
      else if (r.failed > 0) toast.error(`${r.failed} backup${r.failed === 1 ? "" : "s"} failed. It will retry automatically.`);
      else toast.success(`Backup complete: ${r.saved} saved, ${r.unchanged} unchanged.`);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Backup failed.");
    } finally {
      setBusy(false);
    }
  };

  const tile = (label: string, value: React.ReactNode) => (
    <div className="rounded-lg bg-[#f7f7f8] px-3 py-2">
      <p className="ui-eyebrow">{label}</p>
      <p className="mt-0.5 text-[13px] font-medium text-[#171717]" suppressHydrationWarning>{value}</p>
    </div>
  );

  return (
    <section className="ui-tray">
      <header className="flex flex-wrap items-center justify-between gap-2 px-3 py-1.5">
        <span className="flex items-center gap-2">
          <span className="ui-eyebrow">Automatic Backups</span>
          <StatusPill tone={hasError ? "danger" : health?.last_completed_at ? "success" : "warning"}>
            {hasError ? "Needs attention" : health?.last_completed_at ? "Healthy" : "Waiting for first run"}
          </StatusPill>
        </span>
        <Button size="sm" variant="outline" disabled={busy} onClick={run}>
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          {busy ? "Backing up..." : "Back Up Now"}
        </Button>
      </header>
      <div className="ui-surface grid grid-cols-2 gap-2 p-2.5 lg:grid-cols-4">
        {tile("Last Complete", when(health?.last_completed_at))}
        {tile("Runs Every", `${intervalHours} hours`)}
        {tile("Saved / Unchanged", `${health?.saved ?? 0} / ${health?.unchanged ?? 0}`)}
        {tile("Free Storage Used", `${((health?.storage_bytes ?? 0) / 1024 / 1024).toFixed(1)} MB of 10 GB`)}
      </div>
      {(health?.storage_bytes ?? 0) > 7 * 1024 ** 3 ? (
        <p role="alert" className="px-3 py-2 text-xs font-medium text-amber-700">
          Backup storage is above 7 GB. Download a copy and review old backups before the free 10 GB limit.
        </p>
      ) : null}
      {hasError ? (
        <p role="alert" className="px-3 py-2 text-xs font-medium text-rose-700">
          {failed > 0 ? `${failed} business backup${failed === 1 ? "" : "s"} failed. ` : "Platform backup failed. "}
          It will retry automatically within an hour.
        </p>
      ) : null}
    </section>
  );
}
