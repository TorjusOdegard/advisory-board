/** @jsxImportSource chat */
import {
  Chat,
  Card,
  CardText,
  Actions,
  Button,
  Divider,
  Fields,
  Field,
  emoji,
} from "chat"
import { createSlackAdapter } from "@chat-adapter/slack"
import { createDiscordAdapter } from "@chat-adapter/discord"
import { createRedisState } from "@chat-adapter/state-redis"
import { createMemoryState } from "@chat-adapter/state-memory"
import {
  createAdvisor,
  getAdvisor,
  listAdvisors,
  deleteAdvisor,
} from "./advisors/store"
import { ingestKnowledgeForAdvisor } from "./knowledge/scraper"
import { generateAdvisorResponse, recordAdvisorInteraction } from "./agent/advisor-agent"
function redisUrlForChatState(): string | null {
  const direct = process.env.REDIS_URL
  if (direct) return direct

  const restOrTcp = process.env.KV_REST_API_URL
  const token = process.env.KV_REST_API_TOKEN
  if (!restOrTcp) return null
  if (restOrTcp.startsWith("redis://") || restOrTcp.startsWith("rediss://")) {
    return restOrTcp
  }
  if (!token) return null
  try {
    const u = new URL(restOrTcp)
    if (u.hostname.includes("upstash.io")) {
      return `rediss://default:${encodeURIComponent(token)}@${u.hostname}:6379`
    }
  } catch {
    /* not a URL */
  }
  return null
}

function createState() {
  // Temporarily use memory state for faster responses
  // TODO: Re-enable Redis once timeout issue is resolved
  console.log('Using memory state for fast responses')
  return createMemoryState()
  
  // const url = redisUrlForChatState()
  // if (url) {
  //   try {
  //     return createRedisState({ 
  //       url,
  //       connectTimeout: 5000, // 5 second timeout
  //       commandTimeout: 3000  // 3 second command timeout
  //     })
  //   } catch (error) {
  //     console.warn('Failed to create Redis state, falling back to memory:', error)
  //   }
  // }
  // console.log('Using memory state (Redis not configured)')
  // return createMemoryState()
}

const slackEnvReady =
  Boolean(process.env.SLACK_BOT_TOKEN) &&
  Boolean(process.env.SLACK_SIGNING_SECRET)

const discordEnvReady =
  Boolean(process.env.DISCORD_BOT_TOKEN) &&
  Boolean(process.env.DISCORD_PUBLIC_KEY)

// Create bot with error handling
let bot: Chat
try {
  console.log('Creating chat bot with Slack env ready:', slackEnvReady)
  bot = new Chat({
    userName: "advisoryboard",
    adapters: {
      ...(slackEnvReady
        ? {
            slack: createSlackAdapter({
              botToken: process.env.SLACK_BOT_TOKEN!,
              signingSecret: process.env.SLACK_SIGNING_SECRET!,
            }),
          }
        : {}),
      ...(discordEnvReady
        ? {
            discord: createDiscordAdapter({
              botToken: process.env.DISCORD_BOT_TOKEN,
              publicKey: process.env.DISCORD_PUBLIC_KEY,
              applicationId: process.env.DISCORD_APPLICATION_ID,
            }),
          }
        : {}),
    },
    state: createState(),
  })
  console.log('Chat bot created successfully')
} catch (error) {
  console.error('Failed to create chat bot:', error)
  throw error
}

export { bot }

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
  try {
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

      const slug = name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "")
        .slice(0, 30)
      const existing = await getAdvisor(slug)
      if (existing) {
        await event.reply(
          <Card title="Advisor already exists">
            <CardText>
              {existing.name} is already on the board (id: `{existing.id}`).{"\n"}
              Use `/board ask {existing.id} "question"` or add someone else.
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
  } catch (error) {
    console.error("[/board] command failed:", error)
    await event.reply(
      <Card title="Command failed">
        <CardText>
          {error instanceof Error ? error.message : "Unknown error"}
          {"\n\n"}
          Check Vercel logs. Common fixes: `SLACK_SIGNING_SECRET` / `SLACK_BOT_TOKEN` for this app,
          and `KV_REST_API_URL` + `KV_REST_API_TOKEN` for persistent advisors.
        </CardText>
      </Card>
    )
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

  // Note: Mubit memories persist - we're just removing from our advisor registry
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

// Follow-ups in threads the bot already subscribed to (e.g. after an @mention)
bot.onSubscribedMessage(async (thread, message) => {
  if (message.author.isMe) return
  if (!message.isMention) return

  await thread.post(
    <Card title="Advisory Board">
      <CardText>
        In this thread, use `/board` commands: `list`, `ask`, `add`, `ingest`, `remove`.
      </CardText>
    </Card>
  )
})

bot.onReaction([emoji.thumbs_up], async (event) => {
  if (!event.added) return
  await event.thread.post(
    <Card title="Thanks">
      <CardText>Glad that helped.</CardText>
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
