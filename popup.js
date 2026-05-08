const MIGRATION_PROMPT_KEY = 'mjliNeedsMigrationPrompt';
const STORAGE_AREA_PREFERENCE_KEY = 'mjliStorageAreaPreference';
const SYNC_BUCKET_PREFIX = 'mjli:bucket:v2:';

function setText(id, value) {
  const element = document.getElementById(id);
  if (element) {
    element.textContent = value;
  }
}

async function updateStatusPanel() {
  try {
    const manifest = chrome.runtime.getManifest();
    setText('status-version', `${manifest.version}`);

    const [syncData, localState] = await Promise.all([
      chrome.storage.sync.get(null),
      chrome.storage.local.get([STORAGE_AREA_PREFERENCE_KEY, MIGRATION_PROMPT_KEY])
    ]);

    const keys = Object.keys(syncData || {});
    const hasLegacyKeys = keys.some((key) => key.startsWith('note:/') || key.startsWith('meta:/'));
    const bucketKeys = keys.filter((key) => key.startsWith(SYNC_BUCKET_PREFIX));
    const hasBucketData = bucketKeys.length > 0;

    const isLocalMode = localState[STORAGE_AREA_PREFERENCE_KEY] === 'local';

    let syncFormat = 'No synced notes yet';
    if (hasLegacyKeys) {
      syncFormat = hasBucketData ? 'Migration in progress or mixed data' : 'Legacy format still present';
    } else if (hasBucketData) {
      syncFormat = 'Compacted current format';
    }

    if (localState[MIGRATION_PROMPT_KEY] && !hasLegacyKeys) {
      syncFormat = 'Compacted current format';
    }

    const storageMode = isLocalMode
      ? 'Local fallback active'
      : 'Sync preferred';

    if (isLocalMode) {
      syncFormat = hasLegacyKeys
        ? 'Local mode active (legacy sync data retained)'
        : 'Local mode active';
    }

    setText('status-sync-format', syncFormat);
    setText('status-storage-mode', storageMode);
  } catch (e) {
    setText('status-sync-format', 'Unable to determine');
    setText('status-storage-mode', 'Unable to determine');
  }
}

function clearMigrationPrompt() {
  try {
    chrome.storage.local.set({ [MIGRATION_PROMPT_KEY]: false });
    chrome.action.setBadgeText({ text: '' });
  } catch (e) {
    // Best effort only
  }
}

// Handle opening the options page
document.getElementById('open-dashboard').addEventListener('click', () => {
  clearMigrationPrompt();
  chrome.runtime.openOptionsPage();
});

try {
  chrome.storage.local.get([MIGRATION_PROMPT_KEY, STORAGE_AREA_PREFERENCE_KEY], (result) => {
    if (chrome.runtime.lastError) return;
    const isLocalMode = result[STORAGE_AREA_PREFERENCE_KEY] === 'local';
    const shouldShowUpdatePrompt = !isLocalMode && !!result[MIGRATION_PROMPT_KEY];
    const notice = document.getElementById('update-notice');
    if (notice) {
      notice.classList.toggle('visible', shouldShowUpdatePrompt);
    }
    if (isLocalMode && result[MIGRATION_PROMPT_KEY]) {
      clearMigrationPrompt();
    }
  });
} catch (e) {
  // Silent
}

updateStatusPanel();
