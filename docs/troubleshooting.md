# 故障排除

[English](en/troubleshooting.md) · [文件首頁](README.md)

先取得第一個失敗訊息、request ID、環境、commit SHA 與發生時間。不要只看最後一連串衍生錯誤，也不要把 token 或個資貼到公開 issue。

## 安裝或驗證失敗

### `npm ci` 失敗

- 使用 Node.js 24，並確認 `package-lock.json` 未被舊 npm 改寫。
- 清除 npm 自身的損壞 cache 後重試；不要手動修改 lockfile。
- 若是 registry 或代理問題，先確認組織網路設定。

### 產生檔出現差異

執行 `npm run generate:all`，檢查 `config/` 與產生檔是否同步。產生結果應提交；CI 會以 `git diff --exit-code` 驗證。

### Edge check 找不到 Deno

先完成 `npm ci`，再以 `npm run check:edge` 使用專案固定的 `deno-bin`。不要依賴任意全域版本。

## 登入

| 症狀 | 檢查 |
| --- | --- |
| Google popup 被拒絕 | Firebase Google provider、authorized domain、瀏覽器 popup 政策 |
| 顯示網域不允許 | `VITE_ALLOWED_DOMAIN` 與後端 `ALLOWED_DOMAIN` 是否一致 |
| 登入成功但同步失敗 | `FIREBASE_PROJECT_ID`、Web API key、service account JSON、email verified |
| 管理員仍是一般使用者 | `ADMIN_EMAILS`、允許網域、重新登入／token 更新 |

不要用前端硬編角色或關閉後端驗證來修復登入。

## API 與資料

### 全部 action 回傳 401/403

確認請求使用目前 Firebase project 的有效 ID token、時間同步正常、Edge secret 指向相同 project，並查看 Function log 中的匿名化原因碼。

### 只有特定資料看不到

確認分類 `readAccess`、審核狀態、作者身分與管理員角色。直接查 database 時也要分辨 `app_api` RLS 結果與 service role 結果。

### Realtime 不更新

確認初始讀取成功、連線未被 CSP／代理阻擋、event audience 與目前使用者相符。提案與公告列表會自動重連、連線失敗後補抓，並在前景定期校正；也可使用列表標題列的重新整理按鈕立即強制讀取。若強制讀取能恢復但自動更新仍持續失敗，應檢查 `realtime_events` publication、RLS 與瀏覽器 WebSocket 連線。

## 圖片

1. 確認來源大小、壓縮後尺寸與圖片數符合 `rate-limits.config.json`。
2. 查看取得 upload session 的 action 是否成功。
3. 在 Cloudinary 確認 authenticated resource 是否存在。
4. 檢查 webhook URL、secret 與 Function log。
5. 若上傳 ready 但無法顯示，檢查 resolve action、signed URL 到期與 CSP。

不要把 delivery 改成永久公開或把 API secret 放到前端。

## 通知與背景工作

- 站內通知正常、Push 失敗：檢查瀏覽器權限、service worker、VAPID、FCM service account 與 token/topic 狀態。
- outbox 持續增加：檢查 worker 觸發、`WEBHOOK_SECRET`、Upstash 與外部供應商狀態。
- Notion 失敗：確認 integration 仍可存取 database，欄位沒有被改名或刪除。
- 重試前先確認事件 handler 的冪等性，避免重複通知或外部更新。

## 部署

| 階段 | 常見原因 |
| --- | --- |
| Validate secrets | Environment 選錯、名稱錯誤、空值 |
| Supabase link/push | access token、project ref、DB password、migration history |
| Function deploy | Deno type error、import 或 secret 缺漏 |
| Healthcheck | `WEBHOOK_SECRET` 不一致或 Function 尚未就緒 |
| Vercel pull/build | token scope、org/project ID、公開環境變數 |
| 前端等待後端逾時 | 同 commit 的 backend workflow 失敗或未觸發 |

## 仍無法解決

依[貢獻指南](contributing.md)建立最小重現 issue，附上作業系統、Node 版本、commit SHA、執行指令、已遮罩的第一個錯誤與預期／實際結果。安全問題改用[私下回報](security.md#回報安全問題)。
