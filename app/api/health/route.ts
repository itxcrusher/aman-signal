import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Liveness and readiness. Reports what is actually wired rather than returning a
 * bare 200: a deployment that cannot reach its database or has no model credential
 * looks healthy from the outside while being unable to accept a single report.
 */
export async function GET() {
  const checks: Record<string, { ok: boolean; detail?: string }> = {};

  try {
    const row = db().prepare("SELECT COUNT(*) AS n FROM incidents").get() as { n: number };
    checks.database = { ok: true, detail: `${row.n} incident(s)` };
  } catch (err) {
    checks.database = { ok: false, detail: (err as Error).message };
  }

  checks.model_credential = process.env.DASHSCOPE_API_KEY
    ? { ok: true, detail: "configured" }
    : { ok: false, detail: "DASHSCOPE_API_KEY is not set; reports cannot be processed" };

  const ok = Object.values(checks).every((c) => c.ok);
  return NextResponse.json(
    { status: ok ? "ok" : "degraded", checks, time: new Date().toISOString() },
    { status: ok ? 200 : 503 },
  );
}
