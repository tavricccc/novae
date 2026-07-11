# 維運手冊

[English](en/operations.md) · [文件首頁](README.md)

本手冊提供部署後的例行檢查、事故處理與復原順序。雲端控制台的完整錯誤可能包含個人資料或敏感 metadata，分享前必須遮罩。

## 服務目標

專案沒有內建 SLA。營運團隊應自行定義至少以下指標：登入成功率、主要 action 錯誤率、p95 latency、outbox 待處理與最老事件時間、推播失敗率、圖片失敗率、Notion 同步延遲、資料庫與供應商用量。

## 每次部署後

1. 確認 GitHub Actions 後端與前端 workflow 成功。
2. 檢查 `backendAction` smoke test 與 maintenance cleanup 回應。
3. 以一般使用者與管理員各完成一次登入和受權限保護的讀取。
4. 建立低風險測試內容，驗證寫入、Realtime、圖片與通知。
5. 檢查 Dashboard、Supabase Function logs、database health 與 Vercel logs。
6. 監看至少一個背景工作週期，確認 outbox 沒有持續累積。

## 例行節奏

| 頻率 | 檢查 |
| --- | --- |
| 每日 | 登入與 action 錯誤、outbox backlog、Function 失敗、供應商事故 |
| 每週 | 圖片／Notion／FCM 失敗、資料庫容量、Redis 用量、管理員名單 |
| 每月 | 帳單與額度、token／key 使用狀態、依賴更新、資料保留與備份還原演練 |
| 每學期 | 允許網域、分類規則、附議門檻、回覆期限、管理責任與隱私告知 |

## Dashboard 判讀

- 計數突然歸零：先確認環境與時間範圍，再檢查 counter 更新與最近 migration。
- outbox backlog 上升：檢查 worker 排程、claim、外部供應商與重試狀態。
- 圖片失敗增加：檢查 Cloudinary webhook、簽章時間、額度與 deletion jobs。
- Notion 延遲增加：檢查 integration 權限、database schema 與 API rate limits。
- 推播下降但站內通知正常：檢查 service account、VAPID、topic subscription 與瀏覽器權限。

Dashboard 是快速診斷入口，不是 log 或稽核紀錄的替代品。

## 事故處理

1. **確認影響**：記錄開始時間、環境、使用者範圍、錯誤 action 與最近部署。
2. **保留證據**：保存 workflow run、request ID、匿名化錯誤與供應商狀態；不要貼出 token。
3. **降低傷害**：停止有問題的部署或背景觸發，必要時暫停特定整合；不要先 reset 資料。
4. **定位層級**：瀏覽器／Vercel、Firebase、Edge Function、Postgres、Redis、Cloudinary、Notion 或 FCM。
5. **修復與驗證**：使用最小修正，跑對應檢查，再執行 smoke test。
6. **復原 backlog**：確認冪等後再重試 worker 或 deletion job，觀察數量下降。
7. **結案**：記錄時間線、原因、影響、修正與預防項目；若涉及資料或憑證，依組織程序通知。

## 常見處置

| 症狀 | 先做什麼 | 避免 |
| --- | --- | --- |
| 全部 action 401/403 | 比對 Firebase project、允許網域與 service account | 關閉驗證 |
| migration 失敗 | 閱讀第一個 SQL 錯誤並比對 migration history | 修改已部署 migration |
| outbox 卡住 | 檢查 worker secret、排程與最早失敗事件 | 無限重跑造成重複副作用 |
| 圖片 pending | 檢查 webhook secret、URL 與 Cloudinary delivery | 將資源改成公開 |
| 成本突升 | 依服務拆用量，檢查讀取、上傳、egress 與 retry | 未定位來源就升級全部方案 |

更細的逐項判斷見[故障排除](troubleshooting.md)。

## 資料保留與刪除

Cron 與 `maintenanceCleanup` 負責短期操作資料、失敗紀錄與暫存資料的保留。內容刪除可能同時涉及 Postgres、Cloudinary 與 Notion 標記；不要只在單一供應商手動刪除。修改保留政策時要新增 migration、更新隱私告知並驗證 deletion jobs。

## 備份與復原

- 使用 Supabase 提供的資料庫備份能力，並依方案確認保留期與復原點。
- Notion 僅為方便營運的副本，不保證完整、一致或可還原 schema。
- Cloudinary 資產與資料庫 metadata 必須一起考量。
- 每月以隔離環境演練還原，記錄 RPO/RTO 與缺口。
- 復原後輪替暫時憑證，重跑 smoke test，確認背景工作不會重複外部副作用。

## 本機維護指令

```bash
npm run verify:local
npm run db:start
npm run db:reset:local
npm run db:lint:local
```

這些指令只操作本機或驗證程式碼，不代表已驗證正式環境供應商整合。
