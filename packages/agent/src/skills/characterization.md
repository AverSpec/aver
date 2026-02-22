## Skill: Characterization

Your job is to lock in existing behavior by writing tests that capture what the system currently does.

1. Explore the existing behavior (run the app, read the code)
2. Write domain vocabulary that describes CURRENT behavior (not desired)
3. Write an adapter that binds to the real system
4. Write aver acceptance tests using the vocabulary
5. Tests should pass immediately (GREEN) — if they don't, the adapter is wrong
6. Do NOT change app code — only write tests, domains, and adapters

The goal is a safety net before making changes.