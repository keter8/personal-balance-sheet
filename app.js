const DB_NAME = "finance-ledger-db";
const DB_VERSION = 1;
const STORE_ENTRIES = "entries";
const STORE_SNAPSHOTS = "snapshots";
const GUIDE_STORAGE_KEY = "finance-ledger-guide-open";

const assetCategories = ["現金", "銀行餘額", "證券戶現金", "股票市值", "基金/ETF", "外幣", "保單", "其他資產"];
const liabilityCategories = ["房貸", "信貸", "車貸", "信用卡", "私人借款", "其他負債"];
const limitCategories = ["理財型房貸額度", "信用卡額度", "信貸額度", "其他額度"];

const $ = (selector) => document.querySelector(selector);
const state = {
  entries: [],
  snapshots: [],
  filter: "all",
  showAllSnapshots: false,
  deferredInstallPrompt: null,
};

const els = {
  form: $("#entryForm"),
  entryId: $("#entryId"),
  entryType: $("#entryType"),
  entryCategory: $("#entryCategory"),
  entryNameField: $("#entryNameField"),
  entryName: $("#entryName"),
  entryAmount: $("#entryAmount"),
  entryCurrency: $("#entryCurrency"),
  entryDate: $("#entryDate"),
  entryNote: $("#entryNote"),
  limitHint: $("#limitHint"),
  stockFields: $("#stockFields"),
  stockSymbol: $("#stockSymbol"),
  stockShares: $("#stockShares"),
  stockPrice: $("#stockPrice"),
  fetchQuoteButton: $("#fetchQuoteButton"),
  quoteStatus: $("#quoteStatus"),
  clearFormButton: $("#clearFormButton"),
  netWorth: $("#netWorth"),
  totalAssets: $("#totalAssets"),
  totalLiabilities: $("#totalLiabilities"),
  totalLimits: $("#totalLimits"),
  lastUpdated: $("#lastUpdated"),
  entryList: $("#entryList"),
  emptyState: $("#emptyState"),
  guidePanel: $("#guidePanel"),
  guideBody: $("#guideBody"),
  guideToggleButton: $("#guideToggleButton"),
  allocationList: $("#allocationList"),
  limitDisclosure: $("#limitDisclosure"),
  snapshotList: $("#snapshotList"),
  toggleSnapshotsButton: $("#toggleSnapshotsButton"),
  trendChart: $("#trendChart"),
  snapshotMonth: $("#snapshotMonth"),
  snapshotButton: $("#snapshotButton"),
  refreshAllQuotesButton: $("#refreshAllQuotesButton"),
  clearSnapshotsButton: $("#clearSnapshotsButton"),
  exportButton: $("#exportButton"),
  importInput: $("#importInput"),
  installButton: $("#installButton"),
  toast: $("#toast"),
};

const SNAPSHOT_PREVIEW_LIMIT = 12;

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_ENTRIES)) {
        db.createObjectStore(STORE_ENTRIES, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(STORE_SNAPSHOTS)) {
        db.createObjectStore(STORE_SNAPSHOTS, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function withStore(storeName, mode, callback) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, mode);
    const store = transaction.objectStore(storeName);
    const result = callback(store);
    transaction.oncomplete = () => {
      db.close();
      resolve(result);
    };
    transaction.onerror = () => {
      db.close();
      reject(transaction.error);
    };
  });
}

function getAll(storeName) {
  return new Promise(async (resolve, reject) => {
    try {
      const db = await openDb();
      const transaction = db.transaction(storeName, "readonly");
      const request = transaction.objectStore(storeName).getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
      transaction.oncomplete = () => db.close();
    } catch (error) {
      reject(error);
    }
  });
}

async function putItem(storeName, item) {
  await withStore(storeName, "readwrite", (store) => store.put(item));
}

async function deleteItem(storeName, id) {
  await withStore(storeName, "readwrite", (store) => store.delete(id));
}

async function clearStore(storeName) {
  await withStore(storeName, "readwrite", (store) => store.clear());
}

function formatMoney(value, currency = "TWD") {
  if (currency === "TWD") {
    return `NT$${new Intl.NumberFormat("zh-TW", { maximumFractionDigits: 0 }).format(value || 0)}`;
  }

  return new Intl.NumberFormat("zh-TW", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(value || 0);
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function currentMonth() {
  return today().slice(0, 7);
}

function uid(prefix) {
  return `${prefix}-${crypto.randomUUID()}`;
}

function showToast(message) {
  els.toast.textContent = message;
  els.toast.classList.add("show");
  window.setTimeout(() => els.toast.classList.remove("show"), 2200);
}

function getStoredGuideState() {
  return localStorage.getItem(GUIDE_STORAGE_KEY);
}

function setGuideOpen(open, persist = true) {
  els.guideBody.hidden = !open;
  els.guideToggleButton.textContent = open ? "收合說明" : "使用說明";
  els.guideToggleButton.setAttribute("aria-expanded", String(open));
  els.guidePanel.classList.toggle("open", open);
  if (persist) {
    localStorage.setItem(GUIDE_STORAGE_KEY, open ? "true" : "false");
  }
}

function updateCategoryOptions() {
  const currentCategory = els.entryCategory.value;
  const options = getCategoriesForType(els.entryType.value);
  els.entryCategory.innerHTML = options.map((item) => `<option value="${item}">${item}</option>`).join("");
  if (options.includes(currentCategory)) {
    els.entryCategory.value = currentCategory;
  }
  updateCashFields();
  updateStockFields();
  updateLimitHint();
}

function getCategoriesForType(type) {
  if (type === "asset") return assetCategories;
  if (type === "liability") return liabilityCategories;
  return limitCategories;
}

function isCashEntry() {
  return els.entryType.value === "asset" && els.entryCategory.value === "現金";
}

function updateCashFields() {
  const enabled = isCashEntry();
  els.entryNameField.hidden = enabled;
  els.entryName.required = !enabled;
  els.entryName.disabled = enabled;
  els.entryName.readOnly = enabled;
  if (enabled) {
    els.entryName.value = "現金";
  } else if (els.entryName.value === "現金" && !els.entryId.value) {
    els.entryName.value = "";
  }
}

function isStockEntry() {
  return els.entryType.value === "asset" && els.entryCategory.value === "股票市值";
}

function updateLimitHint() {
  els.limitHint.hidden = els.entryType.value !== "limit";
}

function updateStockFields() {
  updateCashFields();
  const enabled = isStockEntry();
  els.stockFields.hidden = !enabled;
  els.stockSymbol.required = enabled;
  els.stockShares.required = enabled;
  els.stockPrice.required = enabled;
  if (!enabled) {
    els.quoteStatus.textContent = "股票市值會用股數 × 現價自動換算。";
  }
}

function updateStockMarketValue() {
  if (!isStockEntry()) return;
  const shares = Number(els.stockShares.value);
  const price = Number(els.stockPrice.value);
  if (shares > 0 && price > 0) {
    els.entryAmount.value = String(Math.round(shares * price));
  }
}

function resetForm() {
  els.entryId.value = "";
  els.form.reset();
  els.entryType.value = "asset";
  els.entryDate.value = today();
  updateCategoryOptions();
  updateCashFields();
  els.stockSymbol.value = "";
  els.stockShares.value = "";
  els.stockPrice.value = "";
  els.quoteStatus.textContent = "股票市值會用股數 × 現價自動換算。";
}

function resetSnapshotMonth() {
  els.snapshotMonth.value = currentMonth();
}

function getTotals() {
  const totalAssets = state.entries
    .filter((entry) => entry.type === "asset")
    .reduce((sum, entry) => sum + Number(entry.amount), 0);
  const totalLiabilities = state.entries
    .filter((entry) => entry.type === "liability")
    .reduce((sum, entry) => sum + Number(entry.amount), 0);
  const totalLimits = state.entries
    .filter((entry) => entry.type === "limit")
    .reduce((sum, entry) => sum + Number(entry.amount), 0);
  return {
    totalAssets,
    totalLiabilities,
    totalLimits,
    netWorth: totalAssets - totalLiabilities,
  };
}

function renderSummary() {
  const totals = getTotals();
  els.totalAssets.textContent = formatMoney(totals.totalAssets);
  els.totalLiabilities.textContent = formatMoney(totals.totalLiabilities);
  els.netWorth.textContent = formatMoney(totals.netWorth);
  els.totalLimits.textContent = formatMoney(totals.totalLimits);

  const latest = state.entries
    .map((entry) => entry.updatedAt)
    .sort()
    .at(-1);
  els.lastUpdated.textContent = latest ? `最後更新：${new Date(latest).toLocaleString("zh-TW")}` : "尚未建立資料";
}

function renderEntries() {
  const entries = state.entries
    .filter((entry) => state.filter === "all" || entry.type === state.filter)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

  els.emptyState.hidden = entries.length > 0;
  els.entryList.innerHTML = entries
    .map(
      (entry) => `
        <article class="entry-row ${entry.type}">
          <div class="entry-main">
            <strong>${escapeHtml(entry.name)}</strong>
            <span>${entry.category} · ${entry.date}${entry.stock ? ` · ${escapeHtml(entry.stock.symbol)} · ${formatShares(entry.stock.shares)} 股 · 現價 ${formatPrice(entry.stock.price)}` : ""}${entry.note ? ` · ${escapeHtml(entry.note)}` : ""}</span>
          </div>
          <div class="entry-amount">${entry.type === "liability" ? "-" : ""}${formatMoney(Number(entry.amount), entry.currency)}</div>
          <div class="row-actions">
            <button type="button" data-action="edit" data-id="${entry.id}" title="編輯">✎</button>
            <button type="button" data-action="delete" data-id="${entry.id}" title="刪除">×</button>
          </div>
        </article>
      `
    )
    .join("");
}

function formatShares(value) {
  return new Intl.NumberFormat("zh-TW", { maximumFractionDigits: 2 }).format(value || 0);
}

function formatPrice(value) {
  return new Intl.NumberFormat("zh-TW", { maximumFractionDigits: 2 }).format(value || 0);
}

function renderAllocation() {
  const assets = state.entries.filter((entry) => entry.type === "asset");
  const total = assets.reduce((sum, entry) => sum + Number(entry.amount), 0);
  const totalLimits = state.entries
    .filter((entry) => entry.type === "limit")
    .reduce((sum, entry) => sum + Number(entry.amount), 0);
  const grouped = assets.reduce((map, entry) => {
    map.set(entry.category, (map.get(entry.category) || 0) + Number(entry.amount));
    return map;
  }, new Map());

  renderLimitDisclosure(totalLimits);

  if (!total) {
    els.allocationList.innerHTML = `<div class="empty-state"><strong>尚無資產配置</strong><span>新增資產後會自動整理比例。</span></div>`;
    return;
  }

  els.allocationList.innerHTML = Array.from(grouped.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([category, amount]) => {
      const percent = Math.round((amount / total) * 100);
      return `
        <div class="allocation-row">
          <div class="allocation-top">
            <span>${category}</span>
            <span>${formatMoney(amount)} · ${percent}%</span>
          </div>
          <div class="bar"><span style="width: ${percent}%"></span></div>
        </div>
      `;
    })
    .join("");
}

function renderLimitDisclosure(totalLimits) {
  els.limitDisclosure.hidden = totalLimits <= 0;
  if (totalLimits <= 0) {
    els.limitDisclosure.innerHTML = "";
    return;
  }

  els.limitDisclosure.innerHTML = `
    <div>
      <strong>未動用額度</strong>
      <span>不列入資產配置與淨資產</span>
    </div>
    <strong>${formatMoney(totalLimits)}</strong>
  `;
}

function renderSnapshots() {
  if (!state.snapshots.length) {
    renderTrendChart([]);
    els.toggleSnapshotsButton.hidden = true;
    els.snapshotList.innerHTML = `<div class="empty-state"><strong>還沒有月結</strong><span>每月對帳後建立一筆，用來追蹤淨資產變化。</span></div>`;
    return;
  }

  const snapshots = state.snapshots.slice().map(normalizeSnapshot).sort((a, b) => a.month.localeCompare(b.month));
  renderTrendChart(snapshots);
  const reversedSnapshots = snapshots.slice().reverse();
  const visibleSnapshots = state.showAllSnapshots ? reversedSnapshots : reversedSnapshots.slice(0, SNAPSHOT_PREVIEW_LIMIT);
  els.toggleSnapshotsButton.hidden = snapshots.length <= SNAPSHOT_PREVIEW_LIMIT;
  els.toggleSnapshotsButton.textContent = state.showAllSnapshots ? "收合月結" : `顯示全部 ${snapshots.length} 筆`;

  els.snapshotList.innerHTML = visibleSnapshots
    .map((snapshot) => {
      const originalIndex = snapshots.findIndex((item) => item.id === snapshot.id);
      const previous = originalIndex > 0 ? snapshots[originalIndex - 1] : null;
      const delta = previous ? snapshot.netWorth - previous.netWorth : null;
      return `
        <article class="snapshot-card">
          <div class="snapshot-card-top">
            <strong>${snapshot.month}</strong>
            <div class="snapshot-card-actions">
              <span class="snapshot-delta ${delta === null ? "neutral" : delta >= 0 ? "positive" : "negative"}">${delta === null ? "第一筆月結" : `${delta >= 0 ? "+" : ""}${formatMoney(delta)}`}</span>
              <button type="button" data-action="delete-snapshot" data-id="${snapshot.id}" title="刪除月結">×</button>
            </div>
          </div>
          <div class="snapshot-metrics">
            <span>資產 ${formatMoney(snapshot.totalAssets)}</span>
            <span>負債 ${formatMoney(snapshot.totalLiabilities)}</span>
            <span>淨資產 ${formatMoney(snapshot.netWorth)}</span>
            <span>額度 ${formatMoney(snapshot.totalLimits || 0)}</span>
          </div>
          ${snapshot.stockQuoteTotal ? `<p class="snapshot-source">股票歷史收盤價 ${snapshot.stockQuoteResolved}/${snapshot.stockQuoteTotal} 筆${snapshot.stockQuoteFailed ? `，${snapshot.stockQuoteFailed} 筆沿用目前價格` : ""}</p>` : ""}
        </article>
      `;
    })
    .join("");
}

function renderTrendChart(snapshots) {
  if (snapshots.length < 2) {
    els.trendChart.innerHTML = `<div class="trend-empty">至少兩筆月結後顯示趨勢</div>`;
    return;
  }

  const width = 640;
  const height = 180;
  const padding = { top: 16, right: 18, bottom: 28, left: 82 };
  const seriesConfig = [
    { key: "netWorth", label: "淨資產", color: "#0b6b6f" },
    { key: "totalAssets", label: "資產", color: "#1b7f5c" },
    { key: "totalLiabilities", label: "負債", color: "#b94535" },
    { key: "totalLimits", label: "額度", color: "#7c5c1f" },
  ];
  const values = snapshots.flatMap((snapshot) => seriesConfig.map((series) => Number(snapshot[series.key]) || 0));
  const min = Math.min(...values, 0);
  const max = Math.max(...values, 1);
  const spread = max - min || 1;
  const xFor = (index) => padding.left + (index * (width - padding.left - padding.right)) / Math.max(snapshots.length - 1, 1);
  const yFor = (value) => height - padding.bottom - ((value - min) * (height - padding.top - padding.bottom)) / spread;
  const polyline = (key) => snapshots.map((snapshot, index) => `${xFor(index)},${yFor(Number(snapshot[key]) || 0)}`).join(" ");
  const yTicks = Array.from({ length: 4 }, (_, index) => min + (spread * index) / 3).reverse();

  els.trendChart.innerHTML = `
    <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="月結趨勢">
      ${yTicks
        .map((tick) => {
          const y = yFor(tick);
          return `
            <line class="grid-line" x1="${padding.left}" y1="${y}" x2="${width - padding.right}" y2="${y}" />
            <text class="y-label" x="${padding.left - 10}" y="${y + 4}" text-anchor="end">${formatCompactMoney(tick)}</text>
          `;
        })
        .join("")}
      <line class="axis-line" x1="${padding.left}" y1="${padding.top}" x2="${padding.left}" y2="${height - padding.bottom}" />
      <line class="axis-line" x1="${padding.left}" y1="${height - padding.bottom}" x2="${width - padding.right}" y2="${height - padding.bottom}" />
      ${seriesConfig
        .map(
          (series) => `
            <polyline points="${polyline(series.key)}" stroke="${series.color}" />
            ${snapshots
              .map((snapshot, index) => `<circle cx="${xFor(index)}" cy="${yFor(Number(snapshot[series.key]) || 0)}" r="3" fill="${series.color}" />`)
              .join("")}
          `
        )
        .join("")}
      ${snapshots
        .map((snapshot, index) => `<text class="x-label" x="${xFor(index)}" y="${height - 6}" text-anchor="middle">${snapshot.month.slice(5)}</text>`)
        .join("")}
    </svg>
    <div class="trend-legend">
      ${seriesConfig.map((series) => `<span><i style="background:${series.color}"></i>${series.label}</span>`).join("")}
    </div>
  `;
}

function formatCompactMoney(value) {
  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  if (abs >= 100000000) return `${sign}${formatPrice(abs / 100000000)}億`;
  if (abs >= 10000) return `${sign}${formatPrice(abs / 10000)}萬`;
  return `${sign}${formatPrice(abs)}`;
}

function normalizeSnapshot(snapshot) {
  const month = snapshot.month || snapshot.date?.slice(0, 7) || currentMonth();
  return {
    ...snapshot,
    id: snapshot.id || `snapshot-${month}`,
    month,
    totalAssets: Number(snapshot.totalAssets) || 0,
    totalLiabilities: Number(snapshot.totalLiabilities) || 0,
    totalLimits: Number(snapshot.totalLimits) || 0,
    netWorth: Number(snapshot.netWorth) || 0,
    stockQuoteTotal: Number(snapshot.stockQuoteTotal) || 0,
    stockQuoteResolved: Number(snapshot.stockQuoteResolved) || 0,
    stockQuoteFailed: Number(snapshot.stockQuoteFailed) || 0,
  };
}

function render() {
  renderSummary();
  renderEntries();
  renderAllocation();
  renderSnapshots();
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function loadData() {
  state.entries = (await getAll(STORE_ENTRIES)).map(normalizeEntry);
  state.snapshots = (await getAll(STORE_SNAPSHOTS)).map(normalizeSnapshot);
  const storedGuideState = getStoredGuideState();
  if (storedGuideState === null) {
    setGuideOpen(state.entries.length === 0, false);
  }
  render();
}

function normalizeEntry(entry) {
  if (entry.type === "asset" && entry.category === "現金") {
    return { ...entry, name: "現金" };
  }
  return entry;
}

async function handleSubmit(event) {
  event.preventDefault();
  const now = new Date().toISOString();
  updateStockMarketValue();
  const name = isCashEntry() ? "現金" : els.entryName.value.trim();
  const stock = isStockEntry()
    ? {
        symbol: normalizeSymbol(els.stockSymbol.value),
        shares: Number(els.stockShares.value),
        price: Number(els.stockPrice.value),
        priceUpdatedAt: els.quoteStatus.dataset.priceUpdatedAt || null,
        exchange: els.quoteStatus.dataset.exchange || null,
      }
    : null;
  const entry = normalizeEntry({
    id: els.entryId.value || uid("entry"),
    type: els.entryType.value,
    category: els.entryCategory.value,
    name,
    amount: Number(els.entryAmount.value),
    currency: els.entryCurrency.value,
    date: els.entryDate.value,
    note: els.entryNote.value.trim(),
    stock,
    createdAt: els.entryId.value ? state.entries.find((item) => item.id === els.entryId.value)?.createdAt || now : now,
    updatedAt: now,
  });

  if (!entry.name || Number.isNaN(entry.amount)) return;
  if (stock && (!stock.symbol || !(stock.shares > 0) || !(stock.price > 0))) return;

  await putItem(STORE_ENTRIES, entry);
  resetForm();
  await loadData();
  showToast("已儲存");
}

function editEntry(id) {
  const entry = state.entries.find((item) => item.id === id);
  if (!entry) return;
  els.entryId.value = entry.id;
  els.entryType.value = entry.type;
  updateCategoryOptions();
  els.entryCategory.value = entry.category;
  updateCashFields();
  updateStockFields();
  els.entryName.value = isCashEntry() ? "現金" : entry.name;
  els.entryAmount.value = entry.amount;
  els.entryCurrency.value = entry.currency;
  els.entryDate.value = entry.date;
  els.entryNote.value = entry.note;
  els.stockSymbol.value = entry.stock?.symbol || "";
  els.stockShares.value = entry.stock?.shares || "";
  els.stockPrice.value = entry.stock?.price || "";
  els.quoteStatus.dataset.priceUpdatedAt = entry.stock?.priceUpdatedAt || "";
  els.quoteStatus.dataset.exchange = entry.stock?.exchange || "";
  els.quoteStatus.textContent = entry.stock?.priceUpdatedAt
    ? `現價更新：${new Date(entry.stock.priceUpdatedAt).toLocaleString("zh-TW")}`
    : "股票市值會用股數 × 現價自動換算。";
  if (isCashEntry()) {
    els.entryAmount.focus();
  } else {
    els.entryName.focus();
  }
}

function normalizeSymbol(value) {
  return value.trim().toUpperCase().replace(/\\.TW$|\\.TWO$/, "");
}

async function fetchTwStockQuote(symbol) {
  const cleanSymbol = normalizeSymbol(symbol);
  if (!cleanSymbol) throw new Error("Missing symbol");
  const exchanges = [
    { id: "tse", label: "上市" },
    { id: "otc", label: "上櫃" },
  ];

  for (const exchange of exchanges) {
    const sourceUrl = `https://mis.twse.com.tw/stock/api/getStockInfo.jsp?ex_ch=${exchange.id}_${encodeURIComponent(cleanSymbol)}.tw&json=1&delay=0&_=${Date.now()}`;
    try {
      const data = await fetchQuoteJson(sourceUrl);
      const quote = data?.msgArray?.[0];
      const rawPrice = quote?.z && quote.z !== "-" ? quote.z : quote?.pz;
      const price = Number(rawPrice);
      if (price > 0) {
        return {
          symbol: cleanSymbol,
          name: quote.n || cleanSymbol,
          price,
          exchange: exchange.label,
          fetchedAt: new Date().toISOString(),
        };
      }
    } catch {
      continue;
    }
  }

  throw new Error("Quote unavailable");
}

async function fetchQuoteJson(sourceUrl) {
  const attempts = [
    { url: sourceUrl, source: "TWSE" },
    { url: `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(sourceUrl)}`, source: "TWSE proxy" },
  ];

  for (const attempt of attempts) {
    try {
      const controller = new AbortController();
      const timeoutId = window.setTimeout(() => controller.abort(), 8000);
      const response = await fetch(attempt.url, { cache: "no-store", signal: controller.signal });
      window.clearTimeout(timeoutId);
      if (!response.ok) continue;
      const data = await response.json();
      if (data?.rtcode === "0000" && Array.isArray(data.msgArray)) {
        data.source = attempt.source;
        return data;
      }
    } catch {
      continue;
    }
  }

  throw new Error("Quote unavailable");
}

async function fetchJsonWithProxyFallback(sourceUrl, validator) {
  const attempts = [
    { url: sourceUrl, source: "direct" },
    { url: `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(sourceUrl)}`, source: "proxy" },
  ];

  for (const attempt of attempts) {
    try {
      const controller = new AbortController();
      const timeoutId = window.setTimeout(() => controller.abort(), 10000);
      const response = await fetch(attempt.url, { cache: "no-store", signal: controller.signal });
      window.clearTimeout(timeoutId);
      if (!response.ok) continue;
      const data = await response.json();
      if (!validator || validator(data)) {
        data.source = attempt.source;
        return data;
      }
    } catch {
      continue;
    }
  }

  throw new Error("History unavailable");
}

function monthToHistoryDate(month) {
  return `${month.replace("-", "")}01`;
}

function parseHistoryPrice(value) {
  return Number(String(value || "").replaceAll(",", ""));
}

function isComparableHistoricalPrice(historyPrice, currentPrice) {
  if (!(historyPrice > 0) || !(currentPrice > 0)) return true;
  const ratio = historyPrice / currentPrice;
  return ratio >= 0.33 && ratio <= 3;
}

async function fetchHistoricalStockClose(symbol, month) {
  const cleanSymbol = normalizeSymbol(symbol);
  const historyDate = monthToHistoryDate(month);
  const twseUrl = `https://www.twse.com.tw/rwd/zh/afterTrading/STOCK_DAY?date=${historyDate}&stockNo=${encodeURIComponent(cleanSymbol)}&response=json`;
  const tpexUrl = `https://www.tpex.org.tw/www/zh-tw/afterTrading/tradingStock?code=${encodeURIComponent(cleanSymbol)}&date=${month.replace("-", "/")}/01&response=json`;

  try {
    const data = await fetchJsonWithProxyFallback(twseUrl, (payload) => payload?.stat === "OK" && Array.isArray(payload.data));
    const row = data.data.at(-1);
    const price = parseHistoryPrice(row?.[6]);
    if (price > 0) {
      return { symbol: cleanSymbol, price, date: row[0], exchange: "上市", source: data.source };
    }
  } catch {
    // Try TPEx below.
  }

  const data = await fetchJsonWithProxyFallback(tpexUrl, (payload) => payload?.stat === "ok" && Array.isArray(payload.tables?.[0]?.data));
  const row = data.tables[0].data.at(-1);
  const price = parseHistoryPrice(row?.[6]);
  if (price > 0) {
    return { symbol: cleanSymbol, price, date: row[0], exchange: "上櫃", source: data.source };
  }

  throw new Error("History unavailable");
}

async function getMonthlyCloseTotals(month) {
  let totalAssets = 0;
  let totalLiabilities = 0;
  let totalLimits = 0;
  let stockQuoteTotal = 0;
  let stockQuoteResolved = 0;
  let stockQuoteFailed = 0;

  for (const entry of state.entries) {
    const amount = Number(entry.amount) || 0;
    if (entry.type === "liability") {
      totalLiabilities += amount;
      continue;
    }
    if (entry.type === "limit") {
      totalLimits += amount;
      continue;
    }
    if (entry.type !== "asset") continue;

    if (entry.stock?.symbol && entry.stock?.shares > 0) {
      stockQuoteTotal += 1;
      try {
        const history = await fetchHistoricalStockClose(entry.stock.symbol, month);
        const currentPrice = Number(entry.stock.price);
        if (!isComparableHistoricalPrice(history.price, currentPrice)) {
          throw new Error("Possible split or reverse split");
        }
        totalAssets += Math.round(Number(entry.stock.shares) * history.price);
        stockQuoteResolved += 1;
      } catch {
        totalAssets += amount;
        stockQuoteFailed += 1;
      }
      continue;
    }

    totalAssets += amount;
  }

  return {
    totalAssets,
    totalLiabilities,
    totalLimits,
    netWorth: totalAssets - totalLiabilities,
    stockQuoteTotal,
    stockQuoteResolved,
    stockQuoteFailed,
  };
}

async function refreshQuote() {
  const symbol = normalizeSymbol(els.stockSymbol.value);
  if (!symbol) {
    showToast("請先輸入股票代號");
    return;
  }

  els.fetchQuoteButton.disabled = true;
  els.quoteStatus.textContent = "抓取現價中...";
  try {
    const quote = await fetchTwStockQuote(symbol);
    els.stockSymbol.value = quote.symbol;
    els.stockPrice.value = String(quote.price);
    els.quoteStatus.dataset.priceUpdatedAt = quote.fetchedAt;
    els.quoteStatus.dataset.exchange = quote.exchange;
    els.quoteStatus.textContent = `${quote.name} ${quote.exchange} · 現價 ${formatPrice(quote.price)} · ${new Date(quote.fetchedAt).toLocaleString("zh-TW")}`;
    if (!els.entryName.value.trim()) {
      els.entryName.value = `${quote.symbol} ${quote.name}`;
    }
    updateStockMarketValue();
    showToast("已更新現價");
  } catch {
    els.quoteStatus.textContent = "抓不到現價，請確認代號或手動輸入價格。";
    showToast("現價抓取失敗");
  } finally {
    els.fetchQuoteButton.disabled = false;
  }
}

async function createSnapshot() {
  const month = els.snapshotMonth.value || currentMonth();
  els.snapshotButton.disabled = true;
  const originalText = els.snapshotButton.textContent;
  els.snapshotButton.textContent = "月結中...";
  const totals = await getMonthlyCloseTotals(month);
  const snapshot = {
    id: `snapshot-${month}`,
    month,
    date: today(),
    totalAssets: totals.totalAssets,
    totalLiabilities: totals.totalLiabilities,
    totalLimits: totals.totalLimits,
    netWorth: totals.netWorth,
    stockQuoteTotal: totals.stockQuoteTotal,
    stockQuoteResolved: totals.stockQuoteResolved,
    stockQuoteFailed: totals.stockQuoteFailed,
    createdAt: new Date().toISOString(),
  };
  await putItem(STORE_SNAPSHOTS, snapshot);
  els.snapshotButton.disabled = false;
  els.snapshotButton.textContent = originalText;
  await loadData();
  showToast(totals.stockQuoteFailed ? `已儲存 ${month} 月結，${totals.stockQuoteFailed} 筆股票沿用目前價格` : `已儲存 ${month} 月結`);
}

async function refreshAllStockQuotes() {
  const stockEntries = state.entries.filter((entry) => entry.stock?.symbol && entry.stock?.shares > 0);
  if (!stockEntries.length) {
    showToast("目前沒有股票項目");
    return;
  }

  els.refreshAllQuotesButton.disabled = true;
  const originalText = els.refreshAllQuotesButton.textContent;
  let updated = 0;
  let failed = 0;

  for (const [index, entry] of stockEntries.entries()) {
    els.refreshAllQuotesButton.textContent = `${index + 1}/${stockEntries.length}`;
    try {
      const quote = await fetchTwStockQuote(entry.stock.symbol);
      const nextEntry = {
        ...entry,
        amount: Math.round(Number(entry.stock.shares) * quote.price),
        date: today(),
        stock: {
          ...entry.stock,
          symbol: quote.symbol,
          price: quote.price,
          priceUpdatedAt: quote.fetchedAt,
          exchange: quote.exchange,
        },
        updatedAt: new Date().toISOString(),
      };
      await putItem(STORE_ENTRIES, normalizeEntry(nextEntry));
      updated += 1;
    } catch {
      failed += 1;
    }
  }

  els.refreshAllQuotesButton.disabled = false;
  els.refreshAllQuotesButton.textContent = originalText;
  await loadData();
  showToast(failed ? `已更新 ${updated} 筆，${failed} 筆失敗` : `已更新 ${updated} 筆股價`);
}

function downloadJson(filename, payload) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function exportData() {
  downloadJson(`finance-ledger-${today()}.json`, {
    app: "finance-ledger",
    exportedAt: new Date().toISOString(),
    entries: state.entries,
    snapshots: state.snapshots,
  });
  showToast("已匯出備份");
}

async function importData(file) {
  const text = await file.text();
  const data = JSON.parse(text);
  if (!Array.isArray(data.entries) || !Array.isArray(data.snapshots)) {
    throw new Error("Invalid backup");
  }

  await clearStore(STORE_ENTRIES);
  await clearStore(STORE_SNAPSHOTS);
  for (const entry of data.entries) await putItem(STORE_ENTRIES, normalizeEntry(entry));
  for (const snapshot of data.snapshots) await putItem(STORE_SNAPSHOTS, normalizeSnapshot(snapshot));
  await loadData();
  showToast("已匯入備份");
}

function bindEvents() {
  els.entryType.addEventListener("change", updateCategoryOptions);
  els.entryCategory.addEventListener("change", () => {
    updateCashFields();
    updateStockFields();
    updateLimitHint();
  });
  els.stockShares.addEventListener("input", updateStockMarketValue);
  els.stockPrice.addEventListener("input", updateStockMarketValue);
  els.stockSymbol.addEventListener("change", () => {
    els.stockSymbol.value = normalizeSymbol(els.stockSymbol.value);
  });
  els.fetchQuoteButton.addEventListener("click", refreshQuote);
  els.form.addEventListener("submit", handleSubmit);
  els.clearFormButton.addEventListener("click", resetForm);
  els.guideToggleButton.addEventListener("click", () => {
    setGuideOpen(els.guideBody.hidden);
  });
  els.snapshotButton.addEventListener("click", createSnapshot);
  els.refreshAllQuotesButton.addEventListener("click", refreshAllStockQuotes);
  els.clearSnapshotsButton.addEventListener("click", async () => {
    if (!state.snapshots.length) return;
    if (!confirm("確定清除所有快照？")) return;
    await clearStore(STORE_SNAPSHOTS);
    await loadData();
    showToast("已清除快照");
  });
  els.exportButton.addEventListener("click", exportData);
  els.importInput.addEventListener("change", async () => {
    const file = els.importInput.files?.[0];
    if (!file) return;
    try {
      await importData(file);
    } catch {
      showToast("備份檔格式不正確");
    } finally {
      els.importInput.value = "";
    }
  });

  document.querySelectorAll("[data-filter]").forEach((button) => {
    button.addEventListener("click", () => {
      document.querySelectorAll("[data-filter]").forEach((item) => item.classList.remove("active"));
      button.classList.add("active");
      state.filter = button.dataset.filter;
      renderEntries();
    });
  });

  els.entryList.addEventListener("click", async (event) => {
    const button = event.target.closest("button");
    if (!button) return;
    const { action, id } = button.dataset;
    if (action === "edit") editEntry(id);
    if (action === "delete") {
      await deleteItem(STORE_ENTRIES, id);
      await loadData();
      showToast("已刪除");
    }
  });

  els.snapshotList.addEventListener("click", async (event) => {
    const button = event.target.closest("button");
    if (!button || button.dataset.action !== "delete-snapshot") return;
    if (!confirm("確定刪除這筆月結？")) return;
    await deleteItem(STORE_SNAPSHOTS, button.dataset.id);
    await loadData();
    showToast("已刪除月結");
  });

  els.toggleSnapshotsButton.addEventListener("click", () => {
    state.showAllSnapshots = !state.showAllSnapshots;
    renderSnapshots();
  });

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    state.deferredInstallPrompt = event;
    els.installButton.hidden = false;
  });

  els.installButton.addEventListener("click", async () => {
    if (!state.deferredInstallPrompt) return;
    state.deferredInstallPrompt.prompt();
    await state.deferredInstallPrompt.userChoice;
    state.deferredInstallPrompt = null;
    els.installButton.hidden = true;
  });
}

async function registerServiceWorker() {
  if ("serviceWorker" in navigator) {
    await navigator.serviceWorker.register("./sw.js");
  }
}

updateCategoryOptions();
resetForm();
resetSnapshotMonth();
if (getStoredGuideState() !== null) {
  setGuideOpen(getStoredGuideState() === "true", false);
}
bindEvents();
loadData();
registerServiceWorker();
