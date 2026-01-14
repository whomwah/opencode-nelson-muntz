import { readPlanFile, writePlanFile, parsePlanFile, updateTaskStatus } from "./plan"

/**
 * Create a git commit for a completed task
 */
export async function createGitCommit(
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
  // Git commit format: subject line (short), blank line, body (details)
  // If taskTitle has **heading** format, extract heading as subject, rest as body
  const headingMatch = taskTitle.match(/^\*\*(.+?)\*\*(.*)$/)
  let commitSubject: string
  let commitBody: string | null = null

  if (headingMatch) {
    const heading = headingMatch[1].trim()
    const description = headingMatch[2].trim()
    commitSubject = `feat(ralph): task ${taskNum} - ${heading}`
    if (description) {
      commitBody = description
    }
  } else {
    commitSubject = `feat(ralph): task ${taskNum} - ${taskTitle}`
  }

  const commitArgs = ["commit", "-m", commitSubject]
  if (commitBody) {
    commitArgs.push("-m", commitBody)
  }
  const commitResult = await runCommand("git", commitArgs)
  if (commitResult.code !== 0) {
    return { success: false, message: `Failed to commit: ${commitResult.stderr}` }
  }

  return { success: true, message: `Created commit: ${commitSubject}` }
}

/**
 * Mark a task as complete in the plan file and optionally create a git commit
 */
export async function markTaskCompleteAndCommit(
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
