"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { FlaskConical, KeyRound, Loader2, Lock, User } from "lucide-react";
import { toast } from "sonner";
import { NexusLogo } from "@/components/brand/nexus-logo";
import { Button, Card, CardContent, Dialog, Input, Label } from "@/components/ui/primitives";
import type { DevPreviewRole } from "@/lib/dev/preview";

export default function LoginPage() {
  const router = useRouter();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const [resetOpen, setResetOpen] = useState(false);
  const [resetIdent, setResetIdent] = useState("");
  const [resetSlug, setResetSlug] = useState("");
  const [resetNote, setResetNote] = useState("");
  const [resetBusy, setResetBusy] = useState(false);

  const launchDevRole = async (role: DevPreviewRole, target: string) => {
    const res = await fetch("/api/dev-preview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role }),
    });
    if (!res.ok) {
      toast.error("Dev preview is only available in development.");
      return;
    }
    toast.success(`Entered Dev Preview (${role.replace("_", " ")})`);
    router.push(target);
    router.refresh();
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
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
        toast.error(data.error || "Sign in failed");
        return;
      }
      toast.success("Signed in");
      router.push(data.redirectTo || "/dashboard");
      router.refresh();
    } catch {
      toast.error("Network error while signing in");
    } finally {
      setLoading(false);
    }
  };

  const handleResetRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    setResetBusy(true);
    try {
      const res = await fetch("/api/auth", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "request_reset",
          identifier: resetIdent,
          tenantSlug: resetSlug || undefined,
          note: resetNote || undefined,
        }),
      });
      const data = await res.json();
      toast.success(data.message || "Request submitted.");
      setResetOpen(false);
      setResetIdent("");
      setResetNote("");
    } catch {
      toast.error("Could not submit reset request.");
    } finally {
      setResetBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0B1120] flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md space-y-6">
        <div className="flex flex-col items-center text-center">
          <Link href="/">
            <NexusLogo variant="light" size="lg" />
          </Link>
          <p className="text-slate-400 text-sm mt-2">
            Sign in with your Email or Staff Username
          </p>
        </div>

        <Card className="border-slate-800 shadow-2xl">
          <CardContent className="p-6">
            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <Label>Email or Username</Label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <Input
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    placeholder="owner@company.in or imraan-footwear/chn_staff"
                    className="pl-9"
                    required
                    autoComplete="username"
                  />
                </div>
              </div>

              <div>
                <Label>Password</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <Input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="pl-9"
                    required
                    autoComplete="current-password"
                  />
                </div>
              </div>

              <Button type="submit" className="w-full" size="lg" disabled={loading}>
                {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                Sign In to Nexus ERP
              </Button>
            </form>

            <div className="mt-4 flex items-center justify-between text-xs text-slate-500">
              <button
                type="button"
                onClick={() => setResetOpen(true)}
                className="inline-flex items-center gap-1 text-sky-600 hover:underline font-medium cursor-pointer"
              >
                <KeyRound className="h-3.5 w-3.5" />
                Forgot Password?
              </button>
              <Link href="/" className="hover:text-slate-800">
                ← Back to Home
              </Link>
            </div>
          </CardContent>
        </Card>

        {process.env.NODE_ENV !== "production" && (
          <div className="rounded-2xl border border-amber-500/30 bg-slate-900/90 p-4 space-y-2.5 text-white">
            <div className="flex items-center gap-2 text-xs font-bold text-amber-300">
              <FlaskConical className="h-4 w-4" />
              Dev Preview Mode (No Backend Needed)
            </div>
            <p className="text-[11px] text-slate-400">
              Preview every UI with mock Imraan Footwear data (New Delhi Factory + Chennai Shop):
            </p>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => launchDevRole("platform_admin", "/platform")}
                className="rounded-lg border border-slate-700 bg-slate-800/80 px-3 py-2 text-xs font-semibold hover:border-amber-400 cursor-pointer"
              >
                Platform Super Admin
              </button>
              <button
                type="button"
                onClick={() => launchDevRole("owner", "/dashboard")}
                className="rounded-lg border border-slate-700 bg-slate-800/80 px-3 py-2 text-xs font-semibold hover:border-sky-400 cursor-pointer"
              >
                Shop Owner (Admin)
              </button>
              <button
                type="button"
                onClick={() => launchDevRole("branch_admin", "/dashboard")}
                className="rounded-lg border border-slate-700 bg-slate-800/80 px-3 py-2 text-xs font-semibold hover:border-emerald-400 cursor-pointer"
              >
                Branch Manager
              </button>
              <button
                type="button"
                onClick={() => launchDevRole("worker", "/dashboard/billing/new")}
                className="rounded-lg border border-slate-700 bg-slate-800/80 px-3 py-2 text-xs font-semibold hover:border-violet-400 cursor-pointer"
              >
                Counter Staff
              </button>
            </div>
          </div>
        )}
      </div>

      <Dialog
        open={resetOpen}
        onClose={() => setResetOpen(false)}
        title="Request Password Reset"
        subtitle="Your Shop Owner or Nexus ERP Admin will set a temporary password for you."
      >
        <form onSubmit={handleResetRequest} className="space-y-3">
          <div>
            <Label>Email or Staff Username *</Label>
            <Input
              value={resetIdent}
              onChange={(e) => setResetIdent(e.target.value)}
              placeholder="e.g. chn_staff or imraan@company.in"
              required
            />
          </div>
          <div>
            <Label>Business Slug (optional)</Label>
            <Input
              value={resetSlug}
              onChange={(e) => setResetSlug(e.target.value)}
              placeholder="e.g. imraan-footwear"
            />
          </div>
          <div>
            <Label>Note (optional)</Label>
            <Input
              value={resetNote}
              onChange={(e) => setResetNote(e.target.value)}
              placeholder="Chennai counter phone reset"
            />
          </div>
          <Button type="submit" className="w-full" disabled={resetBusy}>
            {resetBusy && <Loader2 className="h-4 w-4 animate-spin" />}
            Notify Administrator
          </Button>
        </form>
      </Dialog>
    </div>
  );
}
