# Ralph Wiggum Plugin for OpenCode (⚠️ work in progress, use at your own risk ⚠️)

Implementation of the Ralph Wiggum technique for iterative, self-referential AI development loops in OpenCode.

## What is Ralph?

Ralph is a development methodology based on continuous AI agent loops. As Geoffrey Huntley describes it: **"Ralph is a Bash loop"** - a simple `while true` that repeatedly feeds an AI agent a prompt file, allowing it to iteratively improve its work until completion.

The technique is named after Ralph Wiggum from The Simpsons, embodying the philosophy of persistent iteration despite setbacks.

### Core Concept

This plugin implements Ralph using OpenCode's `session.idle` event. When the AI finishes, the plugin checks progress and either continues or stops.

**Two modes of operation:**

1. **Plan-based** (`rw-start`): Work through a list of tasks, marking each complete
2. **Direct loop** (`rw-loop`): Hammer at one goal until it succeeds

Both create a **self-referential feedback loop** where:

- The AI's previous work persists in files
- Each iteration sees modified files and output from earlier attempts
- The AI iteratively improves by building on its own work

**Plan-based mode** - for structured projects:

```
# Create PLAN.md with tasks, then:
rw-start

# Loop works through tasks one by one
# Stops when: all tasks marked [x] OR maxIterations reached
```

**Direct loop mode** - for iterative problem-solving:

```
# Start a loop that keeps trying until success:
rw-loop("Make all tests pass", completionPromise: "ALL_TESTS_PASSING", maxIterations: 20)

# Same prompt fed back each iteration
# Stops when: <promise>ALL_TESTS_PASSING</promise> output OR maxIterations reached
```

The direct loop is ideal for tasks like "fix the build", "make tests pass", or "get this working" where you want the AI to keep iterating on the same problem until solved.

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
git clone https://github.com/whomwah/opencode-ralph-wiggum.git
cd opencode-ralph-wiggum

# Install dependencies
just install

# Link to OpenCode for local development
just link-local    # Global: ~/.config/opencode/plugin/
just link-project  # Project: .opencode/plugin/
```

## Usage

Ralph's tools are designed to complement OpenCode's built-in Plan and Code modes:

- **OpenCode Plan mode** - For thinking, designing, and conversation without making changes
- **OpenCode Build mode** - For executing tasks and writing code

Ralph's `rw-plan` and `rw-start` tools align with this workflow:

| OpenCode Mode | Ralph Tool | What Happens                                |
| ------------- | ---------- | ------------------------------------------- |
| Plan mode     | `rw-plan`  | Design and refine your plan in conversation |
| Build mode    | `rw-start` | Execute tasks, write code, commit changes   |

### Plan Mode

Use OpenCode's Plan mode (Ctrl+K) with `rw-plan` to create and refine your plan _before_ any code is written. This is an iterative conversation where you shape the plan until you're happy with it.

1. **Start planning** - Ask the AI to create a plan:

   ```
   You: "Create a plan for building a REST API for todos"
   ```

   The AI calls `rw-plan` and generates a draft plan, showing it to you in the conversation. **No file is written yet.**

2. **Iterate on the plan** - Refine it through conversation:

   ```
   You: "Add a task for authentication"
   You: "Split the database task into schema design and migrations"
   You: "Remove the Docker task, I'll handle that manually"
   ```

   The AI updates the plan and shows you each revision.

3. **Confirm and save** - When you're satisfied, confirm it:

   ```
   You: "Looks good, save it"
   ```

   The AI calls `rw-plan` with `action='save'` to write the plan file to `.opencode/plans/rest-api.md`.

### Build Mode

Once your plan is saved, switch to OpenCode's Build mode and use `rw-start` to execute tasks. The AI reads the plan file and works through each task.

1. **Start the loop** - Execute all pending tasks automatically:

   ```
   You: "Use rw-start rest-api"
   ```

   Ralph works through each task, marking them complete and creating git commits.

2. **Or run tasks one at a time** - For more control:

   ```
   You: "Use rw-tasks"          # List tasks and their status
   You: "Use rw-task 2"         # Execute task #2 only
   ```

### Available Tools

When the plugin is installed you can ask opencode for all "rw-* tasks" and it will list them.

| Tool                  | Description                                            |
| --------------------- | ------------------------------------------------------ |
| `rw-start`            | Start loop from PLAN.md (auto-commits per task)        |
| `rw-plan`             | Create or view a PLAN.md file                          |
| `rw-tasks`            | List all tasks from the plan                           |
| `rw-task`             | Execute a single task (auto-completes, no commit)      |
| `rw-complete`         | Manually mark a task complete (rarely needed now)      |
| `rw-loop`             | Start loop with direct prompt (advanced, no plan file) |
| `rw-cancel`           | Cancel the active Ralph loop                           |
| `rw-status`           | Check the status of the current loop                   |
| `rw-check-completion` | Manually check if text contains the completion promise |

### Tool Parameters

#### rw-start

| Parameter       | Type   | Required | Description                                       |
| --------------- | ------ | -------- | ------------------------------------------------- |
| `file`          | string | No       | Plan file path (default: .opencode/plans/PLAN.md) |
| `maxIterations` | number | No       | Max iterations (default: 0 = unlimited)           |

#### rw-plan

| Parameter     | Type   | Required | Description                                                        |
| ------------- | ------ | -------- | ------------------------------------------------------------------ |
| `action`      | string | No       | 'create', 'view', or 'save' (default: create)                      |
| `name`        | string | No       | Plan name - used to generate filename (e.g., 'My API' → my-api.md) |
| `description` | string | No       | Project description (also used for filename if no name)            |
| `file`        | string | No       | Explicit file path (overrides auto-generated name)                 |
| `content`     | string | No       | Plan content to save (required when action='save')                 |

Filename generation priority:

1. Explicit `file` parameter if provided
2. Slugified `name` parameter
3. Slugified `description` parameter
4. Falls back to "plan.md"

All plans are stored in `.opencode/plans/` by default.

#### rw-task

| Parameter | Type   | Required | Description                                       |
| --------- | ------ | -------- | ------------------------------------------------- |
| `task`    | string | Yes      | Task number (1, 2, 3...) or name                  |
| `file`    | string | No       | Plan file path (default: .opencode/plans/PLAN.md) |

#### rw-loop

Direct loop mode - keeps feeding the same prompt until completion or max iterations. Ideal for iterative problem-solving like "make tests pass" or "fix the build".

| Parameter           | Type   | Required | Description                                                     |
| ------------------- | ------ | -------- | --------------------------------------------------------------- |
| `prompt`            | string | Yes      | The task prompt to execute repeatedly                           |
| `maxIterations`     | number | No       | Maximum iterations before stopping (default: 2, 0 = unlimited)  |
| `completionPromise` | string | No       | Phrase that signals completion when wrapped in `<promise>` tags |

## Development

### Prerequisites

- [Bun](https://bun.sh) v1.0 or later
- [OpenCode](https://opencode.ai) installed

### Setup

```bash
# Clone the repository
git clone https://github.com/whomwah/opencode-ralph-wiggum.git
cd opencode-ralph-wiggum

# Install dependencies
just install

# Type check
just typecheck

# Build for distribution
just build
```

### Tasks

This project uses [just](https://github.com/casey/just) as a command runner. Run `just` with no arguments to see all available tasks.

## Local Files and Folders

Ralph creates files in your project's `.opencode/` directory:

```
.opencode/
├── plans/                      # Your plan files (persistent)
│   ├── my-api.md
│   └── another-project.md
└── ralph-loop.local.json       # Loop state (temporary)
```

### File Details

| File/Folder                       | Purpose                                                              | Lifecycle                                                                             |
| --------------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `.opencode/plans/`                | Stores PLAN.md files with your tasks                                 | Persistent - you create and manage these                                              |
| `.opencode/ralph-loop.local.json` | Tracks active loop state (iteration count, current task, session ID) | **Temporary** - created when loop starts, deleted when loop completes or is cancelled |

### Git Recommendations

Add to your `.gitignore`:

```gitignore
# Ralph Wiggum plugin state (temporary, local only)
.opencode/ralph-loop.local.json
```

Your plan files in `.opencode/plans/` can be committed if you want to share them with your team, or gitignored if they're personal.

## How It Works

### Plan-Based Mode (rw-start, rw-task)

1. **Loop Activation**: When you call `rw-start`, the plugin reads PLAN.md and creates a state file at `.opencode/ralph-loop.local.json`

2. **Task Execution**: The plugin generates a prompt for the first pending task and sends it to the AI

3. **Session Monitoring**: The plugin listens for the `session.idle` event which fires when the AI finishes its response

4. **Task Completion**: When idle, the plugin marks the current task as `[x]` in PLAN.md and (in loop mode) creates a git commit

5. **Loop Continuation**: The plugin finds the next pending task and sends a new prompt. If no pending tasks remain, the loop ends.

6. **Safety Stop**: If `maxIterations` is reached before all tasks complete, the loop halts entirely for human review

### Direct Loop Mode (rw-loop)

1. **Loop Activation**: When you call `rw-loop`, the plugin stores your prompt and creates a state file

2. **Same Prompt Each Time**: Unlike plan-based mode, the exact same prompt is fed back each iteration

3. **Completion Detection**: The plugin checks the AI's output for `<promise>YOUR_TEXT</promise>` tags matching your completion promise

4. **Iterative Improvement**: The AI sees files modified by previous attempts, allowing it to build on its own work

5. **Stops When**: The completion promise is detected OR maxIterations is reached

## When to Use Ralph

### Plan-based mode (`rw-start`) is good for:

- Multi-step projects with distinct phases
- Greenfield development where you want git commits per task
- Projects where you want to review progress task-by-task

### Direct loop mode (`rw-loop`) is good for:

- "Make the tests pass" - iterate until green
- "Fix the build errors" - hammer until it compiles
- Bug hunting - keep trying fixes until resolved
- Any goal with clear, verifiable success criteria

### Not good for:

- One-shot operations that don't benefit from iteration
- Tasks with unclear success criteria
- Production debugging (use targeted debugging instead)

## Differences from Claude Code Plugin

This OpenCode port has some differences from the original Claude Code plugin:

| Feature           | Claude Code                 | OpenCode                 |
| ----------------- | --------------------------- | ------------------------ |
| Loop mechanism    | Stop hook (shell script)    | `session.idle` event     |
| Commands          | Slash commands (`/rw-loop`) | Custom tools             |
| State storage     | Markdown frontmatter        | JSON file                |
| Loop continuation | Blocks exit + feeds prompt  | Sends new prompt via SDK |

## Learn More

- Original technique: https://ghuntley.com/ralph/
- OpenCode Plugins: https://opencode.ai/docs/plugins/

## Credits

- Claude Code plugin by Daisy Hollman (Anthropic)

## License

MIT
