import type { ParsedPlan, PlanTask, ProjectTools } from "./types"

/**
 * Options for generating task prompts
 */
export interface PromptOptions {
  /** Use compact format (omits overview, task list, detailed instructions) */
  compact?: boolean
  /** Detected project tools */
  projectTools?: ProjectTools
}

/**
 * Generate a prompt for executing a single task from a plan
 *
 * @param plan - The parsed plan
 * @param task - The current task to execute
 * @param taskNum - 1-based task number
 * @param isLoopMode - Whether running in loop mode (affects instructions)
 * @param options - Optional settings including compact mode and project tools
 */
export function generateSingleTaskPrompt(
  plan: ParsedPlan,
  task: PlanTask,
  taskNum: number,
  isLoopMode: boolean,
  options?: PromptOptions,
): string {
  const { compact = false, projectTools } = options || {}
  const completedCount = plan.tasks.filter((t) => t.status === "completed").length

  // Compact format: minimal context for subsequent iterations
  if (compact) {
    let prompt = `## Task ${taskNum}/${plan.tasks.length} (${completedCount} done)\n\n`
    prompt += `**${task.title}**\n\n`
    prompt += task.description || "No description."
    prompt += `\n\nComplete this task, then the loop continues.`
    return prompt
  }

  // Full format: complete context for first iteration
  let prompt = `# ${plan.title || "Project Plan"}\n\n`

  if (plan.overview) {
    prompt += `## Context\n${plan.overview}\n\n`
  }

  // Compact project tools (single line)
  if (projectTools) {
    const tools: string[] = []
    if (projectTools.hasJustfile) tools.push("just")
    if (projectTools.hasPackageJson) tools.push("npm/bun")
    if (projectTools.hasMakefile) tools.push("make")
    if (tools.length > 0) {
      prompt += `**Tools**: ${tools.join(", ")} available. Run \`just\` or check package.json for commands.\n\n`
    }
  }

  // Progress and task list
  prompt += `## Progress: ${completedCount}/${plan.tasks.length}\n\n`
  for (let i = 0; i < plan.tasks.length; i++) {
    const t = plan.tasks[i]
    const marker = t.status === "completed" ? "✓" : i === taskNum - 1 ? "→" : " "
    prompt += `${marker} ${i + 1}. ${t.title}\n`
  }

  prompt += `\n## Current: Task ${taskNum}\n\n`
  prompt += `**${task.title}**\n\n`
  prompt += task.description || "No description."
  prompt += `\n\n`

  // Compact instructions
  if (isLoopMode) {
    prompt += `Complete thoroughly. Task auto-marks done + commits. Focus on this task only.`
  } else {
    prompt += `Complete thoroughly. Task auto-marks done. Commit manually when ready.`
  }

  return prompt
}
