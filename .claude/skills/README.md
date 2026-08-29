# Repo-level skills

Empty on purpose.

What used to live here — `headless-dispatch`, `panel-review`, `autonomous-tdd`, `backlog-sweep`,
`backlog-wave` — was general engineering practice wearing this repo's clothes, reachable only from
this one checkout. It moved to the `agent-console` plugin, which is installed machine-wide, so
those practices now apply everywhere instead of here alone. Their coupling to Aver turned out to
be one line each: a save path under `.aver/plans/`, a test command named after the product.

`backlog-wave` was not ported. It read a Linear API key from `~/.config/aver/.env`, and that
backlog moved to GitHub Issues; the wave discipline it described is in `backlog` and
`parallel-queue`.

**What stays Aver's** is in `packages/agent-plugin/skills/` and ships with the product: the
scenario pipeline and the sessions that drive it (`aver-workflow`), and telemetry declarations on
domains (`telemetry`). Those are apparatus — a pipeline, a vocabulary, a runner — rather than
practice.

Nothing in Aver depends on the console plugin. The reference goes one way, and that is the point:
the practices are useful without Aver, and Aver works without them.
