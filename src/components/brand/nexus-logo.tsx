import React from "react";

export function NexusLogo({
  variant = "dark",
  size = "md",
}: {
  variant?: "dark" | "light";
  size?: "sm" | "md" | "lg";
}) {
  const sizes = {
    sm: { box: "h-7 w-7", text: "text-base", badge: "text-[10px] px-1.5 py-0.5" },
    md: { box: "h-9 w-9", text: "text-xl", badge: "text-[11px] px-2 py-0.5" },
    lg: { box: "h-11 w-11", text: "text-2xl", badge: "text-xs px-2.5 py-0.5" },
  }[size];

  const textColor = variant === "light" ? "text-white" : "text-slate-900";
  const badgeColor =
    variant === "light"
      ? "bg-sky-500/20 text-sky-300 border border-sky-400/30"
      : "bg-slate-900 text-sky-300";

  return (
    <div className="inline-flex items-center gap-2.5 select-none">
      <svg
        viewBox="0 0 48 48"
        fill="none"
        className={`${sizes.box} shrink-0`}
        aria-hidden="true"
      >
        <rect width="48" height="48" rx="12" fill="#0B1120" />
        <path
          d="M12 34V14L24 23.5L36 14V34"
          stroke="#38BDF8"
          strokeWidth="3.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M12 34L24 23.5L36 34"
          stroke="#818CF8"
          strokeWidth="3.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <div className="flex items-center gap-1.5">
        <span className={`font-logo font-extrabold tracking-tight uppercase ${sizes.text} ${textColor}`}>
          NEXUS
        </span>
        <span className={`font-display font-bold tracking-wider uppercase rounded-md ${sizes.badge} ${badgeColor}`}>
          ERP
        </span>
      </div>
    </div>
  );
}
