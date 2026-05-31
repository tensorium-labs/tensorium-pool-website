import { NextRequest, NextResponse } from "next/server";
import { getMinerPending } from "@/lib/pool";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const address = request.nextUrl.searchParams.get("address") ?? "";

  try {
    return NextResponse.json(await getMinerPending(address));
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "miner lookup failed"
      },
      { status: 400 }
    );
  }
}
