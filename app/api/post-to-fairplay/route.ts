import { NextRequest, NextResponse } from "next/server";

/** Relays a signed X-ray challenge onto the FairPlay open-bets board. */
export async function POST(req: NextRequest) {
  const fairplay = process.env.NEXT_PUBLIC_FAIRPLAY_URL;
  if (!fairplay || fairplay === "#") return NextResponse.json({ error: "FairPlay not linked" }, { status: 503 });
  const body = await req.json();
  const r = await fetch(`${fairplay}/api/bets`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  const data = await r.json().catch(() => ({}));
  return NextResponse.json(data, { status: r.status });
}
