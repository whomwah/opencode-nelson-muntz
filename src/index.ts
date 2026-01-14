import { type Plugin } from "@opencode-ai/plugin"

// Import from modules
import { readState, writeState, removeState } from "./state"
import { extractPromiseText, detectProjectTools } from "./utils"
import { readPlanFile, parsePlanFile } from "./plan"
import { markTaskCompleteAndCommit } from "./git"
import { generateSingleTaskPrompt } from "./prompts"
import { createLoopTools } from "./loop-tools"
import { createPlanTools } from "./plan-tools"

const NelsonMuntzPlugin: Plugin = async (ctx) => {
  const { directory, client } = ctx

  // Helper to check if completion promise is in any message parts
  async function checkCompletionInSession(
    sessionId: string,
    completionPromise: string,
  ): Promise<boolean> {
    try {
      const messagesResult = await client.session.messages({
        path: { id: sessionId },
      })

      if (!messagesResult.data) return false

      // Check the last few assistant messages for completion promise
      const messages = messagesResult.data
      for (let i = messages.length - 1; i >= Math.max(0, messages.length - 5); i--) {
        const msg = messages[i]
        if (msg.info.role !== "assistant") continue

        for (const part of msg.parts) {
          if (part.type === "text" && typeof part.text === "string") {
            const promiseText = extractPromiseText(part.text)
            if (promiseText === completionPromise) {
              return true
            }
          }
        }
      }
    } catch {
      // Failed to get messages, continue loop
    }
    return false
  }

  return {
    // Listen for session idle to continue the Nelson loop
    event: async ({ event }) => {
      if (event.type !== "session.idle") return

      const state = await readState(directory)
      if (!state || !state.active) return

      // Get session ID from event if available
      const sessionId = (event.properties as { sessionId?: string })?.sessionId || state.sessionId
      if (!sessionId) {
        await client.app.log({
          body: {
            service: "nelson-muntz",
            level: "warn",
            message: "Nelson loop: No session ID available, cannot continue loop.",
          },
        })
        return
      }

      // Update session ID in state if we got it from event
      if (sessionId !== state.sessionId) {
        state.sessionId = sessionId
        await writeState(directory, state)
      }

      // Handle single-task mode: just mark complete and exit
      if (state.mode === "single-task") {
        if (state.planFile && state.currentTaskNum) {
          try {
            const result = await markTaskCompleteAndCommit(
              directory,
              state.planFile,
              state.currentTaskNum,
              false, // No commit in single-task mode
            )
            await client.app.log({
              body: {
                service: "nelson-muntz",
                level: "info",
                message: `✓ Task completed: ${result.taskTitle}`,
              },
            })
            await client.tui.showToast({
              body: {
                message: `✓ Task completed: ${result.taskTitle}`,
                variant: "success",
              },
            })
          } catch (err) {
            await client.app.log({
              body: {
                service: "nelson-muntz",
                level: "error",
                message: `Failed to mark task complete: ${err}`,
              },
            })
          }
        }
        await removeState(directory)
        return
      }

      // Handle loop mode: complete current task, commit, then continue to next
      if (state.mode === "loop" && state.planFile) {
        // Mark current task complete and create commit
        if (state.currentTaskNum) {
          try {
            const result = await markTaskCompleteAndCommit(
              directory,
              state.planFile,
              state.currentTaskNum,
              true, // Create commit in loop mode
            )
            let logMsg = `✓ Task ${state.currentTaskNum} completed: ${result.taskTitle}`
            if (result.commitResult?.success) {
              logMsg += ` | ${result.commitResult.message}`
            } else if (result.commitResult) {
              logMsg += ` | Commit skipped: ${result.commitResult.message}`
            }
            await client.app.log({
              body: {
                service: "nelson-muntz",
                level: "info",
                message: logMsg,
              },
            })
          } catch (err) {
            await client.app.log({
              body: {
                service: "nelson-muntz",
                level: "error",
                message: `Failed to complete task ${state.currentTaskNum}: ${err}`,
              },
            })
          }
        }

        // Re-read the plan to find next pending task
        const content = await readPlanFile(directory, state.planFile)
        if (!content) {
          await client.app.log({
            body: {
              service: "nelson-muntz",
              level: "error",
              message: `Plan file not found: ${state.planFile}`,
            },
          })
          await removeState(directory)
          return
        }

        const plan = parsePlanFile(content)
        const nextPendingIdx = plan.tasks.findIndex((t) => t.status !== "completed")

        // Check if all tasks are complete
        if (nextPendingIdx === -1) {
          await client.app.log({
            body: {
              service: "nelson-muntz",
              level: "info",
              message: `🎉 All ${plan.tasks.length} tasks complete!`,
            },
          })
          await client.tui.showToast({
            body: {
              message: `🎉 Nelson loop: All ${plan.tasks.length} tasks complete!`,
              variant: "success",
            },
          })
          await removeState(directory)
          return
        }

        // Check if completion promise was detected
        if (state.completionPromise) {
          const completed = await checkCompletionInSession(sessionId, state.completionPromise)
          if (completed) {
            await client.app.log({
              body: {
                service: "nelson-muntz",
                level: "info",
                message: `Nelson loop: Detected <promise>${state.completionPromise}</promise> - loop complete!`,
              },
            })
            await client.tui.showToast({
              body: {
                message: `Nelson loop completed after ${state.iteration} iterations!`,
                variant: "success",
              },
            })
            await removeState(directory)
            return
          }
        }

        // Check max iterations
        if (state.maxIterations > 0 && state.iteration >= state.maxIterations) {
          await client.app.log({
            body: {
              service: "nelson-muntz",
              level: "info",
              message: `Nelson loop: Max iterations (${state.maxIterations}) reached.`,
            },
          })
          await client.tui.showToast({
            body: {
              message: `Nelson loop: Max iterations (${state.maxIterations}) reached.`,
              variant: "warning",
            },
          })
          await removeState(directory)
          return
        }

        // Continue to next task
        const nextTask = plan.tasks[nextPendingIdx]
        const nextTaskNum = nextPendingIdx + 1
        state.iteration++
        state.currentTaskId = nextTask.id
        state.currentTaskNum = nextTaskNum
        await writeState(directory, state)

        const projectTools = await detectProjectTools(directory)
        const taskPrompt = generateSingleTaskPrompt(plan, nextTask, nextTaskNum, true, projectTools)
        const completedCount = plan.tasks.filter((t) => t.status === "completed").length

        const systemMsg = `🔄 Nelson iteration ${state.iteration} | Task ${nextTaskNum}/${plan.tasks.length} (${completedCount} complete)`

        await client.app.log({
          body: {
            service: "nelson-muntz",
            level: "info",
            message: systemMsg,
          },
        })

        try {
          await client.session.prompt({
            path: { id: sessionId },
            body: {
              parts: [
                {
                  type: "text",
                  text: `${systemMsg}\n\n---\n\n${taskPrompt}`,
                },
              ],
            },
          })
        } catch (error) {
          await client.app.log({
            body: {
              service: "nelson-muntz",
              level: "error",
              message: `Nelson loop: Failed to send prompt - ${error}`,
            },
          })
        }
        return
      }

      // Legacy mode (for nm-loop tool without plan file)
      // Check if completion promise was detected in the last message
      if (state.completionPromise) {
        const completed = await checkCompletionInSession(sessionId, state.completionPromise)
        if (completed) {
          await client.app.log({
            body: {
              service: "nelson-muntz",
              level: "info",
              message: `Nelson loop: Detected <promise>${state.completionPromise}</promise> - loop complete!`,
            },
          })

          await client.tui.showToast({
            body: {
              message: `Nelson loop completed after ${state.iteration} iterations!`,
              variant: "success",
            },
          })

          await removeState(directory)
          return
        }
      }

      // Check if max iterations reached
      if (state.maxIterations > 0 && state.iteration >= state.maxIterations) {
        await client.app.log({
          body: {
            service: "nelson-muntz",
            level: "info",
            message: `Nelson loop: Max iterations (${state.maxIterations}) reached.`,
          },
        })

        await client.tui.showToast({
          body: {
            message: `Nelson loop: Max iterations (${state.maxIterations}) reached.`,
            variant: "warning",
          },
        })

        await removeState(directory)
        return
      }

      // Increment iteration and continue the loop
      state.iteration++
      await writeState(directory, state)

      // Build system message
      let systemMsg: string
      if (state.completionPromise) {
        systemMsg = `🔄 Nelson iteration ${state.iteration} | To stop: output <promise>${state.completionPromise}</promise> (ONLY when statement is TRUE - do not lie to exit!)`
      } else {
        systemMsg = `🔄 Nelson iteration ${state.iteration} | No completion promise set - loop runs infinitely`
      }

      await client.app.log({
        body: {
          service: "nelson-muntz",
          level: "info",
          message: systemMsg,
        },
      })

      // Send the prompt back to continue the session
      try {
        await client.session.prompt({
          path: { id: sessionId },
          body: {
            parts: [
              {
                type: "text",
                text: `${systemMsg}\n\n---\n\n${state.prompt}`,
              },
            ],
          },
        })
      } catch (error) {
        await client.app.log({
          body: {
            service: "nelson-muntz",
            level: "error",
            message: `Nelson loop: Failed to send prompt - ${error}`,
          },
        })
      }
    },

    // Custom tools for Nelson loop management
    tool: {
      ...createLoopTools(directory),
      ...createPlanTools(directory),
    },
  }
}

export { NelsonMuntzPlugin }
