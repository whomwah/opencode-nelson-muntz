import { describe, expect, test } from "bun:test"
import { extractPromiseText, slugify, formatProjectToolsCompact } from "./utils"
import type { ProjectTools } from "./types"

describe("extractPromiseText", () => {
  test("extracts text from promise tags", () => {
    const input = "Some text <promise>DONE</promise> more text"
    expect(extractPromiseText(input)).toBe("DONE")
  })

  test("trims whitespace from extracted text", () => {
    const input = "<promise>  COMPLETED  </promise>"
    expect(extractPromiseText(input)).toBe("COMPLETED")
  })

  test("collapses internal whitespace", () => {
    const input = "<promise>ALL   TASKS\n\nDONE</promise>"
    expect(extractPromiseText(input)).toBe("ALL TASKS DONE")
  })

  test("returns null when no promise tags present", () => {
    const input = "No promise tags here"
    expect(extractPromiseText(input)).toBeNull()
  })

  test("returns null for empty string", () => {
    expect(extractPromiseText("")).toBeNull()
  })

  test("extracts only first promise tag when multiple present", () => {
    const input = "<promise>FIRST</promise> text <promise>SECOND</promise>"
    expect(extractPromiseText(input)).toBe("FIRST")
  })

  test("handles multiline content in promise tags", () => {
    const input = `<promise>
      Line 1
      Line 2
    </promise>`
    expect(extractPromiseText(input)).toBe("Line 1 Line 2")
  })

  test("handles empty promise tags", () => {
    const input = "<promise></promise>"
    expect(extractPromiseText(input)).toBe("")
  })
})

describe("slugify", () => {
  test("converts to lowercase", () => {
    expect(slugify("Hello World")).toBe("hello-world")
  })

  test("replaces spaces with hyphens", () => {
    expect(slugify("my cool project")).toBe("my-cool-project")
  })

  test("removes special characters", () => {
    expect(slugify("Hello! World?")).toBe("hello-world")
  })

  test("collapses multiple hyphens", () => {
    expect(slugify("hello---world")).toBe("hello-world")
  })

  test("trims hyphens from start and end", () => {
    expect(slugify("---hello---")).toBe("hello")
  })

  test("handles leading and trailing whitespace", () => {
    expect(slugify("  hello world  ")).toBe("hello-world")
  })

  test("limits length to 50 characters", () => {
    const longInput = "a".repeat(100)
    expect(slugify(longInput).length).toBe(50)
  })

  test("handles empty string", () => {
    expect(slugify("")).toBe("")
  })

  test("preserves numbers", () => {
    expect(slugify("version 2.0")).toBe("version-20")
  })

  test("handles underscores", () => {
    expect(slugify("hello_world")).toBe("hello_world")
  })

  test("handles mixed special characters", () => {
    expect(slugify("My API's Test! (v2)")).toBe("my-apis-test-v2")
  })
})

describe("formatProjectToolsCompact", () => {
  test("returns empty string when no tools", () => {
    const tools: ProjectTools = { hasJustfile: false, hasPackageJson: false, hasMakefile: false }
    expect(formatProjectToolsCompact(tools)).toBe("")
  })

  test("formats single tool", () => {
    const tools: ProjectTools = { hasJustfile: true, hasPackageJson: false, hasMakefile: false }
    expect(formatProjectToolsCompact(tools)).toBe("**Tools**: just available.")
  })

  test("formats multiple tools", () => {
    const tools: ProjectTools = { hasJustfile: true, hasPackageJson: true, hasMakefile: false }
    expect(formatProjectToolsCompact(tools)).toBe("**Tools**: just, npm/bun available.")
  })

  test("formats all tools", () => {
    const tools: ProjectTools = { hasJustfile: true, hasPackageJson: true, hasMakefile: true }
    expect(formatProjectToolsCompact(tools)).toBe("**Tools**: just, npm/bun, make available.")
  })

  test("formats only makefile", () => {
    const tools: ProjectTools = { hasJustfile: false, hasPackageJson: false, hasMakefile: true }
    expect(formatProjectToolsCompact(tools)).toBe("**Tools**: make available.")
  })
})
