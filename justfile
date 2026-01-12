# Ralph Wiggum OpenCode Plugin
# https://github.com/whomwah/ralph-wiggum-opencode

# List available recipes
default:
    @just --list

# Install dependencies
install:
    bun install

# Build plugin to dist/
build:
    bun build src/index.ts --outdir dist --target bun

# Generate TypeScript declarations
build-types:
    tsc --emitDeclarationOnly

# Build everything (code + types)
build-all: build build-types

# Run TypeScript type checking
typecheck:
    tsc --noEmit

# Watch mode - rebuilds on changes
dev:
    bun run build --watch

# Symlink plugin to global OpenCode plugins (~/.config/opencode/plugin/)
link-local:
    mkdir -p ~/.config/opencode/plugin
    ln -sf $(pwd)/src/index.ts ~/.config/opencode/plugin/ralph-wiggum.ts

# Symlink plugin to project OpenCode plugins (.opencode/plugin/)
link-project:
    mkdir -p .opencode/plugin
    ln -sf $(pwd)/src/index.ts .opencode/plugin/ralph-wiggum.ts

# Remove global plugin symlink
unlink-local:
    rm -f ~/.config/opencode/plugin/ralph-wiggum.ts

# Remove project plugin symlink
unlink-project:
    rm -f .opencode/plugin/ralph-wiggum.ts

# Prepare for publishing (build + types)
prepublish: build build-types

# Clean build artifacts
clean:
    rm -rf dist

# Full rebuild from clean state
rebuild: clean build-all
