import { describe, expect, test } from "bun:test"
import {
  resolvePlanFile,
  parsePlanFile,
  updateTaskStatus,
  DEFAULT_PLAN_DIR,
  DEFAULT_PLAN_FILE,
} from "./plan"

describe("resolvePlanFile", () => {
  test("returns path as-is if it contains a slash", () => {
    expect(resolvePlanFile("custom/plan.md")).toBe("custom/plan.md")
    expect(resolvePlanFile(".opencode/plans/test.md")).toBe(".opencode/plans/test.md")
  })

  test("returns path as-is if it ends with .md", () => {
    expect(resolvePlanFile("myplan.md")).toBe("myplan.md")
  })

  test("converts name to slug and adds to default directory", () => {
    expect(resolvePlanFile("rest-api")).toBe(`${DEFAULT_PLAN_DIR}/rest-api.md`)
    expect(resolvePlanFile("My New Plan")).toBe(`${DEFAULT_PLAN_DIR}/my-new-plan.md`)
  })

  test("handles special characters in name", () => {
    expect(resolvePlanFile("My API's Test!")).toBe(`${DEFAULT_PLAN_DIR}/my-apis-test.md`)
  })
})

describe("parsePlanFile", () => {
  test("extracts title from H1 heading", () => {
    const content = "# My Project Plan\n\n## Tasks\n- [ ] Task 1"
    const result = parsePlanFile(content)
    expect(result.title).toBe("My Project Plan")
  })

  test("extracts overview section", () => {
    const content = `# Plan
## Overview
This is the overview.
Multiple lines here.

## Tasks
- [ ] Task 1`
    const result = parsePlanFile(content)
    expect(result.overview).toContain("This is the overview.")
    expect(result.overview).toContain("Multiple lines here.")
  })

  test("parses pending tasks", () => {
    const content = `# Plan
## Tasks
- [ ] Task 1
- [ ] Task 2`
    const result = parsePlanFile(content)
    expect(result.tasks).toHaveLength(2)
    expect(result.tasks[0].title).toBe("Task 1")
    expect(result.tasks[0].status).toBe("pending")
    expect(result.tasks[1].title).toBe("Task 2")
  })

  test("parses completed tasks", () => {
    const content = `# Plan
## Tasks
- [x] Completed task
- [X] Also completed`
    const result = parsePlanFile(content)
    expect(result.tasks[0].status).toBe("completed")
    expect(result.tasks[1].status).toBe("completed")
  })

  test("parses bold task titles", () => {
    const content = `# Plan
## Tasks
- [ ] **Bold Task Title**`
    const result = parsePlanFile(content)
    expect(result.tasks[0].title).toBe("Bold Task Title")
  })

  test("parses task descriptions from indented content", () => {
    const content = `# Plan
## Tasks
- [ ] **Task 1**
  This is the description.
  More description here.
- [ ] Task 2`
    const result = parsePlanFile(content)
    expect(result.tasks[0].description).toContain("This is the description.")
    expect(result.tasks[0].description).toContain("More description here.")
  })

  test("extracts completion promise", () => {
    const content = `# Plan
completion_promise: ALL_DONE
## Tasks
- [ ] Task 1`
    const result = parsePlanFile(content)
    expect(result.completionPromise).toBe("ALL_DONE")
  })

  test("extracts completion promise with different formats", () => {
    const formats = [
      "completion_promise: DONE",
      "completion-promise: DONE",
      "completionPromise: DONE",
      'completion_promise: "DONE"',
      "completion_promise: 'DONE'",
    ]
    for (const format of formats) {
      const content = `# Plan\n${format}\n## Tasks\n- [ ] Task`
      const result = parsePlanFile(content)
      expect(result.completionPromise).toBe("DONE")
    }
  })

  test("assigns sequential task IDs", () => {
    const content = `# Plan
## Tasks
- [ ] Task 1
- [ ] Task 2
- [ ] Task 3`
    const result = parsePlanFile(content)
    expect(result.tasks[0].id).toBe("task-1")
    expect(result.tasks[1].id).toBe("task-2")
    expect(result.tasks[2].id).toBe("task-3")
  })

  test("tracks line numbers for tasks", () => {
    const content = `# Plan
## Tasks
- [ ] Task 1
- [ ] Task 2`
    const result = parsePlanFile(content)
    expect(result.tasks[0].lineNumber).toBe(3)
    expect(result.tasks[1].lineNumber).toBe(4)
  })

  test("preserves raw content", () => {
    const content = "# Plan\n## Tasks\n- [ ] Task"
    const result = parsePlanFile(content)
    expect(result.rawContent).toBe(content)
  })

  test("handles empty content", () => {
    const result = parsePlanFile("")
    expect(result.title).toBe("")
    expect(result.overview).toBe("")
    expect(result.tasks).toEqual([])
    expect(result.completionPromise).toBeNull()
  })

  test("handles numbered task format", () => {
    const content = `# Plan
## Tasks
1. - [ ] First task
2. - [ ] Second task`
    const result = parsePlanFile(content)
    expect(result.tasks).toHaveLength(2)
    expect(result.tasks[0].title).toBe("First task")
  })

  test("handles mixed completed and pending tasks", () => {
    const content = `# Plan
## Tasks
- [x] Done
- [ ] Pending
- [X] Also Done
- [ ] Also Pending`
    const result = parsePlanFile(content)
    expect(result.tasks[0].status).toBe("completed")
    expect(result.tasks[1].status).toBe("pending")
    expect(result.tasks[2].status).toBe("completed")
    expect(result.tasks[3].status).toBe("pending")
  })
})

describe("updateTaskStatus", () => {
  test("marks task as completed", () => {
    const content = `# Plan
## Tasks
- [ ] Task 1
- [ ] Task 2`
    const parsed = parsePlanFile(content)

    const updated = updateTaskStatus(content, "task-1", parsed.tasks, "completed")
    expect(updated).toContain("- [x] Task 1")
    expect(updated).toContain("- [ ] Task 2")
  })

  test("marks task as pending (uncomplete)", () => {
    const content = `# Plan
## Tasks
- [x] Task 1
- [x] Task 2`
    const parsed = parsePlanFile(content)

    const updated = updateTaskStatus(content, "task-1", parsed.tasks, "pending")
    expect(updated).toContain("- [ ] Task 1")
    expect(updated).toContain("- [x] Task 2")
  })

  test("handles uppercase X checkbox", () => {
    const content = `# Plan
## Tasks
- [X] Task 1`
    const parsed = parsePlanFile(content)

    const updated = updateTaskStatus(content, "task-1", parsed.tasks, "pending")
    expect(updated).toContain("- [ ] Task 1")
  })

  test("returns original content for invalid task ID", () => {
    const content = `# Plan
## Tasks
- [ ] Task 1`
    const parsed = parsePlanFile(content)

    const updated = updateTaskStatus(content, "invalid-id", parsed.tasks, "completed")
    expect(updated).toBe(content)
  })

  test("preserves other content in file", () => {
    const content = `# My Plan

## Overview
Important context here.

## Tasks
- [ ] Task 1
- [ ] Task 2

## Notes
Some notes.`
    const parsed = parsePlanFile(content)

    const updated = updateTaskStatus(content, "task-1", parsed.tasks, "completed")
    expect(updated).toContain("# My Plan")
    expect(updated).toContain("Important context here.")
    expect(updated).toContain("- [x] Task 1")
    expect(updated).toContain("- [ ] Task 2")
    expect(updated).toContain("Some notes.")
  })
})

describe("constants", () => {
  test("DEFAULT_PLAN_DIR is correct", () => {
    expect(DEFAULT_PLAN_DIR).toBe(".opencode/plans")
  })

  test("DEFAULT_PLAN_FILE is correct", () => {
    expect(DEFAULT_PLAN_FILE).toBe(".opencode/plans/PLAN.md")
  })
})
