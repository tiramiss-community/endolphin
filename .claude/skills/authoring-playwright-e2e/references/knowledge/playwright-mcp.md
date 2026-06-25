# Playwright MCP (`browser_*`) の使い方と規約

LLM / エージェントが起動中の Misskey を**実ブラウザで駆動**するための MCP。探索・操作・spec 草案づくりに使う。正本は [docs/endolphin/playwright-e2e.md §Playwright MCP](../../../../../docs/endolphin/playwright-e2e.md)。

## 構成 (Claude Code)

- Claude Code は公式プラグイン **`playwright@claude-plugins-official`** 経由で `browser_*` ツールを使う。[.claude/settings.json](../../../../settings.json) の `enabledPlugins` で有効化済。
- **project `.mcp.json` は同梱しない**。プラグインと二重登録になるため。リポジトリに `.mcp.json` が無いのは意図的。
- Claude 以外の MCP クライアントから使いたい場合のみ、`@playwright/mcp` を project `.mcp.json` に別途登録する。その際は Claude 側のプラグインを無効化して二重登録を避ける。

## 使い方

1. ローカルで Misskey を起動する。探索用途は **`pnpm build && pnpm -C playwright explore`** が最短 (compose + start:test を上げて `:61812` を保持し、Ctrl-C で自動撤去)。`pnpm dev` でも可。起動と初期状態づくりは [tasks/exploring-with-mcp.md](../tasks/exploring-with-mcp.md)。
2. エージェントに `browser_*` で `http://localhost:61812` を探索・操作させる。代表的な操作: ページ遷移 (navigate)、DOM スナップショット取得 (snapshot)、クリック / 入力、スクリーンショット取得など。正確なツール名・引数はプラグインが提供するスキーマに従う (ツール一覧はセッションの利用可能ツールを参照)。
3. snapshot で `data-cy-*` 属性や role を拾い、操作列と待ちの正体を採取する → [tasks/exploring-with-mcp.md](../tasks/exploring-with-mcp.md)。

## codegen との関係

`browser_*` での手探索の代わりに、Playwright 標準の codegen で操作を録画して草案コードを得てもよい:

```bash
pnpm -C playwright codegen   # http://localhost:61812 に対して（playwright/package.json の script）
```

どちらも出力は**使い捨ての素材**。fixtures・`data-cy-*`・describe 構造へ作り替える → [tasks/distilling-a-spec.md](../tasks/distilling-a-spec.md)。

## 鉄則: 探索ログは commit しない

**MCP の探索ログ・codegen の生出力・スナップショット・trace アーティファクトは commit しない。蒸留した spec だけを `playwright/tests/` に置く。** これが Stage 4「探索 → 蒸留」分業の前提。探索ノイズをリポジトリに溜めない。
