import { cookies } from "next/headers";
import type { BranchRow, SessionContext } from "@/types/database";

export const ACTIVE_BRANCH_COOKIE = "nexus_active_branch";
export const ALL_BRANCHES = "all";

export interface BranchScope {
  /** Branches this person may work in. */
  allowed: BranchRow[];
  /** A branch id, or "all" for every allowed branch. */
  activeId: string;
  /** Branch ids used to filter data. Never contains a branch the person cannot access. */
  ids: string[];
  /** Allowed branches with the active one first, so screens default to it. */
  ordered: BranchRow[];
}

export function allowedBranches(ctx: SessionContext): BranchRow[] {
  return ctx.branches.filter((b) => ctx.assignedBranchIds.includes(b.id));
}

export async function getBranchScope(ctx: SessionContext): Promise<BranchScope> {
  const allowed = allowedBranches(ctx);
  const store = await cookies();
  const [tenantId, saved] = (store.get(ACTIVE_BRANCH_COOKIE)?.value ?? "").split(":");
  const remembered = tenantId === ctx.tenant?.id ? saved : undefined;
  const match = allowed.find((b) => b.id === remembered);

  if (match) {
    return {
      allowed,
      activeId: match.id,
      ids: [match.id],
      ordered: [match, ...allowed.filter((b) => b.id !== match.id)],
    };
  }
  if (allowed.length === 1) {
    return { allowed, activeId: allowed[0]!.id, ids: [allowed[0]!.id], ordered: allowed };
  }
  return { allowed, activeId: ALL_BRANCHES, ids: allowed.map((b) => b.id), ordered: allowed };
}
