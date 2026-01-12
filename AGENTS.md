# AGENTS.md - Ralph Wiggum OpenCode Plugin

Guidelines for AI coding agents working in this repository.

## Project Overview

TypeScript plugin for OpenCode implementing the Ralph Wiggum iterative development loop. Uses Bun as the runtime.

- **Language**: TypeScript (strict mode)
- **Runtime**: Bun v1.0+
- **Module System**: ES Modules (`"type": "module"`)
- **Main Export**: `RalphWiggumPlugin` from `src/index.ts`

## Build/Lint/Test Commands

```bash
bun run build           # Build plugin to dist/
bun run build:types     # Generate TypeScript declarations
bun run typecheck       # Run TypeScript type checking (tsc --noEmit)
bun run dev             # Watch mode - rebuilds on changes
bun run link:local      # Symlink to ~/.config/opencode/plugin/
```

### Testing
No test suite exists. When adding tests:
- Use Bun's built-in test runner: `bun test`
- Run single test file: `bun test path/to/file.test.ts`
- Run tests matching pattern: `bun test --filter "pattern"`

### Linting
No linter configured. If adding one, prefer Biome or ESLint.

## Project Structure

```
src/index.ts          # All plugin logic (~400 lines, single file)
dist/                 # Built output (gitignored)
package.json          # Scripts and dependencies
tsconfig.json         # TypeScript config (ESNext, strict, bundler resolution)
```

## Code Style Guidelines

### Imports

Order by category, use `type` keyword for type-only imports:
```typescript
// External packages first
import { type Plugin, tool } from "@opencode-ai/plugin"
// Node.js built-ins second (prefer namespace imports)
import * as fs from "fs"
import * as path from "path"
```

### Naming Conventions

| Type | Convention | Example |
|------|------------|---------|
| Constants | SCREAMING_SNAKE_CASE | `RALPH_STATE_FILE` |
| Interfaces | PascalCase | `RalphState` |
| Functions | camelCase | `readState`, `writeState` |
| Plugin export | PascalCase | `RalphWiggumPlugin` |
| Tool names | kebab-case | `ralph-loop`, `cancel-ralph` |

### Types and Interfaces

```typescript
// Define interfaces for state/data structures
interface RalphState {
  active: boolean
  iteration: number
  maxIterations: number
  completionPromise: string | null  // Use null over undefined
  prompt: string
  sessionId: string | null
  startedAt: string
}

// Use explicit return types
function readState(directory: string): RalphState | null { ... }
function writeState(directory: string, state: RalphState): void { ... }
```

### Error Handling

```typescript
// Empty catch blocks for non-critical operations
try {
  if (fs.existsSync(statePath)) {
    return JSON.parse(fs.readFileSync(statePath, "utf-8"))
  }
} catch {
  // State file corrupted or missing
}
return null

// Return early on error conditions
if (!prompt || prompt.trim() === "") {
  return "Error: No prompt provided."
}

// Log errors via OpenCode client API
await client.app.log({
  body: {
    service: "ralph-wiggum",
    level: "error",
    message: `Ralph loop: Failed - ${error}`,
  },
})
```

### OpenCode Plugin API Patterns

```typescript
// Plugin structure
export const RalphWiggumPlugin: Plugin = async (ctx) => {
  const { directory, client } = ctx

  return {
    event: async ({ event }) => { ... },
    tool: {
      "tool-name": tool({
        description: "Tool description",
        args: {
          param: tool.schema.string().describe("Description"),
          optional: tool.schema.number().optional().describe("Optional"),
        },
        async execute(args, toolCtx) { ... },
      }),
    },
  }
}
```

### Formatting

- No semicolons
- 2-space indentation
- Template literals for multi-line strings
- Use `null` over `undefined` for optional state values

### State Management

State stored at `.opencode/ralph-loop.local.json`:
```typescript
// Always create parent directories before writing
const dir = path.dirname(statePath)
if (!fs.existsSync(dir)) {
  fs.mkdirSync(dir, { recursive: true })
}
fs.writeFileSync(statePath, JSON.stringify(state, null, 2))
```

## Dependencies

- `@opencode-ai/plugin` - OpenCode plugin SDK (peer dependency)
- `@types/bun` - Bun type definitions (dev)
- `typescript` - TypeScript compiler (dev)

## How OpenCode Discovers Plugins

OpenCode loads plugins from two locations at startup:

| Location | Scope | Path |
|----------|-------|------|
| Global | All projects | `~/.config/opencode/plugin/` |
| Project | Single project | `.opencode/plugin/` |

### Local Development via Symlinks

The `link:local` and `link:project` scripts create symbolic links:

```bash
# link:local creates:
~/.config/opencode/plugin/ralph-wiggum.ts -> /path/to/repo/src/index.ts

# link:project creates:
.opencode/plugin/ralph-wiggum.ts -> /path/to/repo/src/index.ts
```

**How it works**:
1. OpenCode scans plugin directories for `.js` or `.ts` files
2. Finds the symlink (e.g., `ralph-wiggum.ts`)
3. Follows symlink to the actual source file
4. Bun executes TypeScript directly (no build step needed for local dev)
5. Plugin exports are registered with OpenCode

**Important**: Plugins load once at startup. Restart OpenCode after changes.

### npm vs Local Loading

| Method | How OpenCode finds it |
|--------|----------------------|
| npm (`opencode.json`) | Downloaded to `~/.cache/opencode/node_modules/`, loaded via package name |
| Local file | Loaded directly from plugin directory (or symlink target) |

## Common Tasks

### Adding a New Tool

1. Add to the `tool` object in the plugin return value
2. Use `tool()` helper with description, args, and execute
3. Tool names should be kebab-case
4. Return string messages for user feedback

### Testing Changes Locally

1. Run `bun run link:local` to create symlink (only needed once)
2. Start/restart OpenCode - it discovers the plugin via symlink
3. Make changes to `src/index.ts`
4. Restart OpenCode to pick up changes
5. Run `bun run typecheck` to verify types
