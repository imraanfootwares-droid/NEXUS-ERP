import { useEffect, type RefObject } from "react";

/**
 * Pointer-driven motion for the auth split layout (login / sign up).
 *
 * One delegated listener on the layout root drives everything, so pages keep
 * using plain `.as-btn` markup:
 *  - panel gradient focal point follows the cursor (--px / --py on the panel)
 *  - a soft page spotlight trails the cursor (--gx / --gy on the root)
 *  - `.as-btn` and `.auth-split__back` are magnetic (--mag-x / --mag-y)
 *  - the hovered button gets a cursor-following light (--bx / --by)
 *  - step cards tilt toward the cursor (--rx / --ry, --sx / --sy)
 *
 * All writes happen in one requestAnimationFrame loop that stops once every
 * spring has settled. Skipped entirely on touch / coarse pointers and when the
 * user prefers reduced motion (CSS keeps a slow ambient drift instead).
 */

const MAGNET_SELECTOR = ".as-btn, .auth-split__back";
const TILT_SELECTOR = ".auth-split__step";
const MAGNET_RADIUS = 70; // px beyond the element's edges
const MAGNET_MAX_X = 8;
const MAGNET_MAX_Y = 6;
const TILT_MAX = 6; // deg

const STIFFNESS = 0.16;
const DAMPING = 0.74;
const EPS = 0.01;

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

interface Spring {
  x: number;
  y: number;
  vx: number;
  vy: number;
  tx: number;
  ty: number;
}

function makeSpring(): Spring {
  return { x: 0, y: 0, vx: 0, vy: 0, tx: 0, ty: 0 };
}

function stepSpring(s: Spring): boolean {
  s.vx = (s.vx + (s.tx - s.x) * STIFFNESS) * DAMPING;
  s.vy = (s.vy + (s.ty - s.y) * STIFFNESS) * DAMPING;
  s.x += s.vx;
  s.y += s.vy;
  const settled =
    Math.abs(s.tx - s.x) < EPS &&
    Math.abs(s.ty - s.y) < EPS &&
    Math.abs(s.vx) < EPS &&
    Math.abs(s.vy) < EPS;
  if (settled) {
    s.x = s.tx;
    s.y = s.ty;
    s.vx = 0;
    s.vy = 0;
  }
  return settled;
}

export function useAuthMotion(rootRef: RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    const root = rootRef.current;
    if (!root || typeof window === "undefined" || !window.matchMedia) return undefined;

    const finePointer = window.matchMedia("(hover: hover) and (pointer: fine)");
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (!finePointer.matches || reducedMotion.matches) return undefined;

    const panel = root.querySelector<HTMLElement>(".auth-split__panel");
    const magnets = new Map<HTMLElement, Spring>();
    const tilts = new Map<HTMLElement, Spring>();
    const glow = { x: 0.7, y: 0.55, tx: 0.7, ty: 0.55 };
    const spot = { x: 0, y: 0, tx: 0, ty: 0, init: false };

    let pointer: { x: number; y: number } | null = null;
    let raf = 0;

    const springFor = (map: Map<HTMLElement, Spring>, el: HTMLElement): Spring => {
      let s = map.get(el);
      if (!s) {
        s = makeSpring();
        map.set(el, s);
      }
      return s;
    };

    const computeTargets = () => {
      root.querySelectorAll<HTMLElement>(MAGNET_SELECTOR).forEach((el) => {
        const s = springFor(magnets, el);
        const disabled = (el as HTMLButtonElement).disabled || el.getAttribute("aria-disabled") === "true";
        if (!pointer || disabled) {
          s.tx = 0;
          s.ty = 0;
          return;
        }
        const r = el.getBoundingClientRect();
        const cx = r.left - s.x + r.width / 2;
        const cy = r.top - s.y + r.height / 2;
        const dx = pointer.x - cx;
        const dy = pointer.y - cy;
        const inside =
          Math.abs(dx) < r.width / 2 + MAGNET_RADIUS && Math.abs(dy) < r.height / 2 + MAGNET_RADIUS;
        s.tx = inside ? clamp(dx * 0.14, -MAGNET_MAX_X, MAGNET_MAX_X) : 0;
        s.ty = inside ? clamp(dy * 0.3, -MAGNET_MAX_Y, MAGNET_MAX_Y) : 0;
      });

      root.querySelectorAll<HTMLElement>(TILT_SELECTOR).forEach((el) => {
        const s = springFor(tilts, el);
        const r = el.getBoundingClientRect();
        const over =
          pointer &&
          pointer.x >= r.left &&
          pointer.x <= r.right &&
          pointer.y >= r.top &&
          pointer.y <= r.bottom;
        if (!over || !pointer) {
          s.tx = 0;
          s.ty = 0;
          return;
        }
        const nx = (pointer.x - r.left) / r.width;
        const ny = (pointer.y - r.top) / r.height;
        s.tx = (0.5 - ny) * 2 * TILT_MAX;
        s.ty = (nx - 0.5) * 2 * TILT_MAX;
        el.style.setProperty("--sx", `${(nx * 100).toFixed(1)}%`);
        el.style.setProperty("--sy", `${(ny * 100).toFixed(1)}%`);
      });

      if (panel && pointer) {
        const r = panel.getBoundingClientRect();
        glow.tx = clamp((pointer.x - r.left) / r.width, -0.1, 1.1);
        glow.ty = clamp((pointer.y - r.top) / r.height, -0.1, 1.1);
      }
      if (pointer) {
        spot.tx = pointer.x;
        spot.ty = pointer.y;
        if (!spot.init) {
          spot.x = spot.tx;
          spot.y = spot.ty;
          spot.init = true;
        }
      }
    };

    const frame = () => {
      raf = 0;
      let active = false;

      magnets.forEach((s, el) => {
        if (!el.isConnected) {
          magnets.delete(el);
          return;
        }
        if (!stepSpring(s)) active = true;
        el.style.setProperty("--mag-x", `${s.x.toFixed(2)}px`);
        el.style.setProperty("--mag-y", `${s.y.toFixed(2)}px`);
      });

      tilts.forEach((s, el) => {
        if (!el.isConnected) {
          tilts.delete(el);
          return;
        }
        if (!stepSpring(s)) active = true;
        el.style.setProperty("--rx", `${s.x.toFixed(2)}deg`);
        el.style.setProperty("--ry", `${s.y.toFixed(2)}deg`);
      });

      glow.x += (glow.tx - glow.x) * 0.08;
      glow.y += (glow.ty - glow.y) * 0.08;
      if (Math.abs(glow.tx - glow.x) > 0.0005 || Math.abs(glow.ty - glow.y) > 0.0005) active = true;
      if (panel) {
        panel.style.setProperty("--px", glow.x.toFixed(4));
        panel.style.setProperty("--py", glow.y.toFixed(4));
      }

      spot.x += (spot.tx - spot.x) * 0.14;
      spot.y += (spot.ty - spot.y) * 0.14;
      if (Math.abs(spot.tx - spot.x) > 0.3 || Math.abs(spot.ty - spot.y) > 0.3) active = true;
      root.style.setProperty("--gx", `${spot.x.toFixed(1)}px`);
      root.style.setProperty("--gy", `${spot.y.toFixed(1)}px`);

      if (active) raf = window.requestAnimationFrame(frame);
    };

    const kick = () => {
      if (!raf) raf = window.requestAnimationFrame(frame);
    };

    const onMove = (e: PointerEvent) => {
      if (e.pointerType && e.pointerType !== "mouse" && e.pointerType !== "pen") return;
      pointer = { x: e.clientX, y: e.clientY };
      root.classList.add("is-pointer");

      const target = e.target as HTMLElement | null;
      const btn = target?.closest?.(".as-btn") as HTMLElement | null;
      if (btn && root.contains(btn)) {
        const r = btn.getBoundingClientRect();
        btn.style.setProperty("--bx", `${(((e.clientX - r.left) / r.width) * 100).toFixed(1)}%`);
        btn.style.setProperty("--by", `${(((e.clientY - r.top) / r.height) * 100).toFixed(1)}%`);
      }

      computeTargets();
      kick();
    };

    const onLeave = () => {
      pointer = null;
      root.classList.remove("is-pointer");
      computeTargets();
      kick();
    };

    const onScroll = () => {
      if (!pointer) return;
      computeTargets();
      kick();
    };

    root.addEventListener("pointermove", onMove, { passive: true });
    root.addEventListener("pointerleave", onLeave);
    window.addEventListener("scroll", onScroll, { passive: true });

    return () => {
      root.removeEventListener("pointermove", onMove);
      root.removeEventListener("pointerleave", onLeave);
      window.removeEventListener("scroll", onScroll);
      if (raf) window.cancelAnimationFrame(raf);
    };
  }, [rootRef]);
}
