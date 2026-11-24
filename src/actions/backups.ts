"use server";

import { revalidatePath } from "next/cache";
import { runBackupCycle } from "@/lib/backups/scheduler";
import { getServerSessionContext } from "@/lib/auth/session";

/** Starts a backup immediately. Unchanged businesses are still skipped. */
export async function runBackupNowAction() {
  const ctx = await getServerSessionContext();
  if (!ctx?.user.is_platform_admin || ctx.impersonation) {
    throw new Error("Platform Super Admin access required.");
  }
  const result = await runBackupCycle({ force: true });
  revalidatePath("/platform/infrastructure");
  return {
    ran: result.ran,
    saved: result.saved ?? 0,
    unchanged: result.unchanged ?? 0,
    failed: result.failed?.length ?? 0,
  };
}
