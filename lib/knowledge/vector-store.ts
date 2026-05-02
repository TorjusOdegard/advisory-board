import { Index } from "@upstash/vector"
import { embed, embedMany } from "ai"
import type { KnowledgeChunk } from "../advisors/types"

const index = new Index({
  url: process.env.UPSTASH_VECTOR_REST_URL!,
  token: process.env.UPSTASH_VECTOR_REST_TOKEN!,
})

const EMBEDDING_MODEL = "openai/text-embedding-3-small"
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

export async function storeKnowledge(
  chunks: Omit<KnowledgeChunk, "id">[]
): Promise<void> {
  if (chunks.length === 0) return

  // Generate embeddings for all chunks
  const { embeddings } = await embedMany({
    model: EMBEDDING_MODEL,
    values: chunks.map((c) => c.content),
  })

  // Prepare vectors for upsert
  const vectors = chunks.map((chunk, i) => ({
    id: `${chunk.advisorId}-${chunk.sourceUrl}-${chunk.chunkIndex}`,
    vector: embeddings[i],
    metadata: {
      advisorId: chunk.advisorId,
      content: chunk.content,
      sourceUrl: chunk.sourceUrl,
      title: chunk.title || "",
      chunkIndex: chunk.chunkIndex,
    },
  }))

  // Upsert in batches of 100
  const BATCH_SIZE = 100
  for (let i = 0; i < vectors.length; i += BATCH_SIZE) {
    const batch = vectors.slice(i, i + BATCH_SIZE)
    await index.upsert(batch)
  }
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
  // Generate embedding for the query
  const { embedding } = await embed({
    model: EMBEDDING_MODEL,
    value: query,
  })

  // Query the vector store with filter
  const results = await index.query({
    vector: embedding,
    topK,
    filter: `advisorId = '${advisorId}'`,
    includeMetadata: true,
  })

  return results.map((r) => ({
    content: (r.metadata?.content as string) || "",
    sourceUrl: (r.metadata?.sourceUrl as string) || "",
    title: (r.metadata?.title as string) || "",
    score: r.score,
  }))
}

export async function deleteAdvisorKnowledge(advisorId: string): Promise<void> {
  // Delete all vectors for this advisor
  // Note: Upstash Vector doesn't have a direct delete-by-filter,
  // so we query first then delete by IDs
  const results = await index.query({
    vector: new Array(1536).fill(0), // Dummy vector
    topK: 10000,
    filter: `advisorId = '${advisorId}'`,
  })

  if (results.length > 0) {
    const ids = results.map((r) => r.id)
    const BATCH_SIZE = 100
    for (let i = 0; i < ids.length; i += BATCH_SIZE) {
      const batch = ids.slice(i, i + BATCH_SIZE)
      await index.delete(batch)
    }
  }
}
