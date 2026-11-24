"use client";

import React, { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Crown, GitBranch, Server, Store, UserRound, type LucideIcon } from "lucide-react";
import { toast } from "sonner";
import { AuthField, AuthSplitLayout, Spinner } from "@/components/auth/auth-split-layout";

type ViewMode = "login" | "reset";

const PORTALS = [
  {
    id: "super",
    label: "Super Admin",
    icon: Crown,
    title: "Super Admin",
    lead: "Full control of every business, plan, tier and person on Nexus ERP.",
    placeholder: "Super admin email or username",
  },
  {
    id: "platform",
    label: "Platform",
    icon: Server,
    title: "Platform Admin",
    lead: "Manage workspaces, infrastructure, roles and support requests.",
    placeholder: "Platform admin email or username",
  },
  {
    id: "owner",
    label: "Owner",
    icon: Store,
    title: "Business Owner",
    lead: "Run your whole business: branches, stock, billing, GST and reports.",
    placeholder: "owner@company.in",
  },
  {
    id: "branch",
    label: "Branch",
    icon: GitBranch,
    title: "Branch Admin",
    lead: "Manage your branch's sales, stock, transfers and daily closing.",
    placeholder: "business-slug/username",
  },
  {
    id: "staff",
    label: "Staff",
    icon: UserRound,
    title: "Staff",
    lead: "Open the counter, create bills and keep stock moving.",
    placeholder: "business-slug/username",
  },
] as const satisfies ReadonlyArray<{
  id: string;
  label: string;
  icon: LucideIcon;
  title: string;
  lead: string;
  placeholder: string;
}>;

type PortalId = (typeof PORTALS)[number]["id"];

export default function LoginPage() {
  // useSearchParams needs a Suspense boundary for this page to prerender.
  return (
    <Suspense fallback={null}>
      <LoginView />
    </Suspense>
  );
}

function LoginView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [portalId, setPortalId] = useState<PortalId>(() => {
    const requested = PORTALS.find((x) => x.id === searchParams.get("portal"));
    if (requested) return requested.id;
    return searchParams.get("next")?.startsWith("/platform") ? "super" : "owner";
  });
  const portal = PORTALS.find((x) => x.id === portalId)!;
  const choosePortal = (id: PortalId) => {
    setPortalId(id);
    setError("");
    window.history.replaceState(null, "", `/login?portal=${id}`);
  };
  const [view, setView] = useState<ViewMode>("login");
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [resetIdent, setResetIdent] = useState("");
  const [resetNote, setResetNote] = useState("");
  const [resetBusy, setResetBusy] = useState(false);
  const [resetDone, setResetDone] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.suspended) {
          router.push("/suspended");
          return;
        }
        const msg = data.error || "Sign in failed";
        setError(msg);
        toast.error(msg);
        return;
      }
      toast.success("Signed in");
      router.push(data.redirectTo || "/dashboard");
      router.refresh();
    } catch {
      const msg = "Network error while signing in";
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleResetRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setResetBusy(true);
    try {
      const res = await fetch("/api/auth", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "request_reset",
          identifier: resetIdent,
          note: resetNote || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Could not submit reset request.");
        return;
      }
      toast.success(data.message || "Request submitted.");
      setResetDone(true);
    } catch {
      setError("Could not submit reset request.");
      toast.error("Could not submit reset request.");
    } finally {
      setResetBusy(false);
    }
  };

  const panel =
    view === "reset"
      ? {
          title: "Reset your password",
          lead: "Three quick steps to notify your workspace administrator.",
          steps: [
            { label: "Enter your username" },
            { label: "Notify admin" },
            { label: "Sign back in" },
          ],
          active: resetDone ? 1 : 0,
        }
      : {
          title: portal.title,
          lead: portal.lead,
          steps: [
            { label: "Enter your credentials" },
            { label: "Verify workspace" },
            { label: "Open Nexus ERP" },
          ],
          active: identifier.trim().length > 0 && password.length > 0 ? 1 : 0,
        };

  return (
    <AuthSplitLayout
      tone="vendor"
      portal={portalId}
      title={panel.title}
      lead={panel.lead}
      steps={panel.steps}
      activeStep={panel.active}
      backHref="/"
      backLabel="Back to home"
      footerLinks={[
        { label: "Sign Up", href: "/signup" },
        { label: "Home", href: "/" },
      ]}
    >
      {view === "reset" ? (
        <>
          <h1 className="as-heading">Request Password Reset</h1>
          <p className="as-sub">
            Your Shop Owner or Nexus ERP Admin will set a temporary password for you.
          </p>

          {error ? <div className="as-alert">{error}</div> : null}
          {resetDone ? (
            <div className="as-alert as-alert--info">
              <div className="as-alert__title">Request Submitted</div>
              If the account exists, your administrator has been notified.
            </div>
          ) : null}

          <form onSubmit={handleResetRequest}>
            <AuthField
              label="Email or Staff Username"
              name="resetIdent"
              value={resetIdent}
              onChange={(e) => setResetIdent(e.target.value)}
              placeholder="e.g. chn_staff or owner@company.in"
              required
            />
            <AuthField
              label="Note"
              optional="(optional)"
              name="resetNote"
              value={resetNote}
              onChange={(e) => setResetNote(e.target.value)}
              placeholder="Reason for reset"
            />
            <button type="submit" disabled={resetBusy} className="as-btn as-btn--primary">
              {resetBusy ? (
                <>
                  <Spinner /> Submitting...
                </>
              ) : (
                "Notify Administrator"
              )}
            </button>
          </form>

          <div className="as-alt">
            <button
              type="button"
              onClick={() => {
                setView("login");
                setError("");
                setResetDone(false);
              }}
              className="as-btn as-btn--ghost as-btn--stacked"
            >
              <span className="as-btn__cap">Remembered your password?</span>
              <span className="as-btn__label">Back to Log In</span>
            </button>
          </div>
        </>
      ) : (
        <>
          <h1 className="as-heading">{portal.title} Login</h1>
          <p className="as-sub">Choose your login type, then enter your details.</p>

          <div className="as-portals" role="radiogroup" aria-label="Login type">
            {PORTALS.map((x) => {
              const Icon = x.icon;
              return (
                <button
                  key={x.id}
                  type="button"
                  role="radio"
                  aria-checked={x.id === portalId}
                  data-portal-option={x.id}
                  onClick={() => choosePortal(x.id)}
                  className="as-portal"
                >
                  <Icon aria-hidden="true" />
                  <span>{x.label}</span>
                </button>
              );
            })}
          </div>

          {error ? <div className="as-alert">{error}</div> : null}

          <form onSubmit={handleLogin}>
            <AuthField
              label="Email or Staff Username"
              name="identifier"
              autoComplete="username"
              value={identifier}
              onChange={(e) => {
                setIdentifier(e.target.value);
                setError("");
              }}
              placeholder={portal.placeholder}
              required
            />

            <AuthField
              label="Password"
              name="password"
              autoComplete="current-password"
              revealable
              revealed={showPassword}
              onToggleReveal={() => setShowPassword((v) => !v)}
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setError("");
              }}
              placeholder="Enter your password"
              required
            />

            <div style={{ display: "flex", justifyContent: "flex-end", margin: "-4px 0 20px" }}>
              <button
                type="button"
                onClick={() => {
                  setView("reset");
                  setError("");
                }}
                className="as-link"
              >
                Forgot password?
              </button>
            </div>

            <button type="submit" disabled={loading} className="as-btn as-btn--primary">
              {loading ? (
                <>
                  <Spinner /> Authenticating...
                </>
              ) : (
                "Log In"
              )}
            </button>
          </form>

          <div className="as-alt">
            <Link href="/signup" className="as-btn as-btn--ghost as-btn--stacked">
              <span className="as-btn__cap">Don&apos;t have an account?</span>
              <span className="as-btn__label">Sign up</span>
            </Link>
          </div>
        </>
      )}
    </AuthSplitLayout>
  );
}
