import { describe, expect, test } from "bun:test"
import { formatCommitMessage } from "./git"

describe("formatCommitMessage", () => {
  test("formats simple task title", () => {
    const result = formatCommitMessage("Add feature", 1)
    expect(result.subject).toBe("feat(nelson): task 1 - Add feature")
    expect(result.body).toBeNull()
  })

  test("includes task number in subject", () => {
    const result = formatCommitMessage("Test Task", 42)
    expect(result.subject).toBe("feat(nelson): task 42 - Test Task")
  })

  test("extracts heading before separator as subject", () => {
    const result = formatCommitMessage("Setup - Initialize the project", 1)
    expect(result.subject).toBe("feat(nelson): task 1 - Setup")
    expect(result.body).toBe("Initialize the project")
  })

  test("strips bold markers from task title", () => {
    const result = formatCommitMessage("**Create API**", 2)
    expect(result.subject).toBe("feat(nelson): task 2 - Create API")
    expect(result.body).toBeNull()
  })

  test("handles bold markers with separator", () => {
    const result = formatCommitMessage("**Create file** - Add main entry point", 3)
    expect(result.subject).toBe("feat(nelson): task 3 - Create file")
    expect(result.body).toBe("Add main entry point")
  })

  test("handles trailing bold markers", () => {
    const result = formatCommitMessage("Create file** - description", 1)
    expect(result.subject).toBe("feat(nelson): task 1 - Create file")
    expect(result.body).toBe("description")
  })

  test("trims whitespace from title", () => {
    const result = formatCommitMessage("  Spaced title  ", 1)
    expect(result.subject).toBe("feat(nelson): task 1 - Spaced title")
  })
})
