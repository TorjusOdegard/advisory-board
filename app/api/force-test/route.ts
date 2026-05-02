import { createAdvisor, getAdvisor, listAdvisors } from "@/lib/advisors/store"
import { generateAdvisorResponse } from "@/lib/agent/advisor-agent"

export async function POST(request: Request) {
  try {
    const { action, name, url, question, advisorId } = await request.json()
    
    console.log('[FORCE-TEST] Action:', action, { name, url, question, advisorId })
    
    switch (action) {
      case 'create': {
        if (!name) {
          return Response.json({ error: 'Name required' }, { status: 400 })
        }
        
        const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "").slice(0, 30)
        const existing = await getAdvisor(slug)
        
        if (existing) {
          return Response.json({ 
            error: 'Advisor already exists', 
            existing: existing 
          }, { status: 409 })
        }
        
        console.log('[FORCE-TEST] Creating advisor with slug:', slug)
        const advisor = await createAdvisor({ name, url })
        
        return Response.json({ 
          success: true, 
          advisor,
          message: `Created advisor: ${advisor.name} (${advisor.id})`
        })
      }
      
      case 'ask': {
        if (!advisorId || !question) {
          return Response.json({ error: 'advisorId and question required' }, { status: 400 })
        }
        
        const advisor = await getAdvisor(advisorId)
        if (!advisor) {
          const advisors = await listAdvisors()
          return Response.json({ 
            error: 'Advisor not found',
            availableAdvisors: advisors.map(a => ({ id: a.id, name: a.name }))
          }, { status: 404 })
        }
        
        console.log('[FORCE-TEST] Asking advisor:', advisor.name, 'Question:', question)
        const result = await generateAdvisorResponse(advisor, question)
        
        return Response.json({ 
          success: true, 
          advisor: { id: advisor.id, name: advisor.name },
          question,
          response: result
        })
      }
      
      case 'list': {
        const advisors = await listAdvisors()
        return Response.json({ 
          success: true, 
          advisors: advisors.map(a => ({ 
            id: a.id, 
            name: a.name, 
            sources: a.knowledgeSources.length 
          }))
        })
      }
      
      default:
        return Response.json({ 
          error: 'Invalid action', 
          availableActions: ['create', 'ask', 'list']
        }, { status: 400 })
    }
    
  } catch (error) {
    console.error('[FORCE-TEST] Error:', error)
    return Response.json({ 
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined
    }, { status: 500 })
  }
}

export async function GET() {
  return Response.json({
    message: "Force test endpoint - use POST with action",
    examples: [
      { action: "list" },
      { action: "create", name: "Paul Graham", url: "paulgraham.com/articles.html" },
      { action: "ask", advisorId: "paulgraham", question: "How do I find PMF?" }
    ]
  })
}