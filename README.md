# 財務簿 / Personal Balance Sheet

本機優先的個人資產負債表 PWA，用來做每月資產、負債、額度與淨資產盤點。這不是每日記帳工具，不記早餐、交通或刷卡明細，而是幫你回答：

> 這個月我的淨資產變多還是變少？主要原因是什麼？

Local-first personal balance sheet PWA for monthly asset, liability, credit-limit, and net-worth tracking. It is not a daily expense tracker.

## Screenshots

### Desktop Overview

![Desktop overview](docs/screenshots/desktop-overview.png)

### iPhone Overview

![Mobile overview](docs/screenshots/mobile-overview.png)

### iPhone Monthly Close

![Mobile monthly close](docs/screenshots/mobile-monthly.png)

## Features / 功能

- 資產、負債、可動用額度管理：現金、銀行餘額、股票市值、房地產、貸款、理財型房貸額度等。
- 台股市值估算：輸入股票代號與股數，連網時可抓現價並換算市值。
- 房產參考估值：房地產可連動房貸，並用實價登錄 Open Data 做區域中位數參考估值；估值需手動套用。
- 每月月結：股票用所選月份最後交易日收盤價重算，非股票項目使用目前畫面金額。
- 趨勢圖與月結洞察：查看淨資產、資產、負債、額度趨勢，並分析最新月結相對前一筆的主要變化。
- 健康檢查：提醒資料是否太久未更新、股票價格是否過期、本月是否尚未月結、備份是否逾期。
- 加密備份：匯出 `.encrypted.json`，使用瀏覽器 Web Crypto API 加密。
- iPhone 分頁介面：手機版分成 `總覽 / 資料 / 月結`，減少長頁捲動。

## Data Privacy / 資料隱私

- 資料儲存在目前瀏覽器的 IndexedDB。
- GitHub Pages 只提供靜態檔案，沒有後端、沒有登入、沒有資料庫。
- 加密備份使用 `PBKDF2-SHA256 + AES-GCM` 在瀏覽器本機完成。
- 密碼不會存進 localStorage 或備份檔；忘記密碼就無法還原加密備份。
- 不要把備份檔 commit 到 repo，即使是加密檔也建議放在 iCloud Drive、Google Drive、Dropbox 等個人空間。

## How To Use / 每月怎麼用

1. 更新現金、銀行、貸款餘額與可動用額度。
2. 按 **更新股價**，刷新股票市值。
3. 選擇月結月份並按 **建立月結**。
4. 查看月結趨勢與最新月結洞察。
5. 匯出加密備份，保存到你自己的雲端硬碟或裝置。

## Deploy / Install

GitHub Pages settings:

- Source: `Deploy from a branch`
- Branch: `main`
- Folder: `/root`

部署後，用 iPhone Safari 開啟 GitHub Pages 網址，選擇 **Add to Home Screen / 加入主畫面**，就可以像 app 一樣使用。

## Tech Stack

- HTML / CSS / vanilla JavaScript
- IndexedDB
- Web Crypto API
- Service Worker + Web App Manifest
- GitHub Pages

## Roadmap

- 財務目標：目標淨資產、達標進度、依月結趨勢估算達標時間。
- 測試與 CI：補核心計算 helper 測試、GitHub Actions、簡單 E2E。
- CSV 匯入：支援銀行或證券庫存匯入。
- 多幣別：匯率更新與跨幣別淨資產估算。
