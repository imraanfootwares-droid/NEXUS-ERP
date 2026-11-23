"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { NexusLogo } from "@/components/brand/nexus-logo";
import { Button, Card, CardContent, Input, Label } from "@/components/ui/primitives";

export default function PlatformSetupPage() {
  const router = useRouter();
  const [token, setToken] = useState("");
  const [fullName, setFullName] = useState("Mohammad Hassan");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await fetch("/api/platform", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, fullName, email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Bootstrap failed");
        return;
      }
      toast.success("Application Owner provisioned! Redirecting to login...");
      router.push("/login");
    } catch {
      toast.error("Request failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0B1120] flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-6">
        <div className="flex flex-col items-center text-center">
          <NexusLogo variant="light" size="lg" />
          <p className="text-slate-400 text-sm mt-2">
            One-Time Application Owner Bootstrap (auto-locks after creation)
          </p>
        </div>

        <Card>
          <CardContent className="p-6">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label>Bootstrap Token (`APP_OWNER_BOOTSTRAP_TOKEN`)</Label>
                <Input
                  type="password"
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  required
                />
              </div>
              <div>
                <Label>Owner Full Name</Label>
                <Input
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  required
                />
              </div>
              <div>
                <Label>Owner Email</Label>
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
              <div>
                <Label>Password (min 8 chars)</Label>
                <Input
                  type="password"
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>
              <Button type="submit" className="w-full" size="lg" disabled={busy}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                Create Platform Super Admin
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
