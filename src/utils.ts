import * as path from "node:path"
import type { ProjectTools } from "./types"

/**
 * Convert text to a URL-friendly slug
 */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "") // Remove special characters
    .replace(/\s+/g, "-") // Replace spaces with hyphens
    .replace(/-+/g, "-") // Collapse multiple hyphens
    .replace(/^-+|-+$/g, "") // Trim hyphens from start/end
    .slice(0, 50) // Limit length
}

/**
 * Detect available project tools (justfile, package.json, Makefile)
 */
export async function detectProjectTools(directory: string): Promise<ProjectTools> {
  const checkFile = async (filename: string): Promise<boolean> => {
    try {
      const file = Bun.file(path.join(directory, filename))
      return await file.exists()
    } catch {
      return false
    }
  }

  const [hasJustfile, hasPackageJson, hasMakefile] = await Promise.all([
    checkFile("justfile"),
    checkFile("package.json"),
    checkFile("Makefile"),
  ])

  return { hasJustfile, hasPackageJson, hasMakefile }
}
