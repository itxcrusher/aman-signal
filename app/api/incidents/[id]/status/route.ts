import { NextRequest, NextResponse } from "next/server";
import { setIncidentStatus } from "@/lib/db";
import { STATUS_FLOW } from "@/lib/incident";

export const runtime = "nodejs";

/**
 * Status transitions are made by a person, never by the model. The operator's
 * identity is required and recorded, so the audit trail can always answer who
 * decided what.
 */
export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  let body: { status?: string; operator?: string; assigned_to?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "expected JSON" }, { status: 400 });
  }

  const status = body.status;
  const operator = body.operator?.trim();

  if (!status || !(STATUS_FLOW as readonly string[]).includes(status)) {
    return NextResponse.json(
      { error: `status must be one of: ${STATUS_FLOW.join(", ")}` },
      { status: 400 },
    );
  }
  if (!operator) {
    return NextResponse.json(
      { error: "operator is required: every status change is attributed to a person" },
      { status: 400 },
    );
  }

  try {
    setIncidentStatus(id, status, `operator:${operator}`, body.assigned_to?.trim() || undefined);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
  return NextResponse.json({ id, status, operator });
}
