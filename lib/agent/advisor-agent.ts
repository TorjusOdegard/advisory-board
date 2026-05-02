import { streamText, tool } from "ai"
import { z } from "zod"
import type { Advisor } from "../advisors/types"
import { retrieveKnowledge } from "../knowledge/vector-store"

const MODEL = "anthropic/claude-sonnet-4-20250514"

interface ConversationMessage {
  role: "user" | "assistant"
  content: string
}

export async function generateAdvisorResponse(
  advisor: Advisor,
  question: string,
  conversationHistory: ConversationMessage[] = []
) {
  // Build messages array
  const messages: ConversationMessage[] = [
    ...conversationHistory,
    { role: "user" as const, content: question },
  ]

  return streamText({
    model: MODEL,
    system: advisor.systemPrompt,
    messages,
    tools: {
      retrieve_knowledge: tool({
        description: `Search ${advisor.name}'s knowledge base (essays, articles, talks) for relevant context. Use this before answering to ground your response in their actual ideas.`,
        inputSchema: z.object({
          query: z.string().describe("The search query to find relevant knowledge"),
        }),
        execute: async ({ query }) => {
          const results = await retrieveKnowledge(advisor.id, query, 5)
          if (results.length === 0) {
            return {
              found: false,
              message: "No specific knowledge found. Answer based on general principles.",
            }
          }

          return {
            found: true,
            sources: results.map((r) => ({
              content: r.content,
              source: r.sourceUrl,
              title: r.title,
              relevance: Math.round(r.score * 100),
            })),
          }
        },
      }),
    },
    maxSteps: 3,
  })
}

export function formatSourcesForSlack(
  sources: Array<{ sourceUrl: string; title: string }>
): string {
  const uniqueSources = Array.from(
    new Map(sources.map((s) => [s.sourceUrl, s])).values()
  ).slice(0, 3)

  if (uniqueSources.length === 0) return ""

  const sourceLinks = uniqueSources
    .map((s) => `• <${s.sourceUrl}|${s.title || "Source"}>`)
    .join("\n")

  return `\n\n_Sources:_\n${sourceLinks}`
}
