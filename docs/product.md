# 產品與使用流程

## 使用者

Novae 服務同一學校網域內的三類使用者：

- 一般成員提出議題、附議、留言、回報設施、閱讀公告並接收通知。
- 分類管理員在獲授權的 category scope 內審核與處理內容。
- 平台管理員設定功能、分類、權限、資料保留政策並查看系統狀態。平台管理員名單只來自 Worker 的 `ADMIN_EMAILS`。

## 內容流程

### 公共提案與權益案件

提案分類決定可見性、作者是否匿名、附議門檻與時限，以及是否開放留言。列表和詳細頁共用 normalized entity store；附議先在畫面上更新，失敗時會還原。提案結案後顯示管理方的處理結果。

提案狀態由後端控制，前端認得下列七種值：

| Status | 意義 |
| --- | --- |
| `under-review` | 等待管理方決定是否公開 |
| `pending` | 已進入提案流程，等待附議或處理 |
| `processing` | 管理方處理中 |
| `auto-rejected` | 附議期限結束且未達門檻 |
| `review-rejected` | 審核未通過 |
| `infeasible` | 管理方判定無法執行，需附處理結果 |
| `completed` | 已完成並提供結果 |

Feed 可依最新、最多附議、即將截止排序；`my-proposals` 是獨立 route filter，不是 category。開啟附議的分類依附議期限收集支持，達標後進入處理流程。

提案與設施列表的搜尋、排序、狀態和分類同步到網址，可直接分享或重新整理；返回上一頁也會恢復已套用的條件。輸入搜尋文字時不建立瀏覽紀錄，提交搜尋才更新網址。「我的提案」支援搜尋自己的標題與本文，仍只會回傳目前帳號的提案。

### 設施回報

成員提交位置、內容及圖片，也能標記自己受到影響。具權限的管理員更新案件狀態與結案說明，列表、詳細頁及通知會由 content version 與 realtime event 重新同步。

設施狀態是 `pending`、`processing`、`completed` 或 `unable-to-handle`。列表可按最新或受影響人數排序。管理員的 scope 綁定 facility category，不因能進管理頁就自動取得所有設施案件權限。

### 公告

管理員發布公告，成員可按讚與留言。公告和留言使用與提案相同的媒體、作者資料解析、optimistic reaction 與討論元件。

### 通知

通知來源包含 domain event 對應的站內訊息與 Firebase Cloud Messaging。通知點擊會直接解析到目標 route，由目的頁自行載入 authoritative data，不先做額外 lookup。

通知 feed 會合併全校 broadcast、管理員通知、個人通知；每個來源維持自己的 cursor。一般使用者啟用 Push 後，所有適用通知都會送達且不能從應用程式關閉。平台管理員可在自己的設定中分別選擇是否接收提案、設施與留言通知；同一偏好同時控制站內通知與 Push。

通知列表排除已過期項目，分頁游標保留資料庫時間精度。通知刷新會淘汰舊分頁請求；刷新失敗時保留已載入的通知並顯示重試入口。已讀時間只會前進，較早發出的請求延遲抵達不會讓已讀通知重新變成未讀。

## 發文草稿

提案、公告與設施回報會將文字草稿儲存在目前分頁的 sessionStorage，最多保留 24 小時。草稿依登入帳號與內容類型隔離，提案另依分類隔離；設施回報包含位置與選定分類。重新整理或離開後回到相同編輯頁會恢復文字，成功送出、確認清除文字草稿或登出時會移除。圖片附件不會保存，恢復提示會提醒重新選取；儲存空間不可用時顯示提示，不會假稱儲存成功。

送出期間欄位暫停編輯，共用提交流程同步阻擋重複送出。建立失敗保留草稿供重試，建立成功後即使導頁失敗，也不會刪除已由內容使用的圖片。

留言與回覆也會保留文字草稿，依帳號、內容紀錄與回覆對象隔離。送出失敗保留原文；等待送出期間的新編輯，不會被前一次成功結果清除。中文輸入法組字期間不會因 Ctrl／Command＋Enter 誤送。版本更新會等待發文、留言、未儲存管理設定與開啟的詳情面板結束後再自動重載。

## 可設定項目

### Platform feature

| Setting | 影響 |
| --- | --- |
| `issuesEnabled` | 導覽與整個 `/issues` route family |
| `facilitiesEnabled` | 導覽與整個 `/facilities` route family |
| `announcementCommentsEnabled` | 公告留言寫入與呈現 |

### 提案 category

每個 category 保存穩定 ID、雙語介面顯示用 label、排序、是否預設，以及下列業務規則：

- `readAccess`：`school`、`reviewed-school` 或 `owner-admin`
- `authorVisible`：公開畫面是否顯示作者；後端仍保存真實 UID
- `supportEnabled`、`supportGoal`、`supportDeadlineDays`
- `commentsEnabled`

設施 category 只負責 ID、label、排序與預設值；案件管理 scope 同樣以 category ID 指派。

## 首次設定

登入後先選擇介面語言。尚未完成系統設定時，平台管理員會進入 `/setup`，至少建立一個提案分類與一個設施分類；流程可安全重試，完成狀態由後端決定。

若一般成員比管理員更早登入，會停在等待畫面。平台管理員完成設定後，其他已登入裝置不靠舊 session cache 猜狀態，會重新取得 bootstrap 並進入主程式。

## 管理範圍

管理介面包括分類與功能開關、category-scoped access、使用者限制、平台資料保留設定、背景工作進度與重試、稽核紀錄與 dashboard。前端隱藏按鈕只是呈現行為，真正的允許或拒絕由 Worker action 與資料庫函式判斷。

Dashboard 的統計包含使用者、提案、留言、附議新增／移除與刪除計數，也會顯示 Notion backlog、failed delivery、failed Push、stuck upload、cleanup backlog、最近失敗與上次 scheduled maintenance。這些讀取要求 `dashboard.view`。

## 介面原則

應用支援繁體中文與英文、亮暗色、鍵盤操作、reduced motion、手機 safe area 與 PWA standalone viewport。手機是主要使用情境；桌面則提供較密集的設定與管理畫面。

所有 domain copy 在 `src/i18n/messages/en` 與 `src/i18n/messages/zh-TW` 成對維護。`check:i18n` 會檢查 catalog shape、interpolation、API error reference、直接 `t()` key，以及 React source 裡未納管的漢字。

## 目前明確不做的事

- 不提供多租戶切換；一個 deployment 對應一個學校網域。
- 不讓前端或資料表欄位授予平台管理員。
- 不把 PostgreSQL、Durable Object 或 Notion 當作 browser 可直接存取的服務。
- 不接入生成式 AI；內容、審核與管理決策都由使用者完成。
