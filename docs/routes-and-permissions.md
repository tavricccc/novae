# 路由、角色與權限

這份文件回答兩件事：使用者能進哪些頁面，以及後端最後用什麼規則決定一項操作能不能執行。前端 route guard 只負責導向和畫面呈現，不能取代 Worker 與 PostgreSQL 的授權。

## Route map

所有 `(protected)` route 都先經過 `ProtectedApp`。Session 尚未恢復時顯示啟動畫面；未登入會轉到 `/login?redirect=...`。首次設定沒完成時，所有受保護頁面都轉到 `/setup`；設定完成後再次進入 `/setup` 則轉到 `/issues`。

| Route | 用途 | 額外條件 |
| --- | --- | --- |
| `/` | 入口 redirect | 直接轉到 `/issues` |
| `/login` | Google 登入與 session restore | 公開頁面 |
| `/setup` | 語言與初始 category 設定 | 未完成 setup；只有平台管理員可編輯，其他人看到等待狀態 |
| `/issues` | 提案入口 | 依 catalog 轉到預設 category；沒有預設值時轉到 `/issues/my-proposals` |
| `/issues/[filter]` | category feed 或「我的提案」 | `issues` feature 必須開啟 |
| `/issues/[filter]/compose/new` | 新增提案 | category 規則、互動限制與後端驗證 |
| `/issues/[filter]/[issueId]` | 提案內容、附議、留言與處理結果 | 可見性與 category scope 由後端判斷 |
| `/facilities` | 設施回報列表 | `facilities` feature 必須開啟 |
| `/facilities/new` | 新增設施回報 | 互動限制與後端驗證 |
| `/facilities/[facilityId]` | 設施詳情、受影響標記與狀態 | 管理操作依 facility scope |
| `/announcements` | 公告列表 | 登入即可閱讀 |
| `/announcements/new` | 發布公告 | `announcement.manage` |
| `/announcements/[announcementId]` | 公告、按讚與留言 | 寫入仍受互動限制 |
| `/notifications` | 合併 broadcast、admin、user 通知 | admin source 只回給具管理身分的使用者 |
| `/settings` | 帳號、語言、外觀、安裝、Push 與管理入口 | 管理連結依 permission 顯示 |
| `/admin` | 管理入口與平台概覽 | 具 `dashboard.view` 或至少一個管理子頁的存取資格 |
| `/admin/content` | 分類與功能開關 | `category.manage` |
| `/admin/platform` | 圖片上傳與資料保留設定 | `category.manage` |
| `/admin/people` | 使用者限制、成員 scope | `role.manage` |
| `/admin/audit` | 角色與存取稽核 | `role.manage` |
| `/admin/system` | 營運狀態、失敗與重試 | 管理身分；後端依操作檢查 permission |
| `/admin/policies` | 執行期操作政策 | 管理身分；後端依操作檢查 permission |

管理頁已拆成各自儲存的獨立路由。舊 `/dashboard`、`/admin/management`、`/admin/categories` 與 `/admin/access` 不再提供，也沒有相容 redirect；新增導覽應使用 `src/lib/admin-routes.ts` 的路由表。

`issues` 或 `facilities` feature 關閉時，對應 route family 由 `FeatureRouteGuard` 轉到 `/announcements`。公告、通知與設定不受這兩個 feature flag 影響。

## Role code

Session bootstrap 回傳 role、permission，以及可管理的 category ID。

| Role code | 意義 |
| --- | --- |
| `platform-admin` | 平台管理員；後端依 `ADMIN_EMAILS` 建立，涵蓋所有 category 與平台權限 |
| `proposal-manager` | 管理獲指派的提案 category |
| `general-affairs` | 管理獲指派的設施 category |
| `announcement-manager` | 發布與刪除公告 |

`SessionRole` 的 `admin` / `user` 是介面使用的粗粒度狀態；真正的操作能力看下面的 permission 和 category scope。

## Permission code

| Permission | 主要用途 |
| --- | --- |
| `proposal.manage` | 審核提案狀態、更新處理結果；實際提案仍要符合 category scope |
| `facility.manage` | 管理設施回報；實際案件仍要符合 facility category scope |
| `announcement.manage` | 發布、刪除公告 |
| `category.manage` | 讀寫 category、feature、retention、影響估算與 platform job |
| `role.manage` | 搜尋使用者、調整限制、設定 category scope、看角色稽核 |
| `dashboard.view` | Dashboard、管理 overview 與 activity |

Platform admin 不需要逐一加入 category ID。`canManageIssueCategory` 和 `canManageFacilityCategory` 先看是否含 `platform-admin`，否則要求目標 category ID 出現在 session bootstrap 回傳的 managed list。

## 授權檢查的實際順序

一個 browser action 會依序經過：

1. `ALLOWED_ORIGINS` 檢查。
2. Firebase App Check 與 Firebase ID token 驗證。
3. Cloudflare native rate limit 和 Durable Object business limit。
4. 從 PostgreSQL 載入使用者、role、permission、scope 與 restriction。
5. Action registry 的 `requiredPermission`。
6. Domain handler 與 `app_api` RPC 的擁有者、category scope、狀態轉移及資料可見性規則。

前端即使手動呼叫隱藏的 action，也會走完整檢查。資料庫 runtime role 本身沒有 DDL 權限，不能繞過 RPC 去改 schema 或 role。

## 帳號存取規則

`role.manage` 管理員可以針對已註冊 UID，或學校信箱 `@` 前的帳號前綴建立持續性規則。個別 UID 優先於前綴；多個前綴命中時採最長者。規則可設 7 天、30 天、自訂時數或永久：

- `read_only`：可讀取通知並開啟裝置 Push，但不能建立、刪除、留言、上傳或反應。
- `reaction_only`：在唯讀能力之外，可附議／取消、公告按讚／取消，以及標記／取消「我也遇到」。
- `blocked`：任何受保護請求都拒絕；`/v1/auth/sync` 在建立新 profile 前先拒絕並回傳管理員設定的純文字訊息。

拒絕的參與寫入回傳 `account-restricted` 與公開原因。分類管理員原有的權限與 scope 操作保留。平台管理員仍只由 `ADMIN_EMAILS` 決定且不受存取規則影響。

## 提案 category 的資料可見性

提案 category 的 `readAccess` 決定讀取範圍：

| 值 | 行為 |
| --- | --- |
| 公開型 | 校內成員可讀，是否顯示作者由 `authorVisible` 決定 |
| `reviewed-school` | 審核前只給作者與管理方，通過後進入校內可讀流程 |
| `owner-admin` | 只給作者與具該 category scope 的管理方 |

列表快照另外帶回該 category 每個狀態的**件數**。這個數字是分類層級的聚合，不受 `readAccess` 限制：即使成員讀不到那些提案，他仍會看到「有幾筆在審核中、有幾筆在處理中」。外流的只有數量，提案內容、標題與作者都不在其中。

已完成、不可行、審核拒絕或自動拒絕的提案不再接受留言。`reviewed-school` category 只在 `pending` 或 `processing` 接受留言；其他 category 在 `under-review` 階段關閉留言。
