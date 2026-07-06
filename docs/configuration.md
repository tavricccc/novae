# 設定指南

本專案把提案分類、附議規則、讀取權限、限流與圖片限制集中在 `config/`。修改設定後，產生器會同步輸出前端與 Edge Functions 使用的型別化常數，避免前後端規則不一致。

## 設定檔

| 檔案 | 用途 |
| --- | --- |
| `config/issue-categories.config.json` | 提案分類、讀取權限、作者顯示、附議門檻、期限 |
| `config/rate-limits.config.json` | 操作限流、圖片數量、圖片壓縮限制 |
| `.env.example` | 前端本機開發環境變數範本 |
| GitHub Environment secrets | 正式部署用前端公開設定與後端私密設定 |

## 修改後要執行

```bash
npm run generate:all
npm run typecheck
npm run lint
npm run build
npm run check:edge
npm run test:architecture
```

`generate:all` 會產生前端與後端共用設定。若只改文件不需要跑產生器；若改 `config/`，一定要跑。

## 提案分類設定

`config/issue-categories.config.json` 的每個分類包含：

| 欄位 | 說明 |
| --- | --- |
| `id` | 分類代號，會用於路由與資料保存。上線後不要隨意改。 |
| `label` | 使用者看到的分類名稱。 |
| `readAccess` | 讀取權限模型。 |
| `authorVisible` | 作者是否對一般使用者顯示。 |
| `support.enabled` | 是否啟用附議。 |
| `support.goal` | 附議門檻。只有啟用附議時需要。 |
| `support.deadlineDays` | 附議期限天數。只有啟用附議時需要。 |
| `responseDeadlineDays` | 管理員回覆期限天數。 |

目前預設分類：

| 分類 | 讀取權限 | 作者顯示 | 附議 |
| --- | --- | --- | --- |
| 公共議題 | 審核後校內可讀 | 匿名 | 啟用，50 票，14 天 |
| 學生權益 | 本人與管理員 | 顯示 | 不啟用 |
| 設備 | 校內可讀 | 顯示 | 不啟用 |

實際分類以 `config/issue-categories.config.json` 為準。分類從 config 移除並部署後，維護清理會刪除資料庫中已不屬於有效分類的提案與留言，並把相關 Cloudinary 圖片排入刪除工作；Notion 備份頁面會保留並標記為已刪除。

## 讀取權限模型

| 值 | 用途 |
| --- | --- |
| `school` | 已登入且符合校內網域者可讀。 |
| `reviewed-school` | 審核通過後校內可讀；本人與管理員可看自己的審核中內容。 |
| `owner-admin` | 只有作者本人與管理員可讀，適合權益維護或私密案件。 |

實際可用值以 config schema 與產生器檢查為準。新增讀取模型屬於後端權限變更，需要同步檢查 RLS、Edge Functions 與前端顯示。

## 附議設定

附議只應用於 `support.enabled: true` 的分類。常見設定：

```json
{
  "support": {
    "enabled": true,
    "goal": 50,
    "deadlineDays": 14
  }
}
```

調整建議：

- 門檻太低會讓管理員快速累積待處理案件。
- 門檻太高會讓學生感覺流程難以推進。
- 期限應與管理員實際處理節奏一致。
- 不需要公開動員的分類，建議關閉附議。

## 作者顯示與隱私

`authorVisible: false` 表示一般使用者看到匿名作者。作者本人與管理員仍可在必要場景辨識案件，實際私密資料由後端與資料庫權限保護。

建議：

- 公共議題若可能涉及個人壓力，可設為匿名。
- 設備與一般校務問題可顯示作者，方便補充資訊。
- 權益維護、申訴或敏感案件建議搭配 `owner-admin`。

## 限流設定

`config/rate-limits.config.json` 控制常見操作上限：

| 設定 | 預設用途 |
| --- | --- |
| `issueCreateDaily` | 每日提案建立上限 |
| `commentCreateHourly` | 每小時留言上限 |
| `imageUploadDaily` | 每日圖片上傳上限 |
| `loginSyncHourly` | 登入同步上限 |
| `avatarCacheDaily` | 頭像更新上限 |
| `supportToggleHourly` | 附議 / 取消附議操作上限 |
| `announcementLikeHourly` | 公告按讚操作上限 |
| `pushTokenWriteHourly` | 推播 token 寫入上限 |

限流是防濫用與控成本的第一層保護。若遇到正常使用者被擋，先看 Dashboard / 後端紀錄，再微調 limit。

## 圖片限制

| 設定 | 說明 |
| --- | --- |
| `imageUploads.issueMaxImages` | 每篇提案圖片上限 |
| `imageUploads.announcementMaxImages` | 每篇公告圖片上限 |
| `imageUploads.commentMaxImages` | 每則留言圖片上限 |
| `imageCompression.maxUploadKilobytes` | 上傳後目標大小 |
| `imageCompression.maxSourceMegabytes` | 原始檔最大大小 |
| `imageCompression.maxDimension` | 圖片最長邊限制 |
| `imageCompression.maxPixels` | 原始圖片最大像素 |
| `imageCompression.webpQuality` | WebP 品質 |
| `imageCompression.outputScales` | 壓縮失敗時逐步縮小比例 |

圖片設定會直接影響 Cloudinary 成本、前端速度與使用者體驗。正式環境建議保守調整。

## 環境變數邊界

| 類型 | 範例 | 可否進前端 |
| --- | --- | --- |
| `VITE_*` | `VITE_FIREBASE_API_KEY`、`VITE_SUPABASE_URL` | 可以，會被打包進瀏覽器 |
| 後端 secret | `SUPABASE_SERVICE_ROLE_KEY`、`GOOGLE_SERVICE_ACCOUNT_JSON` | 不可以 |
| 第三方 API secret | `CLOUDINARY_API_SECRET`、`NOTION_TOKEN` | 不可以 |
| Webhook secret | `WEBHOOK_SECRET`、`CLOUDINARY_WEBHOOK_SECRET` | 不可以 |

完整部署 secrets 請看 [正式環境部署教學](deployment-guide.md)。

## 修改設定的安全檢查

修改 config 前請先問：

1. 這會不會讓原本私密的分類變成公開？
2. 作者顯示是否符合使用者預期？
3. 附議門檻與期限是否會改變既有案件處理規則？
4. 限流是否會造成正常使用者被擋，或讓濫用成本太低？
5. 圖片上限是否會推高 Cloudinary 與頻寬成本？

涉及權限或資料可見性的設定變更，應視為高風險變更。

## 移除分類

移除分類時請注意：

1. 從 `config/issue-categories.config.json` 移除分類物件。
2. 執行 `npm run generate:all` 更新前後端分類常數。
3. 部署 Supabase 後端，讓維護清理取得新的有效分類清單。
4. 維護清理會刪除資料庫中該分類的提案、留言、附議與私密作者資料。
5. 該分類提案與留言綁定的 Cloudinary 圖片會排入 deletion jobs，後續由刪除工作清理。
6. Notion 備份頁面不會被刪除，會保留作為歷史紀錄並標記為已刪除。

移除分類會刪除正式資料，建議先確認該分類沒有需要保留或轉移的提案。
