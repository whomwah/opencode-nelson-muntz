# Bug Hunt: [Describe the Bug]

<!-- completion_promise: BUG_FIXED -->

## Overview

Iterative debugging template for tracking down and fixing bugs.
Replace the bracketed text with your specific bug details.

**Symptoms:**

- [Describe what's happening]
- [Include error messages if any]

**Expected Behavior:**

- [What should happen instead]

**Environment:**

- Runtime: [Node.js version, browser, etc.]
- OS: [Operating system]
- Relevant dependencies: [List key packages]

## Tasks

- [ ] **Reproduce the Bug**
      Create a minimal reproduction case.
      Document exact steps to trigger the issue.
      Confirm the bug is reproducible before proceeding.

- [ ] **Investigate Root Cause**
      Add logging/debugging to narrow down the source.
      Check recent changes that might have caused this.
      Review related code paths and edge cases.
      Document findings in the Notes section below.

- [ ] **Implement Fix**
      Make the minimal change needed to fix the issue.
      Avoid scope creep - fix only this bug.
      Consider edge cases and related scenarios.

- [ ] **Write Regression Test**
      Add a test that fails without the fix.
      Verify the test passes with the fix applied.
      Cover any related edge cases discovered.

- [ ] **Verify Fix**
      Run full test suite to check for regressions.
      Manually verify the original bug is resolved.
      Test in the same environment where bug was found.

## Completion

When the bug is fixed, tests pass, and no regressions:
<promise>BUG_FIXED</promise>

---

## Notes

_Use this section to document your investigation:_

### Investigation Log

-

### Related Files

-

### Attempted Solutions

-
