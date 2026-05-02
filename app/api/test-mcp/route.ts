export async function POST(request: Request) {
  try {
    const { method, params } = await request.json()
    
    const BRIGHTDATA_MCP_URL = `https://mcp.brightdata.com/mcp?token=${process.env.BRIGHTDATA_API_KEY}`
    
    // Try different request formats
    const attempts = [
      // Format 1: Direct method call
      {
        jsonrpc: "2.0",
        method: method || "tools/scrape_as_markdown",
        params: params || { url: "http://paulgraham.com/startupideas.html" },
        id: 1,
      },
      // Format 2: With session initialization
      {
        jsonrpc: "2.0",
        method: "initialize",
        params: {
          protocolVersion: "2024-11-05",
          capabilities: { tools: {} },
          clientInfo: { name: "test", version: "1.0.0" }
        },
        id: 1,
      }
    ]
    
    const results = []
    
    for (const [index, payload] of attempts.entries()) {
      try {
        const response = await fetch(BRIGHTDATA_MCP_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Accept": "application/json, text/event-stream",
          },
          body: JSON.stringify(payload),
        })
        
        const responseText = await response.text()
        let responseData
        
        try {
          responseData = JSON.parse(responseText)
        } catch {
          responseData = responseText
        }
        
        results.push({
          attempt: index + 1,
          payload,
          status: response.status,
          response: responseData
        })
        
      } catch (error) {
        results.push({
          attempt: index + 1,
          payload,
          error: error instanceof Error ? error.message : "Unknown error"
        })
      }
    }
    
    return Response.json({ results })
    
  } catch (error) {
    return Response.json({
      error: error instanceof Error ? error.message : "Unknown error"
    }, { status: 500 })
  }
}

export async function GET() {
  return Response.json({
    message: "MCP test endpoint",
    usage: "POST with { method, params } to test MCP calls"
  })
}