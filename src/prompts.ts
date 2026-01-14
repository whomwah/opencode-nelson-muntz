import type { ParsedPlan, PlanTask, ProjectTools } from "./types"

/**
 * Generate a prompt for executing a single task from a plan
 */
export function generateSingleTaskPrompt(
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
