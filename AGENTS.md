# AI 代理人開發指引

## 工作前提

1. 修改前先完整閱讀 `structure.md`，依既有模組找對應元件、composable、service 或 Supabase Edge Functions domain，不另起平行實作。
2. 搜尋與檢查一律避開 `node_modules`、`dist`、`.vercel`、`.supabase` 與其他產物目錄。
3. 不做 in-app browser preview；以型別、lint、build 與必要的靜態檢查驗證。
4. 工作樹可能已有使用者修改，不覆蓋、不回復無關變更。
5. 若需 staging，使用 `git add .`，不要逐檔 add。
6. changelog.ts只讀最前20行，此檔案非常大不適合整檔讀取。

## 架構邊界

- `views/`：路由頁面組裝與頁面級狀態，不放底層資料存取。
- `components/`：應用 UI 與事件轉發；跨元件狀態或非單純呈現邏輯移到 composable。
- `components/ui/`：無業務資料來源的共用 UI，不 import service 或 session 類 composable。
- `composables/`：Vue 狀態、生命週期與流程協調；避免直接重複資料正規化或純函式。
- `lib/`：無 Vue 相依的純函式、格式化與正規化工具。
- `services/`：前端 Supabase Edge Function / Supabase client 邊界；元件不得直接查詢資料表或自行組後端 action。
- `types/`：跨模組核心型別；共通欄位先抽 base interface，再由領域型別擴充。
- `supabase/functions/_shared/`：Edge Functions 共用環境變數、HTTP、Firebase 驗證、FCM、Notion、Cloudinary、設定常數與 Supabase schema 型別。
- `supabase/functions/backendAction/`：前端受控 action 入口與各領域後端流程；entrypoint 只做 CORS、驗證、冪等與分派。
- `supabase/functions/<function>/`：獨立 Edge Function 入口，例如登入同步、上傳 webhook、outbox worker 與刪除工作；不要把跨領域業務流程塞回 entrypoint。
- `supabase/migrations/`：Postgres schema、RLS、RPC、trigger、publication 與索引；修改 schema 行為時同步檢查 Edge Function 型別。

## 拆分與共用標準

1. 相同 UI 結構或流程出現兩次時，先確認差異是否只是 props、slots 或 callback；是的話抽共用元件或 helper。
2. 元件同時處理資料讀取、權限、狀態流程與大量模板時，優先把流程移到既有 composable，再拆純展示區塊。
3. 單檔超過約 250 行時主動檢查責任；超過 400 行原則上必須說明不拆分的理由。
4. 不為只有一個呼叫點的簡單片段建立抽象；抽象必須降低重複、分離責任或建立清楚邊界。
5. 新增、刪除、搬移、拆分或明顯重構檔案時，同步更新 `structure.md`。
6. 替換既有實作時不要只做增量疊加；新流程確認接手後，同步刪除舊元件、舊分支、舊 props/API、未使用 import、CSS class、設計 token、轉場與註解，不保留相容性殘留。
7. 完成重構後反向檢查引用，並使用 `vue-tsc --noEmit --noUnusedLocals --noUnusedParameters` 或等效方式確認沒有未使用宣告；只有仍有實際呼叫點的程式碼可以保留。

## 更新紀錄規範

1. 每次完成程式、文案、樣式、設定或後端行為更動時，都要在 `src/constants/changelog.ts` 新增一筆 `CHANGELOG_ENTRIES`。
2. Changelog 是使用者看得到的產品更新，只描述使用者能理解或感受到的改善結果，不寫修改過程、內部決策或工程紀錄。
3. 不暴露內部檔名、元件名、composable、service、collection、Functions action、排程名稱、第三方服務細節、錯誤堆疊、安全規則、測試命令或部署細節。
4. 標題使用產品面語言，短而清楚，例如「改善提案瀏覽體驗」、「優化管理員統計頁面」、「提升通知可靠性」、「修正圖片顯示問題」、「完善更新紀錄頁面」。
5. `items` 依一次 commit 的實際使用者可見變更拆成多筆；一個 item 只描述一個改善點，不限制數量，但避免把同一件事拆得過碎。
6. 用字採台灣用語與大型 App 版本更新語氣，正式、精簡、克制；優先使用「新增」、「支援」、「改善」、「優化」、「最佳化」、「調整」、「修正」、「提升」、「強化」、「統一」、「簡化」、「完善」。
7. 避免使用「更快速」、「更直接」、「更直覺」、「更順」、「更好用」、「比較好」等口語或主觀字眼；需要描述體驗改善時，改寫為「優化搜尋結果呈現」、「改善分類切換體驗」、「提升登入流程穩定性」。
8. 禁用工程內部語言，例如「重構」、「修 bug」、「串接」、「call 後端」、「資料庫」、「Firestore」、「Functions」、「API」、「排程」、「job」、「outbox」、「payload」、「fallback」、「cache」、「query」、「service」、「component」、「composable」。
9. 台灣用語優先使用「最佳化、資訊、顯示、使用者、流程、設定、登入、通知、權限、維護」；避免「信息、展示、用戶、配置、登錄、消息、許可權、運維」等非台灣產品語氣。
10. 若變更主要是後端、資料清理、同步、排程、權限或維護性修正，使用「提升系統穩定性」、「提升資料同步可靠性」、「提升維護穩定性」等保守描述。
11. 若只是開發規範、內部維護或不直接改變使用者操作，也要補 changelog，但以「提升維護穩定性」或「改進更新紀錄維護方式」包裝，不揭露代理人流程。
12. `version` 依現有最大版本號遞增，`date` / `time` 使用本地實際時間；不要再為 changelog entry 或 item 手動建立 `id`。

## 命名與 TypeScript

- Vue composable 使用 `useXxx`；元件使用 PascalCase；純函式名稱描述輸入與輸出結果。
- Props、emits、slot props、service request/response 與 Functions request 必須有明確型別。
- 外部資料、Supabase row / RPC response、webhook body 與 action payload 在驗證前使用 `unknown` 或 `Record<string, unknown>`，不要以 `any` 穿透邊界。
- 重複的 union、record 欄位與 domain label 放到核心型別或 constants，不在元件內散落重定義。
- 魔法數字與重複運算抽成具名常數或純函式，但避免建立只包一行且沒有語意價值的 helper。

## Vue 與 UI

- Template 保持可掃讀；重複的 dialog、empty state、action row、分頁或媒體展示優先使用既有共用元件。
- 互動狀態由單一來源控制，避免元件與 composable 各維護一套相同確認流程。
- 手機與桌機共用同一資料流程，只在呈現層切換 layout。
- 優先使用 `style.css` 既有 `panel`、`field`、`button-*`、`tag` 等 class；不要新增近似但不一致的按鈕或間距系統。
- 同一區塊統一 padding、gap、對齊與 border；修改共用 shell 時同步檢查手機版 overflow、固定 footer 與可捲動內容。
- 按鈕、輸入欄、導覽與圖片維持必要的 `aria-label`、label 與 alt。

## 安全與風險

- 不因重構改變路由名稱、Supabase table/column/RPC、RLS、Edge Function action、Storage / Cloudinary path、Vercel 或 Supabase 部署設定。
- 權限與身份驗證必須留在 Supabase RLS / Edge Functions；前端條件只負責顯示，不視為安全邊界。
- 涉及 migrations、RLS 行為、通知語意、Notion 同步、outbox worker 或刪除工作時保持保守；高風險改善列入報告，不順手改動。

## 驗證流程

完成前端修改後至少執行：

1. `npm run typecheck`
2. `npm run lint`
3. `npm run build`

完成後端修改後至少執行：

1. `npm run check:edge`
2. `npm run test:architecture`

若修改 Supabase migrations、Edge Function schema 型別或 shared helper，優先執行 `npm run check:edge` 與 `npm run test:architecture`。所有 warning 與失敗都要確認是否由本次修改造成，能修正就修正，不能修正則在報告中說明。
