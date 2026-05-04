console.log('[Memory Jogger] Service worker loaded');

const BUILD_ID = '2026-05-04-22:45';

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

// Check Chrome sync status on startup
addLog(`Service worker initializing... build=${BUILD_ID}`);
chrome.storage.sync.get(null, (result) => {
  try {
    if (chrome.runtime.lastError) {
      addLog(`Storage API error: ${chrome.runtime.lastError.message}`, 'error');
    } else {
      const noteCount = Object.keys(result).filter(k => k.startsWith('note:')).length;
      const byteUsage = JSON.stringify(result).length;
      addLog(`Storage accessible, found ${noteCount} notes, using ${byteUsage} bytes`);
    }
  } catch (e) {
    addLog(`Startup check error: ${e.message}`, 'error');
  }
});

// Listen for messages from content scripts and diagnostic page
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  addLog(`Message received: ${request.action}`);
  
  try {
    if (request.action === 'getAllNotes') {
      chrome.storage.sync.get(null, (result) => {
        const notes = {};
        Object.keys(result).forEach(key => {
          if (key.startsWith('note:')) {
            notes[key] = result[key];
          }
        });
        addLog(`getAllNotes: returning ${Object.keys(notes).length} notes`);
        sendResponse({ notes, totalItems: Object.keys(notes).length });
      });
      return true; // Keep channel open for async response
    }
    
    if (request.action === 'checkSyncStatus') {
      chrome.storage.sync.get(null, (result) => {
        try {
          const status = {
            accessible: !chrome.runtime.lastError,
            error: chrome.runtime.lastError ? chrome.runtime.lastError.message : null,
            noteCount: Object.keys(result).filter(k => k.startsWith('note:')).length,
            totalItems: Object.keys(result).length,
            byteUsage: JSON.stringify(result).length,
            timestamp: new Date().toISOString()
          };
          addLog(`Sync status: ${status.accessible ? 'accessible' : 'error - ' + status.error}`);
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

