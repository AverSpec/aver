---
layout: default
title: Glossary
nav_order: 8
---

# Glossary

Aver-specific terminology clarified.

## Core Concepts

**Acceptance Testing**
A testing approach focused on verifying that a system exhibits the expected behavior from the user's perspective, typically expressed in business language rather than implementation details.

**Action**
A domain operation that changes state. Actions perform side effects, take optional typed parameters, and return void. Declared with the `action()` marker.

**Adapter**
A concrete implementation of a domain's vocabulary for a specific protocol. One adapter per interaction mode (unit, HTTP, Playwright, etc.). Created via `implement()`, adapters bind domain operations to real handlers within a protocol context.

**Approval**
Snapshot-based verification that compares current output to an approved baseline. The `approve()` function captures behavior and stores it for comparison in future runs. Provided by `@averspec/approvals`.

**Assertion**
A domain operation that verifies an expected outcome. Assertions check conditions, take optional typed parameters, return void, and express intent in domain language. Declared with the `assertion()` marker.

**Contract**
Extracted behavioral expectations from test telemetry used to verify production traces conform to the same expected patterns. Contracts are extracted via `@averspec/telemetry` for dev-to-prod verification.

**Domain**
The vocabulary of a bounded context — what a system does, expressed in business language without implementation details. Domains declare actions, queries, and assertions that describe system behavior. Created with `defineDomain()`.

**Marker**
A factory function (`action()`, `query()`, `assertion()`) that declares a domain operation. Markers accept optional `MarkerOptions<P>` including telemetry expectations.

**Protocol**
The communication layer that manages session lifecycle. Protocols create a context passed to adapter handlers and handle setup, teardown, and optional test lifecycle hooks (onTestStart, onTestFail, onTestEnd). Aver ships unit, http, and playwright protocols.

**Query**
A domain operation that reads state. Queries retrieve data without side effects, take optional typed parameters, and return typed results. Declared with the `query()` marker.

**Suite**
The test API created from a domain and optional adapter pairing. Returned by `suite()`, it provides test registration (`test`/`it`/`describe`), test context (act/given/when/query/assert/then), and programmatic lifecycle methods (setup/teardown/getTrace/getCoverage).

**Trace**
An ordered record of domain operations executed during a test. Each step logs as it executes, capturing the full sequence leading to errors. Accessed via `context.trace()` — a function returning `TraceEntry[]`.

## Architecture

**3-Layer Model**
Aver's foundational architecture separating concerns:
- **Domain** (what) — declares vocabulary in business language
- **Adapter** (how) — binds vocabulary to real implementations via a protocol
- **Test** (verify) — composes domain operations without knowing protocols

## Telemetry

**Correlation**
The practice of linking related spans in a trace to verify observability seams are intact. Aver automatically verifies that spans sharing a correlation attribute (e.g., `order.id`) are causally connected within the same trace or via span links.

**Telemetry Verification**
Automatic checking that domain operations produce expected OpenTelemetry spans with correct names and attributes, and that related operations maintain causal connections. Runs per-step during test execution and end-of-test during correlation verification.

## Functions & APIs

**`adapt()`**
Creates a typed adapter from a domain definition. Enforces at compile time that every domain operation has an implementation. Alias for `implement()` — both names are supported.

**`approve()`**
Snapshot-based approval testing function. Also aliased as `characterize()` for semantic clarity in specific testing contexts.

**`defineDomain()`**
Creates a domain with named vocabulary (actions, queries, assertions). Returns a Domain object.

**`implement()`**
Creates a typed adapter from a domain definition. Alias for `adapt()` — both names are supported.

**`suite()`**
Creates a test suite from a domain and optional adapter. Returns the test API including test registration and context. Supports both single-domain and multi-domain (named config) modes.

## Testing Styles

**Given/When/Then**
Narrative test aliases providing clarity in test structure. `given` and `when` are aliases for `act`, and `then` is an alias for `assert`, used to label setup, trigger, and verification steps in test traces. Internally they call the same adapter handlers.
