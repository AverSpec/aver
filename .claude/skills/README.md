# Repo-level skills

Empty on purpose.

General engineering practices — dispatching parallel workers, panel review, autonomous TDD,
backlog sweeping and wave execution — used to live here, which made them reachable from this
checkout and nowhere else. They were never specific to this project: the coupling was a save path
and a test command. They now live in a separate, general-purpose skill bundle so they apply to any
repository.

**What stays here** is in `packages/agent-plugin/skills/` and ships with the product: the scenario
pipeline and the sessions that drive it (`aver-workflow`), and telemetry declarations on domains
(`telemetry`). Those are apparatus — a pipeline, a vocabulary, a runner — rather than practice.

The distinction is worth keeping: practices like characterization testing, specification by
example and ubiquitous language belong to everyone and work with a text editor and a test runner.
A framework applies them in a particular way, and owns that particular way and nothing more.
Nothing in this repository depends on any external skill bundle.
