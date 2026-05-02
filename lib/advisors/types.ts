export interface Advisor {
  id: string // e.g., "paulgraham" - slug for commands
  name: string // "Paul Graham" - display name
  description: string // Brief bio
  systemPrompt: string // AI persona instructions
  knowledgeSources: string[] // URLs that have been scraped
  createdAt: string // ISO date string
  updatedAt: string // ISO date string
}

export interface KnowledgeChunk {
  id: string
  advisorId: string
  content: string
  sourceUrl: string
  title?: string
  chunkIndex: number
  metadata?: Record<string, unknown>
}

export interface AdvisorCreateInput {
  name: string
  description?: string
  url?: string // Optional initial knowledge source
}

export interface AskAdvisorInput {
  advisorId: string
  question: string
  conversationHistory?: Array<{
    role: "user" | "assistant"
    content: string
  }>
}
