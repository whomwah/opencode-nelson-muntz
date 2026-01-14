import * as path from "node:path"
import { mkdir, unlink } from "node:fs/promises"
import type { NelsonState } from "./types"

export const NELSON_STATE_FILE = ".opencode/nelson-loop.local.json"

/**
 * Read the Nelson loop state from disk
 */
export async function readState(directory: string): Promise<NelsonState | null> {
  const statePath = path.join(directory, NELSON_STATE_FILE)
  try {
    const file = Bun.file(statePath)
    if (await file.exists()) {
      return await file.json()
    }
  } catch {
    // State file corrupted or missing
  }
  return null
}

/**
 * Write the Nelson loop state to disk
 */
export async function writeState(directory: string, state: NelsonState): Promise<void> {
  const statePath = path.join(directory, NELSON_STATE_FILE)
  const dir = path.dirname(statePath)
  await mkdir(dir, { recursive: true })
  await Bun.write(statePath, JSON.stringify(state, null, 2))
}

/**
 * Remove the Nelson loop state file
 */
export async function removeState(directory: string): Promise<boolean> {
  const statePath = path.join(directory, NELSON_STATE_FILE)
  try {
    const file = Bun.file(statePath)
    if (await file.exists()) {
      await unlink(statePath)
      return true
    }
  } catch {
    // Ignore errors
  }
  return false
}
