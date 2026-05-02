import { kvConfigured, getAdvisorStorageMode, pingAdvisorRedis } from "@/lib/advisors/store"

export async function GET() {
  const isConfigured = kvConfigured()
  const mode = getAdvisorStorageMode()
  
  let redisStatus = null
  if (isConfigured) {
    redisStatus = await pingAdvisorRedis()
  }
  
  return Response.json({
    configured: isConfigured,
    storageMode: mode,
    redis: redisStatus,
    env: {
      upstashUrl: !!process.env.UPSTASH_REDIS_REST_URL,
      upstashToken: !!process.env.UPSTASH_REDIS_REST_TOKEN,
      kvUrl: !!process.env.KV_REST_API_URL,
      kvToken: !!process.env.KV_REST_API_TOKEN
    },
    urls: {
      upstash: process.env.UPSTASH_REDIS_REST_URL?.slice(0, 30) + "...",
      kv: process.env.KV_REST_API_URL
    }
  })
}