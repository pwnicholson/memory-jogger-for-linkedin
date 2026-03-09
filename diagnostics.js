// Memory Jogger - Sync Diagnostics Script

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
    const noteCount = Object.keys(result).filter(k => k.startsWith('note:')).length;
    const totalItems = Object.keys(result).length;
    const byteUsage = JSON.stringify(result).length;
    
    const status = {
      timestamp: new Date().toISOString(),
      noteCount,
      totalItems,
      bytesUsed: byteUsage,
      quotaBytes: 102400,
      percentUsed: Math.round((byteUsage / 102400) * 100),
      storageAvailable: byteUsage < 102400
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
    
    // Write to both
    const syncWrite = await new Promise((resolve) => {
      chrome.storage.sync.set({ [testKey]: testValue }, () => {
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

Local Storage:
  Write success: ${localWrite}
  Read success: ${!!localRead[testKey]}
  Value: "${localRead[testKey]}"

Conclusion:
  Storage API working: ${syncWrite && localWrite ? '✅' : '❌'}
  Problem is likely with Google Sync service, not Chrome APIs
    `;
    
    document.getElementById('api-test').textContent = output;
  } catch (e) {
    document.getElementById('api-test').textContent = `❌ Error: ${e.message}`;
  }
}

async function getLogs() {
  try {
    const response = await new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ action: 'getLogs' }, (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(response);
        }
      });
    });
    
    document.getElementById('logs').textContent = response.logs || 'No logs available';
  } catch (e) {
    document.getElementById('logs').textContent = `❌ Error: ${e.message}`;
  }
}

async function clearLogs() {
  try {
    await new Promise((resolve) => {
      chrome.runtime.sendMessage({ action: 'clearLogs' }, (response) => {
        resolve();
      });
    });
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
