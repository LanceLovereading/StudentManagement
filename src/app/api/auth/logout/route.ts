import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { errorResponse } from "@/lib/errors";

export async function POST() {
  try {
    const s = await getSession();
    s.destroy();
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
