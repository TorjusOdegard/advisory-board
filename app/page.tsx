"use client"

import { useState } from "react"
import useSWR from "swr"
import { Users, Database, Zap, MessageSquare, Plus, Trash2, ExternalLink, Copy, Check, BookOpen } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { FieldGroup, Field, FieldLabel } from "@/components/ui/field"

interface Advisor {
  id: string
  name: string
  description: string
  knowledgeSources: string[]
  createdAt: string
  updatedAt: string
}

const fetcher = (url: string) => fetch(url).then((res) => res.json())

function StatCard({
  icon: Icon,
  label,
  value,
  description,
}: {
  icon: React.ElementType
  label: string
  value: string | number
  description: string
}) {
  return (
    <Card className="border-border/50 bg-card/50">
      <CardContent className="p-6">
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
            <Icon className="h-6 w-6 text-primary" />
          </div>
          <div>
            <p className="text-sm text-muted-foreground">{label}</p>
            <p className="text-2xl font-semibold text-foreground">{value}</p>
            <p className="text-xs text-muted-foreground">{description}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function AdvisorCard({
  advisor,
  onDelete,
}: {
  advisor: Advisor
  onDelete: (id: string) => void
}) {
  const [isDeleting, setIsDeleting] = useState(false)

  const handleDelete = async () => {
    setIsDeleting(true)
    try {
      await fetch(`/api/advisors?id=${advisor.id}`, { method: "DELETE" })
      onDelete(advisor.id)
    } catch (error) {
      console.error("Failed to delete:", error)
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <Card className="border-border/50 bg-card/50 transition-colors hover:border-primary/30">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/20 text-primary font-semibold">
              {advisor.name.charAt(0)}
            </div>
            <div>
              <CardTitle className="text-lg">{advisor.name}</CardTitle>
              <CardDescription className="text-sm">@{advisor.id}</CardDescription>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-muted-foreground hover:text-destructive"
            onClick={handleDelete}
            disabled={isDeleting}
          >
            <Trash2 className="h-4 w-4" />
            <span className="sr-only">Delete advisor</span>
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground line-clamp-2">{advisor.description}</p>
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <Database className="h-3 w-3" />
            {advisor.knowledgeSources.length} sources
          </span>
          <span className="flex items-center gap-1">
            <MessageSquare className="h-3 w-3" />
            Ready
          </span>
        </div>
      </CardContent>
    </Card>
  )
}

function AddAdvisorDialog({ onSuccess }: { onSuccess: () => void }) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState("")
  const [url, setUrl] = useState("")
  const [isLoading, setIsLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name) return

    setIsLoading(true)
    try {
      await fetch("/api/advisors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, url: url || undefined }),
      })
      setName("")
      setUrl("")
      setOpen(false)
      onSuccess()
    } catch (error) {
      console.error("Failed to create advisor:", error)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="gap-2">
          <Plus className="h-4 w-4" />
          Add Advisor
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add New Advisor</DialogTitle>
          <DialogDescription>
            Create a new AI advisor based on a public figure. Optionally provide a URL to their essays or blog.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="name">Name</FieldLabel>
              <Input
                id="name"
                placeholder="Paul Graham"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="url">Knowledge URL (optional)</FieldLabel>
              <Input
                id="url"
                placeholder="paulgraham.com/articles.html"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
              />
            </Field>
          </FieldGroup>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading || !name}>
              {isLoading ? "Creating..." : "Create Advisor"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = () => {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={handleCopy}>
      {copied ? <Check className="h-3 w-3 text-primary" /> : <Copy className="h-3 w-3" />}
      <span className="sr-only">Copy command</span>
    </Button>
  )
}

function SetupGuide() {
  return (
    <Card className="border-border/50 bg-card/50">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BookOpen className="h-5 w-5 text-primary" />
          Getting Started
        </CardTitle>
        <CardDescription>
          Set up your Slack integration to start using the advisory board
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-4">
          <div className="flex gap-3">
            <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-medium">
              1
            </div>
            <div className="space-y-1">
              <p className="font-medium text-foreground">Deploy this app</p>
              <p className="text-sm text-muted-foreground">
                Deploy to Vercel to get a public webhook URL
              </p>
            </div>
          </div>

          <div className="flex gap-3">
            <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-medium">
              2
            </div>
            <div className="space-y-1">
              <p className="font-medium text-foreground">Create a Slack app</p>
              <p className="text-sm text-muted-foreground">
                Go to{" "}
                <a
                  href="https://api.slack.com/apps"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline inline-flex items-center gap-1"
                >
                  api.slack.com/apps
                  <ExternalLink className="h-3 w-3" />
                </a>{" "}
                and create a new app from manifest
              </p>
            </div>
          </div>

          <div className="flex gap-3">
            <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-medium">
              3
            </div>
            <div className="space-y-2">
              <p className="font-medium text-foreground">Set environment variables</p>
              <div className="space-y-2 rounded-lg bg-secondary/50 p-3 font-mono text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">SLACK_BOT_TOKEN=</span>
                  <span className="text-foreground">xoxb-...</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">SLACK_SIGNING_SECRET=</span>
                  <span className="text-foreground">...</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">AI_GATEWAY_API_KEY=</span>
                  <span className="text-foreground">vck_...</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">AI_GATEWAY_MODEL=</span>
                  <span className="text-foreground">anthropic/claude-sonnet-4.6</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">KV_REST_API_URL=</span>
                  <span className="text-foreground">https://...</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">MUBIT_API_KEY=</span>
                  <span className="text-foreground">mbt_...</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">BRIGHTDATA_API_KEY=</span>
                  <span className="text-foreground">...</span>
                </div>
              </div>
            </div>
          </div>

          <div className="flex gap-3">
            <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-medium">
              4
            </div>
            <div className="space-y-2">
              <p className="font-medium text-foreground">Use slash commands in Slack</p>
              <div className="space-y-2">
                <div className="flex items-center justify-between rounded-lg bg-secondary/50 px-3 py-2 font-mono text-sm">
                  <code>/board add &quot;Paul Graham&quot; &quot;paulgraham.com/articles.html&quot;</code>
                  <CopyButton text='/board add "Paul Graham" "paulgraham.com/articles.html"' />
                </div>
                <div className="flex items-center justify-between rounded-lg bg-secondary/50 px-3 py-2 font-mono text-sm">
                  <code>/board ask paulgraham &quot;How do I find PMF?&quot;</code>
                  <CopyButton text='/board ask paulgraham "How do I find PMF?"' />
                </div>
                <div className="flex items-center justify-between rounded-lg bg-secondary/50 px-3 py-2 font-mono text-sm">
                  <code>/board list</code>
                  <CopyButton text="/board list" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

export default function DashboardPage() {
  const { data, error, mutate } = useSWR<{ advisors: Advisor[] }>("/api/advisors", fetcher)
  const advisors = data?.advisors || []
  const isLoading = !data && !error

  const totalSources = advisors.reduce((acc, a) => acc + a.knowledgeSources.length, 0)

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="border-b border-border/50 bg-card/30">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/20">
              <Users className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="font-semibold text-foreground">Advisory Board</h1>
              <p className="text-xs text-muted-foreground">AI-powered startup advisors</p>
            </div>
          </div>
          <AddAdvisorDialog onSuccess={() => mutate()} />
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-8 px-6 py-8">
        {/* Stats */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            icon={Users}
            label="Advisors"
            value={advisors.length}
            description="Active board members"
          />
          <StatCard
            icon={Database}
            label="Knowledge Sources"
            value={totalSources}
            description="Indexed URLs"
          />
          <StatCard
            icon={Zap}
            label="Status"
            value={error ? "Error" : isLoading ? "Loading" : "Ready"}
            description="System health"
          />
          <StatCard
            icon={MessageSquare}
            label="Endpoint"
            value="Active"
            description="/api/webhooks/slack"
          />
        </div>

        <div className="grid gap-8 lg:grid-cols-3">
          {/* Advisors */}
          <div className="space-y-4 lg:col-span-2">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold text-foreground">Your Advisors</h2>
            </div>

            {isLoading ? (
              <div className="grid gap-4 sm:grid-cols-2">
                {[1, 2].map((i) => (
                  <Card key={i} className="border-border/50 bg-card/50 animate-pulse">
                    <CardHeader className="pb-3">
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-full bg-secondary" />
                        <div className="space-y-2">
                          <div className="h-4 w-24 rounded bg-secondary" />
                          <div className="h-3 w-16 rounded bg-secondary" />
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="h-4 w-full rounded bg-secondary" />
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : advisors.length === 0 ? (
              <Card className="border-border/50 bg-card/50 border-dashed">
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <Users className="h-12 w-12 text-muted-foreground/50" />
                  <p className="mt-4 text-lg font-medium text-foreground">No advisors yet</p>
                  <p className="text-sm text-muted-foreground">
                    Add your first advisor to get started
                  </p>
                  <AddAdvisorDialog onSuccess={() => mutate()} />
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                {advisors.map((advisor) => (
                  <AdvisorCard
                    key={advisor.id}
                    advisor={advisor}
                    onDelete={() => mutate()}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Setup Guide */}
          <div className="space-y-4">
            <SetupGuide />
          </div>
        </div>
      </main>
    </div>
  )
}
