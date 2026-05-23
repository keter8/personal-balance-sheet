const DB_NAME = "finance-ledger-db";
const DB_VERSION = 1;
const STORE_ENTRIES = "entries";
const STORE_SNAPSHOTS = "snapshots";
const GUIDE_STORAGE_KEY = "finance-ledger-guide-open";
const ENTRY_FORM_STORAGE_KEY = "finance-ledger-entry-form-open";
const MOBILE_TAB_STORAGE_KEY = "finance-ledger-mobile-tab";
const BACKUP_STORAGE_KEY = "finance-ledger-last-backup-at";
const BACKUP_NEEDED_STORAGE_KEY = "finance-ledger-backup-needed";
const IMPORTED_BACKUP_STORAGE_KEY = "finance-ledger-last-imported-exported-at";
const BACKUP_SCHEMA_VERSION = 2;
const BACKUP_KDF = "PBKDF2-SHA256";
const BACKUP_CIPHER = "AES-GCM";
const BACKUP_KDF_ITERATIONS = 210000;
const BACKUP_OVERDUE_DAYS = 30;
const ENTRY_STALE_DAYS = 30;
const STOCK_QUOTE_STALE_DAYS = 7;
const REAL_ESTATE_STREET_SAMPLE_MIN = 5;
const REAL_ESTATE_COMPARABLE_SAMPLE_MIN = 5;

const assetCategories = ["現金", "銀行餘額", "證券戶現金", "股票市值", "基金/ETF", "房地產", "外幣", "保單", "其他資產"];
const liabilityCategories = ["房貸", "理財型房貸已動用", "信貸", "車貸", "信用卡", "私人借款", "其他負債"];
const limitCategories = ["理財型房貸額度", "信用卡額度", "信貸額度", "其他額度"];
const mortgageLinkedLiabilityCategories = new Set(["房貸", "理財型房貸已動用"]);
const realEstateCities = [
  ["臺北市", "A"],
  ["新北市", "F"],
  ["桃園市", "H"],
  ["臺中市", "B"],
  ["臺南市", "D"],
  ["高雄市", "E"],
  ["基隆市", "C"],
  ["新竹市", "O"],
  ["新竹縣", "J"],
  ["苗栗縣", "K"],
  ["彰化縣", "N"],
  ["南投縣", "M"],
  ["雲林縣", "P"],
  ["嘉義市", "I"],
  ["嘉義縣", "Q"],
  ["屏東縣", "T"],
  ["宜蘭縣", "G"],
  ["花蓮縣", "U"],
  ["臺東縣", "V"],
  ["澎湖縣", "X"],
  ["金門縣", "W"],
];
const PING_TO_SQUARE_METER = 3.305785;

const $ = (selector) => document.querySelector(selector);
const state = {
  entries: [],
  snapshots: [],
  filter: "all",
  mobileTab: "overview",
  showAllEntries: false,
  showAllSnapshots: false,
  deferredInstallPrompt: null,
};

const els = {
  main: $("#appMain"),
  mobileTabBar: $("#mobileTabBar"),
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
  inputPanel: $(".input-panel"),
  stockFields: $("#stockFields"),
  stockSymbol: $("#stockSymbol"),
  stockShares: $("#stockShares"),
  stockPrice: $("#stockPrice"),
  fetchQuoteButton: $("#fetchQuoteButton"),
  quoteStatus: $("#quoteStatus"),
  realEstateFields: $("#realEstateFields"),
  realEstateCity: $("#realEstateCity"),
  realEstateDistrict: $("#realEstateDistrict"),
  realEstateArea: $("#realEstateArea"),
  realEstateStreet: $("#realEstateStreet"),
  realEstateMortgage: $("#realEstateMortgage"),
  fetchRealEstateEstimateButton: $("#fetchRealEstateEstimateButton"),
  applyRealEstateEstimateButton: $("#applyRealEstateEstimateButton"),
  realEstateEstimateStatus: $("#realEstateEstimateStatus"),
  toggleEntryFormButton: $("#toggleEntryFormButton"),
  clearFormButton: $("#clearFormButton"),
  netWorth: $("#netWorth"),
  totalAssets: $("#totalAssets"),
  totalLiabilities: $("#totalLiabilities"),
  totalLimits: $("#totalLimits"),
  lastUpdated: $("#lastUpdated"),
  healthPanel: $("#healthPanel"),
  healthList: $("#healthList"),
  entryList: $("#entryList"),
  toggleEntriesButton: $("#toggleEntriesButton"),
  emptyState: $("#emptyState"),
  guidePanel: $("#guidePanel"),
  guideBody: $("#guideBody"),
  guideToggleButton: $("#guideToggleButton"),
  backupPanel: $("#backupPanel"),
  backupStatusText: $("#backupStatusText"),
  backupImportText: $("#backupImportText"),
  backupBadge: $("#backupBadge"),
  clearLocalDataButton: $("#clearLocalDataButton"),
  allocationList: $("#allocationList"),
  limitDisclosure: $("#limitDisclosure"),
  snapshotList: $("#snapshotList"),
  toggleSnapshotsButton: $("#toggleSnapshotsButton"),
  trendChart: $("#trendChart"),
  snapshotInsight: $("#snapshotInsight"),
  snapshotMonth: $("#snapshotMonth"),
  snapshotButton: $("#snapshotButton"),
  refreshAllQuotesButton: $("#refreshAllQuotesButton"),
  clearSnapshotsButton: $("#clearSnapshotsButton"),
  exportButton: $("#exportButton"),
  importInput: $("#importInput"),
  installButton: $("#installButton"),
  toast: $("#toast"),
};

const DESKTOP_ENTRY_PREVIEW_LIMIT = 8;
const MOBILE_ENTRY_PREVIEW_LIMIT = 4;
const MOBILE_TABS = new Set(["overview", "data", "monthly"]);
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

function timestampForFilename(date = new Date()) {
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}`;
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

function getStoredEntryFormState() {
  const value = localStorage.getItem(ENTRY_FORM_STORAGE_KEY);
  if (value === null) return null;
  return value === "true";
}

function setEntryFormOpen(open, persist = true) {
  els.form.hidden = !open;
  els.toggleEntryFormButton.textContent = open ? "收合" : "展開";
  els.toggleEntryFormButton.setAttribute("aria-expanded", String(open));
  els.inputPanel.classList.toggle("collapsed", !open);
  els.clearFormButton.hidden = !open;
  if (persist) {
    localStorage.setItem(ENTRY_FORM_STORAGE_KEY, open ? "true" : "false");
  }
}

function syncEntryFormDefault() {
  const storedState = getStoredEntryFormState();
  if (storedState !== null) {
    setEntryFormOpen(storedState, false);
    return;
  }

  setEntryFormOpen(state.entries.length === 0, false);
}

function getStoredMobileTab() {
  const value = localStorage.getItem(MOBILE_TAB_STORAGE_KEY);
  return MOBILE_TABS.has(value) ? value : "overview";
}

function setMobileTab(tab, persist = true) {
  const nextTab = MOBILE_TABS.has(tab) ? tab : "overview";
  state.mobileTab = nextTab;
  els.main.dataset.mobileTab = nextTab;
  els.mobileTabBar.querySelectorAll("[data-mobile-tab]").forEach((button) => {
    const active = button.dataset.mobileTab === nextTab;
    button.classList.toggle("active", active);
    button.setAttribute("aria-current", active ? "page" : "false");
  });
  if (persist) {
    localStorage.setItem(MOBILE_TAB_STORAGE_KEY, nextTab);
  }
}

function formatDateTime(value) {
  if (!value) return "未知";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "未知";
  return date.toLocaleString("zh-TW");
}

function daysSince(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return Infinity;
  return Math.floor((Date.now() - date.getTime()) / 86400000);
}

function timestampValue(value) {
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? 0 : time;
}

function getLocalUpdatedAt() {
  const times = [
    ...state.entries.map((entry) => timestampValue(entry.updatedAt || entry.createdAt)),
    ...state.entries.map((entry) => timestampValue(entry.realEstate?.estimate?.fetchedAt)),
    ...state.snapshots.map((snapshot) => timestampValue(snapshot.createdAt || snapshot.date)),
  ];
  const latest = Math.max(0, ...times);
  return latest > 0 ? new Date(latest).toISOString() : null;
}

function hasUnbackedLocalChanges() {
  const localUpdatedAt = getLocalUpdatedAt();
  if (!localUpdatedAt) return false;
  const lastBackupAt = localStorage.getItem(BACKUP_STORAGE_KEY);
  return timestampValue(lastBackupAt) < timestampValue(localUpdatedAt);
}

function renderBackupStatus() {
  const lastBackupAt = localStorage.getItem(BACKUP_STORAGE_KEY);
  const lastImportedExportedAt = localStorage.getItem(IMPORTED_BACKUP_STORAGE_KEY);
  const backupNeeded = localStorage.getItem(BACKUP_NEEDED_STORAGE_KEY) === "true";
  const hasLocalData = state.entries.length > 0 || state.snapshots.length > 0;
  const elapsedDays = daysSince(lastBackupAt);
  const overdue = !lastBackupAt || elapsedDays > BACKUP_OVERDUE_DAYS;

  if (!hasLocalData && !lastBackupAt) {
    els.backupStatusText.textContent = "目前沒有本機資料。先新增第一筆資料，或用「匯入加密」恢復資料後，再匯出加密備份。";
  } else if (!lastBackupAt) {
    els.backupStatusText.textContent = "尚未匯出加密備份。月結後建議立刻匯出；請記住密碼，忘記密碼無法還原。";
  } else {
    els.backupStatusText.textContent = `上次匯出加密備份：${formatDateTime(lastBackupAt)}${elapsedDays > 0 ? `，約 ${elapsedDays} 天前` : "，今天"}；請妥善保存密碼。`;
  }

  els.backupImportText.textContent = lastImportedExportedAt
    ? `最近匯入的備份匯出時間：${formatDateTime(lastImportedExportedAt)}`
    : "尚未匯入加密備份檔。";

  const idle = !hasLocalData && !lastBackupAt;
  els.backupPanel.classList.toggle("idle", idle);
  els.backupPanel.classList.toggle("danger", !idle && overdue);
  els.backupPanel.classList.toggle("warning", !idle && !overdue && backupNeeded);
  els.backupBadge.className = `backup-badge ${idle ? "idle" : overdue ? "danger" : backupNeeded ? "warning" : "ok"}`;
  els.backupBadge.textContent = idle ? "尚無資料" : overdue ? "備份逾期" : backupNeeded ? "月結後待備份" : "備份正常";
}

function getBackupHealthStatus() {
  const lastBackupAt = localStorage.getItem(BACKUP_STORAGE_KEY);
  const backupNeeded = localStorage.getItem(BACKUP_NEEDED_STORAGE_KEY) === "true";
  const hasLocalData = state.entries.length > 0 || state.snapshots.length > 0;
  const overdue = !lastBackupAt || daysSince(lastBackupAt) > BACKUP_OVERDUE_DAYS;
  if (!hasLocalData) return null;
  if (overdue) {
    return {
      status: "danger",
      title: "備份逾期",
      description: lastBackupAt ? `上次匯出已超過 ${BACKUP_OVERDUE_DAYS} 天。` : "這台裝置尚未匯出過備份。",
      actionHint: "匯出加密備份到 iCloud Drive、Google Drive 或 Dropbox。",
    };
  }
  if (backupNeeded) {
    return {
      status: "warning",
      title: "月結後待備份",
      description: "本機資料已更新，但還沒有匯出最新備份。",
      actionHint: "完成月結或資料調整後，順手匯出加密備份。",
    };
  }
  return null;
}

function getHealthChecks() {
  const checks = [];
  const hasEntries = state.entries.length > 0;
  if (!hasEntries) {
    return [
      {
        status: "idle",
        title: "尚無資料",
        description: "先新增第一筆資產、負債或額度，健康檢查才會開始提醒。",
        actionHint: "可以從銀行餘額、股票市值或貸款金額開始。",
      },
    ];
  }

  const staleEntries = state.entries.filter((entry) => daysSince(entry.updatedAt || entry.createdAt || entry.date) > ENTRY_STALE_DAYS);
  if (staleEntries.length) {
    checks.push({
      status: "warning",
      title: "資料過期",
      description: `${staleEntries.length} 筆資料超過 ${ENTRY_STALE_DAYS} 天未更新。`,
      actionHint: "月底盤點時確認銀行、貸款、額度與手動輸入金額。",
    });
  }

  const staleStocks = state.entries.filter((entry) => entry.stock?.symbol && (!entry.stock.priceUpdatedAt || daysSince(entry.stock.priceUpdatedAt) > STOCK_QUOTE_STALE_DAYS));
  if (staleStocks.length) {
    checks.push({
      status: "warning",
      title: "股票價格過期",
      description: `${staleStocks.length} 筆股票價格超過 ${STOCK_QUOTE_STALE_DAYS} 天未更新或沒有更新時間。`,
      actionHint: "到資料分頁按「更新股價」後再建立月結。",
    });
  }

  const hasCurrentMonthSnapshot = state.snapshots.some((snapshot) => normalizeSnapshot(snapshot).month === currentMonth());
  if (!hasCurrentMonthSnapshot) {
    checks.push({
      status: "warning",
      title: "本月尚未月結",
      description: `還沒有 ${currentMonth()} 的月結紀錄。`,
      actionHint: "確認資料與股價後，到月結分頁建立月結。",
    });
  }

  const backupHealth = getBackupHealthStatus();
  if (backupHealth) checks.push(backupHealth);

  if (!checks.length) {
    return [
      {
        status: "ok",
        title: "目前沒有待處理項目",
        description: "資料、月結與備份狀態看起來都正常。",
        actionHint: "下次月底再回來盤點即可。",
      },
    ];
  }

  return checks;
}

function renderHealthChecks() {
  if (!els.healthList) return;
  const checks = getHealthChecks();
  els.healthPanel.classList.toggle("ok", checks.every((check) => check.status === "ok"));
  els.healthPanel.classList.toggle("danger", checks.some((check) => check.status === "danger"));
  els.healthPanel.classList.toggle("warning", checks.some((check) => check.status === "warning"));
  els.healthPanel.classList.toggle("idle", checks.every((check) => check.status === "idle"));
  els.healthList.innerHTML = checks
    .map(
      (check) => `
        <article class="health-item ${check.status}">
          <div>
            <span class="health-badge ${check.status}">${healthStatusLabel(check.status)}</span>
            <strong>${escapeHtml(check.title)}</strong>
          </div>
          <p>${escapeHtml(check.description)}</p>
          <small>${escapeHtml(check.actionHint)}</small>
        </article>
      `
    )
    .join("");
}

function healthStatusLabel(status) {
  if (status === "ok") return "正常";
  if (status === "danger") return "逾期";
  if (status === "idle") return "開始";
  return "注意";
}

function markBackupNeeded() {
  localStorage.setItem(BACKUP_NEEDED_STORAGE_KEY, "true");
  renderBackupStatus();
  renderHealthChecks();
}

function markBackupCompleted(timestamp) {
  localStorage.setItem(BACKUP_STORAGE_KEY, timestamp);
  localStorage.setItem(BACKUP_NEEDED_STORAGE_KEY, "false");
  renderBackupStatus();
  renderHealthChecks();
}

async function clearLocalData() {
  const ok = confirm("這會刪除這台裝置瀏覽器裡的所有資產、負債、額度與月結紀錄。\n\n不會影響 GitHub、其他裝置，或你已經匯出的加密備份。\n\n確定要繼續嗎？");
  if (!ok) return;

  const typed = prompt("請輸入 DELETE 確認清除本機資料。");
  if (typed !== "DELETE") {
    showToast("已取消清除");
    return;
  }

  await clearStore(STORE_ENTRIES);
  await clearStore(STORE_SNAPSHOTS);
  localStorage.removeItem(BACKUP_STORAGE_KEY);
  localStorage.removeItem(BACKUP_NEEDED_STORAGE_KEY);
  localStorage.removeItem(IMPORTED_BACKUP_STORAGE_KEY);
  state.entries = [];
  state.snapshots = [];
  state.showAllSnapshots = false;
  resetForm();
  resetSnapshotMonth();
  await loadData();
  showToast("已清除本機資料");
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
  updateRealEstateFields();
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

function isRealEstateEntry() {
  return els.entryType.value === "asset" && els.entryCategory.value === "房地產";
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

function setupRealEstateOptions() {
  els.realEstateCity.innerHTML = realEstateCities.map(([city]) => `<option value="${city}">${city}</option>`).join("");
}

function syncRealEstateMortgageOptions(selectedId = "") {
  const mortgages = state.entries.filter((entry) => entry.type === "liability" && mortgageLinkedLiabilityCategories.has(entry.category));
  els.realEstateMortgage.innerHTML = [
    `<option value="">不連動負債</option>`,
    ...mortgages.map((entry) => `<option value="${entry.id}">${escapeHtml(entry.name)} · ${entry.category} · ${formatMoney(Number(entry.amount))}</option>`),
  ].join("");
  if (selectedId && mortgages.some((entry) => entry.id === selectedId)) {
    els.realEstateMortgage.value = selectedId;
  }
}

function updateRealEstateFields() {
  const enabled = isRealEstateEntry();
  els.realEstateFields.hidden = !enabled;
  els.realEstateCity.required = enabled;
  els.realEstateDistrict.required = enabled;
  els.realEstateArea.required = enabled;
  els.realEstateDistrict.disabled = !enabled;
  els.realEstateArea.disabled = !enabled;
  els.realEstateStreet.disabled = !enabled;
  els.realEstateMortgage.disabled = !enabled;
  els.fetchRealEstateEstimateButton.disabled = !enabled;
  if (enabled) {
    syncRealEstateMortgageOptions(els.realEstateMortgage.value);
  } else {
    clearRealEstateEstimate();
  }
}

function clearRealEstateEstimate() {
  els.applyRealEstateEstimateButton.disabled = true;
  delete els.applyRealEstateEstimateButton.dataset.amount;
  delete els.applyRealEstateEstimateButton.dataset.confidence;
  delete els.applyRealEstateEstimateButton.dataset.sampleCount;
  delete els.applyRealEstateEstimateButton.dataset.period;
  delete els.applyRealEstateEstimateButton.dataset.medianUnitPrice;
  delete els.applyRealEstateEstimateButton.dataset.scope;
  delete els.applyRealEstateEstimateButton.dataset.street;
  delete els.applyRealEstateEstimateButton.dataset.districtSampleCount;
  delete els.applyRealEstateEstimateButton.dataset.streetSampleCount;
  delete els.applyRealEstateEstimateButton.dataset.parkingAdjustedCount;
  delete els.applyRealEstateEstimateButton.dataset.parkingUnadjustedCount;
  delete els.applyRealEstateEstimateButton.dataset.comparableSampleCount;
  delete els.applyRealEstateEstimateButton.dataset.usedComparableOnly;
  els.realEstateEstimateStatus.textContent =
    "此為不含車位的純房屋參考估值，不代表即時成交價或鑑價結果；可填路段讓估值優先使用同路段樣本，房產估值需由你確認後才會套用。";
}

function setRealEstateEstimateDataset(estimate) {
  if (!estimate) return;
  els.applyRealEstateEstimateButton.disabled = false;
  els.applyRealEstateEstimateButton.dataset.amount = String(estimate.amount);
  els.applyRealEstateEstimateButton.dataset.confidence = estimate.confidence || "低";
  els.applyRealEstateEstimateButton.dataset.sampleCount = String(estimate.sampleCount || 0);
  els.applyRealEstateEstimateButton.dataset.period = estimate.period || "";
  els.applyRealEstateEstimateButton.dataset.medianUnitPrice = String(estimate.medianUnitPrice || estimate.medianUnitPricePerPing || 0);
  els.applyRealEstateEstimateButton.dataset.scope = estimate.scope || "行政區";
  els.applyRealEstateEstimateButton.dataset.street = estimate.street || "";
  els.applyRealEstateEstimateButton.dataset.districtSampleCount = String(estimate.districtSampleCount || 0);
  els.applyRealEstateEstimateButton.dataset.streetSampleCount = String(estimate.streetSampleCount || 0);
  els.applyRealEstateEstimateButton.dataset.parkingAdjustedCount = String(estimate.parkingAdjustedCount || 0);
  els.applyRealEstateEstimateButton.dataset.parkingUnadjustedCount = String(estimate.parkingUnadjustedCount || 0);
  els.applyRealEstateEstimateButton.dataset.comparableSampleCount = String(estimate.comparableSampleCount || 0);
  els.applyRealEstateEstimateButton.dataset.usedComparableOnly = estimate.usedComparableOnly ? "true" : "false";
}

function toRealEstateEstimatePayload(estimate) {
  return {
    amount: estimate.amount,
    confidence: estimate.confidence || "低",
    sampleCount: Number(estimate.sampleCount) || 0,
    period: estimate.period || "",
    medianUnitPrice: Number(estimate.medianUnitPrice || estimate.medianUnitPricePerPing) || 0,
    scope: estimate.scope || "行政區",
    street: estimate.street || "",
    districtSampleCount: Number(estimate.districtSampleCount) || 0,
    streetSampleCount: Number(estimate.streetSampleCount) || 0,
    parkingAdjustedCount: Number(estimate.parkingAdjustedCount) || 0,
    parkingUnadjustedCount: Number(estimate.parkingUnadjustedCount) || 0,
    comparableSampleCount: Number(estimate.comparableSampleCount) || 0,
    usedComparableOnly: Boolean(estimate.usedComparableOnly),
    source: "內政部實價登錄 Open Data",
    fetchedAt: new Date().toISOString(),
  };
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
  els.realEstateDistrict.value = "";
  els.realEstateArea.value = "";
  els.realEstateStreet.value = "";
  els.realEstateMortgage.value = "";
  clearRealEstateEstimate();
  updateRealEstateFields();
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
  updateRecordActions();
}

function updateRecordActions() {
  const hasEntries = state.entries.length > 0;
  const hasBackupData = state.entries.length > 0 || state.snapshots.length > 0;
  const hasStocks = state.entries.some((entry) => entry.stock?.symbol && entry.stock?.shares > 0);
  els.snapshotButton.disabled = !hasEntries;
  els.snapshotButton.title = hasEntries ? "建立月結" : "請先新增至少一筆資料";
  els.exportButton.disabled = !hasBackupData;
  els.exportButton.title = hasBackupData ? "匯出加密備份" : "目前沒有可匯出的本機資料";
  els.refreshAllQuotesButton.disabled = !hasStocks;
  els.refreshAllQuotesButton.title = hasStocks ? "更新所有股票現價" : "目前沒有股票項目";
}

function renderEntries() {
  const entries = state.entries
    .filter((entry) => state.filter === "all" || entry.type === state.filter)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const previewLimit = getEntryPreviewLimit();
  const visibleEntries = state.showAllEntries ? entries : entries.slice(0, previewLimit);

  els.emptyState.hidden = entries.length > 0;
  els.toggleEntriesButton.hidden = entries.length <= previewLimit;
  els.toggleEntriesButton.textContent = state.showAllEntries ? "收合清單" : `顯示全部 ${entries.length} 筆`;
  els.entryList.innerHTML = visibleEntries
    .map(
      (entry) => {
        const realEstateDetails = renderRealEstateDetails(entry);
        return `
        <article class="entry-row ${entry.type}">
          <div class="entry-main">
            <strong>${escapeHtml(entry.name)}</strong>
            <span>${entry.category} · ${entry.date}${entry.stock ? ` · ${escapeHtml(entry.stock.symbol)} · ${formatShares(entry.stock.shares)} 股 · 現價 ${formatPrice(entry.stock.price)}` : ""}${entry.note ? ` · ${escapeHtml(entry.note)}` : ""}</span>
            ${realEstateDetails}
          </div>
          <div class="entry-amount">${entry.type === "liability" ? "-" : ""}${formatMoney(Number(entry.amount), entry.currency)}</div>
          <div class="row-actions">
            ${entry.realEstate ? `<button class="estimate-action" type="button" data-action="update-real-estate-estimate" data-id="${entry.id}" title="更新參考估值">估值</button>` : ""}
            <button type="button" data-action="edit" data-id="${entry.id}" title="編輯">✎</button>
            <button type="button" data-action="delete" data-id="${entry.id}" title="刪除">×</button>
          </div>
        </article>
      `;
      }
    )
      .join("");
}

function getLinkedLiability(entry) {
  const linkedId = entry.realEstate?.linkedLiabilityId;
  if (!linkedId) return null;
  return state.entries.find((item) => item.id === linkedId && item.type === "liability" && mortgageLinkedLiabilityCategories.has(item.category)) || null;
}

function renderRealEstateDetails(entry) {
  if (!entry.realEstate) return "";
  const mortgage = getLinkedLiability(entry);
  const mortgageAmount = mortgage ? Number(mortgage.amount) || 0 : 0;
  const equity = Number(entry.amount) - mortgageAmount;
  const estimate = entry.realEstate.estimate;
  const method = estimate ? "實價登錄參考" : entry.realEstate.valuationMethod || "手動輸入";
  const confidence = estimate?.confidence || entry.realEstate.confidence || "低";
  return `
    <div class="real-estate-detail">
      <span>房產總值 ${formatMoney(Number(entry.amount))}</span>
      <span>連動負債 ${mortgage ? `-${formatMoney(mortgageAmount)}` : "未連動"}</span>
      <span>房產淨值 ${formatMoney(equity)}</span>
      <span>${escapeHtml(entry.realEstate.city || "")}${escapeHtml(entry.realEstate.district || "")}${entry.realEstate.street ? ` · ${escapeHtml(entry.realEstate.street)}` : ""} · ${formatPrice(entry.realEstate.buildingAreaPing)} 坪 · ${method} · 信心 ${confidence}</span>
      ${estimate ? `<span>參考估值 ${formatMoney(estimate.amount)}（不含車位純房屋） · ${escapeHtml(estimate.scope || "行政區")} · ${estimate.sampleCount || 0} 筆 · 信心 ${escapeHtml(estimate.confidence || "低")}</span>` : ""}
    </div>
  `;
}

function formatShares(value) {
  return new Intl.NumberFormat("zh-TW", { maximumFractionDigits: 2 }).format(value || 0);
}

function formatPrice(value) {
  return new Intl.NumberFormat("zh-TW", { maximumFractionDigits: 2 }).format(value || 0);
}

function renderAllocation() {
  const assets = state.entries.filter((entry) => entry.type === "asset");
  const liabilities = state.entries.filter((entry) => entry.type === "liability");
  const limits = state.entries.filter((entry) => entry.type === "limit");
  const total = assets.reduce((sum, entry) => sum + Number(entry.amount), 0);
  const totalLiabilities = liabilities.reduce((sum, entry) => sum + Number(entry.amount), 0);
  const totalLimits = limits.reduce((sum, entry) => sum + Number(entry.amount), 0);
  const maxTypeAmount = Math.max(total, totalLiabilities, totalLimits, 1);

  els.limitDisclosure.hidden = true;
  els.limitDisclosure.innerHTML = "";

  if (!state.entries.length) {
    els.allocationList.innerHTML = `<div class="empty-state"><strong>尚無配置資料</strong><span>新增資產、負債或額度後會自動整理。</span></div>`;
    return;
  }

  const typeRows = [
    { label: "資產", note: "列入淨資產", amount: total, className: "asset", signed: false },
    { label: "負債", note: "自資產扣除", amount: totalLiabilities, className: "liability", signed: true },
    { label: "額度", note: "不列入淨資產", amount: totalLimits, className: "limit", signed: false },
  ];
  const typeOverview = typeRows
    .map((row) => {
      const percent = Math.round((row.amount / maxTypeAmount) * 100);
      return `
        <div class="allocation-row allocation-row-${row.className}">
          <div class="allocation-top">
            <span>${row.label}<small>${row.note}</small></span>
            <span>${row.signed && row.amount > 0 ? "-" : ""}${formatMoney(row.amount)}</span>
          </div>
          <div class="bar"><span style="width: ${percent}%"></span></div>
        </div>
      `;
    })
    .join("");
  const detailSections = [
    renderAllocationSection("資產分類", assets, total, "asset", false),
    renderAllocationSection("負債分類", liabilities, totalLiabilities, "liability", true),
    renderAllocationSection("額度分類", limits, totalLimits, "limit", false),
  ].filter(Boolean);

  els.allocationList.innerHTML = `
    <div class="allocation-section">
      <div class="allocation-section-label">三大類</div>
      ${typeOverview}
    </div>
    ${detailSections.join("")}
  `;
}

function renderAllocationSection(label, entries, total, className, signed) {
  if (!entries.length || total <= 0) return "";
  const grouped = entries.reduce((map, entry) => {
    map.set(entry.category, (map.get(entry.category) || 0) + Number(entry.amount));
    return map;
  }, new Map());

  const rows = Array.from(grouped.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([category, amount]) => {
      const percent = Math.round((amount / total) * 100);
      return `
        <div class="allocation-row allocation-row-${className}">
          <div class="allocation-top">
            <span>${category}</span>
            <span>${signed && amount > 0 ? "-" : ""}${formatMoney(amount)} · ${percent}%</span>
          </div>
          <div class="bar"><span style="width: ${percent}%"></span></div>
        </div>
      `;
    })
    .join("");

  return `
    <div class="allocation-section">
      <div class="allocation-section-label">${label}</div>
      ${rows}
    </div>
  `;
}

function addBreakdownAmount(breakdown, category, amount) {
  const key = category || "未分類";
  breakdown[key] = (Number(breakdown[key]) || 0) + (Number(amount) || 0);
}

function normalizeBreakdown(breakdown) {
  if (!breakdown || typeof breakdown !== "object" || Array.isArray(breakdown)) return {};
  return Object.fromEntries(
    Object.entries(breakdown)
      .map(([category, amount]) => [category, Number(amount) || 0])
      .filter(([, amount]) => amount !== 0)
  );
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
    renderSnapshotInsight([]);
    els.toggleSnapshotsButton.hidden = true;
    els.snapshotList.innerHTML = `<div class="empty-state"><strong>還沒有月結</strong><span>每月對帳後建立一筆，用來追蹤淨資產變化。</span></div>`;
    return;
  }

  const snapshots = state.snapshots.slice().map(normalizeSnapshot).sort((a, b) => a.month.localeCompare(b.month));
  renderTrendChart(snapshots);
  renderSnapshotInsight(snapshots);
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

function renderSnapshotInsight(snapshots) {
  if (!els.snapshotInsight) return;
  if (snapshots.length < 2) {
    els.snapshotInsight.innerHTML = `
      <section class="snapshot-insight-card snapshot-insight-empty">
        <strong>最新月結洞察</strong>
        <span>至少兩筆月結後顯示差異分析。</span>
      </section>
    `;
    return;
  }

  const current = snapshots.at(-1);
  const previous = snapshots.at(-2);
  const netWorthDelta = current.netWorth - previous.netWorth;
  const hasBreakdowns = current.hasBreakdowns && previous.hasBreakdowns;

  if (!hasBreakdowns) {
    els.snapshotInsight.innerHTML = `
      <section class="snapshot-insight-card">
        <div class="snapshot-insight-head">
          <div>
            <strong>最新月結洞察</strong>
            <span>${current.month} vs ${previous.month}</span>
          </div>
          <span class="snapshot-delta ${netWorthDelta >= 0 ? "positive" : "negative"}">${netWorthDelta >= 0 ? "+" : ""}${formatMoney(netWorthDelta)}</span>
        </div>
        <p>舊月結缺少分類快照，因此目前只顯示總額差異。之後建立的新月結會自動保存分類資料。</p>
      </section>
    `;
    return;
  }

  const contributionRows = [
    ...diffBreakdown(current.assetBreakdown, previous.assetBreakdown, "asset"),
    ...diffBreakdown(current.liabilityBreakdown, previous.liabilityBreakdown, "liability"),
  ]
    .filter((row) => row.impact !== 0)
    .sort((a, b) => Math.abs(b.impact) - Math.abs(a.impact))
    .slice(0, 5);
  const limitRows = diffBreakdown(current.limitBreakdown, previous.limitBreakdown, "limit")
    .filter((row) => row.amount !== 0)
    .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount))
    .slice(0, 3);

  els.snapshotInsight.innerHTML = `
    <section class="snapshot-insight-card">
      <div class="snapshot-insight-head">
        <div>
          <strong>最新月結洞察</strong>
          <span>${current.month} vs ${previous.month}</span>
        </div>
        <span class="snapshot-delta ${netWorthDelta >= 0 ? "positive" : "negative"}">${netWorthDelta >= 0 ? "+" : ""}${formatMoney(netWorthDelta)}</span>
      </div>
      <div class="insight-grid">
        <div>
          <h3>主要貢獻</h3>
          ${renderInsightRows(contributionRows, "分類金額沒有明顯變化。", true)}
        </div>
        <div>
          <h3>額度變化</h3>
          ${renderInsightRows(limitRows, "額度沒有變化。", false)}
        </div>
      </div>
    </section>
  `;
}

function renderInsightRows(rows, emptyText, useImpact) {
  if (!rows.length) return `<p class="insight-empty">${emptyText}</p>`;
  return `
    <ul class="insight-list">
      ${rows
        .map((row) => {
          const value = useImpact ? row.impact : row.amount;
          const valueClass = value >= 0 ? "positive" : "negative";
          const prefix = value >= 0 ? "+" : "";
          return `
            <li>
              <span><small>${row.typeLabel}</small>${escapeHtml(row.category)}</span>
              <strong class="${valueClass}">${prefix}${formatMoney(value)}</strong>
            </li>
          `;
        })
        .join("")}
    </ul>
  `;
}

function diffBreakdown(current, previous, type) {
  const categories = new Set([...Object.keys(current || {}), ...Object.keys(previous || {})]);
  const typeLabel = type === "asset" ? "資產" : type === "liability" ? "負債" : "額度";
  return Array.from(categories).map((category) => {
    const amount = (Number(current?.[category]) || 0) - (Number(previous?.[category]) || 0);
    const impact = type === "liability" ? -amount : amount;
    return { category, amount, impact, type, typeLabel };
  });
}

function getEntryPreviewLimit() {
  return window.matchMedia("(max-width: 620px)").matches ? MOBILE_ENTRY_PREVIEW_LIMIT : DESKTOP_ENTRY_PREVIEW_LIMIT;
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
  const hasBreakdowns =
    snapshot.hasBreakdowns === false ? false : Boolean(snapshot.assetBreakdown && snapshot.liabilityBreakdown && snapshot.limitBreakdown);
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
    assetBreakdown: normalizeBreakdown(snapshot.assetBreakdown),
    liabilityBreakdown: normalizeBreakdown(snapshot.liabilityBreakdown),
    limitBreakdown: normalizeBreakdown(snapshot.limitBreakdown),
    hasBreakdowns,
  };
}

function render() {
  renderSummary();
  renderHealthChecks();
  renderEntries();
  renderAllocation();
  renderSnapshots();
  renderBackupStatus();
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
  setMobileTab(getStoredMobileTab(), false);
  const storedGuideState = getStoredGuideState();
  if (storedGuideState === null) {
    setGuideOpen(state.entries.length === 0, false);
  }
  syncEntryFormDefault();
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
  const appliedRealEstateEstimateAmount = Number(els.applyRealEstateEstimateButton.dataset.amount);
  const usesReferenceEstimate =
    appliedRealEstateEstimateAmount > 0 && appliedRealEstateEstimateAmount === Math.round(Number(els.entryAmount.value));
  const realEstate = isRealEstateEntry()
    ? {
        city: els.realEstateCity.value,
        district: els.realEstateDistrict.value.trim(),
        buildingAreaPing: Number(els.realEstateArea.value),
        street: els.realEstateStreet.value.trim(),
        valuationMethod: usesReferenceEstimate ? "實價登錄參考" : "手動輸入",
        confidence: usesReferenceEstimate ? els.applyRealEstateEstimateButton.dataset.confidence || "低" : "低",
        linkedLiabilityId: els.realEstateMortgage.value || null,
        estimate: usesReferenceEstimate
          ? toRealEstateEstimatePayload({
              amount: appliedRealEstateEstimateAmount,
              confidence: els.applyRealEstateEstimateButton.dataset.confidence,
              sampleCount: els.applyRealEstateEstimateButton.dataset.sampleCount,
              period: els.applyRealEstateEstimateButton.dataset.period,
              medianUnitPrice: els.applyRealEstateEstimateButton.dataset.medianUnitPrice,
              scope: els.applyRealEstateEstimateButton.dataset.scope,
              street: els.applyRealEstateEstimateButton.dataset.street,
              districtSampleCount: els.applyRealEstateEstimateButton.dataset.districtSampleCount,
              streetSampleCount: els.applyRealEstateEstimateButton.dataset.streetSampleCount,
              parkingAdjustedCount: els.applyRealEstateEstimateButton.dataset.parkingAdjustedCount,
              parkingUnadjustedCount: els.applyRealEstateEstimateButton.dataset.parkingUnadjustedCount,
              comparableSampleCount: els.applyRealEstateEstimateButton.dataset.comparableSampleCount,
              usedComparableOnly: els.applyRealEstateEstimateButton.dataset.usedComparableOnly === "true",
            })
          : null,
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
    realEstate,
    createdAt: els.entryId.value ? state.entries.find((item) => item.id === els.entryId.value)?.createdAt || now : now,
    updatedAt: now,
  });

  if (!entry.name || Number.isNaN(entry.amount)) return;
  if (stock && (!stock.symbol || !(stock.shares > 0) || !(stock.price > 0))) return;
  if (realEstate && (!realEstate.city || !realEstate.district || !(realEstate.buildingAreaPing > 0))) return;

  await putItem(STORE_ENTRIES, entry);
  resetForm();
  await loadData();
  showToast("已儲存");
}

function editEntry(id) {
  const entry = state.entries.find((item) => item.id === id);
  if (!entry) return;
  setMobileTab("data");
  setEntryFormOpen(true);
  els.entryId.value = entry.id;
  els.entryType.value = entry.type;
  updateCategoryOptions();
  els.entryCategory.value = entry.category;
  updateCashFields();
  updateStockFields();
  updateRealEstateFields();
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
  els.realEstateCity.value = entry.realEstate?.city || realEstateCities[0][0];
  els.realEstateDistrict.value = entry.realEstate?.district || "";
  els.realEstateArea.value = entry.realEstate?.buildingAreaPing || "";
  els.realEstateStreet.value = entry.realEstate?.street || "";
  syncRealEstateMortgageOptions(entry.realEstate?.linkedLiabilityId || "");
  clearRealEstateEstimate();
  if (entry.realEstate?.estimate) {
    setRealEstateEstimateDataset(entry.realEstate.estimate);
    els.realEstateEstimateStatus.textContent = `已保存參考估值 ${formatMoney(entry.realEstate.estimate.amount)}，${entry.realEstate.estimate.scope || "行政區"}樣本 ${entry.realEstate.estimate.sampleCount || 0} 筆。`;
  }
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

async function fetchTextWithProxyFallback(sourceUrl) {
  const attempts = [
    { url: sourceUrl, source: "direct" },
    { url: `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(sourceUrl)}`, source: "proxy" },
  ];

  for (const attempt of attempts) {
    try {
      const controller = new AbortController();
      const timeoutId = window.setTimeout(() => controller.abort(), 12000);
      const response = await fetch(attempt.url, { cache: "no-store", signal: controller.signal });
      window.clearTimeout(timeoutId);
      if (!response.ok) continue;
      const text = await response.text();
      if (text.includes("鄉鎮市區") && text.includes("總價元")) {
        return { text, source: attempt.source };
      }
    } catch {
      continue;
    }
  }

  throw new Error("Text unavailable");
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

function parseCsvRows(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  const cleanText = text.replace(/^\uFEFF/, "");

  for (let index = 0; index < cleanText.length; index += 1) {
    const char = cleanText[index];
    const nextChar = cleanText[index + 1];
    if (char === '"' && quoted && nextChar === '"') {
      cell += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      row.push(cell);
      cell = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && nextChar === "\n") index += 1;
      row.push(cell);
      if (row.some((item) => item !== "")) rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }

  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }

  return rows;
}

function parseMinguoDate(value) {
  const digits = String(value || "").replace(/\D/g, "");
  if (digits.length < 7) return null;
  const year = Number(digits.slice(0, 3)) + 1911;
  const month = Number(digits.slice(3, 5));
  const day = Number(digits.slice(5, 7));
  if (!year || !month || !day) return null;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function median(values) {
  if (!values.length) return 0;
  const sorted = values.slice().sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function confidenceForSampleCount(count) {
  if (count >= 20) return "高";
  if (count >= 5) return "中";
  return "低";
}

function realEstateEstimateConfidence(sampleCount, sampleSet) {
  if (sampleSet.scope !== "同路段") {
    return sampleSet.streetSampleCount > 0 ? "低（路段樣本不足）" : "低（行政區參考）";
  }
  return confidenceForSampleCount(sampleCount);
}

function normalizeRealEstateKeyword(value) {
  return String(value || "")
    .trim()
    .replaceAll("台", "臺")
    .replace(/\s/g, "");
}

function pickRealEstateEstimateSamples(samples, street) {
  const cleanStreet = normalizeRealEstateKeyword(street);
  if (!cleanStreet) {
    return {
      samples,
      scope: "行政區",
      usedStreet: "",
      streetSampleCount: 0,
      districtSampleCount: samples.length,
      fallbackReason: "",
    };
  }

  const streetSamples = samples.filter((sample) => normalizeRealEstateKeyword(sample.address).includes(cleanStreet));
  if (streetSamples.length >= REAL_ESTATE_STREET_SAMPLE_MIN) {
    return {
      samples: streetSamples,
      scope: "同路段",
      usedStreet: street,
      streetSampleCount: streetSamples.length,
      districtSampleCount: samples.length,
      fallbackReason: "",
    };
  }

  return {
    samples,
    scope: "行政區",
    usedStreet: street,
    streetSampleCount: streetSamples.length,
    districtSampleCount: samples.length,
    fallbackReason: `同路段樣本少於 ${REAL_ESTATE_STREET_SAMPLE_MIN} 筆，改用行政區樣本。`,
  };
}

function getRealEstateComparableSamples(samples) {
  const comparableSamples = samples.filter((sample) => sample.isComparableUnitPrice);
  if (comparableSamples.length >= REAL_ESTATE_COMPARABLE_SAMPLE_MIN) {
    return {
      samples: comparableSamples,
      comparableSampleCount: comparableSamples.length,
      usedComparableOnly: true,
    };
  }

  return {
    samples,
    comparableSampleCount: comparableSamples.length,
    usedComparableOnly: false,
  };
}

async function fetchRealEstateReferenceEstimate({ city, district, buildingAreaPing, street }) {
  const cityCode = realEstateCities.find(([name]) => name === city)?.[1];
  if (!cityCode || !district || !(buildingAreaPing > 0)) throw new Error("Missing real estate inputs");

  const sourceUrl = `https://plvr.land.moi.gov.tw/Download?fileName=${cityCode}_lvr_land_A.csv`;
  const { text, source } = await fetchTextWithProxyFallback(sourceUrl);
  const rows = parseCsvRows(text);
  const headers = rows[0] || [];
  const records = rows.slice(2);
  const indexOf = (name) => headers.indexOf(name);
  const districtIndex = indexOf("鄉鎮市區");
  const targetIndex = indexOf("交易標的");
  const addressIndex = indexOf("土地位置建物門牌");
  const dateIndex = indexOf("交易年月日");
  const typeIndex = indexOf("建物型態");
  const useIndex = indexOf("主要用途");
  const areaIndex = indexOf("建物移轉總面積平方公尺");
  const priceIndex = indexOf("總價元");
  const unitPriceIndex = indexOf("單價元平方公尺");
  const parkingAreaIndex = indexOf("車位移轉總面積平方公尺");
  const parkingPriceIndex = indexOf("車位總價元");
  const noteIndex = indexOf("備註");

  const samples = records
    .map((row) => {
      const unitPricePerSquareMeter = Number(row[unitPriceIndex]);
      const totalPrice = Number(row[priceIndex]);
      const buildingArea = Number(row[areaIndex]);
      const parkingArea = Number(row[parkingAreaIndex]);
      const parkingPrice = Number(row[parkingPriceIndex]);
      const target = row[targetIndex] || "";
      const note = row[noteIndex] || "";
      const date = parseMinguoDate(row[dateIndex]);
      const hasParking = target.includes("車位") || parkingArea > 0;
      const canAdjustParking = hasParking && parkingArea > 0 && parkingPrice > 0 && totalPrice > parkingPrice && buildingArea > parkingArea;
      const adjustedUnitPricePerSquareMeter = canAdjustParking
        ? Math.round((totalPrice - parkingPrice) / (buildingArea - parkingArea))
        : unitPricePerSquareMeter;
      return {
        district: row[districtIndex],
        target,
        address: row[addressIndex] || "",
        buildingType: row[typeIndex] || "",
        use: row[useIndex] || "",
        unitPricePerSquareMeter: adjustedUnitPricePerSquareMeter,
        totalPrice,
        buildingArea,
        parkingArea,
        parkingPrice,
        hasParking,
        parkingAdjusted: canAdjustParking,
        parkingUnadjusted: hasParking && !canAdjustParking,
        isComparableUnitPrice: !hasParking || canAdjustParking,
        note,
        date,
      };
    })
    .filter((row) => {
      if (row.district !== district) return false;
      if (!row.target.includes("房地")) return false;
      if (row.target.includes("車位") && !row.target.includes("建物")) return false;
      if (!(row.unitPricePerSquareMeter > 0) || !(row.totalPrice > 0) || !(row.buildingArea > 0)) return false;
      if (row.note.includes("特殊") || row.note.includes("親友") || row.note.includes("僅車位")) return false;
      return row.use.includes("住") || row.buildingType.includes("住宅") || row.buildingType.includes("公寓") || row.buildingType.includes("華廈");
    });

  if (!samples.length) throw new Error("No samples");

  const sampleSet = pickRealEstateEstimateSamples(samples, street);
  const oneYearAgo = new Date();
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
  const recentSamples = sampleSet.samples.filter((sample) => !sample.date || new Date(sample.date) >= oneYearAgo);
  const timeScopedSamples = recentSamples.length ? recentSamples : sampleSet.samples;
  const comparableSet = getRealEstateComparableSamples(timeScopedSamples);
  const estimateSamples = comparableSet.samples;
  const unitPricePerSquareMeter = Math.round(median(estimateSamples.map((sample) => sample.unitPricePerSquareMeter)));
  const medianUnitPricePerPing = Math.round(unitPricePerSquareMeter * PING_TO_SQUARE_METER);
  const amount = Math.round(medianUnitPricePerPing * buildingAreaPing);
  const dates = estimateSamples.map((sample) => sample.date).filter(Boolean).sort();
  const period = dates.length ? `${dates[0]} ~ ${dates.at(-1)}` : "本期公開資料";

  return {
    amount,
    sampleCount: estimateSamples.length,
    period,
    medianUnitPricePerPing,
    confidence: realEstateEstimateConfidence(estimateSamples.length, sampleSet),
    scope: sampleSet.scope,
    street: sampleSet.usedStreet,
    districtSampleCount: sampleSet.districtSampleCount,
    streetSampleCount: sampleSet.streetSampleCount,
    parkingAdjustedCount: estimateSamples.filter((sample) => sample.parkingAdjusted).length,
    parkingUnadjustedCount: estimateSamples.filter((sample) => sample.parkingUnadjusted).length,
    comparableSampleCount: comparableSet.comparableSampleCount,
    usedComparableOnly: comparableSet.usedComparableOnly,
    fallbackReason: sampleSet.fallbackReason,
    source,
  };
}

function renderRealEstateEstimateStatus(estimate) {
  const scopeDetail =
    estimate.scope === "同路段"
      ? `估值方式：${estimate.street} 同路段住宅交易，每坪中位數 ${formatMoney(estimate.medianUnitPricePerPing)}。`
      : `估值方式：${estimate.period} ${estimate.scope}住宅交易，每坪中位數 ${formatMoney(estimate.medianUnitPricePerPing)}。`;
  const sampleDetail =
    estimate.street && estimate.scope !== "同路段"
      ? `同路段樣本 ${estimate.streetSampleCount} 筆；行政區樣本 ${estimate.districtSampleCount} 筆。`
      : `樣本 ${estimate.sampleCount} 筆；期間 ${estimate.period}。`;
  const fallback = estimate.fallbackReason ? `${estimate.fallbackReason} ` : "";
  const parkingDetail = [
    estimate.parkingAdjustedCount ? `已拆算車位 ${estimate.parkingAdjustedCount} 筆` : "",
    estimate.parkingUnadjustedCount ? `${estimate.parkingUnadjustedCount} 筆含車位但缺車位價格，可能拉低單價` : "",
    estimate.usedComparableOnly ? `優先使用可比較樣本 ${estimate.comparableSampleCount} 筆` : "",
  ]
    .filter(Boolean)
    .join("；");
  const guideHint =
    estimate.scope === "同路段"
      ? "若房產含車位，套用後請手動加上車位價值；若你掌握近期成交價、銀行鑑價或社區行情，仍建議以手動估值為準。"
      : "目前屬行政區保守參考，較適合當資產盤點下限；若房產含車位，套用後請手動加上車位價值；若你掌握近期成交價、銀行鑑價或社區行情，建議直接手動輸入該金額。";
  return `參考估值 ${formatMoney(estimate.amount)}（不含車位純房屋估值）；${scopeDetail} ${fallback}${sampleDetail} ${parkingDetail ? `${parkingDetail}。` : ""}信心 ${estimate.confidence}。未依社區、屋齡、樓層、裝潢修正；不代表即時成交價或鑑價結果。${guideHint}`;
}

async function fetchRealEstateEstimate() {
  if (!isRealEstateEntry()) return;
  const city = els.realEstateCity.value;
  const district = els.realEstateDistrict.value.trim();
  const buildingAreaPing = Number(els.realEstateArea.value);
  const street = els.realEstateStreet.value.trim();
  if (!city || !district || !(buildingAreaPing > 0)) {
    showToast("請先輸入縣市、行政區與建物坪數");
    return;
  }

  els.fetchRealEstateEstimateButton.disabled = true;
  const originalText = els.fetchRealEstateEstimateButton.textContent;
  els.fetchRealEstateEstimateButton.textContent = "估算中...";
  clearRealEstateEstimate();
  try {
    const estimate = await fetchRealEstateReferenceEstimate({ city, district, buildingAreaPing, street });
    els.applyRealEstateEstimateButton.disabled = false;
    els.applyRealEstateEstimateButton.dataset.amount = String(estimate.amount);
    els.applyRealEstateEstimateButton.dataset.confidence = estimate.confidence;
    els.applyRealEstateEstimateButton.dataset.sampleCount = String(estimate.sampleCount);
    els.applyRealEstateEstimateButton.dataset.period = estimate.period;
    els.applyRealEstateEstimateButton.dataset.medianUnitPrice = String(estimate.medianUnitPricePerPing);
    els.applyRealEstateEstimateButton.dataset.scope = estimate.scope;
    els.applyRealEstateEstimateButton.dataset.street = estimate.street;
    els.applyRealEstateEstimateButton.dataset.districtSampleCount = String(estimate.districtSampleCount);
    els.applyRealEstateEstimateButton.dataset.streetSampleCount = String(estimate.streetSampleCount);
    els.applyRealEstateEstimateButton.dataset.parkingAdjustedCount = String(estimate.parkingAdjustedCount);
    els.applyRealEstateEstimateButton.dataset.parkingUnadjustedCount = String(estimate.parkingUnadjustedCount);
    els.applyRealEstateEstimateButton.dataset.comparableSampleCount = String(estimate.comparableSampleCount);
    els.applyRealEstateEstimateButton.dataset.usedComparableOnly = estimate.usedComparableOnly ? "true" : "false";
    els.realEstateEstimateStatus.textContent = renderRealEstateEstimateStatus(estimate);
    showToast("已取得參考估值");
  } catch {
    clearRealEstateEstimate();
    els.realEstateEstimateStatus.textContent = "無法取得線上參考資料，請先手動輸入估值。";
    showToast("無法取得線上參考資料");
  } finally {
    els.fetchRealEstateEstimateButton.disabled = false;
    els.fetchRealEstateEstimateButton.textContent = originalText;
  }
}

function applyRealEstateEstimate() {
  const amount = Number(els.applyRealEstateEstimateButton.dataset.amount);
  if (!(amount > 0)) return;
  els.entryAmount.value = String(amount);
  els.realEstateEstimateStatus.textContent = `已套用參考估值 ${formatMoney(amount)}；房產估值需儲存後才會更新。`;
  showToast("已套用參考估值，請儲存項目");
}

async function updateRealEstateEstimateForEntry(id, button) {
  const entry = state.entries.find((item) => item.id === id);
  if (!entry?.realEstate) return;
  const originalText = button.textContent;
  button.disabled = true;
  button.textContent = "估...";
  try {
    const estimate = await fetchRealEstateReferenceEstimate({
      city: entry.realEstate.city,
      district: entry.realEstate.district,
      buildingAreaPing: Number(entry.realEstate.buildingAreaPing),
      street: entry.realEstate.street || "",
    });
    const nextEntry = {
      ...entry,
      realEstate: {
        ...entry.realEstate,
        estimate: toRealEstateEstimatePayload(estimate),
      },
    };
    await putItem(STORE_ENTRIES, normalizeEntry(nextEntry));
    markBackupNeeded();
    await loadData();
    showToast(`已更新參考估值 ${formatMoney(estimate.amount)}，請編輯後確認是否套用`);
  } catch {
    button.disabled = false;
    button.textContent = originalText;
    showToast("無法更新參考估值");
  }
}

async function getMonthlyCloseTotals(month) {
  let totalAssets = 0;
  let totalLiabilities = 0;
  let totalLimits = 0;
  let stockQuoteTotal = 0;
  let stockQuoteResolved = 0;
  let stockQuoteFailed = 0;
  const assetBreakdown = {};
  const liabilityBreakdown = {};
  const limitBreakdown = {};

  for (const entry of state.entries) {
    const amount = Number(entry.amount) || 0;
    if (entry.type === "liability") {
      totalLiabilities += amount;
      addBreakdownAmount(liabilityBreakdown, entry.category, amount);
      continue;
    }
    if (entry.type === "limit") {
      totalLimits += amount;
      addBreakdownAmount(limitBreakdown, entry.category, amount);
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
        const historicalAmount = Math.round(Number(entry.stock.shares) * history.price);
        totalAssets += historicalAmount;
        addBreakdownAmount(assetBreakdown, entry.category, historicalAmount);
        stockQuoteResolved += 1;
      } catch {
        totalAssets += amount;
        addBreakdownAmount(assetBreakdown, entry.category, amount);
        stockQuoteFailed += 1;
      }
      continue;
    }

    totalAssets += amount;
    addBreakdownAmount(assetBreakdown, entry.category, amount);
  }

  return {
    totalAssets,
    totalLiabilities,
    totalLimits,
    netWorth: totalAssets - totalLiabilities,
    assetBreakdown,
    liabilityBreakdown,
    limitBreakdown,
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
  if (!state.entries.length) {
    showToast("請先新增至少一筆資料再建立月結");
    return;
  }

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
    assetBreakdown: totals.assetBreakdown,
    liabilityBreakdown: totals.liabilityBreakdown,
    limitBreakdown: totals.limitBreakdown,
    hasBreakdowns: true,
    stockQuoteTotal: totals.stockQuoteTotal,
    stockQuoteResolved: totals.stockQuoteResolved,
    stockQuoteFailed: totals.stockQuoteFailed,
    createdAt: new Date().toISOString(),
  };
  await putItem(STORE_SNAPSHOTS, snapshot);
  els.snapshotButton.disabled = false;
  els.snapshotButton.textContent = originalText;
  markBackupNeeded();
  await loadData();
  showToast(totals.stockQuoteFailed ? `已儲存 ${month} 月結，建議匯出加密備份` : `月結已建立，建議現在匯出加密備份`);
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

function stringToBytes(value) {
  return new TextEncoder().encode(value);
}

function bytesToString(value) {
  return new TextDecoder().decode(value);
}

function bytesToBase64(bytes) {
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}

function base64ToBytes(value) {
  const binary = atob(value);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

async function deriveBackupKey(password, salt) {
  const keyMaterial = await crypto.subtle.importKey("raw", stringToBytes(password), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt,
      iterations: BACKUP_KDF_ITERATIONS,
      hash: "SHA-256",
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

async function encryptBackupPayload(payload, password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveBackupKey(password, salt);
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, stringToBytes(JSON.stringify(payload)));
  return {
    app: "finance-ledger",
    schemaVersion: BACKUP_SCHEMA_VERSION,
    encrypted: true,
    kdf: BACKUP_KDF,
    iterations: BACKUP_KDF_ITERATIONS,
    cipher: BACKUP_CIPHER,
    salt: bytesToBase64(salt),
    iv: bytesToBase64(iv),
    ciphertext: bytesToBase64(new Uint8Array(ciphertext)),
  };
}

async function decryptBackupFile(data, password) {
  if (
    data?.app !== "finance-ledger" ||
    data?.schemaVersion !== BACKUP_SCHEMA_VERSION ||
    data?.encrypted !== true ||
    data?.kdf !== BACKUP_KDF ||
    data?.iterations !== BACKUP_KDF_ITERATIONS ||
    data?.cipher !== BACKUP_CIPHER ||
    !data?.salt ||
    !data?.iv ||
    !data?.ciphertext
  ) {
    throw new Error("Unsupported encrypted backup");
  }

  const salt = base64ToBytes(data.salt);
  const iv = base64ToBytes(data.iv);
  const ciphertext = base64ToBytes(data.ciphertext);
  const key = await deriveBackupKey(password, salt);
  const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext);
  return JSON.parse(bytesToString(plaintext));
}

function buildBackupPayload(exportedAt) {
  return {
    app: "finance-ledger",
    schemaVersion: BACKUP_SCHEMA_VERSION,
    exportedAt,
    localUpdatedAt: getLocalUpdatedAt(),
    entries: state.entries,
    snapshots: state.snapshots,
  };
}

function promptBackupPassword(message) {
  const password = prompt(message);
  if (password === null) return null;
  if (!password.trim()) {
    showToast("備份密碼不可空白");
    return null;
  }
  return password;
}

async function exportData() {
  if (!state.entries.length && !state.snapshots.length) {
    showToast("目前沒有可匯出的本機資料");
    return;
  }

  const exportedAt = new Date().toISOString();
  const password = promptBackupPassword("請輸入加密備份密碼。\n\n請記住密碼，忘記密碼無法還原備份。");
  if (password === null) return;
  const confirmedPassword = promptBackupPassword("請再輸入一次加密備份密碼。");
  if (confirmedPassword === null) return;
  if (password !== confirmedPassword) {
    showToast("兩次密碼不一致，已取消匯出");
    return;
  }

  const encryptedBackup = await encryptBackupPayload(buildBackupPayload(exportedAt), password);
  downloadJson(`finance-ledger-${timestampForFilename(new Date(exportedAt))}.encrypted.json`, encryptedBackup);
  markBackupCompleted(exportedAt);
  showToast("已匯出加密備份");
}

async function importData(file) {
  const text = await file.text();
  const encryptedData = JSON.parse(text);
  if (encryptedData?.encrypted !== true) {
    showToast("此版本只接受加密備份，請使用加密備份檔");
    return false;
  }

  const localUpdatedAt = getLocalUpdatedAt();
  if (hasUnbackedLocalChanges()) {
    showToast("目前本機資料尚未備份，請先匯出加密備份後再匯入");
    return false;
  }

  const password = promptBackupPassword("請輸入加密備份密碼。");
  if (password === null) return false;

  let data;
  try {
    data = await decryptBackupFile(encryptedData, password);
  } catch {
    showToast("解密失敗，請確認備份檔與密碼");
    return false;
  }

  if (!Array.isArray(data.entries) || !Array.isArray(data.snapshots)) {
    throw new Error("Invalid backup");
  }

  const exportedAt = data.exportedAt || null;
  const ok = confirm(
    [
      "匯入備份會覆蓋目前這台裝置的所有本機資料。",
      "",
      "目前本機資料",
      `項目數：${state.entries.length}`,
      `月結數：${state.snapshots.length}`,
      `最後變更：${formatDateTime(localUpdatedAt)}`,
      "",
      "備份檔內容",
      `匯出時間：${formatDateTime(exportedAt)}`,
      `項目數：${data.entries.length}`,
      `月結數：${data.snapshots.length}`,
      `備份版本：${encryptedData.schemaVersion}`,
      "",
      "確定要繼續匯入嗎？",
    ].join("\n")
  );
  if (!ok) return false;

  await clearStore(STORE_ENTRIES);
  await clearStore(STORE_SNAPSHOTS);
  for (const entry of data.entries) await putItem(STORE_ENTRIES, normalizeEntry(entry));
  for (const snapshot of data.snapshots) await putItem(STORE_SNAPSHOTS, normalizeSnapshot(snapshot));
  if (exportedAt) {
    localStorage.setItem(IMPORTED_BACKUP_STORAGE_KEY, exportedAt);
  }
  localStorage.setItem(BACKUP_NEEDED_STORAGE_KEY, "true");
  await loadData();
  showToast("已匯入加密備份，建議再匯出一次加密備份");
  return true;
}

function bindEvents() {
  els.entryType.addEventListener("change", updateCategoryOptions);
  els.entryCategory.addEventListener("change", () => {
    updateCashFields();
    updateStockFields();
    updateRealEstateFields();
    updateLimitHint();
  });
  els.stockShares.addEventListener("input", updateStockMarketValue);
  els.stockPrice.addEventListener("input", updateStockMarketValue);
  els.entryAmount.addEventListener("input", () => {
    if (isRealEstateEntry()) clearRealEstateEstimate();
  });
  els.stockSymbol.addEventListener("change", () => {
    els.stockSymbol.value = normalizeSymbol(els.stockSymbol.value);
  });
  els.fetchQuoteButton.addEventListener("click", refreshQuote);
  [els.realEstateCity, els.realEstateDistrict, els.realEstateArea, els.realEstateStreet].forEach((element) => {
    element.addEventListener("input", clearRealEstateEstimate);
    element.addEventListener("change", clearRealEstateEstimate);
  });
  els.fetchRealEstateEstimateButton.addEventListener("click", fetchRealEstateEstimate);
  els.applyRealEstateEstimateButton.addEventListener("click", applyRealEstateEstimate);
  els.form.addEventListener("submit", handleSubmit);
  els.toggleEntryFormButton.addEventListener("click", () => {
    setEntryFormOpen(els.form.hidden);
  });
  els.mobileTabBar.addEventListener("click", (event) => {
    const button = event.target.closest("[data-mobile-tab]");
    if (!button) return;
    setMobileTab(button.dataset.mobileTab);
    renderEntries();
  });
  els.clearFormButton.addEventListener("click", resetForm);
  els.guideToggleButton.addEventListener("click", () => {
    setGuideOpen(els.guideBody.hidden);
  });
  els.clearLocalDataButton.addEventListener("click", clearLocalData);
  els.snapshotButton.addEventListener("click", createSnapshot);
  els.refreshAllQuotesButton.addEventListener("click", refreshAllStockQuotes);
  els.clearSnapshotsButton.addEventListener("click", async () => {
    if (!state.snapshots.length) return;
    if (!confirm("確定清除所有快照？")) return;
    await clearStore(STORE_SNAPSHOTS);
    await loadData();
    showToast("已清除快照");
  });
  els.exportButton.addEventListener("click", async () => {
    try {
      await exportData();
    } catch {
      showToast("加密備份匯出失敗");
    }
  });
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
      state.showAllEntries = false;
      renderEntries();
    });
  });

  els.entryList.addEventListener("click", async (event) => {
    const button = event.target.closest("button");
    if (!button) return;
    const { action, id } = button.dataset;
    if (action === "edit") editEntry(id);
    if (action === "update-real-estate-estimate") await updateRealEstateEstimateForEntry(id, button);
    if (action === "delete") {
      await deleteItem(STORE_ENTRIES, id);
      await loadData();
      showToast("已刪除");
    }
  });

  els.toggleEntriesButton.addEventListener("click", () => {
    state.showAllEntries = !state.showAllEntries;
    renderEntries();
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
  window.addEventListener("resize", renderEntries);

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

setupRealEstateOptions();
updateCategoryOptions();
resetForm();
resetSnapshotMonth();
if (getStoredGuideState() !== null) {
  setGuideOpen(getStoredGuideState() === "true", false);
}
bindEvents();
loadData();
registerServiceWorker();
