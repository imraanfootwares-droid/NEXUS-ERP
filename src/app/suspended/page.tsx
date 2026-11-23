import Link from "next/link";
import { ShieldAlert } from "lucide-react";
import { NexusLogo } from "@/components/brand/nexus-logo";

export default function SuspendedPage() {
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4 text-center">
      <NexusLogo size="md" />
      <div className="mt-8 max-w-md rounded-2xl border border-rose-200 bg-white p-6 shadow-sm">
        <div className="mx-auto h-12 w-12 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center mb-3">
          <ShieldAlert className="h-6 w-6" />
        </div>
        <h1 className="text-lg font-bold text-slate-900">Account Temporarily Suspended</h1>
        <p className="text-sm text-slate-600 mt-2">
          Your business workspace has been paused by the Nexus ERP administrator. Your data and
          daily backups remain safely preserved.
        </p>
        <div className="mt-5 flex justify-center gap-3">
          <Link
            href="/login"
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
          >
            Back to Login
          </Link>
        </div>
      </div>
    </div>
  );
}
