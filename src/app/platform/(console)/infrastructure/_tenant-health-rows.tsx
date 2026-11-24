"use client";

import React from "react";
import { Badge } from "@/components/ui/primitives";
import { Paged } from "@/components/ui/pagination";

export interface TenantHealthRow {
  id: string;
  name: string;
  custom_domain: string | null;
  storage_used_bytes: string | number;
  last_backup: string | null;
}

export function TenantHealthRows({ tenants }: { tenants: TenantHealthRow[] }) {
  return (
    <Paged items={tenants} size={10} asRow>
      {(rows) =>
        rows.map((t) => (
          <tr key={t.id}>
            <td className="p-2.5 font-semibold">{t.name}</td>
            <td className="p-2.5">{t.custom_domain ? <Badge variant="info">{t.custom_domain}</Badge> : "—"}</td>
            <td className="p-2.5">{(Number(t.storage_used_bytes) / (1024 * 1024)).toFixed(2)} MB</td>
            <td className="p-2.5" suppressHydrationWarning>
              {t.last_backup ? new Date(t.last_backup).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }) : "Never"}
            </td>
          </tr>
        ))
      }
    </Paged>
  );
}
