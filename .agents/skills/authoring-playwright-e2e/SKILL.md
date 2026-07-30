---
name: authoring-playwright-e2e
description: Use whenever authoring, exploring, or debugging the fork-owned Playwright e2e specs under the `playwright/` directory — distilling explorations into committed specs, reusing `fixtures/misskey.ts` helpers and upstream `data-testid` selectors, and triaging flakes, while keeping raw exploration logs and codegen output out of commits.
---

# authoring-playwright-e2e

This is the Codex entrypoint for the canonical endolphin Playwright e2e authoring skill.

Read and follow [.claude/skills/authoring-playwright-e2e/SKILL.md](../../../.claude/skills/authoring-playwright-e2e/SKILL.md). Treat that file and its `references/` directory as the source of truth.

Note: the Playwright MCP `browser_*` tools are Claude Code only (provided by the `playwright@claude-plugins-official` plugin). Without them, author specs by hand or with `pnpm -C playwright codegen`, following the same fixtures / placement / acceptance rules in the canonical skill.
