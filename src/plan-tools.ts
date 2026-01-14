import { tool } from "@opencode-ai/plugin"
import type { RalphState, PlanTask } from "./types"
import { readState, writeState } from "./state"
import { slugify, detectProjectTools } from "./utils"
import {
  DEFAULT_PLAN_DIR,
  DEFAULT_PLAN_FILE,
  readPlanFile,
  writePlanFile,
  parsePlanFile,
  updateTaskStatus,
} from "./plan"
import { generateSingleTaskPrompt } from "./prompts"

/**
 * Create plan-related tools for Ralph Wiggum
 */
export function createPlanTools(directory: string) {
  return {
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
          toolsUsage.push("- Use `npm run <script>` or `bun run <script>` for package.json scripts")
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
  }
}
