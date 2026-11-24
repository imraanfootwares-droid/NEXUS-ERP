"use client";

import React, { useState } from "react";
import { Minus, Package, Plus, Trash2 } from "lucide-react";
import { cn } from "@/components/ui/primitives";

export const money = (n: number) =>
  `₹${n.toLocaleString("en-IN", { minimumFractionDigits: Number.isInteger(n) ? 0 : 2, maximumFractionDigits: 2 })}`;

/** Quantity control: minus, an editable number, plus. Going below 1 removes the item. */
export function QtyStepper({
  value,
  max,
  label,
  onChange,
  size = "md",
}: {
  value: number;
  max?: number;
  label: string;
  onChange: (qty: number) => void;
  size?: "sm" | "md";
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const atMax = max !== undefined && value >= max;

  const commit = () => {
    if (draft === null) return;
    const parsed = Math.floor(Number(draft));
    setDraft(null);
    if (!Number.isFinite(parsed) || draft.trim() === "") return;
    onChange(Math.max(0, parsed));
  };

  return (
    <span className="pos-stepper" data-size={size} role="group" aria-label={`Quantity of ${label}`}>
      <button
        type="button"
        data-remove={value <= 1 || undefined}
        aria-label={value <= 1 ? `Remove ${label}` : `Decrease ${label}`}
        title={value <= 1 ? "Remove from bill" : "Decrease"}
        onClick={() => onChange(value - 1)}
      >
        {value <= 1 ? <Trash2 aria-hidden="true" /> : <Minus aria-hidden="true" />}
      </button>
      <input
        type="text"
        inputMode="numeric"
        aria-label={`Quantity of ${label}`}
        value={draft ?? String(value)}
        placeholder="Qty"
        style={{ width: size === "sm" ? 48 : 62 }}
        onFocus={(e) => e.currentTarget.select()}
        onChange={(e) => {
          const digits = e.target.value.replace(/\D/g, "");
          setDraft(digits);
          if (digits !== "") {
            const parsed = Math.floor(Number(digits));
            if (Number.isFinite(parsed) && parsed > 0) {
              onChange(parsed);
            }
          }
        }}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            e.currentTarget.blur();
          } else if (e.key === "Escape") {
            setDraft(null);
            e.currentTarget.blur();
          }
        }}
      />
      <button
        type="button"
        disabled={atMax}
        aria-label={`Increase ${label}`}
        title={atMax ? `Only ${max} in stock` : "Increase"}
        onClick={() => onChange(value + 1)}
      >
        <Plus aria-hidden="true" />
      </button>
    </span>
  );
}

function StockLevel({ left, total }: { left: number; total: number }) {
  const ratio = total > 0 ? left / Math.max(total, 10) : 0;
  const filled = left <= 0 ? 0 : Math.max(1, Math.ceil(ratio * 5));
  const tone = left <= 0 ? "out" : left <= 5 ? "low" : "ok";
  return (
    <span className="pos-stock" data-tone={tone}>
      <span className="pos-stock-bars" aria-hidden="true">
        {[0, 1, 2, 3, 4].map((i) => (
          <i key={i} data-on={i < filled || undefined} />
        ))}
      </span>
      <span>{left <= 0 ? "No stock" : `${left} left`}</span>
    </span>
  );
}

export function PosProductCard({
  name,
  attributes,
  sku,
  price,
  stock,
  trackStock,
  qty,
  limit,
  thumb,
  onAdd,
  onSetQty,
}: {
  name: string;
  attributes: string[];
  sku: string;
  price: number;
  stock: number;
  trackStock: boolean;
  qty: number;
  limit?: number;
  thumb?: string | null;
  onAdd: () => void;
  onSetQty: (qty: number) => void;
}) {
  const fullLabel = [name, ...attributes].join(" ");
  const unavailable = limit !== undefined && limit <= 0 && qty === 0;
  const atLimit = limit !== undefined && qty >= limit;

  return (
    <article className={cn("pos-card ui-tray")} data-selected={qty > 0 || undefined} data-unavailable={unavailable || undefined}>
      <button
        type="button"
        className="pos-card-hit"
        disabled={unavailable || atLimit}
        aria-label={unavailable ? `${fullLabel} is out of stock` : `Add ${fullLabel} to bill`}
        onClick={onAdd}
      />
      <div className="pos-card-body ui-surface">
        <span className="pos-thumb">
          {thumb ? <img src={thumb} alt="" /> : <Package aria-hidden="true" />}
          {qty > 0 ? (
            <span key={qty} className="pos-count" aria-hidden="true">
              {qty}
            </span>
          ) : null}
        </span>
        <span className="min-w-0 flex-1">
          <span className="pos-card-name" title={name}>{name}</span>
          <span className="pos-card-attrs">
            {attributes.map((a) => (
              <span key={a}>{a}</span>
            ))}
          </span>
          <span className="pos-card-foot">
            <b>{money(price)}</b>
            <small title={sku}>{sku}</small>
          </span>
        </span>
      </div>
      <div className="pos-card-actions">
        {trackStock ? <StockLevel left={stock - qty} total={stock} /> : <span />}
        {qty > 0 ? (
          <span className="pos-card-control">
            <QtyStepper value={qty} max={limit} label={fullLabel} onChange={onSetQty} size="sm" />
          </span>
        ) : (
          <span className="pos-add" aria-hidden="true">
            <Plus />
            {unavailable ? "Sold out" : "Add"}
          </span>
        )}
      </div>
    </article>
  );
}
