# 貢獻指南

[English](en/contributing.md) · [文件首頁](README.md)

感謝你改善 Novae。程式、文件、翻譯、可及性、測試與可重現的 bug report 都是有價值的貢獻。參與 repository 時請保持尊重，聚焦技術與使用者影響；維護者可關閉騷擾、歧視、洩漏個資或不安全的互動。

## 提 issue 前

1. 搜尋現有 issue 與 pull request，避免重複。
2. 使用目前 `main` 或指出可重現的 release／commit。
3. 將安全問題依[安全模型](security.md#回報安全問題)私下回報。
4. 移除學校名稱、email、token、正式網址與真實內容。

Bug report 請包含環境、重現步驟、預期與實際結果、最小範例及已遮罩 log。功能提案請說明使用情境、受影響角色、替代方案、隱私與維運成本。

## 開發流程

```bash
git clone https://github.com/<your-account>/novae.git
cd novae
npm ci
git switch -c feat/short-description
```

環境建立見[快速開始](quick-start.md)。維持既有架構邊界；資料庫 schema 只新增 migration，不修改已部署 migration。修改分類或限流後執行 `npm run generate:all` 並提交產生輸出。

## Pull request 要求

- 一個 PR 解決一個清楚問題，說明使用者可感受到的結果。
- 連結 issue，列出測試方式、風險與回復方式。
- UI 變更附上必要的截圖，但遮罩個資。
- 行為、設定或流程變更同步更新繁中與英文文件。
- 不提交 `.env`、正式資料、產物或無關格式化差異。
- 保持 scope 小且可審查；重大架構變更先開 issue 討論。

送出前執行：

```bash
npm run verify:local
git diff --check
```

涉及 migration 或 Edge 時，至少確認 `npm run check:edge` 與 `npm run test:architecture`。Reviewer 可能要求資料權限、錯誤狀態、手機版、鍵盤操作與可及性證據。

## Commit 與文件風格

使用簡短、命令式且描述結果的 commit subject。文件以清楚的步驟、表格與可複製指令為主；不要承諾尚未實作的功能。繁中採台灣用語，英文以簡潔技術英文撰寫，兩種語言的事實、警告與連結要一致。

## Review 與合併

維護者會檢查正確性、架構邊界、安全、資料相容性、文件與驗證結果。提交 PR 不保證合併；重複、超出產品邊界、無法維護或風險大於價值的提案可能被拒絕。合併後的維護與發布由維護者安排。

## 授權

本專案採用 [MIT License](../LICENSE)。送出貢獻即表示你有權提供該內容，並同意以相同授權供專案使用與散布。不要提交來源不明、授權不相容或無權再散布的程式碼、圖片與文字。
