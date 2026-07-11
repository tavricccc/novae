# 設定參考

[English](en/configuration.md) · [文件首頁](README.md)

設定分成三類：提交到 Git 的產品規則、進入前端 bundle 的公開環境變數，以及只存在部署平台的後端 secrets。不要跨越這三個邊界。

## 產生式設定

| 來源 | 控制內容 | 產生輸出 |
| --- | --- | --- |
| `config/issue-categories.config.json` | 分類、可見性、作者顯示、附議與回覆期限 | 前端與 Edge 共用設定 |
| `config/rate-limits.config.json` | action 限流、圖片數量與壓縮 | 前端與 Edge 共用設定 |

修改後執行：

```bash
npm run generate:all
git diff
```

產生檔是 repository 的一部分，必須與來源一起提交。`typecheck`、`lint` 與 `build` 的 pre-script 也會重新產生設定。

## 提案分類 schema

```json
{
  "id": "public-issues",
  "label": "公共議題",
  "readAccess": "reviewed-school",
  "authorVisible": false,
  "support": {
    "enabled": true,
    "goal": 50,
    "deadlineDays": 14
  },
  "responseDeadlineDays": 7
}
```

| 欄位 | 說明 |
| --- | --- |
| `id` | 永久且唯一的機器識別碼；上線後不要改名重用 |
| `label` | 使用者看到的繁體中文名稱 |
| `readAccess` | `school`、`reviewed-school` 或 `owner-admin` |
| `authorVisible` | 是否向有權閱讀內容的使用者顯示作者 |
| `support.enabled` | 是否啟用附議 |
| `support.goal` | 啟用附議時的正整數門檻 |
| `support.deadlineDays` | 啟用附議時的正整數期限天數 |
| `responseDeadlineDays` | 管理回覆期限天數 |

### 可見性語意

| 值 | 行為 |
| --- | --- |
| `school` | 已登入且符合校內網域的使用者可讀 |
| `reviewed-school` | 作者與管理員可讀草稿；審核通過後校內可讀 |
| `owner-admin` | 只有作者本人與管理員可讀 |

`authorVisible: false` 只控制公開身分顯示，不會移除後端保存的作者關聯。真正的存取控制由後端與 RLS 執行。

### 常見組合與實際結果

| 設定組合 | 適合內容 | 實際行為 |
| --- | --- | --- |
| `school` + 顯示作者 + 不附議 | 設備回報 | 校內登入者可讀並看到作者，不顯示附議進度 |
| `reviewed-school` + 隱藏作者 + 附議 | 公共議題 | 先由管理員審核；核准後全校看到匿名內容與附議期限 |
| `owner-admin` + 顯示作者 + 不附議 | 權益案件 | 只有作者與管理員可讀，作者資訊用於案件聯繫 |

將 `authorVisible` 從 `true` 改為 `false` 會改變之後的顯示，但不等於清除先前已被讀者看到或截圖的身分。提高 `goal` 或縮短 `deadlineDays` 會讓附議更難達標；變更既有提案採用建立當下或最新設定，必須以目前程式行為測試後再公告，不要假設會自動回溯。

### 移除分類

不要直接刪除已使用的 `id` 後就結束。先盤點既有內容、Notion 副本、搜尋與統計影響，再新增後續 migration 清理或遷移資料。已部署 migration 不可回改。

## 限流與圖片

`rate-limits.config.json` 的每個 action 項目包含 `limit` 與使用者訊息。秒級限制吸收突發流量，時／日級限制控制濫用與成本。調高數值前先確認 Edge、Redis、資料庫與第三方服務額度。

`imageUploads` 控制提案、公告與留言可附圖片數；`imageCompression` 控制來源大小、像素、最長邊、目標 KB、WebP 品質與降階比例。瀏覽器限制是體驗層，後端仍會驗證上傳與 Markdown 引用。

### 每個限流欄位的影響

| Key | 超過後會影響 |
| --- | --- |
| `issueCreateDaily` | 使用者當日不能再建立提案 |
| `commentCreateHourly` | 使用者暫時不能新增留言或回覆 |
| `imageUploadDaily` | 當日不能再取得新的圖片上傳額度 |
| `loginSyncHourly` | 過度重複的登入同步被拒絕 |
| `avatarCacheDaily` | 頭像快取更新暫停，既有頭像仍可使用 |
| `supportToggleHourly` | 暫時不能附議或取消附議 |
| `announcementLikeHourly` | 暫時不能按讚或取消讚 |
| `pushTokenWriteHourly` | 裝置推播註冊／更新暫停，站內通知不受影響 |
| `backendActionReadHourly` / `Second` | 一般資料讀取受到長期／突發保護 |
| `backendActionWriteHourly` / `Second` | 一般寫入受到長期／突發保護 |
| `backendActionSensitiveWriteHourly` / `Second` | 刪除或其他敏感寫入採更嚴格門檻 |
| `backendActionAdminWriteHourly` / `Second` | 管理操作受到獨立保護 |
| `backendActionUploadResolveHourly` / `Second` | 圖片簽名網址解析暫停，可能顯示載入失敗 |
| `backendHealthcheckMinute` / `Second` | 過度頻繁的健康檢查被拒絕 |
| `cloudinaryWebhookMinute` / `Second` | 異常密集的圖片 callback 被拒絕或延後 |
| `workerRunMinute` / `Second` | 過度重複觸發背景 worker 被拒絕 |

`limit` 越小，濫用與成本風險越低，但尖峰時正常使用者更容易看到對應 `message`。訊息應說明「何時可再試」，不要透露內部門檻或安全策略。

### 每個圖片欄位的影響

| Key | 行為 |
| --- | --- |
| `issueMaxImages` | 單一提案可引用的圖片上限 |
| `announcementMaxImages` | 單一公告可引用的圖片上限 |
| `commentMaxImages` | 單一留言可引用的圖片上限 |
| `maxUploadKilobytes` | 壓縮後希望不超過的目標大小；過低會增加模糊或失敗 |
| `maxSourceMegabytes` | 選取原始檔的硬上限，超過時不進行壓縮 |
| `maxDimension` | 輸出最長邊上限，降低會節省流量但損失細節 |
| `maxPixels` | 原始解碼像素安全上限，保護記憶體與效能 |
| `webpQuality` | 第一輪 WebP 品質，越高通常越清楚也越大 |
| `outputScales` | 未達目標大小時依序縮圖的比例；必須由大到小評估 |

## 前端環境變數

所有欄位均可被瀏覽器使用者看到。

| 名稱 | 必要 | 用途 |
| --- | --- | --- |
| `VITE_SCHOOL_NAME` | 否 | 啟動畫面與「我的」頁面顯示的學校名稱；留空時不顯示 |
| `VITE_ALLOWED_DOMAIN` | 是 | 前端登入提示與預檢 |
| `VITE_FIREBASE_API_KEY` | 是 | Firebase Web config |
| `VITE_FIREBASE_AUTH_DOMAIN` | 是 | Firebase Auth domain |
| `VITE_FIREBASE_PROJECT_ID` | 是 | Firebase project ID |
| `VITE_FIREBASE_APP_ID` | 是 | Firebase Web App ID |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | 是 | FCM sender ID |
| `VITE_FIREBASE_VAPID_KEY` | 是 | Web Push public key |
| `VITE_FIREBASE_APP_CHECK_ENABLED` | 否 | `true` 時啟用 App Check |
| `VITE_RECAPTCHA_ENTERPRISE_SITE_KEY` | 條件式 | 啟用 App Check 時必要 |
| `VITE_SUPABASE_URL` | 是 | Supabase project URL |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | 是 | Supabase publishable key |

## 後端與部署 secrets

| 群組 | 名稱 |
| --- | --- |
| Supabase 部署 | `SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROJECT_REF`, `SUPABASE_DB_PASSWORD`, `SUPABASE_SERVICE_ROLE_KEY` |
| Firebase 驗證 | `FIREBASE_PROJECT_ID`, `FIREBASE_WEB_API_KEY`, `GOOGLE_SERVICE_ACCOUNT_JSON` |
| 存取控制 | `ALLOWED_DOMAIN`, `ADMIN_EMAILS` |
| Cloudinary | `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`, `CLOUDINARY_WEBHOOK_SECRET` |
| 內部觸發 | `WEBHOOK_SECRET` |
| Notion | `NOTION_TOKEN`, `NOTION_DATABASE_ID`, `NOTION_VERSION`（選用，預設 `2022-06-28`） |
| Upstash | `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` |
| Vercel 部署 | `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID` |

正式與開發環境必須使用不同資源與 secrets。`VITE_ALLOWED_DOMAIN` 應與後端 `ALLOWED_DOMAIN` 相同；管理員 email 使用部署流程所接受的清單格式，且帳號本身仍須符合允許網域。

## 變更檢查清單

- 執行 `npm run generate:all` 並檢查產生差異。
- 若 schema 或後端契約受影響，執行 `npm run check:edge` 與 `npm run test:architecture`。
- 不把 secret、真實使用者資料或正式環境 ID 寫入 Git。
- 將規則變更同步到中英文文件。
- 分類移除或資料模型變更使用新的 migration。
