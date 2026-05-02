import { after } from "next/server"
import { bot } from "@/lib/bot"
import { addChatLogEntry, summarizeIncomingPayload } from "@/lib/chat-log"

type Platform = keyof typeof bot.webhooks

export async function POST(
  request: Request,
  context: { params: Promise<{ platform: string }> }
) {
  const { platform } = await context.params
  let parsedBody: unknown = null
  try {
    parsedBody = await request.clone().json()
  } catch {
    // Some webhook payloads may not be JSON.
  }
  const summary = summarizeIncomingPayload(parsedBody)
  addChatLogEntry({
    platform,
    kind: "incoming",
    ...summary,
  })
  
  // Handle Slack URL verification challenge before checking for adapters
  if (platform === "slack") {
    try {
      const body = (parsedBody ?? (await request.clone().json())) as {
        type?: string
        challenge?: string
      }
      if (body.type === "url_verification" && body.challenge) {
        addChatLogEntry({
          platform,
          kind: "response",
          status: 200,
          eventType: "url_verification",
          detail: "Handled Slack URL verification challenge",
        })
        return Response.json({ challenge: body.challenge })
      }
    } catch {
      // Not JSON or not a challenge, continue to normal handler
    }
  }
  
  const handler = bot.webhooks[platform as Platform]

  if (!handler) {
    addChatLogEntry({
      platform,
      kind: "error",
      status: 503,
      detail: `Platform ${platform} not configured (missing environment variables)`,
      ...summary,
    })
    return new Response(`Platform ${platform} not configured (missing environment variables)`, { status: 503 })
  }

  try {
    const response = await handler(request, {
      waitUntil: (task) => after(() => task),
    })
    addChatLogEntry({
      platform,
      kind: "response",
      status: response.status,
      ...summary,
    })
    return response
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Unknown webhook handler error"
    addChatLogEntry({
      platform,
      kind: "error",
      status: 500,
      detail,
      ...summary,
    })
    throw error
  }
}
