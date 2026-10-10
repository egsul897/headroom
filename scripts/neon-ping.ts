import { PrismaClient } from "@prisma/client";

async function tryUrl(label: string, url: string) {
  const p = new PrismaClient({
    datasources: { db: { url } },
    log: ["error"],
  });
  try {
    const n = await p.company.count();
    console.log(label, "OK companies=", n);
    return true;
  } catch (e) {
    const err = e as { code?: string; message?: string };
    console.log(label, "FAIL", err.code, String(err.message || e).slice(0, 280));
    return false;
  } finally {
    await p.$disconnect().catch(() => undefined);
  }
}

async function main() {
  const base = process.env.DATABASE_URL;
  if (!base) {
    console.log("NO_DATABASE_URL");
    process.exit(2);
  }
  const withSsl = base.includes("sslmode=")
    ? base
    : base + (base.includes("?") ? "&" : "?") + "sslmode=require&connect_timeout=10";
  const channel = withSsl.includes("channel_binding")
    ? withSsl
    : withSsl + "&channel_binding=require";

  const ok =
    (await tryUrl("raw", base)) ||
    (await tryUrl("sslmode", withSsl)) ||
    (await tryUrl("channel_binding", channel));

  if (!ok) process.exit(2);
}

main();
