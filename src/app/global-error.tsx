"use client";

import React from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: "system-ui, -apple-system, sans-serif", background: "#f6f6f7", color: "#171717" }}>
        <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
          <div style={{ maxWidth: 420, width: "100%", background: "#fff", border: "1px solid #e5e5e7", borderRadius: 16, padding: 24, textAlign: "center" }}>
            <h1 style={{ fontSize: 18, fontWeight: 600, margin: "0 0 8px" }}>Nexus ERP ran into an issue</h1>
            <p style={{ fontSize: 13, color: "#71717a", margin: "0 0 18px" }}>
              Your business data is completely safe. Reload this page to continue working.
            </p>
            {error?.digest && (
              <p style={{ fontSize: 11, color: "#a1a1aa", fontFamily: "monospace", margin: "0 0 16px" }}>
                Ref: {error.digest}
              </p>
            )}
            <button
              type="button"
              onClick={() => reset()}
              style={{ background: "#171717", color: "#fff", border: 0, borderRadius: 8, padding: "10px 18px", fontSize: 13, fontWeight: 600, cursor: "pointer" }}
            >
              Reload App
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
