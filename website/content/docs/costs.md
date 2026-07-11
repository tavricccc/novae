# 成本指南

[English](en/costs.md) · [文件首頁](README.md)

本專案沒有固定月費：總成本由 Vercel、Supabase、Firebase／Google Cloud、Cloudinary、Notion 與 Upstash 的方案和用量共同構成。供應商會調整價格與免費額度，因此本頁提供估算方法，不提供會快速過期的報價。

## 先建立用量假設

每個環境至少估算：

- 月活躍使用者與尖峰同時上線人數。
- 每人每月頁面讀取、搜尋、留言、附議與通知次數。
- 每月上傳圖片數、壓縮後平均大小、保存月數與顯示次數。
- Realtime 連線時間、Edge invocation、database size 與 egress。
- Web Push 數量、Notion 同步量及 Redis request 數。
- 正式、開發、預覽與災難復原資源的固定底價。

簡化公式：

```text
月成本 = 各服務固定方案費
       + 超過含量的 request / compute / storage / egress
       + 備份、log、網域與稅費
       + 20%～30% 的尖峰與成長緩衝
```

## 成本驅動因子

| 服務 | 主要驅動 | 專案中的控制方式 |
| --- | --- | --- |
| Vercel | build、function／edge（若有）、頻寬 | 靜態前端、immutable assets |
| Supabase | database、egress、Realtime、Edge invocation、備份 | cursor pagination、聚合 counter、資料保留 |
| Firebase / Google Cloud | Auth、FCM、App Check／reCAPTCHA、相關 API | 網域限制、topic 與個人推播分流 |
| Cloudinary | 儲存、轉換、delivery bandwidth | 前端 WebP 壓縮、尺寸限制、清理工作 |
| Notion | workspace／API 限制 | 非同步 outbox、聚合同步 |
| Upstash | Redis command／bandwidth | 分層限流與短小 key |

## 三種規模的規劃方式

### 試辦

單一學校、少量管理員、低圖片量。可先評估免費層，但不要假設免費層具備所需備份、log 保存、支援或可用性。為正式資料準備付費升級與匯出方案。

### 穩定校內服務

為 Supabase 的資料庫與備份、Cloudinary delivery、Vercel 流量以及監控保留固定預算。使用隔離的 development 環境，設定 50%、75%、90% 用量告警。

### 高活動或跨組織使用

先做壓力測試與資料治理評估。多租戶、跨校隔離、企業 SSO 與正式 SLA 不在目前產品邊界內，成本不只來自方案升級，也包含架構與維運人力。

## 每月成本檢查

1. 從每個供應商匯出實際用量與帳單。
2. 依 production、development 與 preview 分攤。
3. 比較上月、預算與每活躍使用者成本。
4. 對異常用量按 request、storage、egress、retry 與 retention 拆解。
5. 優先修正重複讀取、失控重試、過大圖片與未清理資料，再評估升級。
6. 在預算與方案變更紀錄中標註查價日期與官方定價網址。

## 採購前要向官方確認

- 免費方案是否可用於正式環境，以及閒置、暫停或資料保留條件。
- egress、Realtime、image transformations、build minutes 與額外環境如何計價。
- 備份、point-in-time recovery、log retention 與支援是否另計。
- 稅、幣別、教育優惠、最低合約與超額計費方式。
- 資料區域、合規條款與刪除後保存政策。

官方入口：[Vercel Pricing](https://vercel.com/pricing)、[Supabase Pricing](https://supabase.com/pricing)、[Firebase Pricing](https://firebase.google.com/pricing)、[Cloudinary Pricing](https://cloudinary.com/pricing)、[Notion Pricing](https://www.notion.com/pricing)、[Upstash Pricing](https://upstash.com/pricing)。
