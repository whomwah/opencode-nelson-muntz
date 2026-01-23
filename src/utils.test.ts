import { describe, expect, test } from "bun:test"
import { slugify } from "./utils"

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
