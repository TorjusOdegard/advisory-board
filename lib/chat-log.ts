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

export function listChatLogEntries(limit = 50): ChatLogEntry[] {
  return entries.slice(0, Math.max(1, Math.min(limit, MAX_LOG_ENTRIES)))
}
