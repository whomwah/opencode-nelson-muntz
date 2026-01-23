/**
 * State for the Nelson Muntz loop, persisted to .opencode/nelson-state.local.json
 */
export interface NelsonState {
  active: boolean
  iteration: number
  maxIterations: number
  completionPromise: string | null
  sessionId: string | null
  startedAt: string
  planFile?: string | null
  currentTaskId?: string | null
  mode?: "loop" | "single-task"
  currentTaskNum?: number | null
}

/**
 * A task parsed from a PLAN.md file
 */
export interface PlanTask {
  id: string
  title: string
  description: string
  status: "pending" | "in_progress" | "completed" | "skipped"
  lineNumber: number
}

/**
 * A parsed PLAN.md file with metadata and tasks
 */
export interface ParsedPlan {
  title: string
  overview: string
  tasks: PlanTask[]
  completionPromise: string | null
  rawContent: string
}

/**
 * Detected project tools (justfile, package.json, Makefile)
 */
export interface ProjectTools {
  hasJustfile: boolean
  hasPackageJson: boolean
  hasMakefile: boolean
}
