export interface ChatLogEntry {
  id: string
  timestamp: string
  platform: string
  kind: "incoming" | "response" | "error"
  eventType?: string
  command?: string
  textPreview?: string
  status?: number
  detail?: string
}

const MAX_LOG_ENTRIES = 200
const entries: ChatLogEntry[] = []

function trimPreview(text: string, max = 120): string {
  return text.length > max ? `${text.slice(0, max)}...` : text
}

export function addChatLogEntry(entry: Omit<ChatLogEntry, "id" | "timestamp">) {
  entries.unshift({
    ...entry,
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    timestamp: new Date().toISOString(),
  })
  if (entries.length > MAX_LOG_ENTRIES) {
    entries.length = MAX_LOG_ENTRIES
  }
}

export function summarizeIncomingPayload(payload: unknown): {
  eventType?: string
  command?: string
  textPreview?: string
} {
  if (!payload || typeof payload !== "object") return {}
  const body = payload as Record<string, unknown>

  const eventType =
    (typeof body.type === "string" && body.type) ||
    (typeof body.event === "object" &&
    body.event &&
    typeof (body.event as Record<string, unknown>).type === "string"
      ? ((body.event as Record<string, unknown>).type as string)
      : undefined)

  const command = typeof body.command === "string" ? body.command : undefined

  const textRaw =
    (typeof body.text === "string" && body.text) ||
    (typeof body.event === "object" &&
    body.event &&
    typeof (body.event as Record<string, unknown>).text === "string"
      ? ((body.event as Record<string, unknown>).text as string)
      : undefined)

  return {
    eventType,
    command,
    textPreview: textRaw ? trimPreview(textRaw) : undefined,
  }
}

/**
 * Slack sends JSON for Events API + URL verification, but slash commands and
 * some interactions are `application/x-www-form-urlencoded`. Parse a clone so
 * the original Request body is still available for signature verification.
 */
export async function summarizeIncomingRequest(request: Request): Promise<{
  summary: ReturnType<typeof summarizeIncomingPayload>
  jsonBody: unknown | null
}> {
  const clone = request.clone()
  const ct = (clone.headers.get("content-type") || "").toLowerCase()

  if (ct.includes("application/json")) {
    try {
      const jsonBody = await clone.json()
      return {
        jsonBody,
        summary: summarizeIncomingPayload(jsonBody),
      }
    } catch {
      return { jsonBody: null, summary: {} }
    }
  }

  if (ct.includes("application/x-www-form-urlencoded")) {
    try {
      const raw = await clone.text()
      const params = new URLSearchParams(raw)
      const command = params.get("command") ?? undefined
      const textField = params.get("text") ?? undefined
      const type = params.get("type") ?? undefined
      const triggerId = params.get("trigger_id")
      return {
        jsonBody: null,
        summary: {
          eventType: type ?? (triggerId ? "slash_or_interaction" : undefined),
          command,
          textPreview: textField ? trimPreview(textField) : undefined,
        },
      }
    } catch {
      return { jsonBody: null, summary: {} }
    }
  }

  if (ct.includes("multipart/form-data")) {
    try {
      const fd = await clone.formData()
      const command = fd.get("command")
      const textField = fd.get("text")
      const type = fd.get("type")
      return {
        jsonBody: null,
        summary: {
          eventType: typeof type === "string" ? type : undefined,
          command: typeof command === "string" ? command : undefined,
          textPreview:
            typeof textField === "string" ? trimPreview(textField) : undefined,
        },
      }
    } catch {
      return { jsonBody: null, summary: {} }
    }
  }

  return { jsonBody: null, summary: {} }
}

export function listChatLogEntries(limit = 50): ChatLogEntry[] {
  return entries.slice(0, Math.max(1, Math.min(limit, MAX_LOG_ENTRIES)))
}
