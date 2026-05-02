import { after } from "next/server"
import { bot } from "@/lib/bot"

type Platform = keyof typeof bot.webhooks

export async function POST(
  request: Request,
  context: { params: Promise<{ platform: string }> }
) {
  const { platform } = await context.params
  
  // Handle Slack URL verification challenge before checking for adapters
  if (platform === "slack") {
    try {
      const body = await request.clone().json()
      if (body.type === "url_verification" && body.challenge) {
        return Response.json({ challenge: body.challenge })
      }
    } catch (error) {
      // Not JSON or not a challenge, continue to normal handler
    }
  }
  
  const handler = bot.webhooks[platform as Platform]

  if (!handler) {
    return new Response(`Platform ${platform} not configured (missing environment variables)`, { status: 503 })
  }

  return handler(request, {
    waitUntil: (task) => after(() => task),
  })
}
