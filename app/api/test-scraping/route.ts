import { scrapeUrl, ingestKnowledgeForAdvisor } from "@/lib/knowledge/scraper"

export async function POST(request: Request) {
  try {
    const { action, url, advisorId } = await request.json()
    
    if (action === "scrape") {
      if (!url) {
        return Response.json({ error: "URL required for scraping" }, { status: 400 })
      }
      
      console.log('[TEST-SCRAPING] Scraping URL:', url)
      const result = await scrapeUrl(url)
      
      return Response.json({
        success: result.success,
        url: result.url,
        title: result.title,
        contentLength: result.markdown.length,
        contentPreview: result.markdown.slice(0, 500) + "...",
        error: result.error
      })
    }
    
    if (action === "ingest") {
      if (!url || !advisorId) {
        return Response.json({ error: "URL and advisorId required for ingestion" }, { status: 400 })
      }
      
      console.log('[TEST-SCRAPING] Ingesting knowledge for advisor:', advisorId, 'from:', url)
      const result = await ingestKnowledgeForAdvisor(advisorId, url)
      
      return Response.json(result)
    }
    
    return Response.json({ 
      error: "Invalid action", 
      availableActions: ["scrape", "ingest"] 
    }, { status: 400 })
    
  } catch (error) {
    console.error('[TEST-SCRAPING] Error:', error)
    return Response.json({
      error: error instanceof Error ? error.message : "Unknown error",
      stack: error instanceof Error ? error.stack : undefined
    }, { status: 500 })
  }
}

export async function GET() {
  return Response.json({
    message: "Scraping test endpoint",
    env: {
      brightdataKey: !!process.env.BRIGHTDATA_API_KEY,
      mubitKey: !!process.env.MUBIT_API_KEY
    },
    examples: [
      { 
        action: "scrape", 
        url: "http://paulgraham.com/startupideas.html",
        description: "Test scraping a single URL" 
      },
      { 
        action: "ingest", 
        advisorId: "paulgraham", 
        url: "http://paulgraham.com/articles.html",
        description: "Full ingestion pipeline for an advisor" 
      }
    ]
  })
}