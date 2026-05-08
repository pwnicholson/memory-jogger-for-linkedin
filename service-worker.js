console.log('[Memory Jogger] Service worker loaded');

const BUILD_ID = '2026-05-07-23:35';
let storageAreaPreference = 'sync';
const STORAGE_AREA_PREFERENCE_KEY = 'mjliStorageAreaPreference';
const SYNC_BUCKET_PREFIX = 'mjli:bucket:v2:';
const SYNC_QUOTA_BYTES = (chrome && chrome.storage && chrome.storage.sync && chrome.storage.sync.QUOTA_BYTES) || 102400;
const SYNC_MAX_ITEMS = (chrome && chrome.storage && chrome.storage.sync && chrome.storage.sync.MAX_ITEMS) || 512;
const MIGRATION_PROMPT_KEY = 'mjliNeedsMigrationPrompt';
const MIGRATION_TARGET_KEY = 'mjliMigrationTarget';
const MIGRATION_TARGET_VERSION = 'sync-bucket-v2';
const MIGRATION_NOTICE_KEY = 'mjliShowMigrationNotice';
const MIGRATION_AUTOOPENED_KEY = 'mjliMigrationAutoOpenedTarget';

// In-memory log storage for diagnostics
let debugLogs = [];
const MAX_LOGS = 100;

function addLog(message, level = 'info') {
  const timestamp = new Date().toISOString();
  const logEntry = `[${timestamp}] [${level.toUpperCase()}] ${message}`;
  debugLogs.push(logEntry);
  if (debugLogs.length > MAX_LOGS) {
    debugLogs.shift(); // Remove oldest
  }
  console.log(logEntry);
}

function getStorageArea(areaName) {
  try {
    if (!chrome || !chrome.storage || !chrome.storage[areaName] || !chrome.runtime) return null;
    return chrome.storage[areaName];
  } catch (e) {
    return null;
  }
}

function getAllFromArea(areaName) {
  return new Promise((resolve) => {
    const area = getStorageArea(areaName);
    if (!area) {
      resolve({ ok: false, data: {}, error: 'Storage API unavailable' });
      return;
    }
    area.get(null, (result) => {
      if (chrome.runtime.lastError) {
        resolve({ ok: false, data: {}, error: chrome.runtime.lastError.message });
        return;
      }
      resolve({ ok: true, data: result || {} });
    });
  });
}

function persistStorageAreaPreference(areaName) {
  storageAreaPreference = areaName === 'local' ? 'local' : 'sync';
  try {
    chrome.storage.local.set({ [STORAGE_AREA_PREFERENCE_KEY]: storageAreaPreference });
  } catch (e) {
    // Silent - diagnostics can continue without persistence
  }
}

function loadStorageAreaPreference() {
  return new Promise((resolve) => {
    try {
      chrome.storage.local.get([STORAGE_AREA_PREFERENCE_KEY], (result) => {
        if (!chrome.runtime.lastError && result[STORAGE_AREA_PREFERENCE_KEY] === 'local') {
          storageAreaPreference = 'local';
        }
        resolve(storageAreaPreference);
      });
    } catch (e) {
      resolve(storageAreaPreference);
    }
  });
}

function inspectSyncCapacity() {
  return new Promise((resolve) => {
    try {
      chrome.storage.sync.get(null, (result) => {
        if (chrome.runtime.lastError) {
          resolve({ totalItems: null, bytesUsed: null, quotaReached: false, error: chrome.runtime.lastError.message });
          return;
        }
        const allData = result || {};
        const totalItems = Object.keys(allData).length;
        const bytesUsed = JSON.stringify(allData).length;
        resolve({
          totalItems,
          bytesUsed,
          quotaReached: totalItems >= SYNC_MAX_ITEMS || bytesUsed >= SYNC_QUOTA_BYTES,
          error: null
        });
      });
    } catch (e) {
      resolve({ totalItems: null, bytesUsed: null, quotaReached: false, error: e.message });
    }
  });
}

function hasLegacySyncKeys() {
  return new Promise((resolve) => {
    try {
      chrome.storage.sync.get(null, (result) => {
        if (chrome.runtime.lastError) {
          resolve(false);
          return;
        }
        const keys = Object.keys(result || {});
        resolve(keys.some((key) => key.startsWith('note:/') || key.startsWith('meta:/')));
      });
    } catch (e) {
      resolve(false);
    }
  });
}

function updateMigrationBadge(isEnabled) {
  try {
    if (isEnabled) {
      chrome.action.setBadgeBackgroundColor({ color: '#0a66c2' });
      chrome.action.setBadgeText({ text: 'UPD' });
      chrome.action.setTitle({ title: 'Memory Jogger updated - dashboard opened to update sync data' });
    } else {
      chrome.action.setBadgeText({ text: '' });
      chrome.action.setTitle({ title: 'Memory Jogger for LinkedIn' });
    }
  } catch (e) {
    // Silent - badge update is best effort only
  }
}

function maybeAutoOpenMigrationDashboard(trigger) {
  return new Promise((resolve) => {
    chrome.storage.local.get([
      MIGRATION_PROMPT_KEY,
      MIGRATION_TARGET_KEY,
      MIGRATION_AUTOOPENED_KEY
    ], async (localState) => {
      if (chrome.runtime.lastError) {
        resolve(false);
        return;
      }

      const hasLegacy = await hasLegacySyncKeys();

      if (!hasLegacy) {
        chrome.storage.local.set({
          [MIGRATION_PROMPT_KEY]: false,
          [MIGRATION_TARGET_KEY]: MIGRATION_TARGET_VERSION,
          [MIGRATION_NOTICE_KEY]: false,
          [MIGRATION_AUTOOPENED_KEY]: ''
        });
        updateMigrationBadge(false);
        resolve(false);
        return;
      }

      const autoOpenedTarget = localState[MIGRATION_AUTOOPENED_KEY] || '';
      const shouldAutoOpen = autoOpenedTarget !== MIGRATION_TARGET_VERSION;

      chrome.storage.local.set({
        [MIGRATION_PROMPT_KEY]: true,
        [MIGRATION_TARGET_KEY]: MIGRATION_TARGET_VERSION,
        [MIGRATION_NOTICE_KEY]: true,
        [MIGRATION_AUTOOPENED_KEY]: shouldAutoOpen ? MIGRATION_TARGET_VERSION : autoOpenedTarget
      });
      updateMigrationBadge(true);

      if (!shouldAutoOpen) {
        resolve(false);
        return;
      }

      chrome.runtime.openOptionsPage(() => {
        if (chrome.runtime.lastError) {
          addLog(`Failed to auto-open dashboard for migration (${trigger}): ${chrome.runtime.lastError.message}`, 'warn');
          resolve(false);
          return;
        }
        addLog(`Auto-opened dashboard for migration (${trigger})`);
        resolve(true);
      });
    });
  });
}

chrome.runtime.onInstalled.addListener((details) => {
  if (!details || details.reason !== 'update') return;

  chrome.storage.local.set({
    [MIGRATION_PROMPT_KEY]: true,
    [MIGRATION_TARGET_KEY]: MIGRATION_TARGET_VERSION,
    [MIGRATION_NOTICE_KEY]: true,
    [MIGRATION_AUTOOPENED_KEY]: ''
  });

  updateMigrationBadge(true);

  addLog(`Extension updated from ${details.previousVersion || 'unknown'}; dashboard prompt enabled`);
  maybeAutoOpenMigrationDashboard('install-update').catch(() => {});
});

async function getAllNotesData() {
  const preferredArea = storageAreaPreference === 'local' ? 'local' : 'sync';
  let result = await getAllFromArea(preferredArea);
  if (!result.ok && preferredArea === 'sync') {
    persistStorageAreaPreference('local');
    addLog(`Sync unavailable, switching worker storage to local: ${result.error || 'unknown error'}`, 'warn');
    result = await getAllFromArea('local');
  }
  return result.ok ? result.data : {};
}

function extractNotesFromData(data) {
  const source = data || {};
  const notes = {};

  Object.keys(source).forEach((key) => {
    if (key.startsWith('note:/') && typeof source[key] === 'string') {
      notes[key] = source[key];
    }
  });

  Object.keys(source).forEach((key) => {
    if (!key.startsWith(SYNC_BUCKET_PREFIX)) return;
    const bucket = source[key];
    if (!bucket || typeof bucket !== 'object') return;
    Object.keys(bucket).forEach((entityKey) => {
      const record = bucket[entityKey];
      if (record && typeof record === 'object' && typeof record.n === 'string') {
        notes[`note:${entityKey}`] = record.n;
      }
    });
  });

  return notes;
}

// Check Chrome sync status on startup
addLog(`Service worker initializing... build=${BUILD_ID}`);
loadStorageAreaPreference()
  .then(() => maybeAutoOpenMigrationDashboard('startup'))
  .then(() => inspectSyncCapacity())
  .then((capacity) => {
    if (capacity.quotaReached && storageAreaPreference !== 'local') {
      persistStorageAreaPreference('local');
      addLog(`Sync quota reached, preferring local storage (items=${capacity.totalItems}, bytes=${capacity.bytesUsed})`, 'warn');
    }
  })
  .catch(() => {})
  .then(() => getAllNotesData())
  .then((result) => {
    const noteCount = Object.keys(extractNotesFromData(result)).length;
    const byteUsage = JSON.stringify(result).length;
    addLog(`Storage accessible (${storageAreaPreference}), found ${noteCount} notes, using ${byteUsage} bytes`);
  })
  .catch((e) => {
    addLog(`Startup check error: ${e.message}`, 'error');
  });

// Listen for messages from content scripts and diagnostic page
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  addLog(`Message received: ${request.action}`);
  
  try {
    if (request.action === 'getAllNotes') {
      getAllNotesData().then((result) => {
        const notes = extractNotesFromData(result);
        addLog(`getAllNotes (${storageAreaPreference}): returning ${Object.keys(notes).length} notes`);
        sendResponse({ notes, totalItems: Object.keys(notes).length });
      });
      return true; // Keep channel open for async response
    }
    
    if (request.action === 'checkSyncStatus') {
      Promise.all([getAllNotesData(), inspectSyncCapacity()]).then(([result, capacity]) => {
        try {
          const notes = extractNotesFromData(result);
          const status = {
            accessible: true,
            error: null,
            storageArea: storageAreaPreference,
            noteCount: Object.keys(notes).length,
            totalItems: Object.keys(result).length,
            byteUsage: JSON.stringify(result).length,
            syncItemsUsed: capacity.totalItems,
            syncMaxItems: SYNC_MAX_ITEMS,
            syncQuotaBytes: SYNC_QUOTA_BYTES,
            syncQuotaReached: !!capacity.quotaReached,
            timestamp: new Date().toISOString()
          };
          addLog(`Storage status: ${status.accessible ? 'accessible' : 'error - ' + status.error} (area=${status.storageArea})`);
          sendResponse(status);
        } catch (e) {
          addLog(`checkSyncStatus error: ${e.message}`, 'error');
          sendResponse({ accessible: false, error: e.message });
        }
      });
      return true;
    }
    
    if (request.action === 'contentLog') {
      addLog(`[PAGE] ${request.message || ''}`);
      sendResponse({ ok: true });
      return true;
    }

    if (request.action === 'getLogs') {
      addLog('Logs requested');
      sendResponse({ logs: debugLogs.join('\n') });
      return true;
    }
    
    if (request.action === 'clearLogs') {
      debugLogs = [];
      addLog('Logs cleared');
      sendResponse({ success: true });
      return true;
    }
  } catch (e) {
    addLog(`Message handler error: ${e.message}`, 'error');
    sendResponse({ error: e.message });
  }
});

