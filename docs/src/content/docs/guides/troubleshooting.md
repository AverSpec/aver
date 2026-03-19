---
title: "Troubleshooting"
---

# Troubleshooting

## When to use Aver

Aver fits best when:

- **You have multiple adapters** — unit, HTTP, and browser tests share the same scenario. Without multiple adapters, the domain layer adds structure without payback.
- **You're writing acceptance tests** — Aver is designed for behavior-level verification, not low-level unit logic.
- **Your team wants a shared vocabulary** — domain language gives product and engineering a common way to describe behavior.
- **Observability matters** — you want to prove that telemetry is structurally correct, not just present.

## When NOT to use Aver

Skip Aver when:

- **You only need unit tests** — for a pure function or isolated module, a plain Vitest test is simpler and faster to write.
- **It's a prototype or throwaway** — the domain extraction and adapter wiring pay off over time; short-lived projects rarely reach that payoff.
- **You have one deployment target** — if there's no HTTP adapter, no browser adapter, and no plan for either, you're paying domain overhead for a single runner.
- **It's trivial CRUD with no business rules** — if the domain vocabulary would just mirror the database schema, there's nothing to abstract.

## Common issues

### "My telemetry isn't recording"

Check the `AVER_TELEMETRY_MODE` environment variable spelling. Valid values are `warn`, `fail`, and `off`. Any other value — including `Warn` (wrong case) or an empty string — will cause an error.

Also verify that your OTLP receiver is running before the test suite starts. If the collector isn't reachable when the first span is exported, the exporter drops spans without error.

### "Tests pass but I don't see spans"

Confirm that `AVER_TELEMETRY_MODE=warn` or `AVER_TELEMETRY_MODE=fail` is set in the environment where you're running the tests — not just in your shell profile. Check that your OTLP collector is reachable at the expected host and port. If the collector is on a different address, spans are exported but to the wrong destination.

### "Type errors after defining domain"

The adapter must implement every domain operation with matching generics. A common mismatch is implementing `query<R>()` (no payload) when the domain declared `query<P, R>()` (with payload), or vice versa. The TypeScript error will name the missing or mismatched handler — fix the generic to match the domain definition exactly.

### "Approval tests always fail"

Run `AVER_APPROVE=1 npx vitest run` (or `npx aver approve`) to regenerate baselines. Approvals fail when the output has changed since the baseline was captured — this is intentional. Review the diff, confirm the new output is correct, then approve to update the stored baseline.

If baselines aren't being written at all, check that the `__approvals__/` directory is writable and that you're running with `AVER_APPROVE=1` (not `AVER_APPROVALS=1` — the variable name is singular).

## Incremental adoption

You don't need to restructure your entire test suite at once.

**Week 1 — Safety net.** Add `@averspec/approvals` alongside your existing tests and call `approve()` on the outputs of your highest-risk functions. Commit the baselines. You now have a regression net with no domain model required.

**Week 2 — One domain.** Pick one bounded area — a single feature or service — and extract a domain with two or three operations. Write a unit adapter. Move the tests for that area to use `suite()`. Leave everything else alone.

**Week 3 onward — Expand coverage.** Add an HTTP adapter to the existing domain. Watch the same tests run at two levels. Add a second domain when you see the same pattern repeating in another area.

The rest of your existing tests — plain Vitest, Jest, whatever — continue working unchanged. Aver doesn't require a rewrite; it grows into the space you give it.
