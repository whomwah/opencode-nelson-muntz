# Ralph Wiggum Plugin for OpenCode

Implementation of the Ralph Wiggum technique for iterative, self-referential AI development loops in OpenCode.

## What is Ralph?

Ralph is a development methodology based on continuous AI agent loops. As Geoffrey Huntley describes it: **"Ralph is a Bash loop"** - a simple `while true` that repeatedly feeds an AI agent a prompt file, allowing it to iteratively improve its work until completion.

The technique is named after Ralph Wiggum from The Simpsons, embodying the philosophy of persistent iteration despite setbacks.

### Core Concept

This plugin implements Ralph using OpenCode's `session.idle` event that detects when the AI finishes:

```
# You invoke the ralph-loop tool:
ralph-loop("Your task description", completionPromise: "DONE", maxIterations: 50)

# Then OpenCode automatically:
# 1. Works on the task
# 2. Session becomes idle
# 3. Plugin intercepts and feeds the SAME prompt back
# 4. Repeat until completion promise detected or max iterations
```

This creates a **self-referential feedback loop** where:

- The prompt never changes between iterations
- The AI's previous work persists in files
- Each iteration sees modified files and git history
- The AI autonomously improves by reading its own past work in files

## Installation

### From npm (recommended for end users)

Add the plugin to your `opencode.json`:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["opencode-ralph-wiggum"]
}
```

OpenCode will automatically install it on startup.

### From source (for development)

```bash
# Clone the repository
git clone https://github.com/whomwah/ralph-wiggum-opencode.git
cd ralph-wiggum-opencode

# Install dependencies
just install

# Link to OpenCode for local development
just link-local    # Global: ~/.config/opencode/plugin/
just link-project  # Project: .opencode/plugin/
```

#### How Local Plugin Loading Works

OpenCode automatically loads plugins from two directories at startup:

1. **Global plugins**: `~/.config/opencode/plugin/` - Available in all projects
2. **Project plugins**: `.opencode/plugin/` - Only available in that project

The `link-local` and `link-project` tasks create **symbolic links** from these directories to the source TypeScript file (`src/index.ts`). This means:

- OpenCode finds the symlink in its plugin directory
- The symlink points to your local source file
- OpenCode loads and executes the TypeScript directly (Bun handles TS natively)
- Changes to `src/index.ts` take effect after restarting OpenCode

```bash
# What link-local actually does:
ln -sf $(pwd)/src/index.ts ~/.config/opencode/plugin/ralph-wiggum.ts

# Result: OpenCode sees ralph-wiggum.ts in its plugin folder
# but it's really reading from your development directory
```

**Important**: Plugins are loaded once at OpenCode startup. After making changes, you must restart OpenCode to see them.

## Development

### Prerequisites

- [Bun](https://bun.sh) v1.0 or later
- [OpenCode](https://opencode.ai) installed

### Setup

```bash
# Clone the repository
git clone https://github.com/whomwah/ralph-wiggum-opencode.git
cd ralph-wiggum-opencode

# Install dependencies
just install

# Type check
just typecheck

# Build for distribution
just build
```

### Project Structure

```
ralph-wiggum-opencode/
├── src/
│   └── index.ts          # Main plugin source
├── templates/            # Plan templates for different scenarios
│   ├── README.md         # Template index and usage guide
│   ├── minimal.md        # Bare-bones template
│   ├── bug-hunt.md       # Iterative debugging template
│   └── rest-api.md       # REST API project template
├── dist/                 # Built output (generated)
├── package.json
├── tsconfig.json
└── README.md
```

### Tasks

This project uses [just](https://github.com/casey/just) as a command runner. Run `just` to see all available tasks:

| Task                  | Description                            |
| --------------------- | -------------------------------------- |
| `just install`        | Install dependencies                   |
| `just build`          | Build the plugin for distribution      |
| `just build-types`    | Generate TypeScript declarations       |
| `just build-all`      | Build everything (code + types)        |
| `just dev`            | Watch mode for development             |
| `just typecheck`      | Run TypeScript type checking           |
| `just link-local`     | Symlink to global OpenCode plugins     |
| `just link-project`   | Symlink to current project's plugins   |
| `just unlink-local`   | Remove global plugin symlink           |
| `just unlink-project` | Remove project plugin symlink          |
| `just clean`          | Clean build artifacts                  |
| `just rebuild`        | Full rebuild from clean state          |
| `just prepublish`     | Prepare for publishing (build + types) |

Alternatively, you can use `bun run <script>` with the npm scripts in `package.json`.

### Local Development Workflow

1. Clone and install dependencies:

   ```bash
   git clone https://github.com/whomwah/ralph-wiggum-opencode.git
   cd ralph-wiggum-opencode
   just install
   ```

2. Link the plugin to OpenCode:

   ```bash
   just link-local
   ```

   This creates a symlink at `~/.config/opencode/plugin/ralph-wiggum.ts` pointing to `src/index.ts`.

3. (Re)start OpenCode - it will discover and load the plugin from the symlink

4. Make changes to `src/index.ts`

5. Restart OpenCode to pick up changes (plugins are loaded once at startup)

6. Run `just typecheck` to verify types before committing

### Publishing to npm

```bash
# Ensure you're logged in to npm
npm login

# Build and publish
just prepublish
npm publish
```

Once published, users can install via their `opencode.json`:

```json
{
  "plugin": ["opencode-ralph-wiggum"]
}
```

## Usage

There are two ways to use Ralph: **direct prompts** for simple tasks, or **plan-based workflow** for structured projects.

### Quick Start: Plan-Based Workflow (Recommended)

The easiest way to use Ralph is with a PLAN.md file:

```
# Step 1: Create a plan (in plan mode for best results)
You: "Help me create a plan to build a REST API with auth"
AI: [Creates PLAN.md with structured tasks]

# Step 2: Start the loop
You: "Start ralph loop"
AI: [Uses ralph-start, begins iterating through tasks]

# Step 3: Walk away
Ralph iterates until all tasks are complete
```

### Creating a Plan

Use OpenCode's plan mode to create your PLAN.md:

```
# Switch to plan mode (Ctrl+K in OpenCode)
You: "I want to build a CLI tool that converts markdown to HTML"
AI: [Helps you think through the design]

You: "Create a PLAN.md with these tasks"
AI: [Creates structured plan file]
```

Or use the `ralph-plan` tool:

```
You: "Use ralph-plan to create a plan for building a REST API"
```

### Example PLAN.md

```markdown
# Markdown CLI Tool

<!-- completion_promise: ALL_TASKS_COMPLETE -->

## Overview

Build a CLI tool that converts markdown files to styled HTML.
Target: Node.js, TypeScript, published to npm.

## Tasks

- [ ] **Project Setup**
      Initialize TypeScript project with proper configuration.
      Add eslint, prettier, and vitest.

- [ ] **Core Parser**
      Implement markdown parsing using marked library.
      Support GFM extensions.

- [ ] **CLI Interface**
      Add commander.js for argument parsing.
      Support: input file, output file, --watch mode.

- [ ] **Styling**
      Add default CSS styles for HTML output.
      Support custom style injection via --style flag.

- [ ] **Tests**
      Write unit tests for parser and CLI.
      Aim for >80% coverage.

- [ ] **Documentation**
      Write README with usage examples.
      Add --help output.

## Completion

When ALL tasks are complete, output: <promise>ALL_TASKS_COMPLETE</promise>
```

### Starting a Ralph Loop

**From a plan (simplest):**

```
You: "Start ralph loop"
# or
You: "Use ralph-start"
```

Ralph reads PLAN.md, builds a prompt from your tasks, and iterates until done.

**Direct prompt (for simple tasks):**

```
You: "Use ralph-loop with prompt 'Build a REST API for todos' and completionPromise 'DONE'"
```

### Single Task Execution

For more control, execute tasks one at a time:

```
# List available tasks
You: "Use ralph-tasks"

# Execute task #2
You: "Use ralph-task 2"

# Mark it complete when done
You: "Use ralph-complete 2"
```

This is useful when you want to:

- Review work between tasks
- Make manual adjustments
- Skip certain tasks
- Debug a specific task

### Available Tools

| Tool                     | Description                                            |
| ------------------------ | ------------------------------------------------------ |
| `ralph-start`            | Start loop from PLAN.md (simplest way to start)        |
| `ralph-plan`             | Create or view a PLAN.md file                          |
| `ralph-tasks`            | List all tasks from the plan                           |
| `ralph-task`             | Execute a single task (no loop)                        |
| `ralph-complete`         | Mark a task as complete in the plan                    |
| `ralph-loop`             | Start loop with direct prompt (advanced)               |
| `cancel-ralph`           | Cancel the active Ralph loop                           |
| `ralph-status`           | Check the status of the current loop                   |
| `ralph-check-completion` | Manually check if text contains the completion promise |

### Tool Parameters

#### ralph-start

| Parameter       | Type   | Required | Description                               |
| --------------- | ------ | -------- | ----------------------------------------- |
| `file`          | string | No       | Plan file path (default: PLAN.md)         |
| `maxIterations` | number | No       | Max iterations (default: 50, 0=unlimited) |

#### ralph-plan

| Parameter     | Type   | Required | Description                               |
| ------------- | ------ | -------- | ----------------------------------------- |
| `action`      | string | No       | 'create' or 'view' (default: create)      |
| `description` | string | No       | Project description to customize template |
| `file`        | string | No       | Plan file path (default: PLAN.md)         |

#### ralph-task

| Parameter | Type   | Required | Description                       |
| --------- | ------ | -------- | --------------------------------- |
| `task`    | string | Yes      | Task number (1, 2, 3...) or name  |
| `file`    | string | No       | Plan file path (default: PLAN.md) |

#### ralph-loop

| Parameter           | Type   | Required | Description                                                     |
| ------------------- | ------ | -------- | --------------------------------------------------------------- |
| `prompt`            | string | Yes      | The task prompt to execute repeatedly                           |
| `maxIterations`     | number | No       | Maximum iterations before auto-stop (0 = unlimited)             |
| `completionPromise` | string | No       | Phrase that signals completion when wrapped in `<promise>` tags |

## Plan File Format

The PLAN.md file uses simple markdown:

```markdown
# Project Title

<!-- Optional: completion_promise: YOUR_PROMISE -->

## Overview

Project context and goals (helps AI make better decisions).

## Tasks

- [ ] **Task Title**
      Description and details indented below.

- [ ] **Another Task**
      More details here.

- [x] **Completed Task**
      Already done tasks use [x].

## Completion

Instructions for what to output when done.
```

### Key Elements

1. **Title**: First `# Heading` becomes the plan title
2. **Completion Promise**: Set via `completion_promise: TEXT` comment
3. **Overview**: Context section helps AI understand the project
4. **Tasks**: Use `- [ ]` checkbox format, bold titles recommended
5. **Task Descriptions**: Indent with 2+ spaces under the task line

## Prompt Writing Best Practices

### 1. Clear Completion Criteria

**Bad:**

```
Build a todo API and make it good.
```

**Good:**

```
Build a REST API for todos.

When complete:
- All CRUD endpoints working
- Input validation in place
- Tests passing (coverage > 80%)
- README with API docs
- Output: <promise>COMPLETE</promise>
```

### 2. Incremental Goals

**Bad:**

```
Create a complete e-commerce platform.
```

**Good:**

```
Phase 1: User authentication (JWT, tests)
Phase 2: Product catalog (list/search, tests)
Phase 3: Shopping cart (add/remove, tests)

Output <promise>COMPLETE</promise> when all phases done.
```

### 3. Self-Correction

**Bad:**

```
Write code for feature X.
```

**Good:**

```
Implement feature X following TDD:
1. Write failing tests
2. Implement feature
3. Run tests
4. If any fail, debug and fix
5. Refactor if needed
6. Repeat until all green
7. Output: <promise>COMPLETE</promise>
```

### 4. Escape Hatches

Always use `maxIterations` as a safety net to prevent infinite loops:

```
In your prompt, include what to do if stuck:
"After 15 iterations, if not complete:
 - Document what's blocking progress
 - List what was attempted
 - Suggest alternative approaches"
```

## How It Works

1. **Loop Activation**: When you call `ralph-loop`, the plugin creates a state file at `.opencode/ralph-loop.local.json`

2. **Session Monitoring**: The plugin listens for the `session.idle` event which fires when the AI finishes its response

3. **Completion Check**: Before continuing, it checks if the completion promise was output in the last assistant message

4. **Loop Continuation**: If not complete and under max iterations, it sends the same prompt back using `session.prompt`

5. **State Management**: Iteration count and other state is persisted to handle crashes/restarts

## Philosophy

Ralph embodies several key principles:

### 1. Iteration > Perfection

Don't aim for perfect on first try. Let the loop refine the work.

### 2. Failures Are Data

"Deterministically bad" means failures are predictable and informative. Use them to tune prompts.

### 3. Operator Skill Matters

Success depends on writing good prompts, not just having a good model.

### 4. Persistence Wins

Keep trying until success. The loop handles retry logic automatically.

## When to Use Ralph

**Good for:**

- Well-defined tasks with clear success criteria
- Tasks requiring iteration and refinement (e.g., getting tests to pass)
- Greenfield projects where you can walk away
- Tasks with automatic verification (tests, linters)

**Not good for:**

- Tasks requiring human judgment or design decisions
- One-shot operations
- Tasks with unclear success criteria
- Production debugging (use targeted debugging instead)

## Differences from Claude Code Plugin

This OpenCode port has some differences from the original Claude Code plugin:

| Feature           | Claude Code                    | OpenCode                 |
| ----------------- | ------------------------------ | ------------------------ |
| Loop mechanism    | Stop hook (shell script)       | `session.idle` event     |
| Commands          | Slash commands (`/ralph-loop`) | Custom tools             |
| State storage     | Markdown frontmatter           | JSON file                |
| Loop continuation | Blocks exit + feeds prompt     | Sends new prompt via SDK |

## Learn More

- Original technique: https://ghuntley.com/ralph/
- Ralph Orchestrator: https://github.com/mikeyobrien/ralph-orchestrator
- OpenCode Plugins: https://opencode.ai/docs/plugins/

## Credits

- Original Ralph Wiggum technique by [Geoffrey Huntley](https://ghuntley.com)
- Claude Code plugin by Daisy Hollman (Anthropic)
- OpenCode port by the community

## License

MIT
