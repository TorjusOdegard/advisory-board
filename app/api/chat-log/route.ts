import { NextRequest, NextResponse } from "next/server"
import { listChatLogEntries } from "@/lib/chat-log"

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const limitParam = Number(searchParams.get("limit") || "50")
  const entries = listChatLogEntries(limitParam)
  return NextResponse.json({
    entries,
    count: entries.length,
  })
}
