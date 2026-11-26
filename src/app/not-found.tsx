import Link from "next/link";
import { ArrowLeft, Compass } from "lucide-react";

export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#f6f6f7] p-6">
      <div className="w-full max-w-md rounded-2xl border border-[#e5e5e7] bg-white p-6 text-center shadow-sm">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-[#f4f4f5] text-[#171717]">
          <Compass className="h-6 w-6" />
        </div>
        <p className="mt-4 font-mono text-xs font-semibold uppercase tracking-wider text-[#71717a]">Page Not Found</p>
        <h1 className="mt-1 text-lg font-semibold text-[#171717]">We couldn&apos;t find that screen</h1>
        <p className="mt-1.5 text-sm text-[#71717a]">
          The link may be old, or the item may have been deleted. Head back to your dashboard to keep working.
        </p>
        <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#171717] px-4 py-2 text-xs font-semibold text-white hover:bg-[#2a2a2a]"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Back to Dashboard
          </Link>
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 rounded-lg border border-[#d4d4d8] bg-white px-4 py-2 text-xs font-semibold text-[#171717] hover:bg-[#fafafa]"
          >
            Home Page
          </Link>
        </div>
      </div>
    </div>
  );
}
