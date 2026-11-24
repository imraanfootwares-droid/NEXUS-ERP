"use client";

import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, Loader2, Search, X } from "lucide-react";
import { toast } from "sonner";

export function cn(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(" ");
}

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "outline" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
}

function isThenable(v: unknown): v is PromiseLike<unknown> {
  return Boolean(v) && typeof (v as PromiseLike<unknown>).then === "function";
}

/** Turns any thrown value into a message that is safe to show a shop user. */
export function friendlyErrorMessage(err: unknown, fallback = "Something went wrong. Please try again."): string {
  const raw = err instanceof Error ? err.message : typeof err === "string" ? err : "";
  if (!raw) return fallback;
  // Production builds mask server-action errors behind this generic text.
  if (/Server Components render|digest|An error occurred in the Server|Internal Server Error/i.test(raw)) return fallback;
  if (/Failed to fetch|NetworkError|Load failed/i.test(raw)) return "Network problem. Check your connection and try again.";
  return raw.length > 220 ? `${raw.slice(0, 220)}…` : raw;
}

/** True while the nearest <Form> is running its submit handler. */
const FormBusyContext = React.createContext(false);
export function useFormBusy(): boolean {
  return React.useContext(FormBusyContext);
}

export type FormProps = Omit<React.FormHTMLAttributes<HTMLFormElement>, "onSubmit"> & {
  onSubmit?: (e: React.FormEvent<HTMLFormElement>) => unknown;
};

/**
 * Drop-in <form> replacement with a double-submit guard: while an async onSubmit is
 * running, further submits (double-clicks, repeated Enter) are ignored and every
 * submit <Button> inside is disabled with a spinner. Unhandled errors become a toast.
 */
export const Form = React.forwardRef<HTMLFormElement, FormProps>(({ onSubmit, children, ...props }, ref) => {
  const busyRef = useRef(false);
  const [busy, setBusy] = useState(false);

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    if (busyRef.current) {
      e.preventDefault();
      return;
    }
    if (!onSubmit) return;
    let res: unknown;
    try {
      res = onSubmit(e);
    } catch (err) {
      e.preventDefault();
      toast.error(friendlyErrorMessage(err));
      return;
    }
    if (isThenable(res)) {
      busyRef.current = true;
      setBusy(true);
      Promise.resolve(res)
        .catch((err) => {
          console.error(err);
          toast.error(friendlyErrorMessage(err));
        })
        .finally(() => {
          busyRef.current = false;
          setBusy(false);
        });
    }
  };

  return (
    <FormBusyContext.Provider value={busy}>
      <form ref={ref} onSubmit={handleSubmit} aria-busy={busy || undefined} {...props}>
        {children}
      </form>
    </FormBusyContext.Provider>
  );
});
Form.displayName = "Form";

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "primary", size = "md", type = "button", onClick, disabled, children, ...props }, ref) => {
    const busyRef = useRef(false);
    const [pending, setPending] = useState(false);
    const formBusy = React.useContext(FormBusyContext);
    const submitBusy = type === "submit" && formBusy;
    const busy = pending || submitBusy;

    const handleClick: React.MouseEventHandler<HTMLButtonElement> = (e) => {
      if (disabled || busyRef.current || submitBusy) {
        e.preventDefault();
        return;
      }
      if (!onClick) return;
      let res: unknown;
      try {
        res = onClick(e);
      } catch (err) {
        console.error(err);
        toast.error(friendlyErrorMessage(err));
        return;
      }
      if (isThenable(res)) {
        busyRef.current = true;
        setPending(true);
        Promise.resolve(res)
          .catch((err) => {
            console.error(err);
            toast.error(friendlyErrorMessage(err));
          })
          .finally(() => {
            busyRef.current = false;
            setPending(false);
          });
      }
    };

    const variants: Record<NonNullable<ButtonProps["variant"]>, string> = {
      primary: "bg-[#171717] text-white hover:bg-[#2a2a2a] shadow-[0_1px_2px_rgba(0,0,0,.25),inset_0_1px_0_rgba(255,255,255,.12)]",
      secondary: "bg-[#f1f1f2] text-[#171717] hover:bg-[#e7e7e9]",
      outline: "bg-white text-[#27272a] hover:bg-[#fafafa] shadow-[0_1px_2px_rgba(0,0,0,.05),0_0_0_1px_rgba(0,0,0,.08)]",
      ghost: "text-[#55555b] hover:bg-[#f4f4f5] hover:text-[#171717]",
      danger: "bg-rose-600 text-white hover:bg-rose-700 shadow-[0_1px_2px_rgba(0,0,0,.2)]",
    };
    const sizes: Record<NonNullable<ButtonProps["size"]>, string> = {
      sm: "min-h-[36px] md:min-h-[30px] px-2.5 text-xs",
      md: "min-h-[40px] md:min-h-[34px] px-3.5 text-[13px]",
      lg: "min-h-[44px] px-5 text-sm",
    };
    return (
      <button
        ref={ref}
        type={type}
        disabled={Boolean(disabled || busy)}
        aria-busy={busy || undefined}
        onClick={handleClick}
        className={cn(
          "inline-flex items-center justify-center gap-1.5 rounded-lg font-medium transition-all duration-150 active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#171717] disabled:pointer-events-none disabled:opacity-50 cursor-pointer",
          variant === "danger" && size === "sm"
            ? "bg-rose-50 text-rose-700 shadow-[0_0_0_1px_rgba(225,29,72,.14)] hover:bg-rose-100"
            : variants[variant],
          sizes[size],
          className
        )}
        {...props}
      >
        {busy && !disabled && <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" aria-hidden />}
        {children}
      </button>
    );
  }
);
Button.displayName = "Button";

export function Card({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-[14px] bg-white shadow-[0_0_0_3px_#f1f1f2,0_0_0_4px_rgba(0,0,0,.05),0_1px_2px_rgba(0,0,0,.05)]",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export function CardHeader({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("border-b border-[#ececee] px-4 py-2.5 [&_h2]:text-[13px] [&_h3]:text-[13px] [&_h3]:font-semibold [&_h3]:tracking-[-0.01em]", className)} {...props}>
      {children}
    </div>
  );
}

export function CardContent({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("p-4", className)} {...props}>
      {children}
    </div>
  );
}

export function Badge({
  className,
  variant = "default",
  children,
}: {
  className?: string;
  variant?: "default" | "success" | "warning" | "danger" | "info" | "outline";
  children: React.ReactNode;
}) {
  const styles = {
    default: "bg-[#f1f1f2] text-[#3f3f46]",
    success: "bg-white text-emerald-700 shadow-[0_0_0_1px_rgba(0,0,0,.07)] before:h-1.5 before:w-1.5 before:rounded-full before:bg-emerald-500",
    warning: "bg-white text-amber-700 shadow-[0_0_0_1px_rgba(0,0,0,.07)] before:h-1.5 before:w-1.5 before:rounded-full before:bg-amber-500",
    danger: "bg-white text-rose-700 shadow-[0_0_0_1px_rgba(0,0,0,.07)] before:h-1.5 before:w-1.5 before:rounded-full before:bg-rose-500",
    info: "bg-white text-[#55555b] shadow-[0_0_0_1px_rgba(0,0,0,.07)] before:h-1.5 before:w-1.5 before:rounded-full before:bg-[#a1a1aa]",
    outline: "bg-white text-[#3f3f46] shadow-[0_0_0_1px_rgba(0,0,0,.1)]",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-[3px] text-[11px] font-medium whitespace-nowrap",
        styles[variant],
        className
      )}
    >
      {children}
    </span>
  );
}

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, onWheel, ...props }, ref) => (
    <input
      ref={ref}
      onWheel={(e) => {
        if (props.type === "number") {
          e.currentTarget.blur();
        }
        onWheel?.(e);
      }}
      className={cn(
        "w-full min-h-[40px] md:min-h-[34px] rounded-lg border-0 bg-white px-3 py-2 text-[13px] text-[#171717] placeholder:text-[#a3a3a8] shadow-[0_0_0_1px_rgba(0,0,0,.09),0_1px_2px_rgba(0,0,0,.03)] transition-shadow focus:shadow-[0_0_0_1px_#171717,0_0_0_3px_rgba(23,23,23,.08)] focus:outline-none disabled:bg-[#fafafa] disabled:text-[#77777d]",
        className
      )}
      {...props}
    />
  )
);
Input.displayName = "Input";

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    className={cn(
      "w-full rounded-lg border-0 bg-white px-3 py-2 text-[13px] text-[#171717] placeholder:text-[#a3a3a8] shadow-[0_0_0_1px_rgba(0,0,0,.09),0_1px_2px_rgba(0,0,0,.03)] transition-shadow focus:shadow-[0_0_0_1px_#171717,0_0_0_3px_rgba(23,23,23,.08)] focus:outline-none",
      className
    )}
    {...props}
  />
));
Textarea.displayName = "Textarea";

interface SelectOptionItem {
  value: string;
  label: string;
  disabled: boolean;
}

function nodeText(node: React.ReactNode): string {
  return React.Children.toArray(node)
    .map((c) => {
      if (typeof c === "string" || typeof c === "number") return String(c);
      if (React.isValidElement<{ children?: React.ReactNode }>(c)) return nodeText(c.props.children);
      return "";
    })
    .join("");
}

function readSelectOptions(node: React.ReactNode, out: SelectOptionItem[] = []): SelectOptionItem[] {
  React.Children.forEach(node, (child) => {
    if (!React.isValidElement<React.OptionHTMLAttributes<HTMLOptionElement>>(child)) return;
    if (child.type === "option") {
      const label = nodeText(child.props.children).trim();
      out.push({
        value: child.props.value !== undefined ? String(child.props.value) : label,
        label,
        disabled: Boolean(child.props.disabled),
      });
    } else {
      readSelectOptions(child.props.children, out);
    }
  });
  return out;
}

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  /** Use "dark" on dark surfaces such as the sign-up page. */
  tone?: "light" | "dark";
}

/**
 * Animated dropdown with the same API as a native select: pass <option> children,
 * `value` and `onChange`. A hidden native select keeps form validation working.
 */
export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  (
    { className, children, value, defaultValue, onChange, disabled, id, name, required, tone = "light", "aria-label": ariaLabel, ...rest },
    ref
  ) => {
    const options = useMemo(() => readSelectOptions(children), [children]);
    const listId = useId();
    const triggerRef = useRef<HTMLButtonElement>(null);
    const menuRef = useRef<HTMLDivElement>(null);
    const typed = useRef({ text: "", at: 0 });
    const [internal, setInternal] = useState(defaultValue !== undefined ? String(defaultValue) : undefined);
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState("");
    const [activeIndex, setActiveIndex] = useState(0);
    const [box, setBox] = useState<{ left: number; top?: number; bottom?: number; width: number; maxHeight: number; up: boolean } | null>(null);

    const current = value !== undefined && value !== null ? String(value) : internal ?? options[0]?.value ?? "";
    const selected = options.find((o) => o.value === current);
    const searchable = options.length > 8;
    const q = query.trim().toLowerCase();
    const visible = q ? options.filter((o) => o.label.toLowerCase().includes(q)) : options;

    const place = useCallback(() => {
      const el = triggerRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const gap = 5;
      const below = window.innerHeight - r.bottom - gap - 8;
      const above = r.top - gap - 8;
      const up = below < 200 && above > below;
      const width = Math.min(Math.max(r.width, 190), window.innerWidth - 16);
      setBox({
        left: Math.max(8, Math.min(r.left, window.innerWidth - width - 8)),
        top: up ? undefined : r.bottom + gap,
        bottom: up ? window.innerHeight - r.top + gap : undefined,
        width,
        maxHeight: Math.min(320, up ? above : below),
        up,
      });
    }, []);

    const openMenu = () => {
      if (disabled) return;
      place();
      setQuery("");
      setActiveIndex(Math.max(0, options.findIndex((o) => o.value === current)));
      setOpen(true);
    };

    const closeMenu = (refocus = true) => {
      setOpen(false);
      if (refocus) triggerRef.current?.focus();
    };

    const pick = (option: SelectOptionItem) => {
      if (option.disabled) return;
      closeMenu();
      if (option.value === current) return;
      setInternal(option.value);
      const target = { value: option.value, name: name ?? "", id: id ?? "" };
      onChange?.({
        target,
        currentTarget: target,
        preventDefault() {},
        stopPropagation() {},
        persist() {},
      } as unknown as React.ChangeEvent<HTMLSelectElement>);
    };

    useEffect(() => {
      if (!open) return;
      const onPointer = (e: PointerEvent) => {
        const t = e.target as Node;
        if (!triggerRef.current?.contains(t) && !menuRef.current?.contains(t)) setOpen(false);
      };
      const onMove = (e: Event) => {
        if (menuRef.current?.contains(e.target as Node)) return;
        place();
      };
      document.addEventListener("pointerdown", onPointer);
      window.addEventListener("scroll", onMove, true);
      window.addEventListener("resize", onMove);
      return () => {
        document.removeEventListener("pointerdown", onPointer);
        window.removeEventListener("scroll", onMove, true);
        window.removeEventListener("resize", onMove);
      };
    }, [open, place]);

    useEffect(() => {
      if (!open) return;
      menuRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: "nearest" });
    }, [open, activeIndex, query]);

    const step = (from: number, dir: 1 | -1) => {
      for (let i = 1; i <= visible.length; i++) {
        const next = (from + dir * i + visible.length * i) % visible.length;
        if (!visible[next]?.disabled) return next;
      }
      return from;
    };

    const onKeyDown = (e: React.KeyboardEvent) => {
      if (!open) {
        if (["ArrowDown", "ArrowUp", "Enter", " "].includes(e.key)) {
          e.preventDefault();
          openMenu();
        }
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        closeMenu();
      } else if (e.key === "Tab") {
        setOpen(false);
      } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIndex((i) => step(i, e.key === "ArrowDown" ? 1 : -1));
      } else if (e.key === "Home" || e.key === "End") {
        e.preventDefault();
        setActiveIndex(e.key === "Home" ? step(-1, 1) : step(visible.length, -1));
      } else if (e.key === "Enter" || (e.key === " " && !searchable)) {
        e.preventDefault();
        const option = visible[activeIndex];
        if (option) pick(option);
      } else if (!searchable && e.key.length === 1) {
        const now = Date.now();
        typed.current.text = now - typed.current.at > 600 ? e.key.toLowerCase() : typed.current.text + e.key.toLowerCase();
        typed.current.at = now;
        const hit = visible.findIndex((o) => !o.disabled && o.label.toLowerCase().startsWith(typed.current.text));
        if (hit >= 0) setActiveIndex(hit);
      }
    };

    return (
      <>
        <button
          ref={triggerRef}
          id={id}
          type="button"
          role="combobox"
          aria-label={ariaLabel}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={open ? listId : undefined}
          aria-activedescendant={open && visible[activeIndex] ? `${listId}-${activeIndex}` : undefined}
          disabled={disabled}
          data-open={open || undefined}
          data-tone={tone}
          onClick={() => (open ? closeMenu() : openMenu())}
          onKeyDown={onKeyDown}
          className={cn(
            "ui-select group inline-flex w-full min-h-[40px] md:min-h-[34px] items-center justify-between gap-2 rounded-lg px-3 py-1.5 text-left text-[13px] cursor-pointer focus:outline-none disabled:cursor-not-allowed disabled:opacity-55",
            className
          )}
        >
          <span className={cn("min-w-0 truncate", !selected?.label && "opacity-50")}>{selected?.label || "Select"}</span>
          <ChevronDown className="ui-select-chevron h-3.5 w-3.5 shrink-0 opacity-55" aria-hidden="true" />
        </button>
        <select
          ref={ref}
          name={name}
          required={required}
          disabled={disabled}
          value={current}
          onChange={() => undefined}
          tabIndex={-1}
          aria-hidden="true"
          className="pointer-events-none fixed left-0 top-0 h-px w-px opacity-0"
          {...rest}
        >
          {children}
        </select>
        {open && box
          ? createPortal(
              <div
                ref={menuRef}
                data-tone={tone}
                data-up={box.up || undefined}
                className="ui-menu"
                style={{ left: box.left, top: box.top, bottom: box.bottom, width: box.width, maxHeight: box.maxHeight }}
                onKeyDown={onKeyDown}
              >
                {searchable ? (
                  <div className="ui-menu-search">
                    <Search className="h-3.5 w-3.5 shrink-0 opacity-50" aria-hidden="true" />
                    <input
                      autoFocus
                      value={query}
                      aria-label="Search options"
                      placeholder="Search..."
                      onChange={(e) => {
                        setQuery(e.target.value);
                        setActiveIndex(0);
                      }}
                    />
                  </div>
                ) : null}
                <div id={listId} role="listbox" aria-label={ariaLabel} className="ui-menu-list">
                  {visible.length === 0 ? <p className="ui-menu-empty">No matches</p> : null}
                  {visible.map((o, i) => (
                    <button
                      key={`${o.value}-${i}`}
                      id={`${listId}-${i}`}
                      type="button"
                      role="option"
                      tabIndex={-1}
                      aria-selected={o.value === current}
                      aria-disabled={o.disabled || undefined}
                      data-active={i === activeIndex}
                      disabled={o.disabled}
                      className="ui-menu-item"
                      style={{ animationDelay: `${Math.min(i, 8) * 14}ms` }}
                      onMouseEnter={() => !o.disabled && setActiveIndex(i)}
                      onClick={() => pick(o)}
                    >
                      <span className="min-w-0 truncate">{o.label}</span>
                      {o.value === current ? <Check className="ui-menu-check h-3.5 w-3.5 shrink-0" strokeWidth={2.6} aria-hidden="true" /> : null}
                    </button>
                  ))}
                </div>
              </div>,
              document.body
            )
          : null}
      </>
    );
  }
);
Select.displayName = "Select";

export function Label({ className, children, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label className={cn("block font-mono text-[10.5px] font-medium uppercase tracking-[0.05em] text-[#77777d] mb-1.5", className)} {...props}>
      {children}
    </label>
  );
}

export function Switch({
  checked,
  onCheckedChange,
  disabled,
  label,
}: {
  checked: boolean;
  onCheckedChange: (val: boolean) => void;
  disabled?: boolean;
  label?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
      className={cn(
        "group inline-flex items-center gap-2.5 min-h-[36px] md:min-h-[32px] cursor-pointer select-none rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#171717]/20 focus-visible:ring-offset-2 disabled:opacity-50",
        disabled && "pointer-events-none"
      )}
    >
      <span
        className={cn(
          "relative inline-flex h-[20px] w-[36px] shrink-0 items-center rounded-full p-[2px] transition-all duration-200 ease-out",
          checked
            ? "bg-[#171717] shadow-[inset_0_1px_2px_rgba(0,0,0,0.3)]"
            : "bg-[#e4e4e7] shadow-[inset_0_1px_2px_rgba(0,0,0,0.08)] group-hover:bg-[#d4d4d8]"
        )}
      >
        <span
          className={cn(
            "pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow-[0_1px_3px_rgba(0,0,0,0.22),0_0_0_0.5px_rgba(0,0,0,0.06)] transition-transform duration-200 ease-[cubic-bezier(0.22,1,0.36,1)]",
            checked ? "translate-x-4" : "translate-x-0"
          )}
        />
      </span>
      {label && (
        <span className="text-[13px] font-medium text-[#27272a] transition-colors group-hover:text-[#171717]">
          {label}
        </span>
      )}
    </button>
  );
}

export function Tabs({
  tabs,
  active,
  onChange,
}: {
  tabs: Array<{ id: string; label: string; badge?: string | number }>;
  active: string;
  onChange: (id: string) => void;
}) {
  return (
    <div className="inline-flex max-w-full gap-0.5 overflow-x-auto rounded-full bg-[#f1f1f2] p-[3px] no-scrollbar">
      {tabs.map((tab) => {
        const isActive = tab.id === active;
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onChange(tab.id)}
            className={cn(
              "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1 text-xs font-medium transition-all duration-200 min-h-[30px] cursor-pointer",
              isActive
                ? "bg-white text-[#171717] shadow-[0_1px_2px_rgba(0,0,0,.08),0_0_0_1px_rgba(0,0,0,.03)]"
                : "text-[#77777d] hover:text-[#171717]"
            )}
          >
            {tab.label}
            {tab.badge !== undefined && (
              <span
                className={cn(
                  "rounded-full px-1.5 py-px font-mono text-[10px] font-medium",
                  isActive ? "bg-[#171717] text-white" : "bg-[#e4e4e7] text-[#55555b]"
                )}
              >
                {tab.badge}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/** Modal on desktop, bottom-aligned sheet on < 640px mobile phones. */
export function Dialog({
  open,
  onClose,
  title,
  subtitle,
  children,
  maxWidth = "max-w-lg",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  maxWidth?: string;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="spark-ui fixed inset-0 z-[9999] flex items-end justify-center bg-black/40 p-0 backdrop-blur-[2px] sm:items-center sm:p-6"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={cn(
          "ui-rise flex max-h-[88vh] w-full flex-col overflow-hidden rounded-t-2xl bg-[#f1f1f2] p-[3px] shadow-[0_24px_60px_rgba(0,0,0,.24)] sm:rounded-2xl",
          maxWidth
        )}
      >
        <div className="flex shrink-0 items-center justify-between px-4 py-2.5">
          <div>
            <h3 className="text-sm font-semibold text-[#171717]">{title}</h3>
            {subtitle && <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-full text-[#77777d] transition-colors hover:bg-white hover:text-[#171717] md:h-7 md:w-7"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="overflow-y-auto rounded-[13px] bg-white p-4 shadow-[0_1px_2px_rgba(0,0,0,.05),0_0_0_1px_rgba(0,0,0,.05)] sm:p-6">
          {children}
        </div>
      </div>
    </div>,
    document.body
  );
}

export function Alert({
  variant = "info",
  title,
  children,
  className,
}: {
  variant?: "info" | "warning" | "danger" | "success";
  title?: string;
  children: React.ReactNode;
  className?: string;
}) {
  const styles = {
    info: "border-[#e4e4e7] bg-[#fafafa] text-[#3f3f46]",
    warning: "border-amber-200 bg-amber-50 text-amber-900",
    danger: "border-rose-200 bg-rose-50 text-rose-900",
    success: "border-emerald-200 bg-emerald-50 text-emerald-900",
  };
  return (
    <div className={cn("rounded-[10px] border px-3.5 py-2.5 text-[13px]", styles[variant], className)}>
      {title && <p className="font-semibold mb-1">{title}</p>}
      <div>{children}</div>
    </div>
  );
}
