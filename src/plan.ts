import * as path from "node:path"
import { mkdir, readdir } from "node:fs/promises"
import type { PlanTask, ParsedPlan } from "./types"
import { slugify } from "./utils"

export const DEFAULT_PLAN_DIR = ".opencode/plans"
export const DEFAULT_PLAN_FILE = `${DEFAULT_PLAN_DIR}/PLAN.md`

/**
 * Resolve a plan file path from either an explicit path or a plan name.
 *
 * @param input - Either a file path (contains `/` or ends with `.md`) or a plan name
 * @returns The resolved file path (relative to project root)
 *
 * @example
 * resolvePlanFile("rest-api")           // ".opencode/plans/rest-api.md"
 * resolvePlanFile("My New Plan")        // ".opencode/plans/my-new-plan.md"
 * resolvePlanFile("custom/plan.md")     // "custom/plan.md"
 * resolvePlanFile(".opencode/plans/x.md") // ".opencode/plans/x.md"
 */
export function resolvePlanFile(input: string): string {
  // If input looks like a path (contains / or ends with .md), use as-is
  if (input.includes("/") || input.endsWith(".md")) {
    return input
  }

  // Otherwise, treat as a name and convert to path
  const slug = slugify(input)
  return `${DEFAULT_PLAN_DIR}/${slug}.md`
}

/**
 * List all plan files in the default plans directory.
 *
 * @param directory - The project root directory
 * @returns Array of plan file info (name without extension and relative path)
 *
 * @example
 * const plans = await listPlanFiles("/path/to/project")
 * // [{ name: "rest-api", path: ".opencode/plans/rest-api.md" }, ...]
 */
export async function listPlanFiles(
  directory: string,
): Promise<Array<{ name: string; path: string }>> {
  const plansDir = path.join(directory, DEFAULT_PLAN_DIR)
  try {
    const entries = await readdir(plansDir, { withFileTypes: true })
    return entries
      .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
      .map((entry) => ({
        name: entry.name.replace(/\.md$/, ""),
        path: `${DEFAULT_PLAN_DIR}/${entry.name}`,
      }))
      .sort((a, b) => a.name.localeCompare(b.name))
  } catch {
    // Directory doesn't exist or can't be read
    return []
  }
}

/**
 * Read a plan file from disk
 */
export async function readPlanFile(directory: string, planFile: string): Promise<string | null> {
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

/**
 * Write a plan file to disk
 */
export async function writePlanFile(
  directory: string,
  planFile: string,
  content: string,
): Promise<void> {
  const planPath = path.isAbsolute(planFile) ? planFile : path.join(directory, planFile)
  const dir = path.dirname(planPath)
  await mkdir(dir, { recursive: true })
  await Bun.write(planPath, content)
}

/**
 * Parse a PLAN.md file into structured data
 */
export function parsePlanFile(content: string): ParsedPlan {
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

/**
 * Update a task's status in the plan file content
 */
export function updateTaskStatus(
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

/**
 * Default template for new plan files
 */
export const PLAN_TEMPLATE = `# Project Plan

<!-- Optional: Set a completion promise -->
<!-- completion_promise: ALL_TASKS_COMPLETE -->

## Overview

Describe your project goals and context here. This section helps the AI understand
the bigger picture and make better decisions.

## Tasks

<!-- Order tasks by execution sequence: foundational work first, then features that depend on it -->

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
