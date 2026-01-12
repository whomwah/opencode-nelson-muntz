# Plan Templates

Example PLAN.md files for different Ralph loop scenarios. Copy one to your project root as `PLAN.md` and customize it.

## Available Templates

| Template                   | Best For                                      |
| -------------------------- | --------------------------------------------- |
| [minimal.md](minimal.md)   | Quick tasks, simple projects, getting started |
| [bug-hunt.md](bug-hunt.md) | Iterative debugging and bug fixes             |
| [rest-api.md](rest-api.md) | Building REST APIs with tests                 |

## Usage

```bash
# Copy a template to your project
cp templates/minimal.md PLAN.md

# Edit it with your tasks
# Then start the loop
```

In OpenCode:

```
You: "Start ralph loop"
```

## Template Structure

All templates follow this format:

```markdown
# Title

<!-- completion_promise: YOUR_PROMISE -->

## Overview

Context and goals.

## Tasks

- [ ] **Task Title**
      Details indented below.

## Completion

When done: <promise>YOUR_PROMISE</promise>
```

## Tips

1. **Be specific** - Vague tasks lead to vague results
2. **Include success criteria** - How do you know when a task is done?
3. **Order matters** - Put foundational tasks first
4. **Keep tasks atomic** - Each task should do one thing well
