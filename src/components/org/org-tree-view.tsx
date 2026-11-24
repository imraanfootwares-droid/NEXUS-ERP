"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Building2,
  ChevronsDownUp,
  ChevronsUpDown,
  Factory,
  Network,
  Store,
  UserRound,
  Warehouse,
} from "lucide-react";
import "./org-tree-light.css";
import {
  ACTION_COLOR,
  CARD_H,
  CARD_W,
  cardSubtitle,
  FLOW_COLOR,
  FLOW_WORD,
  accentOf,
  allParents,
  countBits,
  countNodes,
  edgesOfRoute,
  findNode,
  firstVisible,
  groupFlows,
  hasKids,
  hasProblem,
  initialOpen,
  layoutTree,
  routeBetween,
  searchTree,
  timeAgo,
  topAction,
  visibleKids,
  type ActivityItem,
  type OrgFlow,
  type OrgNode,
} from "./org-tree-layout";

const LIST_ABOVE = 300;

export type OrgTreeViewProps = {
  root: OrgNode;
  flows: OrgFlow[];
  activity?: ActivityItem[] | null;
  onSelect: (node: OrgNode) => void;
  selectedId?: string | null;
  toolbarExtra?: React.ReactNode;
  emptyRequests?: string;
  resetKey?: string;
  startOpen?: boolean;
  compact?: boolean;
};

function NodeIcon({ node }: { node: OrgNode }) {
  if (node.kind === "root") return <Network aria-hidden="true" />;
  if (node.kind === "tenant") return <Building2 aria-hidden="true" />;
  if (node.kind === "person") return <UserRound aria-hidden="true" />;
  if (node.branchType === "factory") return <Factory aria-hidden="true" />;
  if (node.branchType === "warehouse") return <Warehouse aria-hidden="true" />;
  return <Store aria-hidden="true" />;
}

export function OrgTreeView(props: OrgTreeViewProps) {
  const { root, flows, onSelect, selectedId } = props;
  const startSet = useCallback(
    () => (props.startOpen ? new Set(allParents(root)) : initialOpen(root)),
    [props.startOpen, root]
  );
  const [open, setOpen] = useState<Set<string>>(startSet);
  const [term, setTerm] = useState("");
  const [problemsOnly, setProblemsOnly] = useState(false);
  const [view, setView] = useState<"auto" | "tree" | "list">("auto");
  const [showFlows, setShowFlows] = useState(true);
  const [narrow, setNarrow] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 20, y: 20 });
  const [focusId, setFocusId] = useState<string | null>(null);
  const [focusFlow, setFocusFlow] = useState<string | null>(null);
  const [panelTab, setPanelTab] = useState<"requests" | "activity">("requests");
  const viewport = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; px: number; py: number } | null>(null);
  const [panning, setPanning] = useState(false);

  const lastRoot = useRef(props.resetKey);
  useEffect(() => {
    if (lastRoot.current !== props.resetKey) {
      lastRoot.current = props.resetKey;
      setOpen(startSet());
      fitted.current = false;
    }
  }, [props.resetKey, startSet]);

  useEffect(() => {
    const q = window.matchMedia("(max-width: 767px)");
    const sync = () => setNarrow(q.matches);
    sync();
    q.addEventListener("change", sync);
    return () => q.removeEventListener("change", sync);
  }, []);

  const toggle = (node: OrgNode) => {
    const wasOpen = open.has(node.id);
    setOpen((prev) => {
      const next = new Set(prev);
      if (wasOpen) next.delete(node.id);
      else next.add(node.id);
      return next;
    });
  };

  const expandAll = () => {
    setOpen(new Set(allParents(root)));
    if (!narrow) setView("tree");
    fitted.current = false;
  };
  const collapseAll = () => setOpen(new Set(initialOpen(root)));

  const { matches, ancestors } = useMemo(() => searchTree(root, term), [root, term]);
  const effectiveOpen = useMemo(() => new Set([...open, ...ancestors]), [open, ancestors]);
  const keep = useCallback((n: OrgNode) => !problemsOnly || hasProblem(n), [problemsOnly]);
  const layout = useMemo(() => layoutTree(root, effectiveOpen, keep), [root, effectiveOpen, keep]);
  const total = countNodes(root, effectiveOpen);
  const everythingOpen = allParents(root).every((id) => effectiveOpen.has(id));
  const listMode = narrow || view === "list" || (view === "auto" && total > LIST_ABOVE);

  const byId = useMemo(() => new Map(layout.placed.map((p) => [p.node.id, p])), [layout.placed]);
  const visible = useMemo(() => new Set(byId.keys()), [byId]);
  const parentOf = useMemo(
    () => new Map(layout.placed.map((p) => [p.node.id, p.parentId])),
    [layout.placed]
  );
  const flowGroups = useMemo(() => groupFlows(flows, visible), [flows, visible]);

  const fitted = useRef(false);
  const wrap = useRef<HTMLDivElement>(null);
  const [full, setFull] = useState(false);

  useEffect(() => {
    const sync = () => {
      if (!document.fullscreenElement && full && wrap.current?.dataset.native === "1") {
        delete wrap.current.dataset.native;
        setFull(false);
      }
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape" && full && !document.fullscreenElement) setFull(false);
    };
    document.addEventListener("fullscreenchange", sync);
    window.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("fullscreenchange", sync);
      window.removeEventListener("keydown", esc);
    };
  }, [full]);

  const toggleFull = useCallback(() => {
    const el = wrap.current;
    if (!el) return;
    if (full) {
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
      delete el.dataset.native;
      setFull(false);
      return;
    }
    setFull(true);
    if (typeof el.requestFullscreen === "function") {
      el.requestFullscreen().then(
        () => {
          el.dataset.native = "1";
        },
        () => undefined
      );
    }
  }, [full]);

  const fit = useCallback(() => {
    const el = viewport.current;
    if (!el || !layout.width) return;
    const z = Math.min(
      1,
      Math.max(
        0.3,
        Math.min((el.clientWidth - 40) / layout.width, (el.clientHeight - 40) / (layout.height + 30))
      )
    );
    setZoom(z);
    setPan({ x: Math.max(20, (el.clientWidth - layout.width * z) / 2), y: 20 });
  }, [layout.width, layout.height]);

  useEffect(() => {
    if (!listMode && !fitted.current && layout.width) {
      fitted.current = true;
      requestAnimationFrame(fit);
    }
  }, [listMode, layout.width, fit]);

  useEffect(() => {
    if (!fitted.current) return;
    const t = window.setTimeout(() => requestAnimationFrame(fit), 120);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [full]);

  const centerOn = useCallback(
    (id: string) => {
      const p = byId.get(id);
      const el = viewport.current;
      if (!p || !el) return;
      const z = Math.max(zoom, 0.7);
      setZoom(z);
      setPan({
        x: el.clientWidth / 2 - (p.x + CARD_W / 2) * z,
        y: el.clientHeight / 2 - (p.y + CARD_H / 2) * z,
      });
    },
    [byId, zoom]
  );

  const onWheel = (e: React.WheelEvent) => {
    if (!viewport.current) return;
    const rect = viewport.current.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const next = Math.min(1.8, Math.max(0.25, zoom * (e.deltaY < 0 ? 1.1 : 0.9)));
    setPan({ x: mx - ((mx - pan.x) * next) / zoom, y: my - ((my - pan.y) * next) / zoom });
    setZoom(next);
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest("button")) return;
    drag.current = { x: e.clientX, y: e.clientY, px: pan.x, py: pan.y };
    setPanning(true);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    setPan({ x: d.px + e.clientX - d.x, y: d.py + e.clientY - d.y });
  };

  const endDrag = () => {
    drag.current = null;
    setPanning(false);
  };

  const zoomBy = (f: number) => setZoom((z) => Math.min(1.8, Math.max(0.25, z * f)));

  const [centerWanted, setCenterWanted] = useState<string | null>(null);
  const reveal = useCallback(
    (path: string[]) => {
      const target = path.find((id) => findNode(root, id));
      if (!target) return;
      const chain: string[] = [];
      const walk = (n: OrgNode, trail: string[]): boolean => {
        if (n.id === target) {
          chain.push(...trail);
          return true;
        }
        return n.children.some((k) => walk(k, [...trail, n.id]));
      };
      walk(root, []);
      setOpen((prev) => new Set([...prev, ...chain]));
      setProblemsOnly(false);
      setFocusId(target);
      setCenterWanted(target);
    },
    [root]
  );

  useEffect(() => {
    if (centerWanted && byId.has(centerWanted)) {
      centerOn(centerWanted);
      setCenterWanted(null);
    }
  }, [centerWanted, byId, centerOn]);

  useEffect(() => {
    if (!focusId) return;
    const t = window.setTimeout(() => setFocusId(null), 4000);
    return () => window.clearTimeout(t);
  }, [focusId]);

  const edgeD = (parentId: string, childId: string): string => {
    const parent = byId.get(parentId);
    const child = byId.get(childId);
    if (!parent || !child) return "";
    const x1 = parent.x + CARD_W / 2;
    const y1 = parent.y + CARD_H + 11;
    const x2 = child.x + CARD_W / 2;
    const y2 = child.y;
    const my = (y1 + y2) / 2;
    return `M${x1},${y1} C${x1},${my} ${x2},${my} ${x2},${y2}`;
  };

  type LitEdge = {
    key: string;
    d: string;
    up: boolean;
    down: boolean;
    kinds: string[];
    items: OrgFlow[];
  };

  const litEdges: LitEdge[] = (() => {
    if (!showFlows || listMode) return [];
    const map = new Map<string, LitEdge>();
    for (const g of flowGroups) {
      if (g.from === g.to) continue;
      for (const e of edgesOfRoute(routeBetween(g.from, g.to, parentOf), parentOf)) {
        const key = `${e.parent}>${e.child}`;
        const lit = map.get(key) ?? {
          key,
          d: edgeD(e.parent, e.child),
          up: false,
          down: false,
          kinds: [],
          items: [],
        };
        if (e.up) lit.up = true;
        else lit.down = true;
        lit.kinds.push(...g.items.map((i) => i.kind));
        lit.items.push(...g.items);
        map.set(key, lit);
      }
    }
    return [...map.values()].filter((l) => l.d);
  })();

  const nodeName = (path: string[]): string => {
    const id = firstVisible(path, visible) ?? path[0];
    return (id && (byId.get(id)?.node.label ?? findNode(root, id)?.label)) || "—";
  };

  const sortedFlows = useMemo(
    () => [...flows].sort((a, b) => (b.at ?? "").localeCompare(a.at ?? "")),
    [flows]
  );

  return (
    <div
      ref={wrap}
      className={`ot-root ot-wrap${props.compact ? " ot-wrap--compact" : ""}${full ? " ot-wrap--full" : ""}`}
    >
      <div className="ot-toolbar">
        <input
          type="search"
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          placeholder="Find a branch or a person…"
          aria-label="Find a branch or a person"
        />
        {props.toolbarExtra}
        <div className="ot-seg" role="group" aria-label="Show">
          <button type="button" aria-pressed={!problemsOnly} onClick={() => setProblemsOnly(false)}>
            All
          </button>
          <button type="button" aria-pressed={problemsOnly} onClick={() => setProblemsOnly(true)}>
            Needs attention
          </button>
        </div>
        <span className="ot-toolbar-spacer" />
        <button type="button" className="ot-btn" onClick={everythingOpen ? collapseAll : expandAll}>
          {everythingOpen ? <ChevronsDownUp size={13} /> : <ChevronsUpDown size={13} />}
          {everythingOpen ? "Hide people" : "Show everyone"}
        </button>
        {!narrow ? (
          <div className="ot-seg" role="group" aria-label="View">
            <button type="button" aria-pressed={!listMode} onClick={() => setView("tree")}>
              Tree
            </button>
            <button type="button" aria-pressed={listMode} onClick={() => setView("list")}>
              List
            </button>
          </div>
        ) : null}
      </div>

      <div className="ot-legend">
        <span><i style={{ background: "#7c5cdb" }} />Business</span>
        <span><i style={{ background: "#16a34a" }} />Retail shop</span>
        <span><i style={{ background: "#ea7a12" }} />Factory</span>
        <span><i style={{ background: "#2f7fe0" }} />Warehouse</span>
        <span><i style={{ background: "#6f6f76" }} />Person</span>
        <span><i style={{ background: "#f59e0b" }} />Needs attention</span>
        {flows.length > 0 ? (
          <span>
            <b className="ot-legend-line" style={{ borderTopColor: ACTION_COLOR.change }} />
            Open request
          </span>
        ) : null}
        {term && matches.size === 0 ? <span>No matches found.</span> : null}
      </div>

      <div className={`ot-shell${props.activity === undefined ? " ot-shell--solo" : ""}`}>
        <div className="ot-main">
          {listMode ? (
            <ul className="ot-list" aria-label="Organisation">
              <ListNode
                node={root}
                open={effectiveOpen}
                keep={keep}
                matches={matches}
                focusId={focusId}
                flowsAt={(id) => flows.filter((f) => f.fromPath[0] === id || f.toPath[0] === id)}
                onToggle={toggle}
                onOpen={onSelect}
              />
            </ul>
          ) : (
            <div
              ref={viewport}
              className={`ot-viewport${panning ? " is-panning" : ""}`}
              onWheel={onWheel}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={endDrag}
              onPointerCancel={endDrag}
            >
              <div
                className="ot-canvas"
                style={{
                  transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                  width: layout.width,
                  height: layout.height + 30,
                }}
              >
                <svg
                  className="ot-links"
                  width={layout.width}
                  height={layout.height + 30}
                  aria-hidden="true"
                >
                  {layout.placed.map((p) => {
                    const parent = p.parentId ? byId.get(p.parentId) : null;
                    if (!parent) return null;
                    const x1 = parent.x + CARD_W / 2;
                    const y1 = parent.y + CARD_H + 11;
                    const x2 = p.x + CARD_W / 2;
                    const y2 = p.y;
                    const my = (y1 + y2) / 2;
                    return (
                      <path
                        key={p.node.id}
                        d={`M${x1},${y1} C${x1},${my} ${x2},${my} ${x2},${y2}`}
                      />
                    );
                  })}
                </svg>

                <svg className="ot-flows" width={layout.width} height={layout.height + 30}>
                  {litEdges.map((l) => {
                    const action = topAction(l.kinds);
                    const focused = focusFlow
                      ? l.items.some((it) => it.id === focusFlow)
                      : false;
                    const dim = Boolean(focusFlow) && !focused;
                    return (
                      <g
                        key={l.key}
                        className={`ot-lit${focused ? " is-focused" : ""}${dim ? " is-dim" : ""}`}
                        style={{ ["--flow" as string]: ACTION_COLOR[action] }}
                      >
                        <path
                          className={`ot-lit-line ${l.up && !l.down ? "is-up" : "is-down"}`}
                          d={l.d}
                        />
                        <path className="ot-flow-hit" d={l.d}>
                          <title>
                            {`${l.items.length} ${l.items.length === 1 ? "request" : "requests"} on this line: ${l.items
                              .slice(0, 4)
                              .map((it) => `${FLOW_WORD[it.kind] ?? it.kind} (${it.targetName})`)
                              .join(", ")}`}
                          </title>
                        </path>
                      </g>
                    );
                  })}
                </svg>

                {layout.placed.map((p) => {
                  const n = p.node;
                  const startsHere = flowGroups
                    .filter((g) => g.from === n.id)
                    .reduce((s, g) => s + g.items.length, 0);
                  const endsHere = flowGroups
                    .filter((g) => g.to === n.id)
                    .reduce((s, g) => s + g.items.length, 0);
                  return (
                    <React.Fragment key={n.id}>
                      <button
                        type="button"
                        title={n.warnings.length ? n.warnings.join(", ") : `Open ${n.label}`}
                        className={`ot-card ot-card--${n.kind}${matches.has(n.id) ? " is-match" : ""}${focusId === n.id ? " is-focus" : ""}${selectedId === n.id ? " is-selected" : ""}${n.isActive === false ? " is-off" : ""}`}
                        style={{
                          left: p.x,
                          top: p.y,
                          ["--ot-accent" as string]: accentOf(n),
                        }}
                        onClick={() => onSelect(n)}
                      >
                        <span className="ot-card-icon">
                          <NodeIcon node={n} />
                        </span>
                        <span className="ot-card-body">
                          <span className="ot-card-title">{n.label}</span>
                          <span className="ot-card-kind">{cardSubtitle(n)}</span>
                          <span className="ot-card-counts">
                            {countBits(n).map(([label, v]) => (
                              <span key={`${label}-${v}`}>
                                <b>{v}</b> {label}
                              </span>
                            ))}
                          </span>
                        </span>
                        {n.warnings.length ? (
                          <span className="ot-warn" role="img" aria-label={`${n.warnings.length} need attention`} />
                        ) : null}
                      </button>

                      {showFlows && (startsHere || endsHere) ? (
                        <span
                          className="ot-flow-badge"
                          style={{ left: p.x + 12, top: p.y - 9 }}
                          aria-hidden="true"
                        >
                          {endsHere ? `${endsHere} waiting` : `${startsHere} sent`}
                        </span>
                      ) : null}

                      {p.hasKids ? (
                        <button
                          type="button"
                          className="ot-toggle"
                          style={{ left: p.x + CARD_W / 2 - 11, top: p.y + CARD_H - 11 }}
                          onClick={() => toggle(n)}
                          aria-expanded={effectiveOpen.has(n.id)}
                          aria-label={`${effectiveOpen.has(n.id) ? "Hide" : "Show"} what's inside ${n.label}`}
                        >
                          {effectiveOpen.has(n.id) ? "−" : "+"}
                        </button>
                      ) : null}
                    </React.Fragment>
                  );
                })}
              </div>

              <div className="ot-zoom">
                <button type="button" onClick={() => zoomBy(1.2)} aria-label="Zoom in">
                  +
                </button>
                <button type="button" onClick={() => zoomBy(1 / 1.2)} aria-label="Zoom out">
                  −
                </button>
                <button type="button" onClick={fit} aria-label="Fit to screen" title="Fit to screen">
                  ⤢
                </button>
                <button
                  type="button"
                  onClick={toggleFull}
                  aria-label={full ? "Exit full screen" : "Full screen"}
                  aria-pressed={full}
                  title={full ? "Exit full screen (Esc)" : "Full screen"}
                  className="ot-full-btn"
                >
                  {full ? (
                    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
                      <path
                        d="M6 1v5H1M10 1v5h5M6 15v-5H1M10 15v-5h5"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.6"
                      />
                    </svg>
                  ) : (
                    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
                      <path
                        d="M1 6V1h5M15 6V1h-5M1 10v5h5M15 10v5h-5"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.6"
                      />
                    </svg>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>

        {props.activity !== undefined ? (
          <aside className="ot-side" aria-label="Requests and activity">
            <div className="ot-seg ot-side-tabs" role="tablist">
              <button
                type="button"
                role="tab"
                aria-selected={panelTab === "requests"}
                onClick={() => setPanelTab("requests")}
              >
                Requests <b>{flows.length}</b>
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={panelTab === "activity"}
                onClick={() => setPanelTab("activity")}
              >
                Activity
              </button>
            </div>

            {panelTab === "requests" ? (
              sortedFlows.length === 0 ? (
                <p className="dr-hint ot-side-empty">
                  {props.emptyRequests ?? "Nothing is waiting. All clear."}
                </p>
              ) : (
                <ul className="ot-feed">
                  {sortedFlows.slice(0, 80).map((f) => (
                    <li key={f.id}>
                      <button
                        type="button"
                        className={focusFlow === f.id ? "is-on" : ""}
                        onClick={() => {
                          setFocusFlow((cur) => (cur === f.id ? null : f.id));
                          setShowFlows(true);
                          reveal(f.direction === "up" ? f.fromPath : f.toPath);
                        }}
                      >
                        <span
                          className="ot-dot"
                          style={{ background: FLOW_COLOR[f.kind] ?? "#9d8cff" }}
                        />
                        <span className="ot-feed-body">
                          <strong>{FLOW_WORD[f.kind] ?? f.kind}</strong>
                          <span>
                            {f.targetName} {f.direction === "up" ? "→" : "←"}{" "}
                            {nodeName(
                              f.toPath[0] === "root" || f.direction === "up" ? f.toPath : f.fromPath
                            )}
                          </span>
                          {f.label ? <small>{f.label}</small> : null}
                          {f.at ? <small>{timeAgo(f.at)}</small> : null}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )
            ) : props.activity === null ? (
              <p className="dr-hint ot-side-empty" role="status">
                Loading activity...
              </p>
            ) : props.activity.length === 0 ? (
              <p className="dr-hint ot-side-empty">Nothing has happened yet.</p>
            ) : (
              <ul className="ot-feed" aria-live="polite">
                {props.activity.map((a) => (
                  <li key={a.id}>
                    <button type="button" onClick={() => reveal(a.nodePath)}>
                      <span className={`ot-dot ot-dot--${a.tone}`} />
                      <span className="ot-feed-body">
                        <span>
                          <strong>{a.who}</strong> {a.text}
                        </span>
                        <small>{timeAgo(a.at)}</small>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </aside>
        ) : null}
      </div>

    </div>
  );
}

function ListNode(props: {
  node: OrgNode;
  open: Set<string>;
  keep: (n: OrgNode) => boolean;
  matches: Set<string>;
  focusId: string | null;
  flowsAt: (id: string) => OrgFlow[];
  onToggle: (n: OrgNode) => void;
  onOpen: (n: OrgNode) => void;
}) {
  const { node: n, open } = props;
  const kids = visibleKids(n, open).filter(props.keep);
  const reqs = props.flowsAt(n.id);
  return (
    <li>
      <div className={`ot-row${props.focusId === n.id ? " is-focus" : ""}`}>
        {hasKids(n) ? (
          <button
            type="button"
            className="ot-toggle"
            style={{ position: "static" }}
            onClick={() => props.onToggle(n)}
            aria-expanded={open.has(n.id)}
            aria-label={`${open.has(n.id) ? "Hide" : "Show"} what's inside ${n.label}`}
          >
            {open.has(n.id) ? "−" : "+"}
          </button>
        ) : (
          <span />
        )}
        <button
          type="button"
          className="ot-row-main"
          style={{
            ["--ot-accent" as string]: accentOf(n),
            outline: props.matches.has(n.id) ? "2px solid #e8c14b" : undefined,
          }}
          onClick={() => props.onOpen(n)}
        >
          <strong>
            {n.label}{" "}
            {n.warnings.length ? (
              <span style={{ color: "#e8a54b" }}>⚠ {n.warnings.length}</span>
            ) : null}
            {reqs.length ? <span className="ot-row-req"> {reqs.length} open</span> : null}
          </strong>
          <small>
            {[cardSubtitle(n), ...countBits(n).map(([l, v]) => `${v} ${l}`.trim())].join(" · ")}
          </small>
        </button>
        <button type="button" className="ot-btn ot-row-open" onClick={() => props.onOpen(n)}>
          Edit
        </button>
      </div>
      {kids.length ? (
        <ul className="ot-list">
          {kids.map((k) => (
            <ListNode key={k.id} {...props} node={k} />
          ))}
        </ul>
      ) : null}
    </li>
  );
}
