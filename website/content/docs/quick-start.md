# 快速開始

[English](en/quick-start.md) · [文件首頁](README.md)

本教學讓你在本機啟動前端並完成程式碼驗證。完整功能仍需要可用的 Firebase 與 Supabase 專案；第三方通知、圖片與備份整合可在之後設定。

## 前置需求

- Node.js 24（CI 使用的版本）
- npm（隨 Node.js 安裝）
- Git
- 一個 Firebase Web App 與啟用的 Google 登入
- 一個已套用本專案 migrations 與 Edge Functions 的 Supabase 專案

需要本機資料庫時，另安裝 Supabase CLI 所需的 Docker 環境。本專案也在 `devDependencies` 固定 Supabase 與 Deno 工具版本。

## 1. 取得並安裝

```bash
git clone https://github.com/tavricccc/novae.git
cd novae
npm ci
```

## 2. 建立前端環境設定

```bash
cp .env.example .env
```

Windows PowerShell 可使用：

```powershell
Copy-Item .env.example .env
```

至少填入 Firebase、Supabase 與允許網域欄位。所有 `VITE_*` 值都會進入瀏覽器 bundle，不可放入 service role key、資料庫密碼或第三方 API secret。欄位說明見[設定參考](configuration.md#前端環境變數)。

## 3. 啟動開發伺服器

```bash
npm run dev
```

終端機會顯示本機網址。登入帳號的網域必須符合 `VITE_ALLOWED_DOMAIN`，而後端 `ALLOWED_DOMAIN` 必須使用相同值。

## 4. 驗證變更

日常修改至少執行：

```bash
npm run typecheck
npm run lint
npm run build
```

送出 pull request 前執行完整驗證：

```bash
npm run verify:local
```

`verify:local` 會依序檢查型別、未使用宣告、lint、production build、Edge Functions、架構規則及離線 dependency audit。

## 5. 選用：本機 Supabase

```bash
npm run db:start
npm run db:reset:local
npm run db:lint:local
```

本機堆疊不能自動代替 Firebase、Cloudinary、Notion、Upstash 或 FCM。若要測試完整整合，仍須設定對應 secrets 或使用隔離的開發資源。

## 完成條件

- 開發伺服器可啟動且沒有設定錯誤。
- 指定校內網域帳號能完成登入與使用者同步。
- `npm run verify:local` 成功。
- 沒有把 `.env` 或任何私密值加入 Git。

若遇到問題，先查看[故障排除](troubleshooting.md)；準備建立完整環境時，前往[部署指南](deployment-guide.md)。
