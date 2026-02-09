# Aver: What's Next

**Date**: 2026-02-09
**Context**: Synthesized from a 4-agent product refinement analysis of the AgilePilot project, mapped against what Aver has actually shipped.

---

## Where We Are

Aver has shipped the MVP core framework AND the MCP server -- roughly Phases 1-2 of what was recommended. Here's the inventory:

### Shipped (82 tests, 100% green)

| Component | Status | What It Does |
|-----------|--------|-------------|
| Core types (`action`, `query`, `assertion`) | Done | Type-safe domain vocabulary markers |
| `defineDomain()` + `.extend()` | Done | Domain definition with protocol-specific extensions |
| `implement()` | Done | Typed adapter creation with exhaustiveness checking |
| `suite()` + domain proxy | Done | Test-time dispatch with automatic action trace recording |
| `direct()` protocol | Done | Zero-overhead protocol for unit-speed acceptance tests |
| `@aver/protocol-playwright` | Done | Browser testing via Playwright |
| `defineConfig()` + registry | Done | Adapter registration and runtime resolution |
| CLI (`aver run`) | Done | Vitest wrapper with `--adapter`, `--domain`, `--watch` |
| Dogfood test suite | Done | Aver tests itself using its own API |
| MCP server (8 tools) | Done | Domain exploration, test execution, scaffolding, incremental reporting |
| `RunStore` | Done | Persists test results for cross-run comparison |

### Not Yet Shipped

| Component | Priority | Notes |
|-----------|----------|-------|
| HTTP protocol | High | API-level testing against the same domain DSL |
| Approval testing | High | Human-in-the-loop gates for AI-generated code verification |
| Claude Code skill (Predictive TDD) | Medium | Agent workflow for AI-assisted development |
| CI reporter (JUnit XML) | Medium | Standard CI pipeline integration |
| `aver init` scaffolding | Medium | Lower barrier to first domain |
| npm publish | **Critical** | No external users can try it today |
| README / docs site | **Critical** | No one knows what this is |
| Real-world example domain | High | Beyond dogfood -- a realistic app domain |

---

## Strategic Context (from Product Refinement Team)

Four independent analyses converged on these findings:

1. **The BDD Testing Framework is the real product** that was hiding inside AgilePilot's sprawling vision. Aver IS that product, and it's already further along than anyone expected.

2. **The target user is "Marcus"** -- a senior TypeScript developer / tech lead at a Series A/B startup (15-40 engineers) who uses AI coding tools daily. His pain: "AI writes code faster than I can verify it." He needs tests that verify business intent, not implementation details.

3. **The competitive landscape is wide open.** No tool today connects domain-abstracted testing + AI-native MCP + TypeScript-first DX. Serenity.js has the right architecture but terrible ergonomics. Playwright has great DX but no domain layer. SDD tools (GitHub Spec Kit, AWS Kiro, Tessl) drive code generation but not testing. Aver sits at an unoccupied intersection.

4. **The market window is 12-18 months.** SDD is now a recognized practice (ThoughtWorks Technology Radar). Major players are moving. The time to establish Aver's position is now.

5. **Blueprint (the spec language from AgilePilot) is the Phase 3+ moat**, not the MVP. If Aver gains traction, a specification language that generates Domain objects becomes the lock-in layer. But that's earned, not assumed.

Full analyses available at: `../agilepilot/docs/product-refinement/`

---

## Recommended Roadmap

### Phase 1: Go to Market (Weeks 1-3)

The goal is **external users**. Everything else is secondary.

#### 1A. npm Publish + README (Week 1)
- [ ] Write a README that reads like a landing page. Show the 3-layer architecture in one glance: Domain (what) -> Adapter (how) -> Test (verify). Include a before/after comparing raw Playwright to Aver.
- [ ] Publish `aver`, `@aver/protocol-playwright`, and `@aver/mcp-server` to npm as `0.1.0-alpha`.
- [ ] Choose a license (MIT recommended -- npm ecosystem default, allows commercial services later).
- [ ] Create a minimal landing page or GitHub Pages site.

#### 1B. Real-World Example (Week 1-2)
- [ ] Build a realistic example domain beyond the dogfood suite. E-commerce (cart + checkout + auth) is the universal testing example. Ship it as `examples/e-commerce/` in the repo.
- [ ] Ensure the example demonstrates: multi-adapter (direct + playwright), domain extensions, action traces on failure, and the MCP server exploring the domain.

#### 1C. HTTP Protocol (Week 2)
- [ ] Implement `@aver/protocol-http` (or include in core as `http()`). Fetch-based, takes `baseUrl` config.
- [ ] Show the same domain tested against browser AND API in the example.
- [ ] This is the "aha moment" for adoption -- same test, different adapter, zero code duplication.

#### 1D. `aver init` Scaffolding (Week 2-3)
- [ ] `aver init --domain ShoppingCart --protocol playwright` generates the 3-layer file structure.
- [ ] Lower the barrier to "I tried it" from 15 minutes to 2 minutes.

#### 1E. Early User Outreach (Week 3)
- [ ] Get Aver in front of 5-10 TypeScript developers who do acceptance testing. DevRel channels: Twitter/X, TypeScript Discord, Testing communities, Dev.to, Reddit r/typescript.
- [ ] Write a "Why I built this" blog post. Lean into the Dave Farley 4-layer architecture and the AI verification gap.
- [ ] Measure: Do they install it? Do they define a domain? Do they come back?

### Phase 2: Approval Testing + Agent Skill (Weeks 4-8)

This is the differentiation phase -- the features that make Aver uniquely suited for AI-assisted development.

#### 2A. Approval Testing
- [ ] `approve()` utility that captures query output and compares against stored baselines.
- [ ] Scrubbers for non-deterministic content (timestamps, IDs).
- [ ] `aver approve` CLI command for interactive review.
- [ ] Per-adapter baseline storage (`__approvals__/<domain>/<test>.<protocol>.approved.txt`).
- [ ] MCP tools: `list_pending_approvals`, `get_approval_diff`.

**Why this matters**: Approvals are the natural human-in-the-loop gate for AI-assisted development. The agent proposes, the developer approves. No other testing framework has this as a first-class workflow with MCP integration.

#### 2B. Claude Code Skill (Predictive TDD)
- [ ] `SKILL.md` with Predictive TDD workflow instructions.
- [ ] Agent predicts test outcomes before running, verifies prediction, iterates.
- [ ] ZOMBIES checklist integration for test coverage planning.
- [ ] Approval gate workflow (agent cannot auto-approve, presents diff to developer).

**Why this matters**: This is the "developer as architect, AI as implementer" workflow. It's the killer feature for Marcus's daily workflow.

#### 2C. CI Reporter
- [ ] JUnit XML reporter for standard CI pipeline integration.
- [ ] Domain-language test names in reports (not raw file paths).
- [ ] Action trace included in failure reports.

### Phase 3: Ecosystem + Community (Weeks 9-16)

Earned through Phase 1-2 user feedback.

#### 3A. Blueprint Integration (Optional, Data-Driven Decision)
- [ ] If users want a higher-level spec format, build a Blueprint-to-Domain code generator.
- [ ] The AgilePilot grammar and LSP are production-quality assets ready to be reused.
- [ ] VS Code extension for spec authoring with cross-reference validation.
- [ ] **Only build this if Phase 1-2 users are asking for it.**

#### 3B. Additional Protocols
- [ ] WebSocket protocol (for real-time app testing).
- [ ] gRPC protocol (for service testing).
- [ ] Community protocol template/guide.

#### 3C. Advanced MCP Features
- [ ] Context-budget-aware reporting (minimal/standard/full disclosure levels).
- [ ] `suggest_test(intent)` -- AI generates test suggestions in domain language.
- [ ] `audit_coverage(domain)` -- what's tested vs. what's not.

#### 3D. Docs Site + Guides
- [ ] Diataxis-structured documentation (tutorials, how-tos, reference, explanation).
- [ ] Migration guide from raw Playwright.
- [ ] Migration guide from Serenity.js.
- [ ] "Aver for AI-Assisted Development" guide.

---

## What to NOT Build (Yet)

Per the product refinement team's analysis, these are explicitly deferred:

- **Web dashboard / SaaS** -- premature. Ship the npm package.
- **AI ticket refinement** -- dead product line from AgilePilot.
- **Knowledge graph / "Collective Intelligence"** -- not relevant to the testing framework.
- **Multi-agent orchestration** -- vaporware scope.
- **Visual test editor** -- too early. IDE + TypeScript types are the authoring experience.
- **Enterprise features** (SSO, audit trails, etc.) -- find 10 users first.

---

## Success Metrics

### Phase 1 (Go to Market)
- npm weekly downloads > 50
- At least 5 external users have defined a real domain (not just installed)
- At least 2 users report the "aha moment" (same domain, different adapters)
- GitHub stars > 100

### Phase 2 (Differentiation)
- At least 3 users using approval testing in a real project
- At least 1 user using the Claude Code skill for Predictive TDD
- At least 1 blog post or conference talk by someone other than the creator

### Phase 3 (Ecosystem)
- Community-contributed protocol or adapter
- A company using Aver in production CI
- Decision data on whether Blueprint integration is warranted

---

## Key Risks

| Risk | Mitigation |
|------|-----------|
| "Just use Playwright directly" objection | README must show maintenance cost difference with before/after examples at scale (50+ tests) |
| Adoption friction of new patterns | `aver init` scaffolding + excellent example domain + 15-minute getting started |
| MCP is still early | Ship the framework as a great testing tool first. MCP is upside, not the pitch. |
| Solo founder / capacity constraints | Ruthlessly prioritize. Phase 1 is the only thing that matters until it's done. |
| AWS Kiro or Playwright adds domain layer | Move fast. Establish category position while the window is open. |

---

## The One Thing

If you do nothing else from this plan, do this:

**Publish to npm and write a README that makes a senior TypeScript developer say "I want to try this."**

Everything else follows from having real users.
