# Example: REST API Project

<!-- completion_promise: ALL_TASKS_COMPLETE -->

## Overview

Build a REST API for a todo application using Node.js and Express.
The API should follow REST conventions, include input validation,
and have comprehensive test coverage.

**Tech Stack:**

- Runtime: Node.js with TypeScript
- Framework: Express.js
- Database: SQLite (for simplicity)
- Testing: Vitest
- Validation: Zod

## Tasks

- [ ] **Project Setup**
      Initialize Node.js project with TypeScript configuration.
      Install dependencies: express, sqlite3, zod, vitest.
      Configure tsconfig.json for ES modules.
      Add npm scripts for dev, build, and test.

- [ ] **Database Layer**
      Create SQLite database schema for todos table.
      Implement data access functions: create, read, update, delete.
      Add database initialization on startup.

- [ ] **API Routes**
      Implement REST endpoints:
  - GET /todos - List all todos
  - GET /todos/:id - Get single todo
  - POST /todos - Create todo
  - PUT /todos/:id - Update todo
  - DELETE /todos/:id - Delete todo
    Add proper HTTP status codes and error responses.

- [ ] **Input Validation**
      Create Zod schemas for todo creation and updates.
      Add validation middleware to routes.
      Return 400 with validation errors on invalid input.

- [ ] **Error Handling**
      Add global error handler middleware.
      Handle 404 for unknown routes.
      Return consistent error response format.

- [ ] **Tests**
      Write integration tests for all endpoints.
      Test validation error cases.
      Test database operations.
      Aim for >80% code coverage.

- [ ] **Documentation**
      Add README with API documentation.
      Include example curl commands.
      Document environment variables.

## Completion

When ALL tasks are verified complete with passing tests, output:
<promise>ALL_TASKS_COMPLETE</promise>

---

## Notes

- Use async/await throughout
- Follow REST naming conventions (plural nouns)
- Keep responses consistent: { data: ... } or { error: ... }
- Run tests after each significant change
