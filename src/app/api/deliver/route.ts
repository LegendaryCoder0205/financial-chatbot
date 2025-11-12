import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/db";
import { deliverStructuredData } from "@/lib/email";

export async function POST(req: NextRequest) {
  try {
    const { sessionId } = (await req.json()) as { sessionId: string };
    const session = getSession(sessionId);
    if (!session)
      return NextResponse.json({ error: "Session not found" }, { status: 404 });

    const subject = `FinancialBot Session ${session.id}`;
    const body = [
      `Session: ${session.id}`,
      `Created: ${new Date(session.createdAt).toISOString()}`,
      `Name: ${session.name ?? ""}`,
      `Email: ${session.email ?? ""}`,
      `Income: ${session.income ?? ""}`,
    ].join("\n");

    const result = await deliverStructuredData(subject, body);
    return NextResponse.json(result);
  } catch (e: any) {
    return NextResponse.json(
      { error: e.message || "Unknown error" },
      { status: 500 }
    );
  }
}
