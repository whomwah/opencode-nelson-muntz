import { type Plugin, tool } from "@opencode-ai/plugin"
import * as path from "node:path"
import { mkdir, unlink } from "node:fs/promises"

const RALPH_STATE_FILE = ".opencode/ralph-loop.local.json"
const DEFAULT_PLAN_DIR = ".opencode/plans"
const DEFAULT_PLAN_FILE = `${DEFAULT_PLAN_DIR}/PLAN.md`

interface RalphState {
  active: boolean
  iteration: number
  maxIterations: number
  completionPromise: string | null
  prompt: string
  sessionId: string | null
  startedAt: string
  planFile?: string | null
  currentTaskId?: string | null
  mode?: "loop" | "single-task"
  currentTaskNum?: number | null
}

interface PlanTask {
  id: string
  title: string
  description: string
  status: "pending" | "in_progress" | "completed" | "skipped"
  lineNumber: number
}

interface ParsedPlan {
  title: string
  overview: string
  tasks: PlanTask[]
  completionPromise: string | null
  rawContent: string
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

function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "") // Remove special characters
    .replace(/\s+/g, "-") // Replace spaces with hyphens
    .replace(/-+/g, "-") // Collapse multiple hyphens
    .replace(/^-+|-+$/g, "") // Trim hyphens from start/end
    .slice(0, 50) // Limit length
}

interface ProjectTools {
  hasJustfile: boolean
  hasPackageJson: boolean
  hasMakefile: boolean
}

async function detectProjectTools(directory: string): Promise<ProjectTools> {
  const checkFile = async (filename: string): Promise<boolean> => {
    try {
      const file = Bun.file(path.join(directory, filename))
      return await file.exists()
    } catch {
      return false
    }
  }

  const [hasJustfile, hasPackageJson, hasMakefile] = await Promise.all([
    checkFile("justfile"),
    checkFile("package.json"),
    checkFile("Makefile"),
  ])

  return { hasJustfile, hasPackageJson, hasMakefile }
}

async function readPlanFile(directory: string, planFile: string): Promise<string | null> {
  const planPath = path.isAbsolute(planFile) ? planFile : path.join(directory, planFile)
  try {
    const file = Bun.file(planPath)
    if (await file.exists()) {
      return await file.text()
    }
  } catch {
    // Plan file not found
  }
  return null
}

async function writePlanFile(directory: string, planFile: string, content: string): Promise<void> {
  const planPath = path.isAbsolute(planFile) ? planFile : path.join(directory, planFile)
  const dir = path.dirname(planPath)
  await mkdir(dir, { recursive: true })
  await Bun.write(planPath, content)
}

async function createGitCommit(
  directory: string,
  taskTitle: string,
  taskNum: number,
): Promise<{ success: boolean; message: string }> {
  const { spawn } = await import("node:child_process")

  // Helper to run a command and get output
  const runCommand = (
    cmd: string,
    args: string[],
  ): Promise<{ code: number; stdout: string; stderr: string }> => {
    return new Promise((resolve) => {
      const proc = spawn(cmd, args, { cwd: directory })
      let stdout = ""
      let stderr = ""
      proc.stdout?.on("data", (data) => (stdout += data.toString()))
      proc.stderr?.on("data", (data) => (stderr += data.toString()))
      proc.on("close", (code) => resolve({ code: code ?? 1, stdout, stderr }))
      proc.on("error", () => resolve({ code: 1, stdout, stderr: "Command failed to spawn" }))
    })
  }

  // Check if we're in a git repo
  const gitCheck = await runCommand("git", ["rev-parse", "--git-dir"])
  if (gitCheck.code !== 0) {
    return { success: false, message: "Not a git repository" }
  }

  // Check if there are any changes to commit
  const statusCheck = await runCommand("git", ["status", "--porcelain"])
  if (statusCheck.stdout.trim() === "") {
    return { success: false, message: "No changes to commit" }
  }

  // Stage all changes
  const addResult = await runCommand("git", ["add", "-A"])
  if (addResult.code !== 0) {
    return { success: false, message: `Failed to stage changes: ${addResult.stderr}` }
  }

  // Create commit with task info
  const commitMessage = `feat(ralph): complete task ${taskNum} - ${taskTitle}`
  const commitResult = await runCommand("git", ["commit", "-m", commitMessage])
  if (commitResult.code !== 0) {
    return { success: false, message: `Failed to commit: ${commitResult.stderr}` }
  }

  return { success: true, message: `Created commit: ${commitMessage}` }
}

async function markTaskCompleteAndCommit(
  directory: string,
  planFile: string,
  taskNum: number,
  shouldCommit: boolean,
): Promise<{ taskTitle: string; commitResult?: { success: boolean; message: string } }> {
  const content = await readPlanFile(directory, planFile)
  if (!content) {
    throw new Error(`Plan file not found: ${planFile}`)
  }

  const plan = parsePlanFile(content)
  if (taskNum < 1 || taskNum > plan.tasks.length) {
    throw new Error(`Invalid task number: ${taskNum}`)
  }

  const task = plan.tasks[taskNum - 1]
  const alreadyCompleted = task.status === "completed"

  // Update the plan file if not already complete
  if (!alreadyCompleted) {
    const updatedContent = updateTaskStatus(content, task.id, plan.tasks, "completed")
    await writePlanFile(directory, planFile, updatedContent)
  }

  // Create commit if requested (even if task was already marked complete)
  let commitResult: { success: boolean; message: string } | undefined
  if (shouldCommit) {
    commitResult = await createGitCommit(directory, task.title, taskNum)
  }

  return { taskTitle: task.title, commitResult }
}

function parsePlanFile(content: string): ParsedPlan {
  const lines = content.split("\n")
  const tasks: PlanTask[] = []
  let title = ""
  let overview = ""
  let completionPromise: string | null = null
  let inOverview = false
  let currentTask: Partial<PlanTask> | null = null
  let taskDescription: string[] = []

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const lineNumber = i + 1

    // Extract title from first H1
    if (!title && line.match(/^#\s+(.+)/)) {
      title = line.replace(/^#\s+/, "").trim()
      continue
    }

    // Check for completion promise in frontmatter or special comment
    const promiseMatch = line.match(/completion[_-]?promise:\s*["']?([^"'\n]+)["']?/i)
    if (promiseMatch) {
      completionPromise = promiseMatch[1].trim()
      continue
    }

    // Check for ## Overview section
    if (line.match(/^##\s+Overview/i)) {
      inOverview = true
      continue
    }

    // Check for ## Tasks section - end overview
    if (line.match(/^##\s+Tasks/i)) {
      inOverview = false
      continue
    }

    // Capture overview text
    if (inOverview && line.trim()) {
      overview += (overview ? "\n" : "") + line
      continue
    }

    // Parse task lines: - [ ] or - [x] or numbered like 1. [ ]
    const taskMatch = line.match(/^(?:\d+\.\s+)?-?\s*\[([ xX])\]\s*(?:\*\*)?(.+?)(?:\*\*)?$/)
    if (taskMatch) {
      // Save previous task
      if (currentTask && currentTask.id) {
        currentTask.description = taskDescription.join("\n").trim()
        tasks.push(currentTask as PlanTask)
      }

      const isCompleted = taskMatch[1].toLowerCase() === "x"
      const taskTitle = taskMatch[2].trim()

      currentTask = {
        id: `task-${tasks.length + 1}`,
        title: taskTitle,
        description: "",
        status: isCompleted ? "completed" : "pending",
        lineNumber,
      }
      taskDescription = []
      continue
    }

    // Collect task description (indented content after task)
    if (currentTask && line.match(/^\s{2,}/) && line.trim()) {
      taskDescription.push(line.trim())
    }
  }

  // Don't forget the last task
  if (currentTask && currentTask.id) {
    currentTask.description = taskDescription.join("\n").trim()
    tasks.push(currentTask as PlanTask)
  }

  return {
    title,
    overview,
    tasks,
    completionPromise,
    rawContent: content,
  }
}

function generateSingleTaskPrompt(
  plan: ParsedPlan,
  task: PlanTask,
  taskNum: number,
  isLoopMode: boolean,
  projectTools?: ProjectTools,
): string {
  let prompt = `# ${plan.title || "Project Plan"}\n\n`

  if (plan.overview) {
    prompt += `## Project Context\n${plan.overview}\n\n`
  }

  // Show available project tools with usage instructions
  if (projectTools) {
    const tools: string[] = []
    if (projectTools.hasJustfile) tools.push("`just` (justfile)")
    if (projectTools.hasPackageJson) tools.push("`npm`/`bun` (package.json)")
    if (projectTools.hasMakefile) tools.push("`make` (Makefile)")

    if (tools.length > 0) {
      prompt += `## Available Tools\nThis project has: ${tools.join(", ")}\n\n`
      prompt += `**IMPORTANT**: Use these project tools for build, test, and other operations:\n`
      if (projectTools.hasJustfile) {
        prompt += `- Run \`just\` to see all available tasks, then use \`just <task>\` for build/test/format\n`
      }
      if (projectTools.hasPackageJson) {
        prompt += `- Use \`npm run <script>\` or \`bun run <script>\` for package.json scripts\n`
      }
      if (projectTools.hasMakefile) {
        prompt += `- Use \`make <target>\` for Makefile targets\n`
      }
      prompt += `\n`
    }
  }

  // Show progress overview
  const completedCount = plan.tasks.filter((t) => t.status === "completed").length
  prompt += `## Progress: ${completedCount}/${plan.tasks.length} tasks complete\n\n`

  // List all tasks with current one highlighted
  prompt += `### All Tasks\n`
  for (let i = 0; i < plan.tasks.length; i++) {
    const t = plan.tasks[i]
    const checkbox = t.status === "completed" ? "[x]" : "[ ]"
    const current = i === taskNum - 1 ? " ← CURRENT" : ""
    prompt += `${i + 1}. ${checkbox} ${t.title}${current}\n`
  }

  prompt += `\n## Current Task: #${taskNum}\n\n`
  prompt += `**${task.title}**\n\n`
  prompt += task.description || "No additional description provided."
  prompt += `\n\n`

  // Different instructions based on mode
  if (isLoopMode) {
    prompt += `## Instructions

Complete this task thoroughly. When you finish:
1. Verify your work is correct
2. The task will be automatically marked complete
3. A git commit will be created for this task
4. The loop will continue to the next task

Focus ONLY on this task - do not work ahead.
`
  } else {
    prompt += `## Instructions

Complete this task thoroughly. When you finish:
1. Verify your work is correct
2. The task will be automatically marked complete
3. Review your changes and commit manually when ready
`
  }

  return prompt
}

function updateTaskStatus(
  content: string,
  taskId: string,
  tasks: PlanTask[],
  newStatus: "completed" | "pending",
): string {
  const task = tasks.find((t) => t.id === taskId)
  if (!task) return content

  const lines = content.split("\n")
  const line = lines[task.lineNumber - 1]

  // Update the checkbox
  const updatedLine =
    newStatus === "completed" ? line.replace(/\[\s\]/, "[x]") : line.replace(/\[[xX]\]/, "[ ]")

  lines[task.lineNumber - 1] = updatedLine
  return lines.join("\n")
}

const PLAN_TEMPLATE = `# Project Plan

<!-- Optional: Set a completion promise -->
<!-- completion_promise: ALL_TASKS_COMPLETE -->

## Overview

Describe your project goals and context here. This section helps the AI understand
the bigger picture and make better decisions.

## Tasks

- [ ] **Task 1: Setup and Configuration**
  Initialize the project structure and configure dependencies.
  Include any specific requirements or constraints.

- [ ] **Task 2: Implement Core Feature**
  Describe what needs to be built.
  List acceptance criteria if helpful.

- [ ] **Task 3: Add Tests**
  Write tests for the implemented features.
  Specify coverage requirements if any.

- [ ] **Task 4: Documentation**
  Update README and add inline documentation.

## Completion

When all tasks are complete and verified, output:
<promise>ALL_TASKS_COMPLETE</promise>

---

## Notes

Add any additional notes, constraints, or context here.
`

const RalphWiggumPlugin: Plugin = async (ctx) => {
  const { directory, client } = ctx

  // Helper to check if completion promise is in any message parts
  async function checkCompletionInSession(
    sessionId: string,
    completionPromise: string,
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

      // Handle single-task mode: just mark complete and exit
      if (state.mode === "single-task") {
        if (state.planFile && state.currentTaskNum) {
          try {
            const result = await markTaskCompleteAndCommit(
              directory,
              state.planFile,
              state.currentTaskNum,
              false, // No commit in single-task mode
            )
            await client.app.log({
              body: {
                service: "ralph-wiggum",
                level: "info",
                message: `✓ Task completed: ${result.taskTitle}`,
              },
            })
            await client.tui.showToast({
              body: {
                message: `✓ Task completed: ${result.taskTitle}`,
                variant: "success",
              },
            })
          } catch (err) {
            await client.app.log({
              body: {
                service: "ralph-wiggum",
                level: "error",
                message: `Failed to mark task complete: ${err}`,
              },
            })
          }
        }
        await removeState(directory)
        return
      }

      // Handle loop mode: complete current task, commit, then continue to next
      if (state.mode === "loop" && state.planFile) {
        // Mark current task complete and create commit
        if (state.currentTaskNum) {
          try {
            const result = await markTaskCompleteAndCommit(
              directory,
              state.planFile,
              state.currentTaskNum,
              true, // Create commit in loop mode
            )
            let logMsg = `✓ Task ${state.currentTaskNum} completed: ${result.taskTitle}`
            if (result.commitResult?.success) {
              logMsg += ` | ${result.commitResult.message}`
            } else if (result.commitResult) {
              logMsg += ` | Commit skipped: ${result.commitResult.message}`
            }
            await client.app.log({
              body: {
                service: "ralph-wiggum",
                level: "info",
                message: logMsg,
              },
            })
          } catch (err) {
            await client.app.log({
              body: {
                service: "ralph-wiggum",
                level: "error",
                message: `Failed to complete task ${state.currentTaskNum}: ${err}`,
              },
            })
          }
        }

        // Re-read the plan to find next pending task
        const content = await readPlanFile(directory, state.planFile)
        if (!content) {
          await client.app.log({
            body: {
              service: "ralph-wiggum",
              level: "error",
              message: `Plan file not found: ${state.planFile}`,
            },
          })
          await removeState(directory)
          return
        }

        const plan = parsePlanFile(content)
        const nextPendingIdx = plan.tasks.findIndex((t) => t.status !== "completed")

        // Check if all tasks are complete
        if (nextPendingIdx === -1) {
          await client.app.log({
            body: {
              service: "ralph-wiggum",
              level: "info",
              message: `🎉 All ${plan.tasks.length} tasks complete!`,
            },
          })
          await client.tui.showToast({
            body: {
              message: `🎉 Ralph loop: All ${plan.tasks.length} tasks complete!`,
              variant: "success",
            },
          })
          await removeState(directory)
          return
        }

        // Check if completion promise was detected
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

        // Check max iterations
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

        // Continue to next task
        const nextTask = plan.tasks[nextPendingIdx]
        const nextTaskNum = nextPendingIdx + 1
        state.iteration++
        state.currentTaskId = nextTask.id
        state.currentTaskNum = nextTaskNum
        await writeState(directory, state)

        const projectTools = await detectProjectTools(directory)
        const taskPrompt = generateSingleTaskPrompt(plan, nextTask, nextTaskNum, true, projectTools)
        const completedCount = plan.tasks.filter((t) => t.status === "completed").length

        const systemMsg = `🔄 Ralph iteration ${state.iteration} | Task ${nextTaskNum}/${plan.tasks.length} (${completedCount} complete)`

        await client.app.log({
          body: {
            service: "ralph-wiggum",
            level: "info",
            message: systemMsg,
          },
        })

        try {
          await client.session.prompt({
            path: { id: sessionId },
            body: {
              parts: [
                {
                  type: "text",
                  text: `${systemMsg}\n\n---\n\n${taskPrompt}`,
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
        return
      }

      // Legacy mode (for ralph-loop tool without plan file)
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
      "rw-loop": tool({
        description: `Start a Ralph Wiggum loop - an iterative development loop that continues until completion.

Usage: Call this tool with your task prompt and optional configuration.

The Ralph loop will:
1. Execute your task prompt
2. When the session becomes idle, automatically feed the SAME prompt back
3. Continue until the completion promise is detected or max iterations reached

Options:
- maxIterations: Maximum number of iterations (0 = unlimited, default: 2)
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
          const { prompt, maxIterations = 2, completionPromise = null } = args

          if (!prompt || prompt.trim() === "") {
            return "Error: No prompt provided. Please provide a task description."
          }

          // Check if there's already an active loop
          const existingState = await readState(directory)
          if (existingState?.active) {
            return `Error: A Ralph loop is already active (iteration ${existingState.iteration}). Use the rw-cancel tool to cancel it first.`
          }

          // Get session ID from tool context
          const sessionId = (toolCtx as { sessionID?: string })?.sessionID || null

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
Completion promise: ${
            completionPromise
              ? `${completionPromise} (ONLY output when TRUE - do not lie!)`
              : "none (loop will stop at max iterations)"
          }

The loop is now active. When the session becomes idle, the SAME PROMPT will be
fed back to you. You'll see your previous work in files, creating a
self-referential loop where you iteratively improve on the same task.

To stop the loop early, use rw-cancel.

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

      "rw-cancel": tool({
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

      "rw-status": tool({
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

      "rw-check-completion": tool({
        description: "Check if the completion promise has been fulfilled in the given text",
        args: {
          text: tool.schema.string().describe("The text to check for completion promise"),
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

      // ═══════════════════════════════════════════════════════════
      // Plan-based tools
      // ═══════════════════════════════════════════════════════════

      "rw-plan": tool({
        description: `Create or view a PLAN.md file for structured task management.

Usage:
- 'create': Prepares a plan (returns target path - you generate and show the plan content to the user)
- 'view': Shows the current plan and its tasks
- 'save': Saves the provided content to the plan file

The plan file uses a simple markdown format with checkboxes for tasks.
You can set a completion_promise in the file that Ralph will use.

Filename generation (in priority order):
1. Explicit 'file' parameter if provided
2. Slugified 'name' parameter (e.g., "My API" → my-api.md)
3. Slugified 'description' parameter
4. Falls back to "plan.md"

Plans are stored in .opencode/plans/ by default, allowing multiple named plans.

WORKFLOW:
1. User asks for a plan (e.g., "Create a plan for a REST API")
2. Call rw-plan with action='create' and name/description to get the target file path
3. Generate an appropriate plan based on the user's request and show it to them
4. User may request changes - refine the plan in conversation
5. When user approves, call rw-plan with action='save' and content=<the plan>

PLAN FORMAT:
The plan should be markdown with:
- # Title
- ## Overview section with project context
- ## Tasks section with checkbox items: - [ ] **Task title**
- Optional: completion_promise: SOME_PHRASE (for auto-completion detection)`,
        args: {
          action: tool.schema
            .string()
            .optional()
            .describe(
              "Action: 'create' (prepare plan), 'view' (show existing), 'save' (write to disk)",
            ),
          name: tool.schema
            .string()
            .optional()
            .describe("Plan name - used to generate filename (e.g., 'My API' → my-api.md)"),
          description: tool.schema
            .string()
            .optional()
            .describe("Project description (also used for filename if no name)"),
          file: tool.schema
            .string()
            .optional()
            .describe(`Explicit plan file path (overrides auto-generated name)`),
          content: tool.schema
            .string()
            .optional()
            .describe("Plan content to save (required when action='save')"),
        },
        async execute(args) {
          // Generate filename: file > name > description > "plan.md"
          let planFile: string
          if (args.file) {
            planFile = args.file
          } else {
            const baseName = args.name || args.description
            const slug = baseName ? slugify(baseName) : "plan"
            planFile = `${DEFAULT_PLAN_DIR}/${slug || "plan"}.md`
          }

          const action = args.action || "create"

          if (action === "view") {
            const content = await readPlanFile(directory, planFile)
            if (!content) {
              return `No plan file found at ${planFile}. Use rw-plan to create one.`
            }

            const plan = parsePlanFile(content)
            let output = `📋 Plan: ${plan.title || planFile}\n\n`

            if (plan.overview) {
              output += `Overview: ${plan.overview.slice(0, 200)}${plan.overview.length > 200 ? "..." : ""}\n\n`
            }

            output += `Tasks (${plan.tasks.filter((t) => t.status === "completed").length}/${plan.tasks.length} complete):\n`
            for (let i = 0; i < plan.tasks.length; i++) {
              const task = plan.tasks[i]
              const status = task.status === "completed" ? "✓" : "○"
              output += `  ${i + 1}. ${status} ${task.title}\n`
            }

            if (plan.completionPromise) {
              output += `\nCompletion promise: ${plan.completionPromise}`
            }

            return output
          }

          // Save action - write content to disk
          if (action === "save") {
            if (!args.content || args.content.trim() === "") {
              return `Error: No content provided. Use content parameter to specify the plan content to save.`
            }

            const existingContent = await readPlanFile(directory, planFile)
            if (existingContent) {
              return `Plan file already exists at ${planFile}. Delete it first to create a new one, or use a different filename.`
            }

            await writePlanFile(directory, planFile, args.content)

            return `Saved plan to ${planFile}

You can now use:
- rw-tasks: List all tasks
- rw-start: Start the Ralph loop with this plan
- rw-task <num>: Execute a single task`
          }

          // Create action - return target path for assistant to generate plan content
          const existingContent = await readPlanFile(directory, planFile)
          if (existingContent) {
            return `Plan file already exists at ${planFile}. Use rw-plan with action='view' to see it, or delete it first to create a new one.`
          }

          return `Ready to create plan.

Target file: ${planFile}

Generate a plan for the user based on their request, then show it to them.
When they approve (or after any revisions), save it with:
  rw-plan action='save' file='${planFile}' content=<plan content>`
        },
      }),

      "rw-tasks": tool({
        description: `List all tasks from a PLAN.md file.

Shows task IDs, titles, and completion status. Use the task ID or number
with rw-task to execute a specific task.`,
        args: {
          file: tool.schema
            .string()
            .optional()
            .describe(`Plan file path (default: ${DEFAULT_PLAN_FILE})`),
        },
        async execute(args) {
          const planFile = args.file || DEFAULT_PLAN_FILE
          const content = await readPlanFile(directory, planFile)

          if (!content) {
            return `No plan file found at ${planFile}. Use rw-plan to create one.`
          }

          const plan = parsePlanFile(content)

          if (plan.tasks.length === 0) {
            return `No tasks found in ${planFile}. Add tasks using checkbox format:\n- [ ] Task description`
          }

          let output = `📋 Tasks from ${planFile}\n\n`
          output += `Progress: ${plan.tasks.filter((t) => t.status === "completed").length}/${plan.tasks.length} complete\n\n`

          for (let i = 0; i < plan.tasks.length; i++) {
            const task = plan.tasks[i]
            const status = task.status === "completed" ? "[x]" : "[ ]"
            const num = String(i + 1).padStart(2, " ")
            output += `${num}. ${status} ${task.title}\n`
            if (task.description) {
              output += `       ${task.description.split("\n")[0].slice(0, 60)}${task.description.length > 60 ? "..." : ""}\n`
            }
          }

          output += `\nCommands:\n`
          output += `- rw-task 1      Execute task #1\n`
          output += `- rw-task "name" Execute task by name\n`
          output += `- rw-start       Start loop for all tasks`

          return output
        },
      }),

      "rw-task": tool({
        description: `Execute a single task from the PLAN.md file (one iteration only).

Specify task by number (1, 2, 3...) or by name/keyword.
This runs the task ONCE without looping - useful for manual step-by-step execution.

When the task completes, it will automatically be marked as done in the PLAN.md file.
No git commit is created - you can review the changes and commit manually.`,
        args: {
          task: tool.schema.string().describe("Task number (1, 2, 3...) or task name/keyword"),
          file: tool.schema
            .string()
            .optional()
            .describe(`Plan file path (default: ${DEFAULT_PLAN_FILE})`),
        },
        async execute(args, toolCtx) {
          const planFile = args.file || DEFAULT_PLAN_FILE
          const content = await readPlanFile(directory, planFile)

          if (!content) {
            return `No plan file found at ${planFile}. Use rw-plan to create one.`
          }

          const plan = parsePlanFile(content)

          if (plan.tasks.length === 0) {
            return `No tasks found in ${planFile}.`
          }

          // Find the task
          const taskNum = parseInt(args.task, 10)
          let task: PlanTask | undefined
          let resolvedTaskNum: number

          if (!isNaN(taskNum) && taskNum >= 1 && taskNum <= plan.tasks.length) {
            task = plan.tasks[taskNum - 1]
            resolvedTaskNum = taskNum
          } else {
            // Search by name
            const idx = plan.tasks.findIndex((t) =>
              t.title.toLowerCase().includes(args.task.toLowerCase()),
            )
            if (idx !== -1) {
              task = plan.tasks[idx]
              resolvedTaskNum = idx + 1
            } else {
              return `Task "${args.task}" not found. Use rw-tasks to see available tasks.`
            }
          }

          if (task.status === "completed") {
            return `Task "${task.title}" is already marked as complete. To re-run it, uncheck it in ${planFile} first.`
          }

          // Check for existing loop
          const existingState = await readState(directory)
          if (existingState?.active) {
            return `A Ralph loop is already active (iteration ${existingState.iteration}). Use rw-cancel to stop it first.`
          }

          // Get session ID from tool context
          const sessionId = (toolCtx as { sessionID?: string })?.sessionID || null

          // Create state for single-task mode
          const state: RalphState = {
            active: true,
            iteration: 1,
            maxIterations: 1, // Single iteration only
            completionPromise: null,
            prompt: "", // Not used in single-task mode
            sessionId,
            startedAt: new Date().toISOString(),
            planFile,
            currentTaskId: task.id,
            mode: "single-task",
            currentTaskNum: resolvedTaskNum,
          }
          await writeState(directory, state)

          // Detect project tools for the prompt
          const projectTools = await detectProjectTools(directory)
          const toolsInfo: string[] = []
          const toolsUsage: string[] = []
          if (projectTools.hasJustfile) {
            toolsInfo.push("`just` (justfile)")
            toolsUsage.push(
              "- Run `just` to see all available tasks, then use `just <task>` for build/test/format",
            )
          }
          if (projectTools.hasPackageJson) {
            toolsInfo.push("`npm`/`bun` (package.json)")
            toolsUsage.push(
              "- Use `npm run <script>` or `bun run <script>` for package.json scripts",
            )
          }
          if (projectTools.hasMakefile) {
            toolsInfo.push("`make` (Makefile)")
            toolsUsage.push("- Use `make <target>` for Makefile targets")
          }
          let toolsSection = ""
          if (toolsInfo.length > 0) {
            toolsSection = `\n## Available Tools\nThis project has: ${toolsInfo.join(", ")}\n\n`
            toolsSection += `**IMPORTANT**: Use these project tools for build, test, and other operations:\n`
            toolsSection += toolsUsage.join("\n") + "\n"
          }

          // Generate a focused prompt for this single task
          const taskPrompt = `# Single Task Execution

**Plan:** ${plan.title || planFile}
${toolsSection}
## Current Task

**${task.title}**

${task.description || "No additional description provided."}

## Instructions

1. Complete the task described above
2. When done, verify the work is correct
3. The task will be automatically marked complete when you finish

${plan.overview ? `\n## Project Context\n\n${plan.overview}` : ""}`

          return `🎯 Executing single task: ${task.title}

---

${taskPrompt}

---

Note: This is a ONE-TIME execution (no loop). The task will be automatically
marked complete when finished. No git commit will be created - review and
commit your changes manually when ready.`
        },
      }),

      "rw-complete": tool({
        description: `Mark a task as complete in the PLAN.md file.

Use after successfully completing a task with rw-task.`,
        args: {
          task: tool.schema.string().describe("Task number (1, 2, 3...) or task name"),
          file: tool.schema
            .string()
            .optional()
            .describe(`Plan file path (default: ${DEFAULT_PLAN_FILE})`),
        },
        async execute(args) {
          const planFile = args.file || DEFAULT_PLAN_FILE
          const content = await readPlanFile(directory, planFile)

          if (!content) {
            return `No plan file found at ${planFile}.`
          }

          const plan = parsePlanFile(content)
          const taskNum = parseInt(args.task, 10)
          let task: PlanTask | undefined

          if (!isNaN(taskNum) && taskNum >= 1 && taskNum <= plan.tasks.length) {
            task = plan.tasks[taskNum - 1]
          } else {
            task = plan.tasks.find((t) => t.title.toLowerCase().includes(args.task.toLowerCase()))
          }

          if (!task) {
            return `Task "${args.task}" not found.`
          }

          if (task.status === "completed") {
            return `Task "${task.title}" is already complete.`
          }

          // Update the plan file
          const updatedContent = updateTaskStatus(content, task.id, plan.tasks, "completed")
          await writePlanFile(directory, planFile, updatedContent)

          const completedCount = plan.tasks.filter((t) => t.status === "completed").length + 1
          const allComplete = completedCount === plan.tasks.length

          let output = `✓ Marked complete: ${task.title}\n\nProgress: ${completedCount}/${plan.tasks.length} tasks complete`

          if (allComplete && plan.completionPromise) {
            output += `\n\n🎉 All tasks complete! The plan's completion promise is:\n<promise>${plan.completionPromise}</promise>`
          }

          return output
        },
      }),

      "rw-start": tool({
        description: `Start a Ralph loop using tasks from a PLAN.md file.

This is the simplest way to start Ralph - just say "start ralph loop" or use this tool.
It reads your PLAN.md, builds a prompt from all pending tasks, and starts iterating.

The loop will:
1. Read the plan file and extract all pending tasks
2. Work through each task one at a time
3. After each task: mark it complete AND create a git commit
4. Continue until all tasks are complete (if completion_promise is set)

Each task gets its own git commit, so you can review them separately later.`,
        args: {
          file: tool.schema
            .string()
            .optional()
            .describe(`Plan file path (default: ${DEFAULT_PLAN_FILE})`),
          maxIterations: tool.schema
            .number()
            .optional()
            .describe("Maximum iterations (default: 0 = unlimited)"),
        },
        async execute(args, toolCtx) {
          const planFile = args.file || DEFAULT_PLAN_FILE
          const maxIterations = args.maxIterations ?? 0
          const content = await readPlanFile(directory, planFile)

          if (!content) {
            return `No plan file found at ${planFile}.

To get started:
1. Use rw-plan to create a plan file
2. Edit the plan with your tasks
3. Run rw-start again`
          }

          const plan = parsePlanFile(content)

          if (plan.tasks.length === 0) {
            return `No tasks found in ${planFile}. Add tasks using checkbox format:\n- [ ] Task description`
          }

          const pendingTasks = plan.tasks.filter((t) => t.status !== "completed")
          if (pendingTasks.length === 0) {
            return `All tasks in ${planFile} are already complete!`
          }

          // Check for existing loop
          const existingState = await readState(directory)
          if (existingState?.active) {
            return `A Ralph loop is already active (iteration ${existingState.iteration}). Use rw-cancel to stop it first.`
          }

          // Find the first pending task
          const firstPendingIdx = plan.tasks.findIndex((t) => t.status !== "completed")
          const firstTask = plan.tasks[firstPendingIdx]
          const firstTaskNum = firstPendingIdx + 1

          // Detect project tools and build a prompt focused on the current task
          const projectTools = await detectProjectTools(directory)
          const taskPrompt = generateSingleTaskPrompt(
            plan,
            firstTask,
            firstTaskNum,
            true,
            projectTools,
          )
          const completionPromise = plan.completionPromise || null
          const sessionId = (toolCtx as { sessionID?: string })?.sessionID || null

          // Create state with loop mode
          const state: RalphState = {
            active: true,
            iteration: 1,
            maxIterations,
            completionPromise,
            prompt: "", // Will be regenerated each iteration
            sessionId,
            startedAt: new Date().toISOString(),
            planFile,
            currentTaskId: firstTask.id,
            mode: "loop",
            currentTaskNum: firstTaskNum,
          }
          await writeState(directory, state)

          let output = `🔄 Ralph loop started from ${planFile}!

Plan: ${plan.title || "Untitled"}
Tasks: ${pendingTasks.length} pending, ${plan.tasks.length - pendingTasks.length} complete
Max iterations: ${maxIterations > 0 ? maxIterations : "unlimited"}
Mode: Loop with auto-commit per task

Starting with task ${firstTaskNum}: ${firstTask.title}

---

${taskPrompt}`

          if (completionPromise) {
            output += `

═══════════════════════════════════════════════════════════
COMPLETION: Output <promise>${completionPromise}</promise> when ALL tasks are done
═══════════════════════════════════════════════════════════`
          }

          return output
        },
      }),
    },
  }
}

export { RalphWiggumPlugin }
