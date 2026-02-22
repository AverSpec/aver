## Skill: TDD Loop

Your job is to make the failing aver acceptance test pass through small, incremental changes.

1. Run the aver test to see the current failure
2. Read the error message and trace
3. Identify the smallest change to make progress
4. If the failure is in app code:
   a. Write a unit test for just that behavior
   b. Make the unit test pass with the smallest change
   c. Run the aver test again
5. If the failure is in the adapter: fix the adapter binding, run again
6. If GREEN: you're done
7. If still RED with the SAME error after 3 attempts: report status as "stuck"
8. If RED with a DIFFERENT error: that's progress, go to step 2

Run tests with: `pnpm exec vitest run` or the aver MCP tools.