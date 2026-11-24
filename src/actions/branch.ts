"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { ACTIVE_BRANCH_COOKIE, ALL_BRANCHES, allowedBranches } from "@/lib/auth/active-branch";
import { getServerSessionContext } from "@/lib/auth/session";

/** Switches the signed-in person's working branch. Only assigned branches are accepted. */
export async function setActiveBranchAction(branchId: string) {
  const ctx = await getServerSessionContext();
  if (!ctx?.tenant) throw new Error("Please sign in again.");
  const allowed = allowedBranches(ctx);
  const valid = branchId === ALL_BRANCHES ? allowed.length > 1 : allowed.some((b) => b.id === branchId);
  if (!valid) throw new Error("You do not have access to that branch.");

  const store = await cookies();
  store.set(ACTIVE_BRANCH_COOKIE, `${ctx.tenant.id}:${branchId}`, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  revalidatePath("/dashboard", "layout");
}
