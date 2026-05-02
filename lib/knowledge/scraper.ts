import { chunkText, storeKnowledge } from "./simple-store"
import { addKnowledgeSource } from "../advisors/store"

// Brightdata Web Unlocker API - Direct REST API approach
const BRIGHTDATA_API_BASE = "https://api.brightdata.com"

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

// Simple fetch-based scraping
async function callBrightDataAPI(url: string): Promise<{ content: string; title?: string }> {
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; Advisory Board Bot/1.0)'
      }
    })

    if (!response.ok) {
      throw new Error(`Failed to fetch ${url}: ${response.status}`)
    }

    const html = await response.text()
    
    // Extract title
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i)
    const title = titleMatch ? titleMatch[1].trim() : undefined

    // Simple HTML to text conversion
    let content = html
      .replace(/<script[^>]*>.*?<\/script>/gis, '')
      .replace(/<style[^>]*>.*?<\/style>/gis, '')
      .replace(/<[^>]*>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\s+/g, ' ')
      .trim()

    return { content, title }
  } catch (error) {
    throw new Error(`Scraping failed: ${error instanceof Error ? error.message : "Unknown error"}`)
  }
}

export async function scrapeUrl(url: string): Promise<ScrapeResult> {
  try {
    const result = await callBrightDataAPI(url)

    return {
      url,
      markdown: result.content,
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
    // For now, use simple discovery by scraping the base URL and extracting links
    const result = await callBrightDataAPI(baseUrl)
    
    // Simple link extraction from markdown (basic implementation)
    const linkPattern = /\[([^\]]+)\]\(([^)]+)\)/g
    const urls = [baseUrl]
    let match
    
    while ((match = linkPattern.exec(result.content)) !== null) {
      const linkUrl = match[2]
      if (linkUrl.startsWith('http') && urls.length < 10) { // Limit to 10 URLs
        urls.push(linkUrl)
      }
    }
    
    return urls
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
