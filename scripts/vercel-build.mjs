import { spawnSync } from "node:child_process";

/**
 * Vercel runs this instead of `next build`. Production migrations run first, so the
 * new code never goes live against an older database. If a migration fails, the
 * build stops and the current production deployment stays online.
 */
function run(command, args) {
  const result = spawnSync(command, args, { stdio: "inherit", shell: process.platform === "win32" });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

if (process.env.VERCEL_ENV === "production") {
  run("npx", ["tsx", "scripts/migrate.ts"]);
}
run("npx", ["next", "build"]);
