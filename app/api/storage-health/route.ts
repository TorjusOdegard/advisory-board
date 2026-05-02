import { NextResponse } from "next/server"
import {
  getAdvisorStorageMode,
  kvConfigured,
  pingAdvisorRedis,
} from "@/lib/advisors/store"

export async function GET() {
  const mode = getAdvisorStorageMode()
  const redisPing = mode === "redis" ? await pingAdvisorRedis() : null

  const url = process.env.KV_REST_API_URL?.trim()
  let host: string | null = null
  try {
    host = url ? new URL(url).hostname : null
  } catch {
    host = null
  }

  return NextResponse.json({
    advisorStore: mode,
    kvConfigured: kvConfigured(),
    kvHost: host,
    hasKvToken: Boolean(process.env.KV_REST_API_TOKEN?.trim()),
    redisPing,
    hint:
      mode === "memory"
        ? "Advisors are stored in server memory — Slack and the dashboard can see different data on Vercel. Set KV_REST_API_URL (https://….upstash.io) and KV_REST_API_TOKEN from your Upstash Redis database."
        : undefined,
  })
}
