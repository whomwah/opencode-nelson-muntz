import { tool } from "@opencode-ai/plugin"
import type { NelsonState, PlanTask } from "./types"
import { readState, writeState } from "./state"
import { slugify, detectProjectTools, formatProjectToolsCompact } from "./utils"
import {
  DEFAULT_PLAN_DIR,
  DEFAULT_PLAN_FILE,
  readPlanFile,
  writePlanFile,
  parsePlanFile,
  updateTaskStatus,
  resolvePlanFile,
  listPlanFiles,
} from "./plan"
import { generateSingleTaskPrompt } from "./prompts"

/**
 * Create plan-related tools for Nelson Muntz
 */
export function createPlanTools(directory: string) {
  /**
   * Format a "plan not found" error message with available plan suggestions
   */
  async function formatPlanNotFoundError(planFile: string): Promise<string> {
    const availablePlans = await listPlanFiles(directory)

    let message = `No plan file found at ${planFile}.`

    if (availablePlans.length > 0) {
      const planNames = availablePlans.map((p) => p.name).join(", ")
      message += `\n\nAvailable plans: ${planNames}`
      message += `\n\nUse one of these with the 'name' parameter, or create a new plan with nm-plan.`
    } else {
      message += `\n\nNo plans found in ${DEFAULT_PLAN_DIR}/. Use nm-plan to create one.`
    }

    return message
  }

  return {
    "nm-plan": tool({
      description: `Create or view a plan file for structured task management.

Actions: 'create' (prepare), 'view' (show), 'save' (write content)
Plans stored in .opencode/plans/ as markdown with checkbox tasks.
Filename: file param > slugified name > slugified description > "plan.md"

Plan format: # Title, ## Overview, ## Tasks with - [ ] **Task**, optional completion_promise.

Workflow: 1) action='create' to get path, 2) generate plan and show user, 3) action='save' with content to write file.`,
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
            return await formatPlanNotFoundError(planFile)
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
- nm-tasks: List all tasks
- nm-start: Start the Nelson loop with this plan
- nm-task <num>: Execute a single task`
        }

        // Create action - return target path for assistant to generate plan content
        const existingContent = await readPlanFile(directory, planFile)
        if (existingContent) {
          return `Plan file already exists at ${planFile}. Use nm-plan with action='view' to see it, or delete it first to create a new one.`
        }

        return `Ready to create plan.

Target file: ${planFile}

Generate a plan for the user based on their request, then show it to them.
When they approve (or after any revisions), save it with:
  nm-plan action='save' file='${planFile}' content=<plan content>`
      },
    }),

    "nm-plans": tool({
      description: `List all plan files in ${DEFAULT_PLAN_DIR}. Use plan names with nm-tasks, nm-task, nm-start.`,
      args: {},
      async execute() {
        const plans = await listPlanFiles(directory)

        if (plans.length === 0) {
          return `No plans found in ${DEFAULT_PLAN_DIR}/.\n\nCreate a plan with: nm-plan create name="my-plan"`
        }

        let output = `📋 Available plans in ${DEFAULT_PLAN_DIR}/\n\n`

        for (const plan of plans) {
          const content = await readPlanFile(directory, plan.path)
          if (content) {
            const parsed = parsePlanFile(content)
            const completed = parsed.tasks.filter((t) => t.status === "completed").length
            const total = parsed.tasks.length
            const progress = total > 0 ? `${completed}/${total} tasks` : "no tasks"
            output += `• ${plan.name} (${progress})\n`
          } else {
            output += `• ${plan.name}\n`
          }
        }

        output += `\nUsage:\n`
        output += `• nm-tasks name="plan-name"  List tasks in a plan\n`
        output += `• nm-task 1 name="plan-name" Execute task #1\n`
        output += `• nm-start name="plan-name"  Start loop for all tasks`

        return output
      },
    }),

    "nm-tasks": tool({
      description: `List tasks from a plan. Shows IDs, titles, status. Specify plan by name or file param.`,
      args: {
        name: tool.schema
          .string()
          .optional()
          .describe(
            "Plan name (e.g., 'rest-api' or 'My API') - resolves to .opencode/plans/{slug}.md",
          ),
        file: tool.schema
          .string()
          .optional()
          .describe(`Plan file path (default: ${DEFAULT_PLAN_FILE})`),
      },
      async execute(args) {
        // Resolve plan file: name takes precedence over file, then default
        const planFile = args.name ? resolvePlanFile(args.name) : args.file || DEFAULT_PLAN_FILE
        const content = await readPlanFile(directory, planFile)

        if (!content) {
          return await formatPlanNotFoundError(planFile)
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
        output += `- nm-task 1      Execute task #1\n`
        output += `- nm-task "name" Execute task by name\n`
        output += `- nm-start       Start loop for all tasks`

        return output
      },
    }),

    "nm-task": tool({
      description: `Execute a single task (no loop). Specify by number or name. Auto-marks done, no commit.`,
      args: {
        task: tool.schema.string().describe("Task number (1, 2, 3...) or task name/keyword"),
        name: tool.schema
          .string()
          .optional()
          .describe(
            "Plan name (e.g., 'rest-api' or 'My API') - resolves to .opencode/plans/{slug}.md",
          ),
        file: tool.schema
          .string()
          .optional()
          .describe(`Plan file path (default: ${DEFAULT_PLAN_FILE})`),
      },
      async execute(args, toolCtx) {
        // Resolve plan file: name takes precedence over file, then default
        const planFile = args.name ? resolvePlanFile(args.name) : args.file || DEFAULT_PLAN_FILE
        const content = await readPlanFile(directory, planFile)

        if (!content) {
          return await formatPlanNotFoundError(planFile)
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
            return `Task "${args.task}" not found. Use nm-tasks to see available tasks.`
          }
        }

        if (task.status === "completed") {
          return `Task "${task.title}" is already marked as complete. To re-run it, uncheck it in ${planFile} first.`
        }

        // Check for existing loop
        const existingState = await readState(directory)
        if (existingState?.active) {
          return `A Nelson loop is already active (iteration ${existingState.iteration}). Use nm-cancel to stop it first.`
        }

        // Get session ID from tool context
        const sessionId = (toolCtx as { sessionID?: string })?.sessionID || null

        // Create state for single-task mode
        const state: NelsonState = {
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
        const toolsLine = formatProjectToolsCompact(projectTools)

        // Generate a focused prompt for this single task
        const taskPrompt = `# Single Task Execution

**Plan:** ${plan.title || planFile}
${toolsLine ? `\n${toolsLine}\n` : ""}
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

    "nm-complete": tool({
      description: `Mark a task complete in plan file. Use after nm-task. Specify plan by name or file.`,
      args: {
        task: tool.schema.string().describe("Task number (1, 2, 3...) or task name"),
        name: tool.schema
          .string()
          .optional()
          .describe(
            "Plan name (e.g., 'rest-api' or 'My API') - resolves to .opencode/plans/{slug}.md",
          ),
        file: tool.schema
          .string()
          .optional()
          .describe(`Plan file path (default: ${DEFAULT_PLAN_FILE})`),
      },
      async execute(args) {
        // Resolve plan file: name takes precedence over file, then default
        const planFile = args.name ? resolvePlanFile(args.name) : args.file || DEFAULT_PLAN_FILE
        const content = await readPlanFile(directory, planFile)

        if (!content) {
          return await formatPlanNotFoundError(planFile)
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

    "nm-start": tool({
      description: `Start Nelson loop from a plan. Works through pending tasks sequentially.
After each task: auto-marks complete + creates git commit. Specify plan by name or file.`,
      args: {
        name: tool.schema
          .string()
          .optional()
          .describe(
            "Plan name (e.g., 'rest-api' or 'My API') - resolves to .opencode/plans/{slug}.md",
          ),
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
        // Resolve plan file: name takes precedence over file, then default
        const planFile = args.name ? resolvePlanFile(args.name) : args.file || DEFAULT_PLAN_FILE
        const maxIterations = args.maxIterations ?? 0
        const content = await readPlanFile(directory, planFile)

        if (!content) {
          return await formatPlanNotFoundError(planFile)
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
          return `A Nelson loop is already active (iteration ${existingState.iteration}). Use nm-cancel to stop it first.`
        }

        // Find the first pending task
        const firstPendingIdx = plan.tasks.findIndex((t) => t.status !== "completed")
        const firstTask = plan.tasks[firstPendingIdx]
        const firstTaskNum = firstPendingIdx + 1

        // Detect project tools and build a prompt focused on the current task
        const projectTools = await detectProjectTools(directory)
        const taskPrompt = generateSingleTaskPrompt(plan, firstTask, firstTaskNum, true, {
          compact: false, // Full format for first iteration
          projectTools,
        })
        const completionPromise = plan.completionPromise || null
        const sessionId = (toolCtx as { sessionID?: string })?.sessionID || null

        // Create state with loop mode
        const state: NelsonState = {
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

        let output = `🔄 Nelson loop started from ${planFile}!

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
