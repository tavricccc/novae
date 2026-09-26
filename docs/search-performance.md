# 本文與作者搜尋效能

`0019_search_content_and_author.sql` 把搜尋擴大到本文和作者，但每筆候選資料都要呼叫 `SECURITY DEFINER` 比對函數。PostgreSQL 無法把函數內的條件轉成外層索引查詢。即使標題已有 trigram 索引，搜尋罕見詞仍會逐筆檢查分類中的資料。

`0050_indexed_content_author_search.sql` 改成先用各欄位的索引取得候選 ID，再沿用原本的分類、狀態、審核、本人及作者可見性條件。本文和作者名稱各補上對應的 GIN trigram 索引；標題、設施位置沿用既有索引。隱藏作者的提案仍只有作者本人或有管理權限的人能以作者名稱找到。

## 重跑方式

```bash
bun run db:start
bun run verify:search-performance
```

腳本位於 [`scripts/verify-search-performance.mjs`](../scripts/verify-search-performance.mjs)。它使用本機 PostgreSQL owner 帳號建立 `novae_search_verify_<pid>`，依序套用 migration、建立測試資料、量測，再執行搜尋及管理頁進度的權限回歸測試。結束時會重新連線並刪除該測試資料庫，保留原本的 `novae`；Windows 執行期間另有 WSL keepalive，避免 PostgreSQL 隨 WSL 閒置關閉。

預設使用專案的本機 owner URL，也可透過 `DATABASE_OWNER_URL` 指定測試用 PostgreSQL。帳號需要建立資料庫及設定 fixture session 的權限。fixture 匯入期間略過 trigger，量測及回歸測試前恢復正常模式；這項檢查不衡量寫入效能。修改 SQL function 簽章後，可執行 `bun run verify:search-performance --generate-contracts`，從同一份完成 migration 的 schema 更新 Worker 契約。

## 2026-09-26 本機量測

環境為 Windows、WSL Ubuntu 24.04、專案的 PostgreSQL 17 container 和 Node.js 24。每個 domain 有 12,000 筆資料，另有 12,000 位作者；資料集中於一個分類、皆為有效狀態，本文約 400 字元。`NeedleContent` 命中每個 domain 的 12 筆本文；`NeedleAuthor` 命中一位作者及其一筆內容。頁面大小為 30。

對同一資料庫的正式 `backend_list_issues`、`backend_list_facilities` 函數執行 `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)`。每組先暖機一次，再取三次 `Execution Time` 的中位數；比較套用 `0050` 前後，並核對完整回傳結果一致。

| 查詢 | `0050` 前 | `0050` 後 |
| --- | ---: | ---: |
| 提案本文 `NeedleContent` | 646.427 ms | 4.364 ms |
| 提案作者 `NeedleAuthor` | 640.819 ms | 2.947 ms |
| 設施本文 `NeedleContent` | 1130.464 ms | 6.518 ms |
| 設施作者 `NeedleAuthor` | 1137.927 ms | 5.584 ms |

此外，腳本對本文、作者欄位各執行獨立的 `EXPLAIN ANALYZE`，確認 planner 選用 `issues_content_search_trgm_idx`、`facility_reports_content_search_trgm_idx`、`user_profiles_display_name_search_trgm_idx`，過程沒有關閉 sequential scan。最初只有 1,200 位作者時，planner 選擇掃描小型 profile table；擴大 fixture 後才驗證到作者索引路徑，不能把「存在索引」直接當成「每次都會使用索引」。

這是單連線、合成資料與暖快取下的 SQL 時間，未包含 Worker、網路、冷啟動、同時操作或 production 資料分布。常見詞、少於三個字元的搜尋、較多符合項目或不同分類大小，都可能選擇其他計畫。GIN 也會增加索引空間及寫入成本；部署時須依資料量安排建立索引的時間，不能把上表當成線上延遲承諾。

## 功能回歸

腳本一併驗證提案的匿名作者搜尋權限、設施的分類管理權限，以及管理頁 `progressOnly` 仍受原本管理權限保護。`0051_owned_proposal_search.sql` 為「我的提案」補上本文／標題／本人名稱搜尋，scope 一律取認證後的 `auth.uid`，不接受 payload 裡另一個使用者的 UID。

「我的提案」測試也包含 `%` 的字面比對、空搜尋，以及同毫秒但帶微秒的兩筆資料跨頁讀取。列表 SQL 使用明確資料列別名計算排序時間，並依 cursor ID 恢復資料庫中的精確時間，避免 JavaScript `Date` 的毫秒精度漏掉同時建立的提案。
