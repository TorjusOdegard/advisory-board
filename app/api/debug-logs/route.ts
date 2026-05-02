import { listChatLogEntries } from "@/lib/chat-log"

export async function GET() {
  const logs = listChatLogEntries(100) // Get last 100 entries
  
  return Response.json({
    logs,
    count: logs.length,
    timestamp: new Date().toISOString()
  }, {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store, max-age=0'
    }
  })
}

export async function POST() {
  // Clear logs
  const logs = listChatLogEntries()
  logs.length = 0
  
  return Response.json({
    message: "Logs cleared",
    timestamp: new Date().toISOString()
  })
}