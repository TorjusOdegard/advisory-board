import { NextRequest } from "next/server"
import { bot } from "@/lib/bot"

export async function GET() {
  return Response.json({
    availableWebhooks: Object.keys(bot.webhooks || {}),
    adapters: Object.keys(bot.adapters || {}),
    env: {
      slackToken: !!process.env.SLACK_BOT_TOKEN,
      slackSecret: !!process.env.SLACK_SIGNING_SECRET,
      redisUrl: !!process.env.KV_REST_API_URL,
      redisToken: !!process.env.KV_REST_API_TOKEN,
      upstashRedisUrl: !!process.env.UPSTASH_REDIS_REST_URL,
      upstashRedisToken: !!process.env.UPSTASH_REDIS_REST_TOKEN,
      upstashVectorUrl: !!process.env.UPSTASH_VECTOR_REST_URL,
      upstashVectorToken: !!process.env.UPSTASH_VECTOR_REST_TOKEN,
      aiGatewayKey: !!process.env.AI_GATEWAY_API_KEY,
      aiGatewayModel: !!process.env.AI_GATEWAY_MODEL,
      brightdataKey: !!process.env.BRIGHTDATA_API_KEY
    },
    envValues: {
      slackTokenPrefix: process.env.SLACK_BOT_TOKEN?.slice(0, 10) + "...",
      redisUrl: process.env.KV_REST_API_URL,
      upstashUrl: process.env.UPSTASH_REDIS_REST_URL,
      aiModel: process.env.AI_GATEWAY_MODEL,
      usingAiGateway: process.env.AI_GATEWAY_API_KEY ? true : false
    }
  })
}

export async function POST(request: NextRequest) {
  const body = await request.json()
  
  // Handle Slack URL verification challenge
  if (body.type === "url_verification" && body.challenge) {
    return Response.json({ challenge: body.challenge })
  }
  
  return Response.json({ received: body, timestamp: Date.now() })
}