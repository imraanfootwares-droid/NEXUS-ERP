import { Download, HardDrive, Server } from "lucide-react";
import { KpiGrid } from "@/components/ui/kpi-grid";
import { Badge, Card, CardContent, CardHeader } from "@/components/ui/primitives";
import { checkDbHealth, withPlatformTx } from "@/lib/db";
import { env } from "@/lib/env";
import { checkStorageHealth } from "@/lib/storage/s3-client";
import { CopySnippetButton } from "@/app/platform/_client";

export const dynamic = "force-dynamic";

export default async function PlatformInfrastructurePage() {
  const [dbHealth, storageHealth, info] = await Promise.all([
    checkDbHealth(),
    checkStorageHealth(),
    withPlatformTx(async (client) => {
      const [tenantsRes, pendingRes] = await Promise.all([
        client.query<{
          id: string;
          name: string;
          slug: string;
          custom_domain: string | null;
          storage_used_bytes: string;
          last_backup: string | null;
        }>(
          `SELECT t.id, t.name, t.slug, t.custom_domain, t.storage_used_bytes,
                  (SELECT MAX(created_at)::text FROM public.tenant_backups b WHERE b.tenant_id = t.id) AS last_backup
           FROM public.tenants t ORDER BY t.name`
        ),
        client.query<{ cnt: string }>("SELECT COUNT(*)::text AS cnt FROM public.pending_uploads"),
      ]);
      return { tenants: tenantsRes.rows, pendingUploads: Number(pendingRes.rows[0]?.cnt ?? 0) };
    }),
  ]);

  const appUrl = env.NEXT_PUBLIC_APP_URL || "https://erp.yourdomain.in";
  const customDomains = info.tenants.filter((t) => Boolean(t.custom_domain)).map((t) => t.custom_domain!);

  const caddyfile = `# Auto-generated Caddyfile for VPS (automatic Let's Encrypt HTTPS)
{
  on_demand_tls {
    ask ${appUrl}/api/platform
  }
}

${env.NEXT_PUBLIC_APP_DOMAIN || "erp.yourdomain.in"} {
  reverse_proxy app:3000
}

:443 {
  tls {
    on_demand
  }
  reverse_proxy app:3000
}`;

  const crontab = `# Daily 02:00 AM IST backup job on VPS
30 20 * * * curl -fsS -H "Authorization: Bearer YOUR_CRON_SECRET" ${appUrl}/api/cron/daily-backup >/dev/null 2>&1`;

  const neonMb = ((dbHealth.sizeBytes ?? 0) / (1024 * 1024)).toFixed(2);
  const r2PubMb = (storageHealth.publicTotalBytes / (1024 * 1024)).toFixed(2);
  const r2PrivMb = (storageHealth.privateTotalBytes / (1024 * 1024)).toFixed(2);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900">
            Infrastructure, Free-Tier Meters &amp; VPS Migration
          </h1>
          <p className="text-sm text-slate-600">
            Live Neon + Cloudflare R2 health and 1-click VPS transition tools.
          </p>
        </div>
        <a
          href="/api/platform"
          className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800"
        >
          <Download className="h-4 w-4" />
          Download Full Platform Migration Export
        </a>
      </div>

      <KpiGrid
        items={[
          {
            label: "Postgres (Neon)",
            value: dbHealth.ok ? `${neonMb} MB` : "Offline",
            subtext: dbHealth.ok ? `Latency: ${dbHealth.latencyMs}ms (0.5 GB free tier)` : dbHealth.error,
            tone: dbHealth.ok ? "success" : "danger",
            icon: <Server className="h-4 w-4" />,
          },
          {
            label: "R2 Public Bucket",
            value: `${r2PubMb} MB`,
            subtext: "Compressed WebP images & logos",
            tone: storageHealth.ok ? "info" : "warning",
            icon: <HardDrive className="h-4 w-4" />,
          },
          {
            label: "R2 Private Bucket",
            value: `${r2PrivMb} MB`,
            subtext: "Deduped gzip backups (14-day cap)",
            tone: "default",
            icon: <HardDrive className="h-4 w-4" />,
          },
          {
            label: "Pending Uploads",
            value: info.pendingUploads,
            subtext: "Auto-swept after 24h",
            tone: info.pendingUploads > 10 ? "warning" : "default",
          },
        ]}
      />

      <Card>
        <CardHeader>
          <h3 className="text-sm font-semibold text-slate-900">Per-Tenant Storage &amp; Backup Health</h3>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="p-2.5">Tenant</th>
                <th className="p-2.5">Custom Domain</th>
                <th className="p-2.5">R2 Media Used</th>
                <th className="p-2.5">Last Backup</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {info.tenants.map((t) => (
                <tr key={t.id}>
                  <td className="p-2.5 font-semibold">{t.name}</td>
                  <td className="p-2.5">{t.custom_domain ? <Badge variant="info">{t.custom_domain}</Badge> : "—"}</td>
                  <td className="p-2.5">{(Number(t.storage_used_bytes) / (1024 * 1024)).toFixed(2)} MB</td>
                  <td className="p-2.5">{t.last_backup ? new Date(t.last_backup).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }) : "Never"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-900">
              VPS Caddyfile ({customDomains.length} custom domains)
            </h3>
            <CopySnippetButton text={caddyfile} />
          </CardHeader>
          <CardContent>
            <pre className="rounded-lg bg-slate-950 p-3 text-[11px] text-sky-300 overflow-x-auto">
              {caddyfile}
            </pre>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-900">VPS Linux Crontab (Daily Backup)</h3>
            <CopySnippetButton text={crontab} />
          </CardHeader>
          <CardContent>
            <pre className="rounded-lg bg-slate-950 p-3 text-[11px] text-emerald-300 overflow-x-auto">
              {crontab}
            </pre>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
