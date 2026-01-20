import type { ParsedPlan, PlanTask, ProjectTools } from "./types"

/**
 * Generate a prompt for executing a single task from a plan
 * On iteration > 1, uses a compact format to reduce token usage
 */
export function generateSingleTaskPrompt(
  plan: ParsedPlan,
  task: PlanTask,
  taskNum: number,
  isLoopMode: boolean,
  projectTools?: ProjectTools,
  iteration?: number,
): string {
  const isFirstIteration = !iteration || iteration <= 1
  const completedCount = plan.tasks.filter((t) => t.status === "completed").length

  // Compact format for subsequent iterations
  if (!isFirstIteration) {
    let prompt = `## Task ${taskNum}/${plan.tasks.length} (${completedCount} done)\n\n`
    prompt += `**${task.title}**\n\n`
    prompt += task.description || "No description."
    prompt += `\n\nComplete this task, then the loop continues.`
    return prompt
  }

  // Full format for first iteration
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
