# 変更の分割と公開順序

以下を独立してレビュー・起票できる PR の単位とする。子 Issue と完了報告の本文案は GitHub へ未投稿。Issue 本文案はこのディレクトリの `issue-*-draft.md`、方式別 PR 本文案は `pr-*-draft.md`。

| 順序 | 変更単位 | 含める内容 |
| --- | --- | --- |
| 1 | 証拠整理・再現方法 | evidence.md、environment.md、reproduce.md、子 Issue/PR 本文案 |
| 2 | systemd | systemd ガイド、systemd-results.md、systemd 分の changelog |
| 3 | Docker | Docker ガイド、docker-results.md、Docker 分の changelog |
| 4 | 共通文書と親 Issue の完了報告 | 共通運用メモ、close-report-draft.md、本ファイル |

2/3 は1の共有資料に依存するが、互いのガイド変更には依存しない。4は2/3の結果に依存する。本文案のチェックリストは起票する人が担当範囲の実際の確認結果に従って更新する。

#131 の close は、実環境検証だけでなく修正文書と検証記録の公開後に判断する。子 Issue の起票・完了報告の投稿・close は別途明示された指示に従う。
