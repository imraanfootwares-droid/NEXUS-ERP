# Nexus ERP — Multi-Tenant Business ERP, GST Billing & Storefront SaaS

Built on **Next.js 16 (App Router + TypeScript)**, **Neon PostgreSQL (pure Postgres with strict FORCE RLS & ACID RPCs)**, and **Cloudflare R2 (two-bucket public/private S3 storage)** — with zero vendor lock-in for seamless transition to a self-hosted **Linux VPS (Docker + Caddy + Postgres/MinIO)**.

## 1. 5-Minute Setup (Vercel + Neon + Cloudflare R2)

1. **Copy environment variables**:
   ```bash
   cp .env.example .env.local
   ```
   Fill in:
   - `DATABASE_URL_MIGRATE`: Your Neon **direct** owner connection string.
   - `DATABASE_URL`: Your Neon **pooled (`-pooler`)** connection string using the `nexus_app` role and `NEXUS_APP_DB_PASSWORD`.
   - `AUTH_SECRET` & `CRON_SECRET`: Random 32+ char strings.
   - Cloudflare R2 keys (`S3_ENDPOINT`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_BUCKET_PUBLIC`, `S3_BUCKET_PRIVATE`, `S3_PUBLIC_URL`).

2. **Configure Cloudflare R2 CORS & Custom Domain**:
   - Create two buckets: `nexus-public` (attach a custom domain e.g. `https://cdn.yourdomain.in`) and `nexus-private` (keep completely private).
   - On `nexus-public`, add a CORS policy allowing `PUT` from your app origin(s) with headers `Content-Type` and `Content-Length`.

3. **Run Migrations, Provision Owner & Seed Demo**:
   ```bash
   npm install
   npm run db:migrate
   npm run provision:owner
   npm run seed:demo
   npm run dev
   ```

4. **Custom Client Domains on Vercel**:
   - Add the client's `.in` / `.co.in` domain in **Vercel Project Settings → Domains**, set the client's DNS `CNAME` to `cname.vercel-dns.com`, and save `custom_domain` on the tenant in `/platform/tenants/[id]`.

## 2. Running ACID & RLS Integration Tests

Set `TEST_DATABASE_URL` to a **Neon test branch** or local Docker Postgres (`docker compose up -d postgres`), then run:
```bash
npm run test
npm run test:db
```

## 3. Transitioning to a Self-Hosted Linux VPS (Docker + Caddy)

1. Download your complete Migration Export (DB snapshot + `rclone` manifest) from `/platform/infrastructure`.
2. Sync R2 buckets to your VPS or keep R2 as your S3 endpoint:
   ```bash
   BUILD_STANDALONE=true npm run build
   docker compose --profile proxy up -d --build
   ```
3. Paste the auto-generated **Caddyfile** and **Linux Crontab** from `/platform/infrastructure` onto your VPS.
4. To restore a tenant snapshot anytime:
   ```bash
   npm run restore:tenant -- --file=./backup.json.gz --dry-run
   ```
