import { Redis } from "@upstash/redis"
import type { Advisor, AdvisorCreateInput } from "./types"

const ADVISORS_KEY = "advisory-board:advisors"

function normalizeKvUrl(url: string): string | null {
  try {
    const u = new URL(url)
    return u.toString()
  } catch {
    return null
  }
}

/**
 * Upstash Redis REST: https://<name>-<id>.upstash.io with bearer token.
 * Placeholder hosts (e.g. global.upstash.io) or missing token → memory mode.
 */
export function kvConfigured(): boolean {
  // Check for Upstash Redis credentials first, then fall back to old format
  const rawUrl = (process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL)?.trim()
  const token = (process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN)?.trim()
  if (!rawUrl || !token) return false

  const url = normalizeKvUrl(rawUrl)
  if (!url) return false

  try {
    const host = new URL(url).hostname.toLowerCase()
    if (host === "global.upstash.io") return false
    if (!host.endsWith(".upstash.io")) return false
  } catch {
    return false
  }

  return true
}

let redis: Redis | null = null
function getRedis(): Redis | null {
  if (!kvConfigured()) return null
  if (!redis) {
    const url = (process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL)!.trim()
    const token = (process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN)!.trim()
    redis = new Redis({ url, token })
  }
  return redis
}

/** In-process fallback when Upstash env is not set (not durable on serverless). */
const memoryById = new Map<string, Advisor>()
let loggedMemoryFallback = false

function ensureMemoryModeLogged() {
  if (!loggedMemoryFallback && !kvConfigured()) {
    loggedMemoryFallback = true
    const url = (process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL)?.trim()
    const hasToken = Boolean((process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN)?.trim())
    let reason = "UPSTASH_REDIS_REST_URL/KV_REST_API_URL and UPSTASH_REDIS_REST_TOKEN/KV_REST_API_TOKEN must both be set to your Upstash Redis REST credentials."
    if (url?.includes("global.upstash.io")) {
      reason =
        "Redis URL looks like a placeholder (global.upstash.io). Use the REST URL from your Upstash database page (https://….upstash.io)."
    } else if (url && !hasToken) {
      reason = "Redis token is missing — Upstash will not receive writes."
    }
    console.warn(`[advisors/store] Using in-memory advisor storage. ${reason}`)
  }
}

export type AdvisorStorageMode = "redis" | "memory"

export function getAdvisorStorageMode(): AdvisorStorageMode {
  return kvConfigured() ? "redis" : "memory"
}

export async function pingAdvisorRedis(): Promise<{
  ok: boolean
  error?: string
}> {
  if (!kvConfigured()) return { ok: false, error: "Redis not configured" }
  const r = getRedis()
  if (!r) return { ok: false, error: "Redis client unavailable" }
  try {
    await r.hget(ADVISORS_KEY, "__ping__")
    return { ok: true }
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Redis request failed",
    }
  }
}

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

  const r = getRedis()
  if (r) {
    await r.hset(ADVISORS_KEY, { [id]: JSON.stringify(advisor) })
  } else {
    ensureMemoryModeLogged()
    memoryById.set(id, advisor)
  }
  return advisor
}

export async function getAdvisor(id: string): Promise<Advisor | null> {
  const r = getRedis()
  if (r) {
    const data = await r.hget<string>(ADVISORS_KEY, id)
    if (!data) return null
    return JSON.parse(data) as Advisor
  }
  ensureMemoryModeLogged()
  return memoryById.get(id) ?? null
}

export async function listAdvisors(): Promise<Advisor[]> {
  const r = getRedis()
  if (r) {
    const data = await r.hgetall<Record<string, string>>(ADVISORS_KEY)
    if (!data) return []
    return Object.values(data).map((json) => JSON.parse(json) as Advisor)
  }
  ensureMemoryModeLogged()
  return Array.from(memoryById.values())
}

export async function deleteAdvisor(id: string): Promise<boolean> {
  const r = getRedis()
  if (r) {
    const result = await r.hdel(ADVISORS_KEY, id)
    return result > 0
  }
  ensureMemoryModeLogged()
  return memoryById.delete(id)
}

export async function updateAdvisor(id: string, updates: Partial<Advisor>): Promise<Advisor | null> {
  const existing = await getAdvisor(id)
  if (!existing) return null

  const updated: Advisor = {
    ...existing,
    ...updates,
    id: existing.id,
    updatedAt: new Date().toISOString(),
  }

  const r = getRedis()
  if (r) {
    await r.hset(ADVISORS_KEY, { [id]: JSON.stringify(updated) })
  } else {
    ensureMemoryModeLogged()
    memoryById.set(id, updated)
  }
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
