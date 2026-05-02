export async function POST(request: Request) {
  console.log('=== SLASH COMMAND TEST ===')
  console.log('Headers:', Object.fromEntries(request.headers.entries()))
  
  const body = await request.text()
  console.log('Raw body:', body)
  
  // Parse form data
  const params = new URLSearchParams(body)
  const data = Object.fromEntries(params)
  console.log('Parsed data:', data)
  
  return new Response(JSON.stringify({
    response_type: "ephemeral",
    text: "✅ Test endpoint working! Command received successfully.",
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*Command Test Success*\n\nCommand: \`${data.command}\`\nText: \`${data.text}\`\nUser: <@${data.user_id}>`
        }
      }
    ]
  }), {
    headers: {
      'Content-Type': 'application/json'
    }
  })
}

export async function GET() {
  return Response.json({ message: "Test slash command endpoint" })
}