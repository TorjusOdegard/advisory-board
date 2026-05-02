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
      redisToken: !!process.env.KV_REST_API_TOKEN
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