"use server";

import { NextResponse } from "next/server";
import { getSession } from "@/lib/db";

type RouteParams = {
  params: {
    id: string;
  };
};

export async function GET(_: Request, { params }: RouteParams) {
  try {
    const session = getSession(params.id);
    if (!session) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }
    return NextResponse.json({
      id: session.id,
      name: session.name,
      email: session.email,
      income: session.income,
      createdAt: session.createdAt,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message ?? "Unknown error" },
      { status: 500 }
    );
  }
}
