console.log('[Memory Jogger] Service worker loaded');

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

// Log storage info when service worker starts
chrome.storage.sync.get(null, (result) => {
  const noteCount = Object.keys(result).filter(k => k.startsWith('note:')).length;
  console.log('[Memory Jogger] Service worker sync status: ', noteCount, 'notes in storage');
});
