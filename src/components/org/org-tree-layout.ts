/** Pure helpers for the organisation tree: layout, search, filters (ported from MEELII). */

export type OrgCounts = {
  branches: number;
  retail: number;
  factory: number;
  warehouse: number;
  people: number;
  admins: number;
  workers: number;
  pendingResets: number;
};

export type OrgNodeKind = "root" | "tenant" | "branch" | "person";

export type OrgNode = {
  id: string;
  kind: OrgNodeKind;
  label: string;
  sublabel?: string;
  branchType?: "retail" | "factory" | "warehouse";
  role?: "owner" | "branch_admin" | "worker";
  tenantId?: string;
  branchId?: string;
  personId?: string;
  isActive?: boolean;
  isDefault?: boolean;
  meta?: {
    code?: string;
    stateCode?: string;
    gstin?: string | null;
    email?: string | null;
    username?: string | null;
    tier?: string;
    status?: string;
  };
  counts: OrgCounts;
  warnings: string[];
  managers: Array<{ id: string; name: string; role: string }>;
  children: OrgNode[];
};

export const CARD_W = 220;
export const CARD_H = 76;
const GAP_X = 24;
const GAP_Y = 62;

export type Placed = {
  node: OrgNode;
  x: number;
  y: number;
  depth: number;
  parentId: string | null;
  hasKids: boolean;
  open: boolean;
};

export function visibleKids(node: OrgNode, open: Set<string>): OrgNode[] {
  if (!open.has(node.id)) return [];
  return node.children;
}

export const hasKids = (node: OrgNode): boolean => node.children.length > 0;

/** Simple tidy top-down layout: parents centred over their children. */
export function layoutTree(
  root: OrgNode,
  open: Set<string>,
  keep: (n: OrgNode) => boolean = () => true
): {
  placed: Placed[];
  width: number;
  height: number;
} {
  const placed: Placed[] = [];
  let cursor = 0;
  let maxDepth = 0;
  const walk = (node: OrgNode, depth: number, parentId: string | null): number => {
    maxDepth = Math.max(maxDepth, depth);
    const kids = visibleKids(node, open).filter(keep);
    let x: number;
    if (kids.length === 0) {
      x = cursor;
      cursor += CARD_W + GAP_X;
    } else {
      const xs = kids.map((k) => walk(k, depth + 1, node.id));
      x = (xs[0]! + xs[xs.length - 1]!) / 2;
    }
    placed.push({
      node,
      x,
      y: depth * (CARD_H + GAP_Y),
      depth,
      parentId,
      hasKids: hasKids(node),
      open: open.has(node.id),
    });
    return x;
  };
  walk(root, 0, null);
  return {
    placed,
    width: Math.max(cursor - GAP_X, CARD_W),
    height: (maxDepth + 1) * (CARD_H + GAP_Y) - GAP_Y,
  };
}

export function hasProblem(node: OrgNode): boolean {
  if (node.warnings.length) return true;
  return node.children.some((k) => hasProblem(k));
}

export function searchTree(
  root: OrgNode,
  term: string
): { matches: Set<string>; ancestors: Set<string> } {
  const matches = new Set<string>();
  const ancestors = new Set<string>();
  const q = term.trim().toLowerCase();
  if (!q) return { matches, ancestors };
  const walk = (node: OrgNode, trail: string[]): void => {
    const hay = [
      node.label,
      node.sublabel ?? "",
      node.meta?.code ?? "",
      node.meta?.username ?? "",
      node.meta?.email ?? "",
      ...node.managers.map((m) => m.name),
    ]
      .join(" ")
      .toLowerCase();
    if (hay.includes(q)) {
      matches.add(node.id);
      trail.forEach((t) => ancestors.add(t));
    }
    node.children.forEach((k) => walk(k, [...trail, node.id]));
  };
  walk(root, []);
  return { matches, ancestors };
}

export function initialOpen(root: OrgNode): Set<string> {
  const open = new Set<string>();
  const walk = (n: OrgNode): void => {
    if (n.kind === "branch" || n.kind === "person") return;
    if (n.children.length) open.add(n.id);
    n.children.forEach(walk);
  };
  walk(root);
  return open;
}

export function countNodes(root: OrgNode, open: Set<string>): number {
  return 1 + visibleKids(root, open).reduce((n, k) => n + countNodes(k, open), 0);
}

export const KIND_LABEL: Record<OrgNodeKind, string> = {
  root: "Platform",
  tenant: "Business",
  branch: "Branch",
  person: "Person",
};

export function accentOf(n: OrgNode): string {
  if (n.kind === "branch") {
    if (n.branchType === "factory") return "#ea7a12";
    if (n.branchType === "warehouse") return "#2f7fe0";
    return "#16a34a";
  }
  if (n.kind === "person") {
    if (n.role === "owner") return "#171717";
    if (n.role === "branch_admin") return "#7c5cdb";
    return "#6f6f76";
  }
  if (n.kind === "tenant") return "#7c5cdb";
  return "#171717";
}

const BRANCH_WORD = { retail: "Retail shop", factory: "Factory", warehouse: "Warehouse" } as const;
const ROLE_WORD = { owner: "Owner", branch_admin: "Branch admin", worker: "Staff" } as const;

/** One plain-language line under the card title. */
export function cardSubtitle(n: OrgNode): string {
  if (n.kind === "root") return "Control centre";
  if (n.kind === "tenant") return `Business · ${(n.meta?.tier ?? "").replace("tier_", "Tier ")}`;
  if (n.kind === "branch") {
    return `${BRANCH_WORD[n.branchType ?? "retail"]}${n.meta?.code ? ` · ${n.meta.code}` : ""}`;
  }
  const tier = n.meta?.tier ? ` · ${n.meta.tier.replace("tier_", "Tier ")}` : "";
  return `${ROLE_WORD[n.role ?? "worker"]}${tier}`;
}

export function countBits(n: OrgNode): Array<[string, number | string]> {
  const c = n.counts;
  const bits: Array<[string, number | string]> = [];
  if (n.kind === "root" || n.kind === "tenant") {
    bits.push([c.branches === 1 ? "branch" : "branches", c.branches]);
    bits.push([c.people === 1 ? "person" : "people", c.people]);
  } else if (n.kind === "branch") {
    bits.push([c.people === 1 ? "person" : "people", c.people]);
  } else if (n.kind === "person") {
    bits.push(["", n.isActive === false ? "Disabled" : "Active"]);
  }
  if (c.pendingResets > 0 && n.kind !== "person") bits.push([c.pendingResets === 1 ? "request" : "requests", c.pendingResets]);
  return bits;
}

/* ── Request flows ── */

export type OrgFlow = {
  id: string;
  kind: string;
  label: string;
  targetName: string;
  at: string | null;
  fromPath: string[];
  toPath: string[];
  direction: "up" | "down";
};

export type ActivityItem = {
  id: string;
  at: string;
  who: string;
  text: string;
  tone: "info" | "good" | "warn" | "bad";
  nodePath: string[];
};

export type FlowAction = "create" | "change" | "remove" | "company";

export const FLOW_ACTION: Record<string, FlowAction> = {
  new_branch: "create",
  password_reset: "change",
  profile_change: "change",
  suspend: "remove",
  notice: "company",
};

export const ACTION_COLOR: Record<FlowAction, string> = {
  create: "#3fb27f",
  change: "#e8a54b",
  remove: "#e5484d",
  company: "#4b8bf5",
};

export const ACTION_WORD: Record<FlowAction, string> = {
  create: "New branch",
  change: "Password reset",
  remove: "Suspended / disabled",
  company: "From Platform",
};

const ACTION_RANK: FlowAction[] = ["remove", "change", "create", "company"];
export const actionOf = (kind: string): FlowAction => FLOW_ACTION[kind] ?? "change";
export const topAction = (kinds: string[]): FlowAction =>
  ACTION_RANK.find((a) => kinds.some((k) => actionOf(k) === a)) ?? "change";

export const FLOW_COLOR: Record<string, string> = Object.fromEntries(
  Object.entries(FLOW_ACTION).map(([k, a]) => [k, ACTION_COLOR[a]])
);

export const FLOW_WORD: Record<string, string> = {
  new_branch: "New branch",
  password_reset: "Password reset",
  profile_change: "Profile change",
  suspend: "Account disabled",
  notice: "Platform notice",
};

export const firstVisible = (path: string[], visible: Set<string>): string | null =>
  path.find((id) => visible.has(id)) ?? null;

export function routeBetween(
  a: string,
  b: string,
  parentOf: Map<string, string | null>
): string[] {
  const chain = (id: string): string[] => {
    const out = [id];
    let cur = parentOf.get(id) ?? null;
    while (cur) {
      out.push(cur);
      cur = parentOf.get(cur) ?? null;
    }
    return out;
  };
  const up = chain(a);
  const down = chain(b);
  const common = up.find((id) => down.includes(id));
  if (!common) return [a, b];
  return [
    ...up.slice(0, up.indexOf(common) + 1),
    ...down.slice(0, down.indexOf(common)).reverse(),
  ];
}

export function groupFlows(
  flows: OrgFlow[],
  visible: Set<string>
): Array<{ key: string; from: string; to: string; direction: "up" | "down"; items: OrgFlow[] }> {
  const groups = new Map<
    string,
    { key: string; from: string; to: string; direction: "up" | "down"; items: OrgFlow[] }
  >();
  for (const f of flows) {
    const from = firstVisible(f.fromPath, visible);
    const to = firstVisible(f.toPath, visible);
    if (!from || !to) continue;
    const key = `${from}|${to}|${f.direction}`;
    const g = groups.get(key) ?? { key, from, to, direction: f.direction, items: [] };
    g.items.push(f);
    groups.set(key, g);
  }
  return [...groups.values()];
}

export function findNode(root: OrgNode, id: string): OrgNode | null {
  if (root.id === id) return root;
  for (const k of root.children) {
    const hit = findNode(k, id);
    if (hit) return hit;
  }
  return null;
}

export function allParents(root: OrgNode): string[] {
  const ids: string[] = [];
  const walk = (n: OrgNode): void => {
    if (hasKids(n)) ids.push(n.id);
    n.children.forEach(walk);
  };
  walk(root);
  return ids;
}

export function timeAgo(iso: string, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  if (s < 172800) return "yesterday";
  return new Date(iso).toLocaleDateString();
}

export function edgesOfRoute(
  route: string[],
  parentOf: Map<string, string | null>
): Array<{ parent: string; child: string; up: boolean }> {
  const out: Array<{ parent: string; child: string; up: boolean }> = [];
  for (let i = 0; i < route.length - 1; i += 1) {
    const a = route[i]!;
    const b = route[i + 1]!;
    if (parentOf.get(a) === b) out.push({ parent: b, child: a, up: true });
    else if (parentOf.get(b) === a) out.push({ parent: a, child: b, up: false });
  }
  return out;
}
