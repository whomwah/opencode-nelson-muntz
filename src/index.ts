import { type Plugin, tool } from "@opencode-ai/plugin"
import * as path from "node:path"
import { mkdir, unlink } from "node:fs/promises"

const RALPH_STATE_FILE = ".opencode/ralph-loop.local.json"

interface RalphState {
  active: boolean
  iteration: number
  maxIterations: number
  completionPromise: string | null
  prompt: string
  sessionId: string | null
  startedAt: string
}

async function readState(directory: string): Promise<RalphState | null> {
  const statePath = path.join(directory, RALPH_STATE_FILE)
  try {
    const file = Bun.file(statePath)
    if (await file.exists()) {
      return await file.json()
    }
  } catch {
    // State file corrupted or missing
  }
  return null
}

async function writeState(directory: string, state: RalphState): Promise<void> {
  const statePath = path.join(directory, RALPH_STATE_FILE)
  const dir = path.dirname(statePath)
  await mkdir(dir, { recursive: true })
  await Bun.write(statePath, JSON.stringify(state, null, 2))
}

async function removeState(directory: string): Promise<boolean> {
  const statePath = path.join(directory, RALPH_STATE_FILE)
  try {
    const file = Bun.file(statePath)
    if (await file.exists()) {
      await unlink(statePath)
      return true
    }
  } catch {
    // Ignore errors
  }
  return false
}

function extractPromiseText(text: string): string | null {
  const match = text.match(/<promise>([\s\S]*?)<\/promise>/)
  if (match) {
    return match[1].trim().replace(/\s+/g, " ")
  }
  return null
}

export const RalphWiggumPlugin: Plugin = async (ctx) => {
  const { directory, client } = ctx

  // Helper to check if completion promise is in any message parts
  async function checkCompletionInSession(
    sessionId: string,
    completionPromise: string
  ): Promise<boolean> {
    try {
      const messagesResult = await client.session.messages({
        path: { id: sessionId },
      })
      
      if (!messagesResult.data) return false

      // Check the last few assistant messages for completion promise
      const messages = messagesResult.data
      for (let i = messages.length - 1; i >= Math.max(0, messages.length - 5); i--) {
        const msg = messages[i]
        if (msg.info.role !== "assistant") continue
        
        for (const part of msg.parts) {
          if (part.type === "text" && typeof part.text === "string") {
            const promiseText = extractPromiseText(part.text)
            if (promiseText === completionPromise) {
              return true
            }
          }
        }
      }
    } catch {
      // Failed to get messages, continue loop
    }
    return false
  }

  return {
    // Listen for session idle to continue the Ralph loop
    event: async ({ event }) => {
      if (event.type !== "session.idle") return

      const state = await readState(directory)
      if (!state || !state.active) return

      // Get session ID from event if available
      const sessionId = (event.properties as { sessionId?: string })?.sessionId || state.sessionId
      if (!sessionId) {
        await client.app.log({
          body: {
            service: "ralph-wiggum",
            level: "warn",
            message: "Ralph loop: No session ID available, cannot continue loop.",
          },
        })
        return
      }

      // Update session ID in state if we got it from event
      if (sessionId !== state.sessionId) {
        state.sessionId = sessionId
        await writeState(directory, state)
      }

      // Check if completion promise was detected in the last message
      if (state.completionPromise) {
        const completed = await checkCompletionInSession(sessionId, state.completionPromise)
        if (completed) {
          await client.app.log({
            body: {
              service: "ralph-wiggum",
              level: "info",
              message: `Ralph loop: Detected <promise>${state.completionPromise}</promise> - loop complete!`,
            },
          })
          
          await client.tui.showToast({
            body: {
              message: `Ralph loop completed after ${state.iteration} iterations!`,
              variant: "success",
            },
          })
          
          await removeState(directory)
          return
        }
      }

      // Check if max iterations reached
      if (state.maxIterations > 0 && state.iteration >= state.maxIterations) {
        await client.app.log({
          body: {
            service: "ralph-wiggum",
            level: "info",
            message: `Ralph loop: Max iterations (${state.maxIterations}) reached.`,
          },
        })
        
        await client.tui.showToast({
          body: {
            message: `Ralph loop: Max iterations (${state.maxIterations}) reached.`,
            variant: "warning",
          },
        })
        
        await removeState(directory)
        return
      }

      // Increment iteration and continue the loop
      state.iteration++
      await writeState(directory, state)

      // Build system message
      let systemMsg: string
      if (state.completionPromise) {
        systemMsg = `🔄 Ralph iteration ${state.iteration} | To stop: output <promise>${state.completionPromise}</promise> (ONLY when statement is TRUE - do not lie to exit!)`
      } else {
        systemMsg = `🔄 Ralph iteration ${state.iteration} | No completion promise set - loop runs infinitely`
      }

      await client.app.log({
        body: {
          service: "ralph-wiggum",
          level: "info",
          message: systemMsg,
        },
      })

      // Send the prompt back to continue the session
      try {
        await client.session.prompt({
          path: { id: sessionId },
          body: {
            parts: [
              {
                type: "text",
                text: `${systemMsg}\n\n---\n\n${state.prompt}`,
              },
            ],
          },
        })
      } catch (error) {
        await client.app.log({
          body: {
            service: "ralph-wiggum",
            level: "error",
            message: `Ralph loop: Failed to send prompt - ${error}`,
          },
        })
      }
    },

    // Custom tools for Ralph loop management
    tool: {
      "ralph-loop": tool({
        description: `Start a Ralph Wiggum loop - an iterative development loop that continues until completion.

Usage: Call this tool with your task prompt and optional configuration.

The Ralph loop will:
1. Execute your task prompt
2. When the session becomes idle, automatically feed the SAME prompt back
3. Continue until the completion promise is detected or max iterations reached

Options:
- maxIterations: Maximum number of iterations (0 = unlimited, default: 0)
- completionPromise: Text that signals completion when wrapped in <promise> tags

Example: Start a loop to build a REST API that runs until "DONE" is output.`,
        args: {
          prompt: tool.schema.string().describe("The task prompt to execute repeatedly"),
          maxIterations: tool.schema
            .number()
            .optional()
            .describe("Maximum iterations before auto-stop (0 = unlimited)"),
          completionPromise: tool.schema
            .string()
            .optional()
            .describe("Promise phrase that signals completion"),
        },
        async execute(args, toolCtx) {
          const { prompt, maxIterations = 0, completionPromise = null } = args

          if (!prompt || prompt.trim() === "") {
            return "Error: No prompt provided. Please provide a task description."
          }

          // Check if there's already an active loop
          const existingState = await readState(directory)
          if (existingState?.active) {
            return `Error: A Ralph loop is already active (iteration ${existingState.iteration}). Use the cancel-ralph tool to cancel it first.`
          }

          // Get session ID from tool context if available
          const sessionId = (toolCtx as { sessionId?: string })?.sessionId || null

          // Create state file
          const state: RalphState = {
            active: true,
            iteration: 1,
            maxIterations: maxIterations,
            completionPromise: completionPromise || null,
            prompt: prompt,
            sessionId: sessionId,
            startedAt: new Date().toISOString(),
          }
          await writeState(directory, state)

          let output = `🔄 Ralph loop activated!

Iteration: 1
Max iterations: ${maxIterations > 0 ? maxIterations : "unlimited"}
Completion promise: ${completionPromise ? `${completionPromise} (ONLY output when TRUE - do not lie!)` : "none (runs forever)"}

The loop is now active. When the session becomes idle, the SAME PROMPT will be
fed back to you. You'll see your previous work in files, creating a
self-referential loop where you iteratively improve on the same task.

⚠️  WARNING: This loop cannot be stopped manually! It will run infinitely
unless you set maxIterations or completionPromise.

---

${prompt}`

          if (completionPromise) {
            output += `

═══════════════════════════════════════════════════════════
CRITICAL - Ralph Loop Completion Promise
═══════════════════════════════════════════════════════════

To complete this loop, output this EXACT text:
  <promise>${completionPromise}</promise>

STRICT REQUIREMENTS (DO NOT VIOLATE):
  ✓ Use <promise> XML tags EXACTLY as shown above
  ✓ The statement MUST be completely and unequivocally TRUE
  ✓ Do NOT output false statements to exit the loop
  ✓ Do NOT lie even if you think you should exit

IMPORTANT - Do not circumvent the loop:
  Even if you believe you're stuck, the task is impossible,
  or you've been running too long - you MUST NOT output a
  false promise statement. The loop is designed to continue
  until the promise is GENUINELY TRUE. Trust the process.
═══════════════════════════════════════════════════════════`
          }

          return output
        },
      }),

      "cancel-ralph": tool({
        description: "Cancel an active Ralph Wiggum loop",
        args: {},
        async execute() {
          const state = await readState(directory)

          if (!state || !state.active) {
            return "No active Ralph loop found."
          }

          const iteration = state.iteration
          await removeState(directory)

          return `🛑 Cancelled Ralph loop (was at iteration ${iteration})`
        },
      }),

      "ralph-status": tool({
        description: "Check the status of the current Ralph Wiggum loop",
        args: {},
        async execute() {
          const state = await readState(directory)

          if (!state || !state.active) {
            return "No active Ralph loop."
          }

          return `📊 Ralph Loop Status:
- Active: ${state.active}
- Iteration: ${state.iteration}
- Max iterations: ${state.maxIterations > 0 ? state.maxIterations : "unlimited"}
- Completion promise: ${state.completionPromise || "none"}
- Session ID: ${state.sessionId || "unknown"}
- Started at: ${state.startedAt}

Prompt:
${state.prompt}`
        },
      }),

      "ralph-check-completion": tool({
        description:
          "Check if the completion promise has been fulfilled in the given text",
        args: {
          text: tool.schema
            .string()
            .describe("The text to check for completion promise"),
        },
        async execute(args) {
          const state = await readState(directory)

          if (!state || !state.active) {
            return "No active Ralph loop."
          }

          if (!state.completionPromise) {
            return "No completion promise set for this loop."
          }

          const promiseText = extractPromiseText(args.text)

          if (promiseText && promiseText === state.completionPromise) {
            await removeState(directory)
            return `✅ Completion promise detected: <promise>${state.completionPromise}</promise>
Ralph loop completed successfully after ${state.iteration} iterations.`
          }

          return `❌ Completion promise NOT detected.
Expected: <promise>${state.completionPromise}</promise>
${promiseText ? `Found: <promise>${promiseText}</promise>` : "No <promise> tags found in text."}

Loop continues at iteration ${state.iteration}.`
        },
      }),
    },
  }
}
