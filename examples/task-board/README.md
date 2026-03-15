# Task Board Example

A complete React + Express task board demonstrating Aver's multi-adapter testing. The same domain-language tests run against three adapters: unit (in-memory), HTTP (REST API), and Playwright (browser UI).

## Prerequisites

- Node.js 22+
- pnpm

## Setup

```bash
pnpm install
pnpm --filter @averspec/core run build
```

## Running the App

Start the Express server and Vite dev server:

```bash
pnpm dev
```

The app is available at `http://localhost:5173` (Vite proxy forwards API requests to Express on port 3000).

## Running Tests

Run all adapters:

```bash
pnpm test
```

Run a specific adapter:

```bash
pnpm test:unit        # In-memory (fastest)
pnpm test:http        # Against REST API
pnpm test:playwright  # In a real browser
```

## Feature Flags

| Variable | Description |
|----------|-------------|
| `AVER_DEMO_FAIL=1` | Enables a deliberately failing test to demonstrate failure artifacts |
| `AVER_DEMO_APPROVAL=1` | Enables an approval testing demo |
| `AVER_DEMO_DIFF=1` | Enables an approval diff demo |

## Project Structure

```
adapters/           # Adapter implementations (unit, http, playwright)
domains/            # Domain definitions
src/                # App source (React frontend + Express API)
tests/              # Test files
aver.config.ts      # Aver adapter registration
vitest.config.ts    # Vitest configuration
```
