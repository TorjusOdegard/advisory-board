import {
  Chat,
  Card,
  CardText,
  Actions,
  Button,
  Divider,
  Fields,
  Field,
} from "chat"
import { createSlackAdapter } from "@chat-adapter/slack"
import { createRedisState } from "@chat-adapter/state-redis"
import {
  createAdvisor,
  getAdvisor,
  listAdvisors,
  deleteAdvisor,
} from "./advisors/store"
import { ingestKnowledgeForAdvisor } from "./knowledge/scraper"
import { deleteAdvisorKnowledge } from "./knowledge/vector-store"
import { generateAdvisorResponse } from "./agent/advisor-agent"

export const bot = new Chat({
  userName: "advisoryboard",
  adapters: {
    slack: createSlackAdapter({
      botToken: process.env.SLACK_BOT_TOKEN!,
      signingSecret: process.env.SLACK_SIGNING_SECRET!,
    }),
  },
  state: createRedisState({
    url: process.env.KV_REST_API_URL!,
    token: process.env.KV_REST_API_TOKEN!,
  }),
})

// Parse slash command arguments
function parseCommand(text: string): { action: string; args: string[] } {
  const parts = text.trim().split(/\s+/)
  const action = parts[0]?.toLowerCase() || "help"

  // Handle quoted strings for names
  const argsText = text.slice(action.length).trim()
  const args: string[] = []

  let current = ""
  let inQuotes = false

  for (const char of argsText) {
    if (char === '"' || char === "'") {
      inQuotes = !inQuotes
    } else if (char === " " && !inQuotes) {
      if (current) {
        args.push(current)
        current = ""
      }
    } else {
      current += char
    }
  }
  if (current) args.push(current)

  return { action, args }
}

// /board slash command handler
bot.onSlashCommand("/board", async (event) => {
  const { action, args } = parseCommand(event.text)

  switch (action) {
    case "add": {
      const name = args[0]
      const url = args[1]

      if (!name) {
        await event.reply(
          <Card title="Missing Name">
            <CardText>
              Usage: `/board add "Name" [url]`{"\n"}
              Example: `/board add "Paul Graham" "paulgraham.com/articles.html"`
            </CardText>
          </Card>
        )
        return
      }

      await event.reply(
        <Card title="Creating Advisor...">
          <CardText>
            Setting up {name} as an advisor. This may take a moment if scraping knowledge...
          </CardText>
        </Card>
      )

      try {
        const advisor = await createAdvisor({ name, url })

        if (url) {
          // Start knowledge ingestion in background
          const result = await ingestKnowledgeForAdvisor(advisor.id, url)

          await event.thread.post(
            <Card title={`${advisor.name} Added!`}>
              <Fields>
                <Field title="ID">{advisor.id}</Field>
                <Field title="Pages Scraped">{result.pagesScraped}</Field>
                <Field title="Knowledge Chunks">{result.chunksCreated}</Field>
              </Fields>
              <Divider />
              <CardText>
                Ask questions with: `/board ask {advisor.id} "Your question"`
              </CardText>
            </Card>
          )
        } else {
          await event.thread.post(
            <Card title={`${advisor.name} Added!`}>
              <Fields>
                <Field title="ID">{advisor.id}</Field>
                <Field title="Status">No knowledge yet</Field>
              </Fields>
              <Divider />
              <CardText>
                Add knowledge: `/board ingest {advisor.id} "url"`{"\n"}
                Ask questions: `/board ask {advisor.id} "Your question"`
              </CardText>
            </Card>
          )
        }
      } catch (error) {
        await event.thread.post(
          <Card title="Error">
            <CardText>
              Failed to create advisor: {error instanceof Error ? error.message : "Unknown error"}
            </CardText>
          </Card>
        )
      }
      break
    }

    case "ask": {
      const advisorId = args[0]?.toLowerCase()
      const question = args.slice(1).join(" ")

      if (!advisorId || !question) {
        await event.reply(
          <Card title="Missing Arguments">
            <CardText>
              Usage: `/board ask advisorId "Your question"`{"\n"}
              Example: `/board ask paulgraham "How do I find product-market fit?"`
            </CardText>
          </Card>
        )
        return
      }

      const advisor = await getAdvisor(advisorId)

      if (!advisor) {
        const advisors = await listAdvisors()
        const available = advisors.map((a) => a.id).join(", ") || "None"

        await event.reply(
          <Card title="Advisor Not Found">
            <CardText>
              No advisor with ID "{advisorId}".{"\n"}
              Available advisors: {available}
            </CardText>
          </Card>
        )
        return
      }

      await event.reply(
        <Card title={`Asking ${advisor.name}...`}>
          <CardText>_Thinking..._</CardText>
        </Card>
      )

      try {
        const result = await generateAdvisorResponse(advisor, question)
        await event.thread.post(result.fullStream)
      } catch (error) {
        await event.thread.post(
          <Card title="Error">
            <CardText>
              Failed to get response: {error instanceof Error ? error.message : "Unknown error"}
            </CardText>
          </Card>
        )
      }
      break
    }

    case "list": {
      const advisors = await listAdvisors()

      if (advisors.length === 0) {
        await event.reply(
          <Card title="Advisory Board">
            <CardText>
              No advisors yet. Add one with:{"\n"}
              `/board add "Name" "knowledge-url"`
            </CardText>
          </Card>
        )
        return
      }

      await event.reply(
        <Card title={`Advisory Board (${advisors.length})`}>
          {advisors.map((advisor) => (
            <Fields key={advisor.id}>
              <Field title={advisor.name}>
                ID: {advisor.id}{"\n"}
                Sources: {advisor.knowledgeSources.length}
              </Field>
            </Fields>
          ))}
          <Divider />
          <CardText>
            Ask: `/board ask advisorId "question"`{"\n"}
            Add knowledge: `/board ingest advisorId "url"`
          </CardText>
        </Card>
      )
      break
    }

    case "remove": {
      const advisorId = args[0]?.toLowerCase()

      if (!advisorId) {
        await event.reply(
          <Card title="Missing Advisor ID">
            <CardText>
              Usage: `/board remove advisorId`{"\n"}
              Example: `/board remove paulgraham`
            </CardText>
          </Card>
        )
        return
      }

      const advisor = await getAdvisor(advisorId)

      if (!advisor) {
        await event.reply(
          <Card title="Advisor Not Found">
            <CardText>No advisor with ID "{advisorId}".</CardText>
          </Card>
        )
        return
      }

      await event.reply(
        <Card title="Confirm Removal">
          <CardText>
            Remove {advisor.name} from your advisory board?{"\n"}
            This will delete all their knowledge.
          </CardText>
          <Divider />
          <Actions>
            <Button id={`confirm-remove:${advisorId}`} style="danger">
              Remove {advisor.name}
            </Button>
            <Button id="cancel-remove">Cancel</Button>
          </Actions>
        </Card>
      )
      break
    }

    case "ingest": {
      const advisorId = args[0]?.toLowerCase()
      const url = args[1]

      if (!advisorId || !url) {
        await event.reply(
          <Card title="Missing Arguments">
            <CardText>
              Usage: `/board ingest advisorId "url"`{"\n"}
              Example: `/board ingest paulgraham "ycombinator.com/library"`
            </CardText>
          </Card>
        )
        return
      }

      const advisor = await getAdvisor(advisorId)

      if (!advisor) {
        await event.reply(
          <Card title="Advisor Not Found">
            <CardText>No advisor with ID "{advisorId}".</CardText>
          </Card>
        )
        return
      }

      await event.reply(
        <Card title="Ingesting Knowledge...">
          <CardText>
            Scraping {url} for {advisor.name}. This may take a few minutes...
          </CardText>
        </Card>
      )

      try {
        const result = await ingestKnowledgeForAdvisor(advisorId, url)

        await event.thread.post(
          <Card title="Knowledge Added!">
            <Fields>
              <Field title="Advisor">{advisor.name}</Field>
              <Field title="Pages Scraped">{result.pagesScraped}</Field>
              <Field title="Knowledge Chunks">{result.chunksCreated}</Field>
            </Fields>
          </Card>
        )
      } catch (error) {
        await event.thread.post(
          <Card title="Error">
            <CardText>
              Failed to ingest: {error instanceof Error ? error.message : "Unknown error"}
            </CardText>
          </Card>
        )
      }
      break
    }

    default: {
      await event.reply(
        <Card title="Advisory Board Commands">
          <CardText>
            *Add an advisor:*{"\n"}
            `/board add "Name" [url]`{"\n\n"}
            *Ask an advisor:*{"\n"}
            `/board ask advisorId "question"`{"\n\n"}
            *List advisors:*{"\n"}
            `/board list`{"\n\n"}
            *Add more knowledge:*{"\n"}
            `/board ingest advisorId "url"`{"\n\n"}
            *Remove an advisor:*{"\n"}
            `/board remove advisorId`
          </CardText>
        </Card>
      )
    }
  }
})

// Handle confirm/cancel button actions
bot.onAction(/^confirm-remove:/, async (event) => {
  const advisorId = event.action.id.replace("confirm-remove:", "")
  const advisor = await getAdvisor(advisorId)

  if (!advisor) {
    await event.thread.post(
      <Card title="Advisor Not Found">
        <CardText>Advisor may have already been removed.</CardText>
      </Card>
    )
    return
  }

  await deleteAdvisorKnowledge(advisorId)
  await deleteAdvisor(advisorId)

  await event.thread.post(
    <Card title="Advisor Removed">
      <CardText>{advisor.name} has been removed from your advisory board.</CardText>
    </Card>
  )
})

bot.onAction("cancel-remove", async (event) => {
  await event.thread.post(
    <Card title="Cancelled">
      <CardText>Advisor removal cancelled.</CardText>
    </Card>
  )
})

// Handle @mentions for direct conversation
bot.onNewMention(async (thread, message) => {
  await thread.subscribe()

  await thread.post(
    <Card title="Advisory Board">
      <CardText>
        Use `/board` commands to manage your advisors:{"\n\n"}
        `/board list` - See your advisors{"\n"}
        `/board ask advisorId "question"` - Ask an advisor{"\n"}
        `/board add "Name" "url"` - Add new advisor
      </CardText>
    </Card>
  )
})
