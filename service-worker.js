console.log('[Memory Jogger] Service worker loaded');

// Check Chrome sync status
chrome.storage.sync.get(null, (result) => {
  if (chrome.runtime.lastError) {
    console.error('[Memory Jogger] Storage API error:', chrome.runtime.lastError);
  } else {
    const noteCount = Object.keys(result).filter(k => k.startsWith('note:')).length;
    console.log('[Memory Jogger] Service worker: Storage accessible, found', noteCount, 'notes');
  }
});

// Listen for messages from content scripts
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'getAllNotes') {
    chrome.storage.sync.get(null, (result) => {
      const notes = {};
      Object.keys(result).forEach(key => {
        if (key.startsWith('note:')) {
          notes[key] = result[key];
        }
      });
      sendResponse({ notes, totalItems: Object.keys(notes).length });
    });
    return true; // Keep channel open for async response
  }
});

// Listen for sync status checks
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'checkSyncStatus') {
    chrome.storage.sync.get(null, (result) => {
      const status = {
        accessible: !chrome.runtime.lastError,
        error: chrome.runtime.lastError ? chrome.runtime.lastError.message : null,
        noteCount: Object.keys(result).filter(k => k.startsWith('note:')).length,
        totalItems: Object.keys(result).length
      };
      console.log('[Memory Jogger] Sync status check:', status);
      sendResponse(status);
    });
    return true;
  }
});

