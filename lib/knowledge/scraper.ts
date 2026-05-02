import { chunkText, storeKnowledge } from "./upstash-store"
import { addKnowledgeSource } from "../advisors/store"

// Brightdata MCP API  
const BRIGHTDATA_MCP_URL = `https://mcp.brightdata.com/mcp?token=${process.env.BRIGHTDATA_API_KEY}`

let sessionId: string | null = null

async function initializeBrightDataSession(): Promise<string> {
  if (sessionId) return sessionId
  
  const response = await fetch(BRIGHTDATA_MCP_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      method: "initialize",
      params: {
        protocolVersion: "2024-11-05",
        capabilities: {
          tools: {}
        },
        clientInfo: {
          name: "advisory-board",
          version: "1.0.0"
        }
      },
      id: 1,
    }),
  })

  const data = await response.json()
  
  if (data.error) {
    throw new Error(`Failed to initialize Brightdata session: ${data.error.message}`)
  }
  
  // Generate a session ID (some MCPs require this)
  sessionId = `session_${Date.now()}_${Math.random().toString(36).slice(2)}`
  return sessionId
}

interface ScrapeResult {
  url: string
  markdown: string
  title?: string
  success: boolean
  error?: string
}

interface DiscoverResult {
  urls: string[]
}

async function callBrightDataMCP(method: string, params: Record<string, unknown>): Promise<any> {
  // Initialize session if needed
  const currentSessionId = await initializeBrightDataSession()
  
  const response = await fetch(BRIGHTDATA_MCP_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Session-ID": currentSessionId, // Add session ID as header
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      method: `tools/${method}`,
      params: {
        ...params,
        _sessionId: currentSessionId, // Also try as parameter
      },
      id: Date.now(),
    }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Brightdata MCP error (${response.status}): ${errorText}`)
  }

  const data = await response.json()
  
  if (data.error) {
    throw new Error(`Brightdata MCP error: ${data.error.message}`)
  }

  return data.result
}

export async function scrapeUrl(url: string): Promise<ScrapeResult> {
  try {
    const result = await callBrightDataMCP("scrape_as_markdown", { url })

    return {
      url,
      markdown: result.markdown || result.content || "",
      title: result.title,
      success: true,
    }
  } catch (error) {
    return {
      url,
      markdown: "",
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    }
  }
}

export async function scrapeMultipleUrls(urls: string[]): Promise<ScrapeResult[]> {
  // For now, scrape individually - can be optimized later with batch API
  const results = []
  for (const url of urls) {
    try {
      const result = await scrapeUrl(url)
      results.push(result)
      // Small delay to avoid rate limits
      await new Promise(resolve => setTimeout(resolve, 100))
    } catch (error) {
      console.error(`Failed to scrape ${url}:`, error)
      results.push({
        url,
        markdown: "",
        success: false,
        error: error instanceof Error ? error.message : "Unknown error"
      })
    }
  }
  return results
}

export async function discoverUrls(
  baseUrl: string,
  description: string
): Promise<string[]> {
  try {
    const result = await callBrightDataMCP("discover", {
      url: baseUrl,
      description,
      max_urls: 50,
    })
    return result.urls || [baseUrl]
  } catch (error) {
    console.error("Failed to discover URLs:", error)
    return [baseUrl] // Fall back to just the base URL
  }
}

export interface IngestResult {
  advisorId: string
  url: string
  pagesScraped: number
  chunksCreated: number
  success: boolean
  error?: string
}

export async function ingestKnowledgeForAdvisor(
  advisorId: string,
  url: string,
  discoverMore: boolean = true
): Promise<IngestResult> {
  try {
    let urlsToScrape: string[] = [url]

    // Discover more URLs if this looks like an index page
    if (discoverMore) {
      const isIndexPage =
        url.includes("articles") ||
        url.includes("essays") ||
        url.includes("blog") ||
        url.includes("posts") ||
        url.endsWith("/")

      if (isIndexPage) {
        const discovered = await discoverUrls(
          url,
          "Find all article, essay, and blog post links"
        )
        urlsToScrape = [...new Set([...urlsToScrape, ...discovered])]
      }
    }

    // Scrape all URLs
    const scrapeResults = await scrapeMultipleUrls(urlsToScrape)
    const successfulScrapes = scrapeResults.filter((r) => r.success && r.markdown)

    // Chunk and store all content
    let totalChunks = 0
    for (const scrape of successfulScrapes) {
      const chunks = chunkText(scrape.markdown, scrape.url, advisorId, scrape.title)
      await storeKnowledge(chunks)
      totalChunks += chunks.length
    }

    // Update advisor's knowledge sources
    await addKnowledgeSource(advisorId, url)

    return {
      advisorId,
      url,
      pagesScraped: successfulScrapes.length,
      chunksCreated: totalChunks,
      success: true,
    }
  } catch (error) {
    return {
      advisorId,
      url,
      pagesScraped: 0,
      chunksCreated: 0,
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    }
  }
}
