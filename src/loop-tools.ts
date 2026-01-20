import { tool } from "@opencode-ai/plugin"
import type { NelsonState } from "./types"
import { readState, writeState, removeState } from "./state"
import { extractPromiseText } from "./utils"

/**
 * Create loop-related tools for Nelson Muntz
 */
export function createLoopTools(directory: string) {
  return {
    "nm-loop": tool({
      description: `Start iterative development loop. On session idle, the SAME prompt is fed back automatically.
Continues until completion promise detected or max iterations. To complete: output <promise>YOUR_PHRASE</promise>.
Options: maxIterations (default 2, 0=unlimited), completionPromise (phrase to signal done).`,
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
        const { prompt, maxIterations = 2, completionPromise = null } = args

        if (!prompt || prompt.trim() === "") {
          return "Error: No prompt provided. Please provide a task description."
        }

        // Check if there's already an active loop
        const existingState = await readState(directory)
        if (existingState?.active) {
          return `Error: A Nelson loop is already active (iteration ${existingState.iteration}). Use the nm-cancel tool to cancel it first.`
        }

        // Get session ID from tool context
        const sessionId = (toolCtx as { sessionID?: string })?.sessionID || null

        // Create state file
        const state: NelsonState = {
          active: true,
          iteration: 1,
          maxIterations: maxIterations,
          completionPromise: completionPromise || null,
          prompt: prompt,
          sessionId: sessionId,
          startedAt: new Date().toISOString(),
        }
        await writeState(directory, state)

        let output = `🔄 Nelson loop activated!

Iteration: 1
Max iterations: ${maxIterations > 0 ? maxIterations : "unlimited"}
Completion promise: ${
          completionPromise
            ? `${completionPromise} (ONLY output when TRUE - do not lie!)`
            : "none (loop will stop at max iterations)"
        }

The loop is now active. When the session becomes idle, the SAME PROMPT will be
fed back to you. You'll see your previous work in files, creating a
self-referential loop where you iteratively improve on the same task.

To stop the loop early, use nm-cancel.

---

${prompt}`

        if (completionPromise) {
          output += `

═══════════════════════════════════════════════════════════
COMPLETION: Output <promise>${completionPromise}</promise> when truly done.
Use exact tags. Statement must be TRUE. Never lie to exit early.
═══════════════════════════════════════════════════════════`
        }

        return output
      },
    }),

    "nm-cancel": tool({
      description: "Cancel an active Nelson Muntz loop",
      args: {},
      async execute() {
        const state = await readState(directory)

        if (!state || !state.active) {
          return "No active Nelson loop found."
        }

        const iteration = state.iteration
        await removeState(directory)

        return `🛑 Cancelled Nelson loop (was at iteration ${iteration})`
      },
    }),

    "nm-status": tool({
      description: "Check the status of the current Nelson Muntz loop",
      args: {},
      async execute() {
        const state = await readState(directory)

        if (!state || !state.active) {
          return "No active Nelson loop."
        }

        return `📊 Nelson Loop Status:
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

    "nm-check-completion": tool({
      description: "Check if the completion promise has been fulfilled in the given text",
      args: {
        text: tool.schema.string().describe("The text to check for completion promise"),
      },
      async execute(args) {
        const state = await readState(directory)

        if (!state || !state.active) {
          return "No active Nelson loop."
        }

        if (!state.completionPromise) {
          return "No completion promise set for this loop."
        }

        const promiseText = extractPromiseText(args.text)

        if (promiseText && promiseText === state.completionPromise) {
          await removeState(directory)
          return `✅ Completion promise detected: <promise>${state.completionPromise}</promise>
Nelson loop completed successfully after ${state.iteration} iterations.`
        }

        return `❌ Completion promise NOT detected.
Expected: <promise>${state.completionPromise}</promise>
${promiseText ? `Found: <promise>${promiseText}</promise>` : "No <promise> tags found in text."}

Loop continues at iteration ${state.iteration}.`
      },
    }),
  }
}
