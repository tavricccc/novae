# 執行期政策與限制

下表是新環境的初始值，不代表目前部署值。產品配額、內容／快取／工作政策以資料庫 `operations_settings` 為準，可由「系統管理 → 營運」調整；`config/operations.config.json` 定義可調範圍，`config/rate-limits.config.json` 提供配額初值。Retention 與圖片設定另有既有管理頁。Cloudflare native bindings 保留資源安全硬上限。

## 業務操作配額

| Policy key | 上限 | 週期 | 使用情境 |
| --- | ---: | --- | --- |
| `issueCreateDaily` | 10 | 每日 / UID | 建立提案 |
| `facilityCreateDaily` | 10 | 每日 / UID | 建立設施回報 |
| `announcementCreateDaily` | 20 | 每日 / UID | 發布公告 |
| `commentCreateHourly` | 60 | 每小時 / UID | 提案與公告留言 |
| `imageUploadDaily` | 50 | 每日 / UID | 圖片 upload unit |
| `loginSyncHourly` | 20 | 每小時 / UID | Profile sync |
| `avatarCacheDaily` | 10 | 每日 / UID | 更新 avatar cache |
| `supportToggleHourly` | 120 | 每小時 / UID | 附議切換 |
| `facilityAffectedToggleHourly` | 120 | 每小時 / UID | 受影響切換 |
| `facilityStatusUpdateHourly` | 60 | 每小時 / UID | 設施狀態更新 |
| `announcementLikeHourly` | 120 | 每小時 / UID | 公告按讚 |
| `pushTokenWriteHourly` | 30 | 每小時 / UID | Push token 註冊或移除 |
| `preferenceWriteHourly` | 60 | 每小時 / UID | 個人偏好與通知已讀 |
| `moderationWriteHourly` | 120 | 每小時 / UID | 提案審核與結果 |
| `roleWriteHourly` | 120 | 每小時 / UID | 角色、scope、category 與平台設定 |
| `destructiveWriteHourly` | 30 | 每小時 / UID | 刪除與運維重試 |

Healthcheck 另限每分鐘 12 次、每秒 2 次；Worker background run 也是每分鐘 30 次、每秒 2 次。這兩組是 Worker 內的業務限制。

## Cloudflare ingress limits

| Binding | Limit / period | 目的 |
| --- | --- | --- |
| `INVALID_AUTH_IP_RATE_LIMITER` | 300 / 60 秒 | 無效身分流量的 IP breaker |
| `READ_RATE_LIMITER` | 60 / 10 秒 | 一般讀取 |
| `WRITE_RATE_LIMITER` | 20 / 10 秒 | 一般寫入 |
| `SENSITIVE_WRITE_RATE_LIMITER` | 10 / 10 秒 | 敏感互動 |
| `ADMIN_WRITE_RATE_LIMITER` | 10 / 10 秒 | 管理寫入 |
| `UPLOAD_WRITE_RATE_LIMITER` | 6 / 10 秒 | 建立與完成 upload |
| `UPLOAD_RESOLVE_RATE_LIMITER` | 30 / 10 秒 | 解析圖片 URL |
| `SYNC_USER_RATE_LIMITER` | 10 / 60 秒 | Profile sync ingress |
| `WEBHOOK_IP_RATE_LIMITER` | 120 / 60 秒 | Cloudinary webhook 單 IP |
| `WEBHOOK_GLOBAL_RATE_LIMITER` | 300 / 60 秒 | Cloudinary webhook 全域 |
| `MEDIA_USER_RATE_LIMITER` | 1,200 / 60 秒 | 已驗證使用者媒體讀取 |
| `MEDIA_INVALID_IP_RATE_LIMITER` | 120 / 60 秒 | 無效媒體 token 的 IP breaker |
| `LOGIN_IP_RATE_LIMITER` | 300 / 60 秒 | 校園共用網路下的登入 burst |

Ingress limit 和業務 limit 會同時生效。前者保護 Worker 資源，後者限制單一 UID 的產品操作；不能只調其中一層便認為配額已改完。

營運頁的 `readBurst`、`writeBurst`、`sensitiveBurst`、`adminBurst`、`uploadBurst`、`resolveBurst` 由 SQLite Durable Object 依 UID 執行，範圍不超過對應 binding 的硬上限。學校共用出口 IP 不會合併已登入使用者的配額。IP breaker 仍只處理登入／無效身分／無效媒體／供應商 webhook，不加入一般已登入操作。

前端 `clientWriteCooldownMs` 預設 500 ms，僅減少同一使用者重複點擊同一寫入操作，不能取代伺服器限制。`markNotificationsOpened` 也受偏好寫入的每小時配額約束。DO alarm 會清掉到期且不再使用的 bucket；20 個同時請求、同一共用 IP 的不同 UID、原子拒絕與 alarm 已有真實 workerd/SQLite 測試。

## 預設資料保留

| 資料 | 預設期限 | 可停用 |
| --- | ---: | --- |
| 已關閉提案 | 365 天 | 是 |
| 已關閉設施回報 | 365 天 | 是 |
| 公告 | 730 天 | 是 |
| 站內通知 | 30 天 | 是 |
| 完成 delivery | 3 天 | 否 |
| 失敗 delivery | 14 天 | 否 |
| Operation 重播 response | 24 小時 | 否 |
| Domain event | 30 天，且所有 delivery 已清除 | 否 |
| 未活動 Push token | 60 天 | 否 |
| Push token 再確認間隔 | 7 天 | 否 |
| 未活動 avatar | 180 天 | 是 |
| 未活動 profile PII | 365 天 | 是 |
| 已過期互動限制 | 30 天 | 是 |
| 完成 background job | 3 天 | 否 |
| 失敗 background job | 30 天 | 否 |
| Role assignment audit | 365 天 | 否 |
| Platform admin audit | 365 天 | 否 |
| Category configuration audit | 365 天 | 否 |
| Access assignment audit | 365 天 | 否 |
| Pending upload | 24 小時 | 否 |
| 未附著到內容的 upload | 48 小時 | 否 |
| Failed upload | 24 小時 | 否 |

表中的值是新系統初始值。部署後，管理員可以在平台設定改 runtime retention；closed content、announcement、notification、avatar、profile PII 與 expired restriction 有獨立 enable switch。技術與安全上限仍留在程式或 Cloudflare binding，不由 UI 修改。

Retention 修改先呼叫 `estimateRetentionCleanup` 算受影響筆數，確認後才儲存設定與排入 background job。Queue consumer 真正執行 policy batch，而不是只重複排程後標示完成。

Operation 的大型 response 到期後可清空；被 event／管理稽核引用的身份列仍保留，讓稽核關聯完整。已清空的操作 ID 再送出會回 `operation-expired`，不回空成功、不再執行一次寫入。等外鍵引用到期後，身份列才刪除。

失敗的外部刪除 job 到期時，必要的 Cloudinary／Notion 識別碼移入 `external_cleanup_backlog`，不保留原始長錯誤；管理員可以重試。這是未完成的刪除責任，不是可直接丟棄的 log。

Notion 非內容事件預設 365 天封存，`notionArchiveDays` 可調；內容頁隨來源資料生命週期處理。刪除到期 mapping 會排入實際 Notion archive 工作，供應商未設定時不能標示完成。封存是 Notion 可復原的 archive，不等同於永久抹除，也無法追溯處理已失去 mapping 的歷史外部副本。

## 前端請求與連線節流

- 首次設定等待頁採 3 秒起始、倍增至 30 秒的輪詢；管理工作的進度採 4 秒起始、倍增至 30 秒。隱藏分頁或離線時暫停，回到可見且連線的狀態立即更新，不疊加未完成的輪詢。
- 管理工作進度沿用 `getOperationsConsole` 的權限檢查，只讀 jobs，不重讀容量、歷史與其他面板。設定頁的背景工作追蹤會合併同時讀取，暫時失敗不會誤判工作已結束。
- 內容失效事件以 200 毫秒合併，持續事件最多等待 1 秒後刷新；慢讀取期間只保留一次後續刷新。背景與離線時保留失效狀態，恢復後再查。
- 支援 Web Locks 與 BroadcastChannel 的瀏覽器，同帳號與相同管理角色的可見分頁共用 realtime 連線。持有連線的分頁隱藏、閒置、離線或關閉時讓其他分頁接手；API 不可用時使用各分頁獨立連線。跨分頁只傳事件與同步訊號，不傳 token 或 ticket。
- 媒體政策快取命中時不建立資料庫連線；快取失效後才讀取政策。圖片仍先驗證媒體 token，再依圖片、尺寸與政策版本共用 edge cache，私密圖片仍使用瀏覽器 `no-store`。
- Notion 每次真正出站時才建立該次請求的 15 秒逾時；排隊與 Retry-After 等待不會耗盡下一次嘗試的逾時。既有重試次數與單次工作請求預算保持有效。

這些規則降低無效請求與重複查詢，不代表固定的帳單降幅。正式成本仍需對照活躍使用量、快取命中率、資料庫執行時間與供應商用量。

## 其他營運政策

| 類別 | 管理項目 |
| --- | --- |
| 內容 | 標題、本文、留言、結果、地點、搜尋長度；Worker 執行產品限制，PostgreSQL 保留較寬儲存安全上限 |
| 前端 | 一般／讀取／長操作 timeout、重試次數、允許自動等待的 Retry-After、寫入冷卻、頁面快取期限／筆數、feed 保留頁數 |
| Realtime | 閒置分鐘、ticket 秒數；不改身分／scope 驗證 |
| 工作 | 外部 job、policy、Notion、通知、realtime 每批量；Worker run 每秒／分鐘配額 |
| 紀錄 | 每日錯誤聚合保存天數、DB 容量日樣本保存天數；設定歷史使用 `adminAuditDays` |
| 媒體 | Browser 與 edge cache 秒數，預設各 60 秒、最多 3,600 秒；私有圖片仍 `private, no-store` |

公開媒體不再回傳一年 `immutable`。媒體政策最多一分鐘刷新一次，edge key 包含政策 revision，避免降低期限後仍使用舊長效快取。先前已下載或已存進瀏覽器的副本無法收回。

JWT／HMAC 演算法、供應商 API 版本、平台 ADMIN_EMAILS、schema 安全上限、原生資源 breaker 與部署排程仍是受版本控制的安全／平台設定，不讓一般 runtime 表單改寫。這些值與「可即時生效的產品政策」要分開看，不能在 UI 顯示超出實際平台能力的假上限。
