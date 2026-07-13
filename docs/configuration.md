# 設定參考

[English](en/configuration.md) · [文件首頁](README.md)

本頁說明提交到 Git 的產品規則，包括分類、可見範圍、限流與圖片。公開環境變數與部署憑證已獨立到[環境與憑證](environment-configuration.md)，不要跨越兩者的公開邊界。

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

`imageUploads` 控制提案、公告與留言可附圖片數；`imageCompression` 控制來源大小、最長邊、目標 KB、WebP 品質與降階比例。瀏覽器限制是體驗層，後端仍會驗證上傳與 Markdown 引用。

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
| `webpQuality` | 第一輪 WebP 品質，越高通常越清楚也越大 |
| `outputScales` | 未達目標大小時依序縮圖的比例；必須由大到小評估 |

## 變更檢查清單

- 執行 `npm run generate:all` 並檢查產生差異。
- 若 schema 或後端契約受影響，執行 `npm run check:edge` 與 `npm run test:architecture`。
- 不把 secret、真實使用者資料或正式環境 ID 寫入 Git。
- 將規則變更同步到中英文文件。
- 分類移除或資料模型變更使用新的 migration。
- 若要設定 `.env`、GitHub 或部署平台，接著閱讀[環境與憑證](environment-configuration.md)。
