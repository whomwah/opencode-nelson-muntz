import { describe, expect, test } from "bun:test"
import { generateSingleTaskPrompt } from "./prompts"
import type { ParsedPlan, PlanTask, ProjectTools } from "./types"

describe("generateSingleTaskPrompt", () => {
  const createTask = (overrides: Partial<PlanTask> = {}): PlanTask => ({
    id: "task-1",
    title: "Test Task",
    description: "Task description",
    status: "pending",
    lineNumber: 1,
    ...overrides,
  })

  const createPlan = (overrides: Partial<ParsedPlan> = {}): ParsedPlan => ({
    title: "Test Plan",
    overview: "Plan overview",
    tasks: [createTask()],
    completionPromise: null,
    rawContent: "",
    ...overrides,
  })

  describe("full format (compact: false)", () => {
    test("includes plan title", () => {
      const plan = createPlan({ title: "My Awesome Plan" })
      const prompt = generateSingleTaskPrompt(plan, plan.tasks[0], 1, false, { compact: false })
      expect(prompt).toContain("# My Awesome Plan")
    })

    test("uses fallback title when not provided", () => {
      const plan = createPlan({ title: "" })
      const prompt = generateSingleTaskPrompt(plan, plan.tasks[0], 1, false, { compact: false })
      expect(prompt).toContain("# Project Plan")
    })

    test("includes project context from overview", () => {
      const plan = createPlan({ overview: "This is important context." })
      const prompt = generateSingleTaskPrompt(plan, plan.tasks[0], 1, false, { compact: false })
      expect(prompt).toContain("## Context")
      expect(prompt).toContain("This is important context.")
    })

    test("omits project context when overview is empty", () => {
      const plan = createPlan({ overview: "" })
      const prompt = generateSingleTaskPrompt(plan, plan.tasks[0], 1, false, { compact: false })
      expect(prompt).not.toContain("## Context")
    })

    test("includes current task number and title", () => {
      const task = createTask({ title: "Implement Feature X" })
      const plan = createPlan({ tasks: [task] })
      const prompt = generateSingleTaskPrompt(plan, task, 1, false, { compact: false })
      expect(prompt).toContain("## Current: Task 1")
      expect(prompt).toContain("**Implement Feature X**")
    })

    test("includes task description", () => {
      const task = createTask({ description: "Detailed instructions here." })
      const plan = createPlan({ tasks: [task] })
      const prompt = generateSingleTaskPrompt(plan, task, 1, false, { compact: false })
      expect(prompt).toContain("Detailed instructions here.")
    })

    test("shows fallback when task has no description", () => {
      const task = createTask({ description: "" })
      const plan = createPlan({ tasks: [task] })
      const prompt = generateSingleTaskPrompt(plan, task, 1, false, { compact: false })
      expect(prompt).toContain("No description.")
    })

    test("shows progress count", () => {
      const tasks = [
        createTask({ id: "task-1", status: "completed" }),
        createTask({ id: "task-2", status: "completed" }),
        createTask({ id: "task-3", status: "pending" }),
      ]
      const plan = createPlan({ tasks })
      const prompt = generateSingleTaskPrompt(plan, tasks[2], 3, false, { compact: false })
      expect(prompt).toContain("## Progress: 2/3")
    })

    test("shows all tasks with current one marked with arrow", () => {
      const tasks = [
        createTask({ id: "task-1", title: "First", status: "completed" }),
        createTask({ id: "task-2", title: "Second", status: "pending" }),
        createTask({ id: "task-3", title: "Third", status: "pending" }),
      ]
      const plan = createPlan({ tasks })
      const prompt = generateSingleTaskPrompt(plan, tasks[1], 2, false, { compact: false })

      expect(prompt).toContain("✓ 1. First")
      expect(prompt).toContain("→ 2. Second")
      expect(prompt).toContain("  3. Third")
    })
  })

  describe("compact format (compact: true)", () => {
    test("uses compact format", () => {
      const task = createTask({ title: "Second Task" })
      const plan = createPlan({ tasks: [createTask(), task] })
      const prompt = generateSingleTaskPrompt(plan, task, 2, true, { compact: true })

      // Should NOT contain full format elements
      expect(prompt).not.toContain("# Test Plan")
      expect(prompt).not.toContain("## Context")
      expect(prompt).not.toContain("## Progress:")

      // Should contain compact format
      expect(prompt).toContain("## Task 2/2")
      expect(prompt).toContain("**Second Task**")
      expect(prompt).toContain("Complete this task, then the loop continues.")
    })

    test("compact format shows completion count", () => {
      const tasks = [
        createTask({ id: "task-1", status: "completed" }),
        createTask({ id: "task-2", status: "pending" }),
      ]
      const plan = createPlan({ tasks })
      const prompt = generateSingleTaskPrompt(plan, tasks[1], 2, true, { compact: true })

      expect(prompt).toContain("## Task 2/2 (1 done)")
    })

    test("compact format includes description", () => {
      const task = createTask({ description: "Important details here." })
      const plan = createPlan({ tasks: [task] })
      const prompt = generateSingleTaskPrompt(plan, task, 1, true, { compact: true })

      expect(prompt).toContain("Important details here.")
    })

    test("compact format shows fallback for empty description", () => {
      const task = createTask({ description: "" })
      const plan = createPlan({ tasks: [task] })
      const prompt = generateSingleTaskPrompt(plan, task, 1, true, { compact: true })

      expect(prompt).toContain("No description.")
    })

    test("compact format omits project tools", () => {
      const plan = createPlan()
      const tools: ProjectTools = { hasJustfile: true, hasPackageJson: true, hasMakefile: false }
      const prompt = generateSingleTaskPrompt(plan, plan.tasks[0], 1, true, {
        compact: true,
        projectTools: tools,
      })

      expect(prompt).not.toContain("**Tools**:")
    })
  })

  describe("project tools", () => {
    test("shows compact tools line for justfile", () => {
      const plan = createPlan()
      const tools: ProjectTools = { hasJustfile: true, hasPackageJson: false, hasMakefile: false }
      const prompt = generateSingleTaskPrompt(plan, plan.tasks[0], 1, false, {
        compact: false,
        projectTools: tools,
      })

      expect(prompt).toContain("**Tools**: just available")
    })

    test("shows compact tools line for multiple tools", () => {
      const plan = createPlan()
      const tools: ProjectTools = { hasJustfile: true, hasPackageJson: true, hasMakefile: true }
      const prompt = generateSingleTaskPrompt(plan, plan.tasks[0], 1, false, {
        compact: false,
        projectTools: tools,
      })

      expect(prompt).toContain("**Tools**: just, npm/bun, make available")
    })

    test("omits tools section when no tools available", () => {
      const plan = createPlan()
      const tools: ProjectTools = { hasJustfile: false, hasPackageJson: false, hasMakefile: false }
      const prompt = generateSingleTaskPrompt(plan, plan.tasks[0], 1, false, {
        compact: false,
        projectTools: tools,
      })

      expect(prompt).not.toContain("**Tools**:")
    })
  })

  describe("loop mode vs single task mode", () => {
    test("shows compact loop mode instruction", () => {
      const plan = createPlan()
      const prompt = generateSingleTaskPrompt(plan, plan.tasks[0], 1, true, { compact: false })

      expect(prompt).toContain("Task auto-marks done + commits")
      expect(prompt).toContain("Focus on this task only")
    })

    test("shows compact single task mode instruction", () => {
      const plan = createPlan()
      const prompt = generateSingleTaskPrompt(plan, plan.tasks[0], 1, false, { compact: false })

      expect(prompt).toContain("Task auto-marks done")
      expect(prompt).toContain("Commit manually when ready")
    })
  })

  describe("backward compatibility (no options)", () => {
    test("defaults to full format when options is undefined", () => {
      const plan = createPlan({ title: "Test" })
      const prompt = generateSingleTaskPrompt(plan, plan.tasks[0], 1, false)

      expect(prompt).toContain("# Test")
      expect(prompt).toContain("## Progress:")
    })

    test("defaults to full format when compact is not specified", () => {
      const plan = createPlan({ title: "Test" })
      const prompt = generateSingleTaskPrompt(plan, plan.tasks[0], 1, false, {})

      expect(prompt).toContain("# Test")
    })
  })

  describe("complex scenarios", () => {
    test("generates complete prompt with all features in full format", () => {
      const tasks = [
        createTask({ id: "task-1", title: "Setup", status: "completed", lineNumber: 5 }),
        createTask({
          id: "task-2",
          title: "Implement Core",
          description: "Build the main functionality",
          status: "pending",
          lineNumber: 6,
        }),
        createTask({ id: "task-3", title: "Test", status: "pending", lineNumber: 7 }),
      ]
      const plan = createPlan({
        title: "API Development",
        overview: "Building a REST API for user management",
        tasks,
        completionPromise: "ALL_DONE",
      })
      const tools: ProjectTools = { hasJustfile: true, hasPackageJson: true, hasMakefile: false }

      const prompt = generateSingleTaskPrompt(plan, tasks[1], 2, true, {
        compact: false,
        projectTools: tools,
      })

      // Title
      expect(prompt).toContain("# API Development")
      // Overview
      expect(prompt).toContain("Building a REST API for user management")
      // Tools (compact)
      expect(prompt).toContain("**Tools**: just, npm/bun available")
      // Progress
      expect(prompt).toContain("## Progress: 1/3")
      // Task list with markers
      expect(prompt).toContain("✓ 1. Setup")
      expect(prompt).toContain("→ 2. Implement Core")
      expect(prompt).toContain("  3. Test")
      // Current task
      expect(prompt).toContain("## Current: Task 2")
      expect(prompt).toContain("**Implement Core**")
      expect(prompt).toContain("Build the main functionality")
      // Compact loop instructions
      expect(prompt).toContain("auto-marks done + commits")
    })

    test("handles single task plan", () => {
      const task = createTask({ title: "Only Task" })
      const plan = createPlan({ tasks: [task] })
      const prompt = generateSingleTaskPrompt(plan, task, 1, false, { compact: false })

      expect(prompt).toContain("## Progress: 0/1")
      expect(prompt).toContain("→ 1. Only Task")
    })
  })
})
