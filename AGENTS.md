# AGENTS.md - Nelson Muntz OpenCode Plugin

Guidelines for AI coding agents working in this repository.

## Project Overview

TypeScript plugin for OpenCode implementing the Nelson Muntz iterative development loop. Uses Bun as the runtime.

- **Language**: TypeScript (strict mode)
- **Runtime**: Bun v1.0+
- **Module System**: ES Modules (`"type": "module"`)
- **Main Export**: `NelsonMuntzPlugin` from `src/index.ts`

## Build/Lint/Test Commands

**IMPORTANT**: Always use `just` commands instead of `bun run` directly. This ensures you run the exact same commands as the maintainer.

```bash
just build              # Build plugin to dist/
just build-types        # Generate TypeScript declarations
just typecheck          # Run TypeScript type checking (tsc --noEmit)
just dev                # Watch mode - rebuilds on changes
just link-local         # Symlink to ~/.config/opencode/plugin/
just link-project       # Symlink to .opencode/plugin/
```

### Testing

No test suite exists. When adding tests:

- Use Bun's built-in test runner: `bun test`
- Run single test file: `bun test path/to/file.test.ts`
- Run tests matching pattern: `bun test --filter "pattern"`

### Formatting

```bash
just format             # Format all files with Prettier
just format-check       # Check formatting without modifying
```

### Linting

No linter configured. If adding one, prefer Biome or ESLint.

### All Available Tasks

Run `just` with no arguments to see all available tasks:

| Task                  | Description                            |
| --------------------- | -------------------------------------- |
| `just install`        | Install dependencies                   |
| `just build`          | Build the plugin for distribution      |
| `just build-types`    | Generate TypeScript declarations       |
| `just build-all`      | Build everything (code + types)        |
| `just dev`            | Watch mode for development             |
| `just typecheck`      | Run TypeScript type checking           |
| `just format`         | Format code with Prettier              |
| `just format-check`   | Check formatting without modifying     |
| `just link-local`     | Symlink to global OpenCode plugins     |
| `just link-project`   | Symlink to current project's plugins   |
| `just unlink-local`   | Remove global plugin symlink           |
| `just unlink-project` | Remove project plugin symlink          |
| `just clean`          | Clean build artifacts                  |
| `just rebuild`        | Full rebuild from clean state          |
| `just prepublish`     | Prepare for publishing (build + types) |

## Project Structure

```
src/index.ts          # All plugin logic (single file)
dist/                 # Built output (gitignored)
package.json          # Scripts and dependencies
tsconfig.json         # TypeScript config (ESNext, strict, bundler resolution)
justfile              # Task runner commands (use these!)
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

| Type          | Convention           | Example                   |
| ------------- | -------------------- | ------------------------- |
| Constants     | SCREAMING_SNAKE_CASE | `NELSON_STATE_FILE`       |
| Interfaces    | PascalCase           | `NelsonState`             |
| Functions     | camelCase            | `readState`, `writeState` |
| Plugin export | PascalCase           | `NelsonMuntzPlugin`       |
| Tool names    | kebab-case           | `nm-loop`, `nm-cancel`    |

### Formatting

- No semicolons
- 2-space indentation
- Template literals for multi-line strings
- Use `null` over `undefined` for optional state values

### State Management

State stored at `.opencode/nelson-loop.local.json`. Always create parent directories before writing.

## How OpenCode Discovers Plugins

OpenCode loads plugins from two locations at startup:

| Location | Scope          | Path                         |
| -------- | -------------- | ---------------------------- |
| Global   | All projects   | `~/.config/opencode/plugin/` |
| Project  | Single project | `.opencode/plugin/`          |

The `just link-local` task symlinks `dist/index.js` to the global plugin directory. We link to `dist/` (not `src/`) because the build bundles all dependencies.

**After making changes**: Run `just build`, then restart OpenCode.

## Commit Messages

Use Semantic Commit Message style: `type(scope): subject`

- **type**: feat, fix, docs, style, refactor, test, chore
- **scope**: Optional area affected
- **subject**: Imperative mood, lowercase, no period
