import { createGateway, streamText, tool, wrapLanguageModel } from "ai"
import { mubitMemoryMiddleware } from "@mubit-ai/ai-sdk"
import { z } from "zod"
import type { Advisor } from "../advisors/types"
import {
  retrieveKnowledge,
  getAdvisorContext,
  rememberInteraction,
  recordOutcome,
} from "../knowledge/mubit-store"

/**
 * Model id from the AI Gateway catalog (`provider/model-name`).
 * Browse: https://vercel.com/ai-gateway/models — override with `AI_GATEWAY_MODEL`.
 */
const GATEWAY_MODEL_ID =
  process.env.AI_GATEWAY_MODEL ?? "anthropic/claude-sonnet-4.6"

const aiGateway = createGateway({
  apiKey:
    process.env.AI_GATEWAY_API_KEY ??
    process.env.VERCEL_OIDC_TOKEN ??
    "",
})

interface ConversationMessage {
  role: "user" | "assistant"
  content: string
}

/**
 * Create a model wrapped with Mubit memory middleware for an advisor
 * This automatically injects lessons and captures interactions
 */
function createAdvisorModel(advisorId: string) {
  return wrapLanguageModel({
    model: aiGateway(GATEWAY_MODEL_ID),
    middleware: mubitMemoryMiddleware({
      apiKey: process.env.MUBIT_API_KEY,
      sessionId: `advisor:${advisorId}`,
      agentId: advisorId,
    }),
  })
}

export async function generateAdvisorResponse(
  advisor: Advisor,
  question: string,
  conversationHistory: ConversationMessage[] = []
) {
  // Get pre-assembled context from Mubit (includes lessons learned)
  const mubitContext = await getAdvisorContext(advisor.id, question)

  // Build enhanced system prompt with Mubit context
  const enhancedSystemPrompt = mubitContext
    ? `${advisor.systemPrompt}\n\n---\nRelevant context from past interactions and lessons:\n${mubitContext}`
    : advisor.systemPrompt

  // Build messages array
  const messages: ConversationMessage[] = [
    ...conversationHistory,
    { role: "user" as const, content: question },
  ]

  // Use model with Mubit middleware for automatic memory capture
  const model = createAdvisorModel(advisor.id)

  const result = streamText({
    model,
    system: enhancedSystemPrompt,
    messages,
    tools: {
      retrieve_knowledge: tool({
        description: `Search ${advisor.name}'s knowledge base (essays, articles, talks) for relevant context. Use this before answering to ground your response in their actual ideas.`,
        inputSchema: z.object({
          query: z
            .string()
            .describe("The search query to find relevant knowledge"),
        }),
        execute: async ({ query }) => {
          const results = await retrieveKnowledge(advisor.id, query, 5)
          if (results.length === 0) {
            return {
              found: false,
              message:
                "No specific knowledge found. Answer based on general principles.",
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

  return result
}

/**
 * After a successful response, record the interaction for learning
 */
export async function recordAdvisorInteraction(
  advisorId: string,
  question: string,
  response: string,
  wasHelpful?: boolean
) {
  // Remember the interaction
  await rememberInteraction(advisorId, question, response)

  // If feedback provided, record the outcome
  if (wasHelpful !== undefined) {
    await recordOutcome(
      advisorId,
      `interaction-${Date.now()}`,
      wasHelpful ? "success" : "failure",
      wasHelpful
        ? "User found the response helpful"
        : "User indicated the response was not helpful"
    )
  }
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
