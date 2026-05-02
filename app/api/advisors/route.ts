import { NextResponse } from "next/server"
import {
  listAdvisors,
  createAdvisor,
  getAdvisor,
  deleteAdvisor,
} from "@/lib/advisors/store"
import { ingestKnowledgeForAdvisor } from "@/lib/knowledge/scraper"

export async function GET() {
  try {
    const advisors = await listAdvisors()
    return NextResponse.json({ advisors })
  } catch (error) {
    console.error("Failed to list advisors:", error)
    return NextResponse.json(
      { error: "Failed to fetch advisors" },
      { status: 500 }
    )
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { name, url, description } = body

    if (!name) {
      return NextResponse.json(
        { error: "Name is required" },
        { status: 400 }
      )
    }

    const advisor = await createAdvisor({ name, url, description })

    // If URL provided, start ingestion
    let ingestionResult = null
    if (url) {
      ingestionResult = await ingestKnowledgeForAdvisor(advisor.id, url)
    }

    return NextResponse.json({
      advisor,
      ingestion: ingestionResult,
    })
  } catch (error) {
    console.error("Failed to create advisor:", error)
    return NextResponse.json(
      { error: "Failed to create advisor" },
      { status: 500 }
    )
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get("id")

    if (!id) {
      return NextResponse.json(
        { error: "Advisor ID is required" },
        { status: 400 }
      )
    }

    const advisor = await getAdvisor(id)
    if (!advisor) {
      return NextResponse.json(
        { error: "Advisor not found" },
        { status: 404 }
      )
    }

    // Note: Mubit memories persist - we're just removing from our advisor registry
    await deleteAdvisor(id)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Failed to delete advisor:", error)
    return NextResponse.json(
      { error: "Failed to delete advisor" },
      { status: 500 }
    )
  }
}
