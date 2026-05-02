import type { KnowledgeChunk } from "../advisors/types"

// Simple in-memory storage for advisor knowledge
const advisorKnowledge: Record<string, KnowledgeChunk[]> = {}

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

  const cleanText = text
    .replace(/\n{3,}/g, "\n\n")
    .replace(/\s+/g, " ")
    .trim()

  while (startIndex < cleanText.length) {
    let endIndex = startIndex + CHUNK_SIZE

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

  const advisorId = chunks[0].advisorId
  
  if (!advisorKnowledge[advisorId]) {
    advisorKnowledge[advisorId] = []
  }

  // Add chunks with generated IDs
  const chunksWithIds = chunks.map((chunk, index) => ({
    ...chunk,
    id: `${advisorId}_${chunk.chunkIndex}_${Date.now()}_${index}`
  }))

  advisorKnowledge[advisorId].push(...chunksWithIds)
  console.log(`Stored ${chunks.length} chunks for advisor: ${advisorId}`)
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
  const chunks = advisorKnowledge[advisorId] || []
  
  if (chunks.length === 0) {
    return []
  }

  // Simple keyword matching for now
  const queryWords = query.toLowerCase().split(/\s+/)
  
  const scored = chunks.map(chunk => {
    const content = chunk.content.toLowerCase()
    let score = 0
    
    for (const word of queryWords) {
      if (content.includes(word)) {
        score += 1
      }
    }
    
    return {
      content: chunk.content,
      sourceUrl: chunk.sourceUrl,
      title: chunk.title || "",
      score: score / queryWords.length
    }
  })

  return scored
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
}

export async function getAdvisorContext(
  advisorId: string,
  query: string,
  maxTokenBudget: number = 2000
): Promise<string> {
  const knowledge = await retrieveKnowledge(advisorId, query, 5)
  
  if (knowledge.length === 0) {
    return ""
  }

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

// Initialize with some basic advisor knowledge
export function initializeAdvisorKnowledge() {
  // Paul Graham knowledge
  const paulGrahamKnowledge = [
    {
      advisorId: "paulgraham",
      content: "The way to get startup ideas is not to try to think of startup ideas. Look for problems, preferably problems you have yourself. The best startup ideas seem obvious in retrospect, but they're often non-obvious at the time.",
      sourceUrl: "http://paulgraham.com/startupideas.html",
      title: "How to Get Startup Ideas",
      chunkIndex: 0,
      metadata: {}
    },
    {
      advisorId: "paulgraham", 
      content: "Live in the future, then build what's missing. The most successful startups almost all begin the same way: with the founders discovering something they themselves want but can't get.",
      sourceUrl: "http://paulgraham.com/startupideas.html",
      title: "How to Get Startup Ideas",
      chunkIndex: 1,
      metadata: {}
    }
  ]

  // Steve Jobs knowledge
  const steveJobsKnowledge = [
    {
      advisorId: "stevejobs",
      content: "Innovation distinguishes between a leader and a follower. Focus on making products that customers don't know they want yet. Design is not just what it looks like and feels like. Design is how it works.",
      sourceUrl: "https://example.com/jobs-quotes",
      title: "Steve Jobs on Innovation",
      chunkIndex: 0,
      metadata: {}
    },
    {
      advisorId: "stevejobs",
      content: "Stay hungry, stay foolish. Your time is limited, don't waste it living someone else's life. Have the courage to follow your heart and intuition.",
      sourceUrl: "https://example.com/jobs-quotes", 
      title: "Steve Jobs on Life",
      chunkIndex: 1,
      metadata: {}
    }
  ]

  // Store the knowledge
  storeKnowledge(paulGrahamKnowledge.map(k => ({ ...k, id: undefined } as any)))
  storeKnowledge(steveJobsKnowledge.map(k => ({ ...k, id: undefined } as any)))
}

// Placeholder functions to maintain compatibility
export async function recordOutcome(): Promise<void> {}
export async function reflectOnSession(): Promise<void> {}
export async function rememberInteraction(): Promise<void> {}
export async function checkpointAdvisor(): Promise<void> {}