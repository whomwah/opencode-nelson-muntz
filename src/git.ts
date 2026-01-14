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
  // Task titles may be in formats like:
  //   "**Create file** - description"  (with ** markers)
  //   "Create file** - description"    (trailing ** from parser)
  //   "Create file - description"      (plain text)
  // We want to extract the heading (before " - ") as subject, rest as body
  let commitSubject: string
  let commitBody: string | null = null

  // First, clean up any ** markers from the title
  const cleanTitle = taskTitle.replace(/\*\*/g, "").trim()

  // Split on " - " to separate heading from description
  const separatorIdx = cleanTitle.indexOf(" - ")
  if (separatorIdx !== -1) {
    const heading = cleanTitle.slice(0, separatorIdx).trim()
    const description = cleanTitle.slice(separatorIdx + 3).trim()
    commitSubject = `feat(nelson): task ${taskNum} - ${heading}`
    if (description) {
      commitBody = description
    }
  } else {
    commitSubject = `feat(nelson): task ${taskNum} - ${cleanTitle}`
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
