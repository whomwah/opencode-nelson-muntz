# Nelson Muntz OpenCode Plugin
# https://github.com/whomwah/opencode-nelson-muntz

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
    bunx tsc --emitDeclarationOnly

# Build everything (code + types)
build-all: build build-types

# Run TypeScript type checking
typecheck:
    bunx tsc --noEmit

# Run tests
test:
    bun test

# Format all files with Prettier
format:
    bunx prettier --write .

# Check formatting without modifying files
format-check:
    bunx prettier --check .

# Watch mode - rebuilds on changes
dev:
    bun build src/index.ts --outdir dist --target bun --watch

# Symlink plugin to global OpenCode plugins (~/.config/opencode/plugin/)
link-local:
    mkdir -p ~/.config/opencode/plugin
    ln -sf $(pwd)/dist/index.js ~/.config/opencode/plugin/nelson-muntz.js

# Symlink plugin to project OpenCode plugins (.opencode/plugin/)
link-project:
    mkdir -p .opencode/plugin
    ln -sf $(pwd)/dist/index.js .opencode/plugin/nelson-muntz.js

# Remove global plugin symlink
unlink-local:
    rm -f ~/.config/opencode/plugin/nelson-muntz.js

# Remove project plugin symlink
unlink-project:
    rm -f .opencode/plugin/nelson-muntz.js

# Prepare for publishing (build + types)
prepublish: build build-types

# Login to npm registry
npm-login:
    npm adduser

# Publish package to npm (public access)
npm-publish: prepublish
    npm publish --access public

# Clean build artifacts
clean:
    rm -rf dist

# Full rebuild from clean state
rebuild: clean build-all
