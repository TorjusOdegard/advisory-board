import { after } from "next/server"
import { bot } from "@/lib/bot"
import { addChatLogEntry, summarizeIncomingRequest } from "@/lib/chat-log"

type Platform = keyof typeof bot.webhooks

export async function POST(
  request: Request,
  context: { params: Promise<{ platform: string }> }
) {
  const { platform } = await context.params

  const { summary, jsonBody } = await summarizeIncomingRequest(request)
  
  // Log full payload for debugging
  const requestClone = request.clone()
  const bodyText = await requestClone.text()
  
  console.log(`[${platform}] Incoming webhook:`, {
    headers: Object.fromEntries(request.headers.entries()),
    bodyText: bodyText.slice(0, 500), // First 500 chars
    contentType: request.headers.get('content-type'),
    summary,
    jsonBody
  })
  
  addChatLogEntry({
    platform,
    kind: "incoming",
    ...summary,
    detail: `Body: ${bodyText.slice(0, 200)}...`
  })

  // Slack URL verification (JSON only)
  if (platform === "slack" && jsonBody && typeof jsonBody === "object") {
    const body = jsonBody as { type?: string; challenge?: string }
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
    return new Response(
      `Platform ${platform} not configured (missing environment variables)`,
      { status: 503 }
    )
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
    const detail =
      error instanceof Error ? error.message : "Unknown webhook handler error"
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
