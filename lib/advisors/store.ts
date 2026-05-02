import { Redis } from "@upstash/redis"
import type { Advisor, AdvisorCreateInput } from "./types"

const redis = new Redis({
  url: process.env.KV_REST_API_URL!,
  token: process.env.KV_REST_API_TOKEN!,
})

const ADVISORS_KEY = "advisory-board:advisors"

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .slice(0, 30)
}

export async function createAdvisor(input: AdvisorCreateInput): Promise<Advisor> {
  const id = slugify(input.name)
  const now = new Date().toISOString()

  const advisor: Advisor = {
    id,
    name: input.name,
    description: input.description || `AI advisor based on ${input.name}'s public knowledge and writing style.`,
    systemPrompt: generateSystemPrompt(input.name),
    knowledgeSources: input.url ? [input.url] : [],
    createdAt: now,
    updatedAt: now,
  }

  await redis.hset(ADVISORS_KEY, { [id]: JSON.stringify(advisor) })
  return advisor
}

export async function getAdvisor(id: string): Promise<Advisor | null> {
  const data = await redis.hget<string>(ADVISORS_KEY, id)
  if (!data) return null
  return JSON.parse(data) as Advisor
}

export async function listAdvisors(): Promise<Advisor[]> {
  const data = await redis.hgetall<Record<string, string>>(ADVISORS_KEY)
  if (!data) return []
  return Object.values(data).map((json) => JSON.parse(json) as Advisor)
}

export async function deleteAdvisor(id: string): Promise<boolean> {
  const result = await redis.hdel(ADVISORS_KEY, id)
  return result > 0
}

export async function updateAdvisor(id: string, updates: Partial<Advisor>): Promise<Advisor | null> {
  const existing = await getAdvisor(id)
  if (!existing) return null

  const updated: Advisor = {
    ...existing,
    ...updates,
    id: existing.id, // Prevent ID changes
    updatedAt: new Date().toISOString(),
  }

  await redis.hset(ADVISORS_KEY, { [id]: JSON.stringify(updated) })
  return updated
}

export async function addKnowledgeSource(id: string, url: string): Promise<Advisor | null> {
  const advisor = await getAdvisor(id)
  if (!advisor) return null

  if (!advisor.knowledgeSources.includes(url)) {
    advisor.knowledgeSources.push(url)
    return updateAdvisor(id, { knowledgeSources: advisor.knowledgeSources })
  }
  return advisor
}

function generateSystemPrompt(name: string): string {
  return `You are ${name}, responding as a virtual advisor on a startup founder's advisory board.

## Your Role
- Provide advice and perspective as ${name} would, based on their known philosophy, writing, and public statements
- Draw from the knowledge base of their essays, talks, and interviews
- Be direct, opinionated, and authentic to their voice and communication style
- When you don't have specific knowledge, reason from their known principles and worldview

## Guidelines
- Use first person ("I think...", "In my experience...")
- Reference specific essays, talks, or experiences when relevant
- Be willing to push back on bad ideas while being constructive
- Stay in character but acknowledge when a question is outside your expertise
- Keep responses focused and actionable for early-stage startup founders

## Context
You have access to a knowledge base of ${name}'s writings. Use the retrieve_knowledge tool to find relevant context before answering questions. Ground your answers in their actual ideas when possible.`
}
