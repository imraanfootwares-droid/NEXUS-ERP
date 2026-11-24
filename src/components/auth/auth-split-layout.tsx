"use client";

import React, { useEffect, useRef } from "react";
import { Eye, EyeOff } from "lucide-react";
import { useAuthMotion } from "./use-auth-motion";

export interface AuthStep {
  label: string;
}

export interface AuthFooterLink {
  label: string;
  href: string;
}

export interface AuthSplitLayoutProps {
  title: string;
  lead?: string;
  steps?: AuthStep[];
  activeStep?: number;
  backHref?: string;
  backLabel?: string;
  toolbar?: React.ReactNode;
  footerLinks?: AuthFooterLink[];
  dir?: "ltr" | "rtl";
  className?: string;
  /** Palette per portal: 'vendor' (green, default), 'customer' (blue), 'team' (indigo). */
  tone?: "vendor" | "customer" | "team";
  /** Colour theme for a login type. Replays the colour sweep when it changes. */
  portal?: string;
  children: React.ReactNode;
}

/**
 * Split-screen auth shell ported from SkyPlatFX.
 * Styles live in src/app/(auth)/auth-split.css.
 */
export function AuthSplitLayout({
  title,
  lead,
  steps = [],
  activeStep = 0,
  backHref = "/",
  backLabel = "Back to home",
  toolbar = null,
  footerLinks = [],
  dir,
  className = "",
  tone = "vendor",
  portal,
  children,
}: AuthSplitLayoutProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const firstRender = useRef(true);
  useAuthMotion(rootRef);

  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    const body = bodyRef.current;
    if (!body) return;
    body.classList.remove("is-entering");
    void body.offsetWidth;
    body.classList.add("is-entering");
  }, [title, activeStep]);

  return (
    <div ref={rootRef} dir={dir} className={`auth-split ${className}`.trim()} data-tone={tone} data-portal={portal}>
      <aside className="auth-split__panel">
        <span className="auth-split__glow" aria-hidden />
        {portal ? <span key={portal} className="auth-split__sweep" aria-hidden /> : null}
        <a href={backHref} className="auth-split__back">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
          {backLabel}
        </a>

        <div>
          <div className="auth-split__intro">
            <h2 className="auth-split__title">{title}</h2>
            {lead ? <p className="auth-split__lead">{lead}</p> : null}
          </div>

          {steps.length > 0 && (
            <ol className="auth-split__steps">
              {steps.map((step, index) => {
                const state = index === activeStep ? "is-active" : index < activeStep ? "is-done" : "";
                return (
                  <li
                    key={step.label}
                    className={`auth-split__step ${state}`.trim()}
                    aria-current={index === activeStep ? "step" : undefined}
                  >
                    <span className="auth-split__step-num">{index + 1}</span>
                    <span>{step.label}</span>
                  </li>
                );
              })}
            </ol>
          )}
        </div>
      </aside>

      <main className="auth-split__main">
        <div className="auth-split__toolbar">{toolbar}</div>
        <div ref={bodyRef} className="auth-split__body is-entering">
          {children}
        </div>
        {footerLinks.length > 0 && (
          <nav className="auth-split__footer" aria-label="Legal">
            {footerLinks.map((link) => (
              <a key={link.label} href={link.href}>
                {link.label}
              </a>
            ))}
          </nav>
        )}
      </main>
    </div>
  );
}

export interface AuthFieldProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  optional?: string;
  hint?: string;
  error?: string;
  revealable?: boolean;
  revealed?: boolean;
  onToggleReveal?: () => void;
  revealLabels?: { show: string; hide: string };
}

/** Labelled input with optional show/hide password toggle. */
export function AuthField({
  label,
  optional,
  hint,
  error,
  revealable = false,
  revealed = false,
  onToggleReveal,
  revealLabels = { show: "Show password", hide: "Hide password" },
  type = "text",
  id,
  ...inputProps
}: AuthFieldProps) {
  const inputId = id || (inputProps.name ? `as-${inputProps.name}` : undefined);
  const inputType = revealable ? (revealed ? "text" : "password") : type;
  return (
    <div className="as-field">
      <label className="as-label" htmlFor={inputId}>
        {label}
        {optional ? <span className="as-label__opt"> {optional}</span> : null}
      </label>
      <div className="as-input-wrap">
        <input
          id={inputId}
          type={inputType}
          className={`as-input${revealable ? " as-input--icon" : ""}`}
          aria-invalid={error ? true : undefined}
          {...inputProps}
        />
        {revealable && (
          <button
            type="button"
            className="as-input-icon"
            onClick={onToggleReveal}
            aria-label={revealed ? revealLabels.hide : revealLabels.show}
            title={revealed ? revealLabels.hide : revealLabels.show}
          >
            {revealed ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        )}
      </div>
      {error ? (
        <p className="as-hint as-hint--error">{error}</p>
      ) : hint ? (
        <p className="as-hint">{hint}</p>
      ) : null}
    </div>
  );
}

export function KeyIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="7.5" cy="15.5" r="4.5" />
      <path d="m10.7 12.3 9.3-9.3M17 6l3 3M14 9l2 2" />
    </svg>
  );
}

export function Spinner() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="as-spin" aria-hidden>
      <circle cx="12" cy="12" r="10" strokeOpacity="0.2" />
      <path d="M12 2A10 10 0 0 1 22 12" />
    </svg>
  );
}
