// Memory Jogger - Sync Diagnostics Script

const PAGE_DEBUG_LOGS_KEY = 'mjliPageDebugLogs';

async function getMachineInfo() {
  const info = {
    timestamp: new Date().toISOString(),
    userAgent: navigator.userAgent,
    platform: navigator.platform,
    url: window.location.href
  };
  
  // Try to get Chrome version from user agent
  const chromeMatch = navigator.userAgent.match(/Chrome\/([0-9.]+)/);
  if (chromeMatch) {
    info.chromeVersion = chromeMatch[1];
  }
  
  document.getElementById('machine-info').textContent = JSON.stringify(info, null, 2);
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

async function checkStorageStatus() {
  try {
    const result = await chrome.storage.sync.get(null);
    const totalItems = Object.keys(result).length;
    const byteUsage = JSON.stringify(result).length;
    const syncStatus = await new Promise((resolve) => {
      chrome.runtime.sendMessage({ action: 'checkSyncStatus' }, (response) => {
        resolve(chrome.runtime.lastError ? null : (response || null));
      });
    });
    const noteCount = syncStatus && typeof syncStatus.noteCount === 'number'
      ? syncStatus.noteCount
      : Object.keys(result).filter(k => k.startsWith('note:')).length;
    
    const status = {
      timestamp: new Date().toISOString(),
      noteCount,
      totalItems,
      bytesUsed: byteUsage,
      quotaBytes: 102400,
      percentUsed: Math.round((byteUsage / 102400) * 100),
      storageAvailable: byteUsage < 102400,
      syncItemsUsed: syncStatus && typeof syncStatus.syncItemsUsed === 'number' ? syncStatus.syncItemsUsed : totalItems,
      syncItemLimit: syncStatus && typeof syncStatus.syncMaxItems === 'number' ? syncStatus.syncMaxItems : 512,
      syncQuotaReached: !!(syncStatus && syncStatus.syncQuotaReached),
      activeStorageArea: syncStatus && syncStatus.storageArea ? syncStatus.storageArea : 'sync'
    };
    
    let output = JSON.stringify(status, null, 2);
    
    // Add human-readable summary before the JSON
    const summary = `You've used ${status.percentUsed}% of your storage (${formatBytes(status.bytesUsed)} / ${formatBytes(status.quotaBytes)})\n\n`;
    output = summary + output;
    
    // Add warning if capacity is at 85% or higher
    if (status.percentUsed >= 85) {
      output = `⚠️ WARNING: Your space for storing synced notes is at ${status.percentUsed}% capacity. Unfortunately, this is a Chrome limitation.\n\n${output}`;
    }
    
    document.getElementById('storage-status').textContent = output;
  } catch (e) {
    document.getElementById('storage-status').textContent = `Error: ${e.message}`;
  }
}

async function getAllStorage() {
  try {
    const result = await chrome.storage.sync.get(null);
    const output = {
      timestamp: new Date().toISOString(),
      totalItems: Object.keys(result).length,
      data: result
    };
    document.getElementById('storage-status').textContent = JSON.stringify(output, null, 2);
  } catch (e) {
    document.getElementById('storage-status').textContent = `Error: ${e.message}`;
  }
}

async function clearAllStorage() {
  if (!confirm('Are you SURE? This will DELETE ALL NOTES. This cannot be undone.')) {
    return;
  }
  if (!confirm('Really? ALL notes will be GONE. Last chance to cancel.')) {
    return;
  }
  
  try {
    const result = await chrome.storage.sync.get(null);
    const keys = Object.keys(result);
    await new Promise((resolve) => {
      chrome.storage.sync.remove(keys, () => resolve());
    });
    document.getElementById('storage-status').textContent = `Deleted ${keys.length} items`;
  } catch (e) {
    document.getElementById('storage-status').textContent = `Error: ${e.message}`;
  }
}

async function writeTestData() {
  try {
    const key = `note:${document.getElementById('test-key').value}`;
    const note = document.getElementById('test-note').value;
    
    await new Promise((resolve) => {
      chrome.storage.sync.set({ [key]: note }, () => {
        if (chrome.runtime.lastError) {
          resolve(`Error: ${chrome.runtime.lastError.message}`);
        } else {
          resolve('Success: Data written to chrome.storage.sync. Sync should propagate in 30-60 seconds.');
        }
      });
    });
    
    const result = await chrome.storage.sync.get([key]);
    document.getElementById('sync-test').textContent = 
      `✅ Data written successfully\n\nVerified in local storage:\n${JSON.stringify(result, null, 2)}\n\nNow check other machines to see if it appears!`;
  } catch (e) {
    document.getElementById('sync-test').textContent = `❌ Error: ${e.message}`;
  }
}

async function readTestData() {
  try {
    const key = `note:${document.getElementById('test-key').value}`;
    const result = await chrome.storage.sync.get([key]);
    
    if (result[key]) {
      document.getElementById('sync-test').textContent = `✅ Found!\n\n${JSON.stringify(result, null, 2)}`;
    } else {
      document.getElementById('sync-test').textContent = `❌ Not found in storage. Key: ${key}`;
    }
  } catch (e) {
    document.getElementById('sync-test').textContent = `❌ Error: ${e.message}`;
  }
}

async function checkSyncStatus2() {
  try {
    // Send message to service worker to check sync
    const response = await new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ action: 'checkSyncStatus' }, (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(response);
        }
      });
    });
    
    document.getElementById('sync-test').textContent = 
      `✅ Service worker responded:\n\n${JSON.stringify(response, null, 2)}`;
  } catch (e) {
    document.getElementById('sync-test').textContent = `❌ Error: ${e.message}`;
  }
}

async function deleteTestData() {
  try {
    const key = `note:${document.getElementById('test-key').value}`;
    await new Promise((resolve) => {
      chrome.storage.sync.remove([key], () => resolve());
    });
    document.getElementById('sync-test').textContent = `✅ Test data deleted`;
  } catch (e) {
    document.getElementById('sync-test').textContent = `❌ Error: ${e.message}`;
  }
}

async function testStorageAPI() {
  try {
    const testData = {
      'test:sync': 'Testing chrome.storage.sync',
      'test:local': 'Testing chrome.storage.local'
    };
    
    // Test sync
    await new Promise((resolve) => {
      chrome.storage.sync.set(testData, () => resolve());
    });
    
    const syncResult = await chrome.storage.sync.get(['test:sync']);
    
    // Test local
    await new Promise((resolve) => {
      chrome.storage.local.set(testData, () => resolve());
    });
    
    const localResult = await chrome.storage.local.get(['test:local']);
    
    // Clean up - use proper API calls
    await new Promise((resolve) => {
      chrome.storage.sync.remove(['test:sync'], () => resolve());
    });
    await new Promise((resolve) => {
      chrome.storage.local.remove(['test:local'], () => resolve());
    });
    
    const output = {
      timestamp: new Date().toISOString(),
      syncAccessible: !!syncResult['test:sync'],
      syncValue: syncResult['test:sync'],
      localAccessible: !!localResult['test:local'],
      localValue: localResult['test:local'],
      bothWorking: syncResult['test:sync'] && localResult['test:local']
    };
    
    document.getElementById('api-test').textContent = JSON.stringify(output, null, 2);
  } catch (e) {
    document.getElementById('api-test').textContent = `❌ Error: ${e.message}`;
  }
}

async function testSyncVsLocal() {
  try {
    const testKey = `comparison:${Date.now()}`;
    const testValue = `Test at ${new Date().toISOString()}`;
    let syncWriteError = null;
    
    // Write to both
    const syncWrite = await new Promise((resolve) => {
      chrome.storage.sync.set({ [testKey]: testValue }, () => {
        syncWriteError = chrome.runtime.lastError ? chrome.runtime.lastError.message : null;
        resolve(chrome.runtime.lastError ? false : true);
      });
    });
    
    const localWrite = await new Promise((resolve) => {
      chrome.storage.local.set({ [testKey]: testValue }, () => {
        resolve(chrome.runtime.lastError ? false : true);
      });
    });
    
    // Read back
    const syncRead = await chrome.storage.sync.get([testKey]);
    const localRead = await chrome.storage.local.get([testKey]);

    const syncStatus = await new Promise((resolve) => {
      chrome.runtime.sendMessage({ action: 'checkSyncStatus' }, (response) => {
        resolve(chrome.runtime.lastError ? null : (response || null));
      });
    });
    
    // Cleanup - use proper API calls
    await new Promise((resolve) => {
      chrome.storage.sync.remove([testKey], () => resolve());
    });
    await new Promise((resolve) => {
      chrome.storage.local.remove([testKey], () => resolve());
    });
    
    const output = `
Sync Storage:
  Write success: ${syncWrite}
  Read success: ${!!syncRead[testKey]}
  Value: "${syncRead[testKey]}"
  Error: ${syncWriteError || 'none'}

Local Storage:
  Write success: ${localWrite}
  Read success: ${!!localRead[testKey]}
  Value: "${localRead[testKey]}"

Conclusion:
  Storage API working: ${localWrite ? '✅' : '❌'}
  ${!syncWrite && /kMaxItems|quota/i.test(syncWriteError || '')
      ? `Sync storage is full (${syncStatus && typeof syncStatus.syncItemsUsed === 'number' ? `${syncStatus.syncItemsUsed}/${syncStatus.syncMaxItems} items` : 'item quota reached'}), so new notes are being routed to local storage.`
      : (!syncWrite ? 'Sync write failed for a reason other than quota; inspect the error above.' : 'Both storage areas accepted the test write.')}
    `;
    
    document.getElementById('api-test').textContent = output;
  } catch (e) {
    document.getElementById('api-test').textContent = `❌ Error: ${e.message}`;
  }
}

async function getLogs() {
  try {
    let workerLogs = '';
    try {
      const response = await new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({ action: 'getLogs' }, (resp) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else {
            resolve(resp || {});
          }
        });
      });
      workerLogs = response.logs || '';
    } catch (e) {
      workerLogs = `⚠️ Could not fetch service worker logs: ${e.message}`;
    }

    const localResult = await chrome.storage.local.get([PAGE_DEBUG_LOGS_KEY]);
    const pageLogsArray = Array.isArray(localResult[PAGE_DEBUG_LOGS_KEY]) ? localResult[PAGE_DEBUG_LOGS_KEY] : [];
    const pageLogs = pageLogsArray.join('\n');

    const sections = [
      '=== SERVICE WORKER LOGS ===',
      workerLogs || '(none)',
      '',
      '=== PAGE DEBUG LOGS (PERSISTENT) ===',
      pageLogs || '(none)'
    ];

    document.getElementById('logs').textContent = sections.join('\n');
  } catch (e) {
    document.getElementById('logs').textContent = `❌ Error: ${e.message}`;
  }
}

async function clearLogs() {
  try {
    await new Promise((resolve) => {
      chrome.runtime.sendMessage({ action: 'clearLogs' }, () => {
        resolve();
      });
    });
    await chrome.storage.local.remove([PAGE_DEBUG_LOGS_KEY]);
    document.getElementById('logs').textContent = '✅ Logs cleared';
  } catch (e) {
    document.getElementById('logs').textContent = `❌ Error: ${e.message}`;
  }
}

// Initialize on page load
window.addEventListener('load', () => {
  document.getElementById('machine-info-btn').addEventListener('click', getMachineInfo);
  document.getElementById('storage-status-btn').addEventListener('click', checkStorageStatus);
  document.getElementById('all-storage-btn').addEventListener('click', getAllStorage);
  document.getElementById('clear-storage-btn').addEventListener('click', clearAllStorage);
  document.getElementById('write-test-btn').addEventListener('click', writeTestData);
  document.getElementById('read-test-btn').addEventListener('click', readTestData);
  document.getElementById('sync-status-btn').addEventListener('click', checkSyncStatus2);
  document.getElementById('delete-test-btn').addEventListener('click', deleteTestData);
  document.getElementById('api-test-btn').addEventListener('click', testStorageAPI);
  document.getElementById('sync-compare-btn').addEventListener('click', testSyncVsLocal);
  document.getElementById('logs-btn').addEventListener('click', getLogs);
  document.getElementById('clear-logs-btn').addEventListener('click', clearLogs);
  
  getMachineInfo();
  checkStorageStatus();
});
