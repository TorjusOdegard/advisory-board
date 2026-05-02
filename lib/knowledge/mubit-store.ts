import { Client } from "@mubit-ai/sdk"
import type { KnowledgeChunk } from "../advisors/types"

// Initialize Mubit client
const client = new Client({
  api_key: process.env.MUBIT_API_KEY,
})

const CHUNK_SIZE = 1500 // Characters per chunk
const CHUNK_OVERLAP = 200

export function chunkText(
  text: string,
  sourceUrl: string,
  advisorId: string,
  title?: string
): Omit<KnowledgeChunk, "id">[] {
  const chunks: Omit<KnowledgeChunk, "id">[] = []
  let startIndex = 0
  let chunkIndex = 0

  // Clean up text
  const cleanText = text
    .replace(/\n{3,}/g, "\n\n")
    .replace(/\s+/g, " ")
    .trim()

  while (startIndex < cleanText.length) {
    let endIndex = startIndex + CHUNK_SIZE

    // Try to find a natural break point
    if (endIndex < cleanText.length) {
      const searchArea = cleanText.slice(endIndex - 100, endIndex + 100)
      const periodIndex = searchArea.lastIndexOf(". ")
      const newlineIndex = searchArea.lastIndexOf("\n")

      const bestBreak = Math.max(periodIndex, newlineIndex)
      if (bestBreak > -1) {
        endIndex = endIndex - 100 + bestBreak + 1
      }
    }

    const content = cleanText.slice(startIndex, endIndex).trim()

    if (content.length > 50) {
      chunks.push({
        advisorId,
        content,
        sourceUrl,
        title,
        chunkIndex,
        metadata: {
          charStart: startIndex,
          charEnd: endIndex,
        },
      })
      chunkIndex++
    }

    startIndex = endIndex - CHUNK_OVERLAP
    if (startIndex >= cleanText.length - 50) break
  }

  return chunks
}

/**
 * Store knowledge chunks in Mubit memory
 * Each advisor has their own session scope for isolated memory
 */
export async function storeKnowledge(
  chunks: Omit<KnowledgeChunk, "id">[]
): Promise<void> {
  if (chunks.length === 0) return

  const advisorId = chunks[0].advisorId
  const sessionId = `advisor:${advisorId}`

  // Store each chunk as a fact in Mubit
  for (const chunk of chunks) {
    await client.remember({
      session_id: sessionId,
      agent_id: advisorId,
      content: chunk.content,
      intent: "fact",
      metadata: {
        sourceUrl: chunk.sourceUrl,
        title: chunk.title || "",
        chunkIndex: chunk.chunkIndex,
        type: "knowledge_chunk",
      },
    })
  }
}

export interface RetrievedKnowledge {
  content: string
  sourceUrl: string
  title: string
  score: number
}

/**
 * Retrieve relevant knowledge for an advisor using Mubit's semantic recall
 */
export async function retrieveKnowledge(
  advisorId: string,
  query: string,
  topK: number = 5
): Promise<RetrievedKnowledge[]> {
  const sessionId = `advisor:${advisorId}`

  try {
    // Use Mubit's recall for semantic search
    const result = await client.recall({
      session_id: sessionId,
      query,
      entry_types: ["fact"],
    })

    // Parse the evidence from the response
    const evidence = result.evidence || []

    return evidence.slice(0, topK).map((e: Record<string, unknown>) => ({
      content: (e.content as string) || "",
      sourceUrl: (e.metadata as Record<string, unknown>)?.sourceUrl as string || "",
      title: (e.metadata as Record<string, unknown>)?.title as string || "",
      score: (e.score as number) || 0.5,
    }))
  } catch (error) {
    console.error("Error retrieving knowledge from Mubit:", error)
    return []
  }
}

/**
 * Get assembled context for an advisor using Mubit's getContext
 * This returns a token-budgeted context block with lessons, facts, and rules
 */
export async function getAdvisorContext(
  advisorId: string,
  query: string,
  maxTokenBudget: number = 2000
): Promise<string> {
  const sessionId = `advisor:${advisorId}`

  try {
    const context = await client.getContext({
      session_id: sessionId,
      query,
      mode: "summary",
      max_token_budget: maxTokenBudget,
    })

    // Combine section summaries into a single context string
    const summaries = context.section_summaries || []
    if (summaries.length === 0) {
      return ""
    }

    return summaries.join("\n\n")
  } catch (error) {
    console.error("Error getting context from Mubit:", error)
    return ""
  }
}

/**
 * Record an outcome for learning - helps advisors improve over time
 */
export async function recordOutcome(
  advisorId: string,
  referenceId: string,
  outcome: "success" | "failure",
  rationale?: string
): Promise<void> {
  const sessionId = `advisor:${advisorId}`

  try {
    await client.recordOutcome({
      session_id: sessionId,
      reference_id: referenceId,
      outcome,
      rationale,
    })
  } catch (error) {
    console.error("Error recording outcome:", error)
  }
}

/**
 * Trigger reflection to extract lessons from interactions
 */
export async function reflectOnSession(advisorId: string): Promise<void> {
  const sessionId = `advisor:${advisorId}`

  try {
    await client.reflect({
      session_id: sessionId,
    })
  } catch (error) {
    console.error("Error reflecting on session:", error)
  }
}

/**
 * Remember an interaction (question and response) for learning
 */
export async function rememberInteraction(
  advisorId: string,
  question: string,
  response: string
): Promise<void> {
  const sessionId = `advisor:${advisorId}`

  // Store the interaction as a trace
  await client.remember({
    session_id: sessionId,
    agent_id: advisorId,
    content: `User asked: "${question}"\n\nResponse: "${response}"`,
    intent: "trace",
    metadata: {
      type: "conversation",
      question,
    },
  })
}

/**
 * Checkpoint the advisor's memory state
 */
export async function checkpointAdvisor(
  advisorId: string,
  label: string
): Promise<void> {
  const sessionId = `advisor:${advisorId}`

  try {
    await client.checkpoint({
      session_id: sessionId,
      snapshot: label,
      label,
    })
  } catch (error) {
    console.error("Error checkpointing:", error)
  }
}
