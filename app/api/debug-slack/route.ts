import { NextRequest } from "next/server"

export async function POST(request: NextRequest) {
  try {
    // Get headers
    const headers = Object.fromEntries(request.headers.entries())
    
    // Get body
    const body = await request.text()
    
    // Parse as form data if it looks like a Slack slash command
    let parsedBody: any = body
    if (headers['content-type']?.includes('application/x-www-form-urlencoded')) {
      const params = new URLSearchParams(body)
      parsedBody = Object.fromEntries(params)
    }
    
    console.log('[DEBUG-SLACK] Headers:', headers)
    console.log('[DEBUG-SLACK] Raw body:', body)
    console.log('[DEBUG-SLACK] Parsed body:', parsedBody)
    
    // Check if this is a slash command
    if (parsedBody.command === '/board') {
      return Response.json({
        response_type: "ephemeral",
        text: `Debug: Received command /board with text: "${parsedBody.text}"`,
        blocks: [
          {
            type: "section",
            text: {
              type: "mrkdwn", 
              text: `*Debug Response*\n\nCommand: \`${parsedBody.command}\`\nText: \`${parsedBody.text}\`\nUser: <@${parsedBody.user_id}>\nChannel: ${parsedBody.channel_id}`
            }
          }
        ]
      })
    }
    
    return Response.json({
      headers,
      body: parsedBody,
      timestamp: new Date().toISOString()
    })
    
  } catch (error) {
    console.error('[DEBUG-SLACK] Error:', error)
    return Response.json({
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    }, { status: 500 })
  }
}

export async function GET() {
  return Response.json({
    message: "Slack debug endpoint - POST here to debug slash commands",
    timestamp: new Date().toISOString()
  })
}