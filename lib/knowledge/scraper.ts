import { chunkText, storeKnowledge } from "./upstash-store"
import { addKnowledgeSource } from "../advisors/store"

const BRIGHTDATA_API_URL = "https://api.brightdata.com/mcp"

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

async function callBrightDataMCP<T>(
  tool: string,
  params: Record<string, unknown>
): Promise<T> {
  const response = await fetch(BRIGHTDATA_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.BRIGHTDATA_API_KEY}`,
    },
    body: JSON.stringify({
      tool,
      params,
    }),
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Bright Data MCP error: ${error}`)
  }

  return response.json() as Promise<T>
}

export async function scrapeUrl(url: string): Promise<ScrapeResult> {
  try {
    const result = await callBrightDataMCP<{ markdown: string; title?: string }>(
      "scrape_as_markdown",
      { url }
    )

    return {
      url,
      markdown: result.markdown,
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
  try {
    const result = await callBrightDataMCP<{ results: ScrapeResult[] }>(
      "scrape_batch",
      { urls }
    )
    return result.results
  } catch (error) {
    // Fall back to individual scraping
    return Promise.all(urls.map(scrapeUrl))
  }
}

export async function discoverUrls(
  baseUrl: string,
  description: string
): Promise<string[]> {
  try {
    const result = await callBrightDataMCP<DiscoverResult>("discover", {
      url: baseUrl,
      description,
      max_urls: 50,
    })
    return result.urls
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
