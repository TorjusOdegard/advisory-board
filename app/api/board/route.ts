import { NextRequest } from "next/server"
import { listAdvisors, getAdvisor } from "@/lib/advisors/store"
import { generateAdvisorResponse } from "@/lib/agent/advisor-agent"

// Parse slash command text into action and args
function parseCommand(text: string): { action: string; args: string[] } {
  const parts = text.trim().split(/\s+/)
  const action = parts[0]?.toLowerCase() || "help"
  const args = parts.slice(1)
  return { action, args }
}

export async function POST(request: NextRequest) {
  try {
    // Parse form data from Slack
    const body = await request.text()
    const params = new URLSearchParams(body)
    const data = Object.fromEntries(params)
    
    console.log('[BOARD] Slash command received:', data)

    const { action, args } = parseCommand(data.text || "")
    
    // Handle different commands
    switch (action) {
      case "list": {
        const advisors = await listAdvisors()
        
        if (advisors.length === 0) {
          return Response.json({
            response_type: "ephemeral",
            text: "No advisors yet! The system comes with Paul Graham and Steve Jobs pre-loaded.",
            blocks: [
              {
                type: "section", 
                text: {
                  type: "mrkdwn",
                  text: "🏢 *Advisory Board*\n\nNo advisors found. Try: `/board ask paulgraham How do I find product-market fit?`"
                }
              }
            ]
          })
        }

        const advisorList = advisors.map(a => `• *${a.name}* (${a.id}) - ${a.knowledgeSources.length} sources`).join('\n')
        
        return Response.json({
          response_type: "ephemeral", 
          text: `Your Advisory Board (${advisors.length} advisors)`,
          blocks: [
            {
              type: "section",
              text: {
                type: "mrkdwn",
                text: `🏢 *Your Advisory Board*\n\n${advisorList}\n\n_Ask: \`/board ask advisorId "question"\`_`
              }
            }
          ]
        })
      }

      case "ask": {
        const advisorId = args[0]?.toLowerCase()
        const question = args.slice(1).join(" ")
        
        if (!advisorId || !question) {
          return Response.json({
            response_type: "ephemeral",
            text: "Usage: `/board ask advisorId question`",
            blocks: [
              {
                type: "section",
                text: {
                  type: "mrkdwn", 
                  text: "❓ *Missing Arguments*\n\nUsage: `/board ask advisorId \"question\"`\nExample: `/board ask paulgraham How do I validate my startup idea?`"
                }
              }
            ]
          })
        }

        const advisor = await getAdvisor(advisorId)
        if (!advisor) {
          const advisors = await listAdvisors()
          const available = advisors.map(a => a.id).join(", ") || "paulgraham, stevejobs"
          
          return Response.json({
            response_type: "ephemeral",
            text: `Advisor "${advisorId}" not found.`,
            blocks: [
              {
                type: "section",
                text: {
                  type: "mrkdwn",
                  text: `❌ *Advisor Not Found*\n\nNo advisor with ID "${advisorId}"\n\nTry: ${available}`
                }
              }
            ]
          })
        }

        // Send immediate acknowledgment
        setTimeout(async () => {
          try {
            const result = await generateAdvisorResponse(advisor, question)
            
            // Send response via webhook to the response_url if available
            if (data.response_url) {
              const webhookResponse = await fetch(data.response_url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  response_type: "in_channel",
                  text: `*${advisor.name}* responds:`,
                  blocks: [
                    {
                      type: "section",
                      text: {
                        type: "mrkdwn",
                        text: `*${advisor.name}* responds to: _"${question}"_`
                      }
                    },
                    {
                      type: "section", 
                      text: {
                        type: "mrkdwn",
                        text: "Getting response..." // Will be replaced with actual response
                      }
                    }
                  ]
                })
              })
              console.log('Webhook response status:', webhookResponse.status)
            }
          } catch (error) {
            console.error('Error generating advisor response:', error)
          }
        }, 100)

        return Response.json({
          response_type: "ephemeral",
          text: `Asking ${advisor.name}...`,
          blocks: [
            {
              type: "section",
              text: {
                type: "mrkdwn",
                text: `🤔 *Asking ${advisor.name}...*\n\n"_${question}_"\n\nGetting response...`
              }
            }
          ]
        })
      }

      default: {
        return Response.json({
          response_type: "ephemeral",
          text: "Advisory Board Commands",
          blocks: [
            {
              type: "section",
              text: {
                type: "mrkdwn",
                text: "🏢 *Advisory Board Commands*\n\n" +
                      "• `/board list` - Show your advisors\n" +
                      "• `/board ask advisorId \"question\"` - Ask an advisor\n\n" +
                      "*Examples:*\n" +
                      "• `/board ask paulgraham How do I find product-market fit?`\n" +
                      "• `/board ask stevejobs How should I design my product?`"
              }
            }
          ]
        })
      }
    }
  } catch (error) {
    console.error('[BOARD] Error:', error)
    return Response.json({
      response_type: "ephemeral", 
      text: "Error processing command",
      blocks: [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `❌ *Error*\n\n${error instanceof Error ? error.message : 'Unknown error'}`
          }
        }
      ]
    })
  }
}

export async function GET() {
  return Response.json({ 
    message: "Board slash command endpoint",
    usage: "/board list | ask advisorId question"
  })
}