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

  describe("basic prompt structure", () => {
    test("includes plan title", () => {
      const plan = createPlan({ title: "My Awesome Plan" })
      const prompt = generateSingleTaskPrompt(plan, plan.tasks[0], 1, false)
      expect(prompt).toContain("# My Awesome Plan")
    })

    test("uses fallback title when not provided", () => {
      const plan = createPlan({ title: "" })
      const prompt = generateSingleTaskPrompt(plan, plan.tasks[0], 1, false)
      expect(prompt).toContain("# Project Plan")
    })

    test("includes project context from overview", () => {
      const plan = createPlan({ overview: "This is important context." })
      const prompt = generateSingleTaskPrompt(plan, plan.tasks[0], 1, false)
      expect(prompt).toContain("## Project Context")
      expect(prompt).toContain("This is important context.")
    })

    test("omits project context when overview is empty", () => {
      const plan = createPlan({ overview: "" })
      const prompt = generateSingleTaskPrompt(plan, plan.tasks[0], 1, false)
      expect(prompt).not.toContain("## Project Context")
    })

    test("includes current task number and title", () => {
      const task = createTask({ title: "Implement Feature X" })
      const plan = createPlan({ tasks: [task] })
      const prompt = generateSingleTaskPrompt(plan, task, 1, false)
      expect(prompt).toContain("## Current Task: #1")
      expect(prompt).toContain("**Implement Feature X**")
    })

    test("includes task description", () => {
      const task = createTask({ description: "Detailed instructions here." })
      const plan = createPlan({ tasks: [task] })
      const prompt = generateSingleTaskPrompt(plan, task, 1, false)
      expect(prompt).toContain("Detailed instructions here.")
    })

    test("shows fallback when task has no description", () => {
      const task = createTask({ description: "" })
      const plan = createPlan({ tasks: [task] })
      const prompt = generateSingleTaskPrompt(plan, task, 1, false)
      expect(prompt).toContain("No additional description provided.")
    })
  })

  describe("progress tracking", () => {
    test("shows progress count", () => {
      const tasks = [
        createTask({ id: "task-1", status: "completed" }),
        createTask({ id: "task-2", status: "completed" }),
        createTask({ id: "task-3", status: "pending" }),
      ]
      const plan = createPlan({ tasks })
      const prompt = generateSingleTaskPrompt(plan, tasks[2], 3, false)
      expect(prompt).toContain("## Progress: 2/3 tasks complete")
    })

    test("shows all tasks with current one marked", () => {
      const tasks = [
        createTask({ id: "task-1", title: "First", status: "completed" }),
        createTask({ id: "task-2", title: "Second", status: "pending" }),
        createTask({ id: "task-3", title: "Third", status: "pending" }),
      ]
      const plan = createPlan({ tasks })
      const prompt = generateSingleTaskPrompt(plan, tasks[1], 2, false)

      expect(prompt).toContain("1. [x] First")
      expect(prompt).toContain("2. [ ] Second ← CURRENT")
      expect(prompt).toContain("3. [ ] Third")
    })

    test("shows checkboxes correctly for completed and pending tasks", () => {
      const tasks = [
        createTask({ id: "task-1", status: "completed" }),
        createTask({ id: "task-2", status: "pending" }),
      ]
      const plan = createPlan({ tasks })
      const prompt = generateSingleTaskPrompt(plan, tasks[0], 1, false)

      expect(prompt).toMatch(/\[x\].*← CURRENT/)
      expect(prompt).toMatch(/\[ \]/)
    })
  })

  describe("project tools", () => {
    test("shows justfile when available", () => {
      const plan = createPlan()
      const tools: ProjectTools = { hasJustfile: true, hasPackageJson: false, hasMakefile: false }
      const prompt = generateSingleTaskPrompt(plan, plan.tasks[0], 1, false, tools)

      expect(prompt).toContain("## Available Tools")
      expect(prompt).toContain("`just` (justfile)")
      expect(prompt).toContain("Run `just` to see all available tasks")
    })

    test("shows package.json when available", () => {
      const plan = createPlan()
      const tools: ProjectTools = { hasJustfile: false, hasPackageJson: true, hasMakefile: false }
      const prompt = generateSingleTaskPrompt(plan, plan.tasks[0], 1, false, tools)

      expect(prompt).toContain("`npm`/`bun` (package.json)")
      expect(prompt).toContain("Use `npm run <script>` or `bun run <script>`")
    })

    test("shows Makefile when available", () => {
      const plan = createPlan()
      const tools: ProjectTools = { hasJustfile: false, hasPackageJson: false, hasMakefile: true }
      const prompt = generateSingleTaskPrompt(plan, plan.tasks[0], 1, false, tools)

      expect(prompt).toContain("`make` (Makefile)")
      expect(prompt).toContain("Use `make <target>`")
    })

    test("shows multiple tools when available", () => {
      const plan = createPlan()
      const tools: ProjectTools = { hasJustfile: true, hasPackageJson: true, hasMakefile: true }
      const prompt = generateSingleTaskPrompt(plan, plan.tasks[0], 1, false, tools)

      expect(prompt).toContain("`just` (justfile)")
      expect(prompt).toContain("`npm`/`bun` (package.json)")
      expect(prompt).toContain("`make` (Makefile)")
    })

    test("omits tools section when no tools available", () => {
      const plan = createPlan()
      const tools: ProjectTools = { hasJustfile: false, hasPackageJson: false, hasMakefile: false }
      const prompt = generateSingleTaskPrompt(plan, plan.tasks[0], 1, false, tools)

      expect(prompt).not.toContain("## Available Tools")
    })

    test("omits tools section when projectTools is undefined", () => {
      const plan = createPlan()
      const prompt = generateSingleTaskPrompt(plan, plan.tasks[0], 1, false)

      expect(prompt).not.toContain("## Available Tools")
    })
  })

  describe("loop mode vs single task mode", () => {
    test("shows loop mode instructions when isLoopMode is true", () => {
      const plan = createPlan()
      const prompt = generateSingleTaskPrompt(plan, plan.tasks[0], 1, true)

      expect(prompt).toContain("## Instructions")
      expect(prompt).toContain("Verify your work is correct")
      expect(prompt).toContain("The task will be automatically marked complete")
      expect(prompt).toContain("A git commit will be created for this task")
      expect(prompt).toContain("The loop will continue to the next task")
      expect(prompt).toContain("Focus ONLY on this task - do not work ahead")
    })

    test("shows single task mode instructions when isLoopMode is false", () => {
      const plan = createPlan()
      const prompt = generateSingleTaskPrompt(plan, plan.tasks[0], 1, false)

      expect(prompt).toContain("## Instructions")
      expect(prompt).toContain("Verify your work is correct")
      expect(prompt).toContain("The task will be automatically marked complete")
      expect(prompt).toContain("Review your changes and commit manually")
      expect(prompt).not.toContain("A git commit will be created")
      expect(prompt).not.toContain("The loop will continue")
    })
  })

  describe("complex scenarios", () => {
    test("generates complete prompt with all features", () => {
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

      const prompt = generateSingleTaskPrompt(plan, tasks[1], 2, true, tools)

      // Title
      expect(prompt).toContain("# API Development")
      // Overview
      expect(prompt).toContain("Building a REST API for user management")
      // Tools
      expect(prompt).toContain("## Available Tools")
      // Progress
      expect(prompt).toContain("## Progress: 1/3 tasks complete")
      // Task list
      expect(prompt).toContain("1. [x] Setup")
      expect(prompt).toContain("2. [ ] Implement Core ← CURRENT")
      expect(prompt).toContain("3. [ ] Test")
      // Current task
      expect(prompt).toContain("## Current Task: #2")
      expect(prompt).toContain("**Implement Core**")
      expect(prompt).toContain("Build the main functionality")
      // Loop instructions
      expect(prompt).toContain("A git commit will be created")
    })

    test("handles first task in list", () => {
      const tasks = [
        createTask({ id: "task-1", title: "First Task" }),
        createTask({ id: "task-2", title: "Second Task" }),
      ]
      const plan = createPlan({ tasks })
      const prompt = generateSingleTaskPrompt(plan, tasks[0], 1, false)

      expect(prompt).toContain("## Current Task: #1")
      expect(prompt).toContain("1. [ ] First Task ← CURRENT")
    })

    test("handles last task in list", () => {
      const tasks = [
        createTask({ id: "task-1", title: "First Task", status: "completed" }),
        createTask({ id: "task-2", title: "Last Task" }),
      ]
      const plan = createPlan({ tasks })
      const prompt = generateSingleTaskPrompt(plan, tasks[1], 2, false)

      expect(prompt).toContain("## Current Task: #2")
      expect(prompt).toContain("2. [ ] Last Task ← CURRENT")
    })

    test("handles single task plan", () => {
      const task = createTask({ title: "Only Task" })
      const plan = createPlan({ tasks: [task] })
      const prompt = generateSingleTaskPrompt(plan, task, 1, false)

      expect(prompt).toContain("## Progress: 0/1 tasks complete")
      expect(prompt).toContain("1. [ ] Only Task ← CURRENT")
    })
  })
})
