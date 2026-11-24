"use client";

import React, { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { Select } from "@/components/ui/primitives";
import { AuthField, AuthSplitLayout, Spinner } from "@/components/auth/auth-split-layout";
import { VERTICAL_PRESETS } from "@/lib/catalog/verticals";
import type { VerticalKey } from "@/types/database";

export default function SignUpPage() {
  return (
    <Suspense fallback={null}>
      <SignUpView />
    </Suspense>
  );
}

function SignUpView() {
  const router = useRouter();
  const requestedVertical = useSearchParams().get("vertical") ?? "";
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const [form, setForm] = useState({
    businessName: "",
    verticalKey: (requestedVertical in VERTICAL_PRESETS ? requestedVertical : "footwear") as VerticalKey,
    fullName: "",
    email: "",
    password: "",
    confirmPassword: "",
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
    setError("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (form.password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (form.password !== form.confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          businessName: form.businessName,
          verticalKey: form.verticalKey,
          fullName: form.fullName,
          email: form.email,
          password: form.password,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Could not create workspace.");
        toast.error(data.error || "Could not create workspace.");
        return;
      }
      toast.success(data.message || "Workspace created! Welcome to Nexus ERP.");
      router.push(data.redirectTo || "/dashboard");
      router.refresh();
    } catch {
      setError("Network error while creating workspace.");
      toast.error("Network error while creating workspace.");
    } finally {
      setLoading(false);
    }
  };

  const step1Done = form.businessName.trim().length > 1;
  const activeStep = step1Done ? 1 : 0;

  return (
    <AuthSplitLayout
      tone="vendor"
      title="Get Started with Us"
      lead="Complete these easy steps to register your business workspace on Nexus ERP."
      steps={[
        { label: "Business details" },
        { label: "Owner account" },
        { label: "Launch workspace" },
      ]}
      activeStep={activeStep}
      backHref="/"
      backLabel="Back to home"
      footerLinks={[
        { label: "Sign In", href: "/login" },
        { label: "Live Storefront", href: "/s/imraan-footwear" },
        { label: "Home", href: "/" },
      ]}
    >
      <h1 className="as-heading">Sign Up Account</h1>
      <p className="as-sub">Create your business workspace and owner account.</p>

      {error ? <div className="as-alert">{error}</div> : null}

      <form onSubmit={handleSubmit}>
        <AuthField
          label="Business Name"
          name="businessName"
          value={form.businessName}
          onChange={handleChange}
          placeholder="eg. Imraan Footwear"
          required
        />

        <div className="as-field">
          <label className="as-label" htmlFor="as-verticalKey">
            Industry Vertical
          </label>
          <Select
            tone="dark"
            id="as-verticalKey"
            name="verticalKey"
            value={form.verticalKey}
            onChange={handleChange}
            className="!min-h-[44px] !text-sm"
          >
            {Object.entries(VERTICAL_PRESETS).map(([key, preset]) => (
              <option key={key} value={key}>
                {preset.name}
              </option>
            ))}
          </Select>
        </div>

        <div className="as-row">
          <AuthField
            label="Full Name"
            name="fullName"
            autoComplete="name"
            value={form.fullName}
            onChange={handleChange}
            placeholder="eg. Mohammad Imraan"
            required
          />
          <AuthField
            label="Email"
            type="email"
            name="email"
            autoComplete="email"
            value={form.email}
            onChange={handleChange}
            placeholder="eg. owner@company.in"
            required
          />
        </div>

        <div className="as-row">
          <AuthField
            label="Password"
            name="password"
            autoComplete="new-password"
            revealable
            revealed={showPassword}
            onToggleReveal={() => setShowPassword((v) => !v)}
            value={form.password}
            onChange={handleChange}
            placeholder="Min 8 characters"
            required
          />
          <AuthField
            label="Confirm Password"
            name="confirmPassword"
            autoComplete="new-password"
            revealable
            revealed={showConfirm}
            onToggleReveal={() => setShowConfirm((v) => !v)}
            value={form.confirmPassword}
            onChange={handleChange}
            placeholder="Repeat password"
            required
          />
        </div>

        <button type="submit" disabled={loading} className="as-btn as-btn--primary" style={{ marginTop: 8 }}>
          {loading ? (
            <>
              <Spinner /> Creating workspace...
            </>
          ) : (
            "Sign Up"
          )}
        </button>

        <div className="as-alt">
          <Link href="/login" className="as-btn as-btn--ghost as-btn--stacked">
            <span className="as-btn__cap">Already have an account?</span>
            <span className="as-btn__label">Log in</span>
          </Link>
        </div>
      </form>
    </AuthSplitLayout>
  );
}
