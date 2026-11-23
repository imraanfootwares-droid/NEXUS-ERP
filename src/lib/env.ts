import { z } from "zod";

const envSchema = z.object({
  DEPLOYMENT_TARGET: z.enum(["vercel", "vps"]).default("vercel"),
  NEXT_PUBLIC_APP_DOMAIN: z.string().default("localhost:3000"),
  NEXT_PUBLIC_APP_URL: z.string().default("http://localhost:3000"),

  APP_OWNER_EMAIL: z.string().email().optional(),
  APP_OWNER_NAME: z.string().default("Application Owner"),
  APP_OWNER_BOOTSTRAP_TOKEN: z.string().optional(),

  DATABASE_URL: z.string().optional(),
  DATABASE_URL_UNPOOLED: z.string().optional(),
  DATABASE_URL_MIGRATE: z.string().optional(),
  NEXUS_APP_DB_PASSWORD: z.string().optional(),
  TEST_DATABASE_URL: z.string().optional(),
  NEON_BRANCH: z.string().optional(),
  NEON_BRANCH_ID: z.string().optional(),

  AUTH_SECRET: z.string().optional(),
  CRON_SECRET: z.string().optional(),

  S3_ENDPOINT: z.string().optional(),
  S3_REGION: z.string().default("auto"),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
  S3_BUCKET_PUBLIC: z.string().default("nexus-public"),
  S3_BUCKET_PRIVATE: z.string().default("nexus-private"),
  S3_PUBLIC_URL: z.string().optional(),
});

const parsed = envSchema.safeParse(process.env);

export const env = parsed.success
  ? parsed.data
  : envSchema.parse({});

export const isConfigured = {
  db: Boolean(env.DATABASE_URL && env.DATABASE_URL.startsWith("postgres")),
  auth: Boolean(env.AUTH_SECRET && env.AUTH_SECRET.length >= 32),
  storage: Boolean(
    env.S3_ENDPOINT &&
      env.S3_ACCESS_KEY_ID &&
      env.S3_SECRET_ACCESS_KEY &&
      env.S3_BUCKET_PUBLIC &&
      env.S3_BUCKET_PRIVATE
  ),
  cron: Boolean(env.CRON_SECRET && env.CRON_SECRET.length >= 8),
  bootstrap: Boolean(env.APP_OWNER_BOOTSTRAP_TOKEN && env.APP_OWNER_BOOTSTRAP_TOKEN.length >= 8),
};

export function getAuthSecret(): Uint8Array {
  const secret = env.AUTH_SECRET;
  if (!secret || secret.length < 32) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("AUTH_SECRET must be at least 32 characters in production.");
    }
    return new TextEncoder().encode("dev-only-insecure-secret-do-not-use-in-prod-32");
  }
  return new TextEncoder().encode(secret);
}
