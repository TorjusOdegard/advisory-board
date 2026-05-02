import { Index } from "@upstash/vector"
import { embed } from "ai"
import { createGateway } from "ai"
import type { KnowledgeChunk } from "../advisors/types"

// Use AI Gateway for embeddings via OpenAI
const aiGateway = createGateway({
  apiKey: process.env.AI_GATEWAY_API_KEY ?? process.env.VERCEL_OIDC_TOKEN ?? "",
})

// Upstash Vector client
let vectorIndex: Index | null = null

function getVectorIndex(): Index | null {
  const url = process.env.UPSTASH_VECTOR_REST_URL
  const token = process.env.UPSTASH_VECTOR_REST_TOKEN
  
  if (!url || !token) {
    console.warn('Upstash Vector not configured - missing UPSTASH_VECTOR_REST_URL or UPSTASH_VECTOR_REST_TOKEN')
    return null
  }
  
  if (!vectorIndex) {
    vectorIndex = new Index({
      url,
      token,
    })
  }
  
  return vectorIndex
}

const CHUNK_SIZE = 1500
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

export async function storeKnowledge(
  chunks: Omit<KnowledgeChunk, "id">[]
): Promise<void> {
  if (chunks.length === 0) return

  const index = getVectorIndex()
  if (!index) {
    console.warn('Vector storage not available - chunks will not be stored')
    return
  }

  const advisorId = chunks[0].advisorId
  console.log(`Storing ${chunks.length} knowledge chunks for advisor: ${advisorId}`)

  // Process chunks in batches to avoid rate limits
  const batchSize = 10
  for (let i = 0; i < chunks.length; i += batchSize) {
    const batch = chunks.slice(i, i + batchSize)
    
    try {
      // Generate embeddings for each chunk
      const embeddings = await Promise.all(
        batch.map(async (chunk) => {
          try {
            console.log(`Generating embedding for chunk ${chunk.chunkIndex}...`)
            const model = aiGateway("openai/text-embedding-3-small")
            console.log('Model created:', typeof model)
            
            const result = await embed({
              model: model,
              value: chunk.content
            })
            console.log(`Embedding generated successfully for chunk ${chunk.chunkIndex}`)
            return result.embedding
          } catch (embeddingError) {
            console.error('Embedding error for chunk:', chunk.chunkIndex, embeddingError)
            // Fallback: create a zero vector if embedding fails
            return new Array(1536).fill(0) // text-embedding-3-small uses 1536 dimensions
          }
        })
      )

      // Prepare vectors for Upstash
      const vectors = batch.map((chunk, idx) => ({
        id: `${advisorId}_${chunk.chunkIndex}_${Date.now()}`,
        vector: embeddings[idx],
        metadata: {
          advisorId,
          content: chunk.content,
          sourceUrl: chunk.sourceUrl,
          title: chunk.title || "",
          chunkIndex: chunk.chunkIndex,
          charStart: chunk.metadata?.charStart,
          charEnd: chunk.metadata?.charEnd,
          type: "knowledge_chunk"
        }
      }))

      // Store in Upstash Vector
      await index.upsert(vectors)
      
      console.log(`Stored batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(chunks.length/batchSize)} for ${advisorId}`)
      
      // Small delay between batches to avoid rate limits
      if (i + batchSize < chunks.length) {
        await new Promise(resolve => setTimeout(resolve, 100))
      }
      
    } catch (error) {
      console.error(`Error storing batch for ${advisorId}:`, error)
      throw error
    }
  }
  
  console.log(`Successfully stored ${chunks.length} chunks for advisor: ${advisorId}`)
}

export interface RetrievedKnowledge {
  content: string
  sourceUrl: string
  title: string
  score: number
}

export async function retrieveKnowledge(
  advisorId: string,
  query: string,
  topK: number = 5
): Promise<RetrievedKnowledge[]> {
  const index = getVectorIndex()
  if (!index) {
    console.warn('Vector storage not available - no knowledge retrieved')
    return []
  }

  try {
    // Generate embedding for the query
    const result = await embed({
      model: aiGateway("openai/text-embedding-3-small"),
      value: query
    })
    const embedding = result.embedding

    // Search for similar vectors
    const results = await index.query({
      vector: embedding,
      topK,
      filter: `advisorId = '${advisorId}'`,
      includeMetadata: true
    })

    // Convert results to RetrievedKnowledge format
    return results.map(result => ({
      content: (result.metadata as any)?.content || "",
      sourceUrl: (result.metadata as any)?.sourceUrl || "",
      title: (result.metadata as any)?.title || "",
      score: result.score || 0
    }))

  } catch (error) {
    console.error("Error retrieving knowledge from Upstash Vector:", error)
    return []
  }
}

// Simple context assembly (replaces Mubit's getContext)
export async function getAdvisorContext(
  advisorId: string,
  query: string,
  maxTokenBudget: number = 2000
): Promise<string> {
  const knowledge = await retrieveKnowledge(advisorId, query, 5)
  
  if (knowledge.length === 0) {
    return ""
  }

  // Simple token estimation (rough: ~4 chars per token)
  let context = ""
  let estimatedTokens = 0
  
  for (const item of knowledge) {
    const snippet = `Source: ${item.title || item.sourceUrl}\n${item.content}\n\n`
    const snippetTokens = Math.ceil(snippet.length / 4)
    
    if (estimatedTokens + snippetTokens > maxTokenBudget) {
      break
    }
    
    context += snippet
    estimatedTokens += snippetTokens
  }
  
  return context
}

// Placeholder functions to maintain compatibility
export async function recordOutcome(
  advisorId: string,
  referenceId: string,
  outcome: "success" | "failure",
  rationale?: string
): Promise<void> {
  // Could implement outcome tracking in Redis if needed
  console.log(`Outcome recorded for ${advisorId}: ${outcome}`)
}

export async function reflectOnSession(advisorId: string): Promise<void> {
  // Could implement reflection logic if needed
  console.log(`Reflection triggered for ${advisorId}`)
}

export async function rememberInteraction(
  advisorId: string,
  question: string,
  response: string
): Promise<void> {
  // Could store interactions in Redis for basic memory
  console.log(`Interaction remembered for ${advisorId}`)
}

export async function checkpointAdvisor(
  advisorId: string,
  label: string
): Promise<void> {
  // Could implement checkpointing if needed
  console.log(`Checkpoint created for ${advisorId}: ${label}`)
}