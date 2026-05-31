import { NextResponse } from "next/server";
import { getPoolSnapshot } from "@/lib/pool";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(await getPoolSnapshot());
}
