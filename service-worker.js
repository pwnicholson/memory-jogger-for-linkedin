console.log('[Memory Jogger] Service worker loaded');

const BUILD_ID = '2026-05-06-19:55';
let storageAreaPreference = 'sync';

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

async function getAllNotesData() {
  const preferredArea = storageAreaPreference === 'local' ? 'local' : 'sync';
  let result = await getAllFromArea(preferredArea);
  if (!result.ok && preferredArea === 'sync') {
    storageAreaPreference = 'local';
    addLog(`Sync unavailable, switching worker storage to local: ${result.error || 'unknown error'}`, 'warn');
    result = await getAllFromArea('local');
  }
  return result.ok ? result.data : {};
}

// Check Chrome sync status on startup
addLog(`Service worker initializing... build=${BUILD_ID}`);
getAllNotesData()
  .then((result) => {
    const noteCount = Object.keys(result).filter(k => k.startsWith('note:')).length;
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
        const notes = {};
        Object.keys(result).forEach(key => {
          if (key.startsWith('note:')) {
            notes[key] = result[key];
          }
        });
        addLog(`getAllNotes (${storageAreaPreference}): returning ${Object.keys(notes).length} notes`);
        sendResponse({ notes, totalItems: Object.keys(notes).length });
      });
      return true; // Keep channel open for async response
    }
    
    if (request.action === 'checkSyncStatus') {
      getAllNotesData().then((result) => {
        try {
          const status = {
            accessible: true,
            error: null,
            storageArea: storageAreaPreference,
            noteCount: Object.keys(result).filter(k => k.startsWith('note:')).length,
            totalItems: Object.keys(result).length,
            byteUsage: JSON.stringify(result).length,
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

