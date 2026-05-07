(async () => {
  console.log('[Memory Jogger] Options page loaded');

  const notesList = document.getElementById('mjli-notes-list');
  const storageInfo = document.getElementById('mjli-storage-usage');
  const exportBtn = document.getElementById('mjli-export-btn');
  const importBtn = document.getElementById('mjli-import-btn');
  const importFile = document.getElementById('mjli-import-file');
  const editModal = document.getElementById('mjli-edit-modal');
  const modalClose = document.getElementById('mjli-modal-close');
  const modalCancel = document.getElementById('mjli-modal-cancel');
  const modalSave = document.getElementById('mjli-modal-save');
  const editTextarea = document.getElementById('mjli-edit-textarea');
  const editCounter = document.getElementById('mjli-edit-counter');
  const editProfileName = document.getElementById('mjli-edit-profile-name');
  const editConnectedOn = document.getElementById('mjli-edit-connected-on');
  const modalConnectedRow = document.getElementById('mjli-modal-connected-row');
  const searchInput = document.getElementById('mjli-search-input');
  const devLoggingToggle = document.getElementById('mjli-dev-logging-toggle');
  const tabPeople = document.getElementById('mjli-tab-people');
  const tabCompanies = document.getElementById('mjli-tab-companies');
  const dateFormatSelect = document.getElementById('mjli-date-format');

  let activeTab = 'people'; // 'people' | 'companies'
  let dateFormatPreference = 'yyyy-mm-dd'; // 'yyyy-mm-dd' | 'mm-dd-yyyy' | 'dd-mm-yyyy'
  let storageAreaPreference = 'sync';

  const DEV_LOGGING_KEY = 'mjliDevLoggingEnabled';
  const DATE_FORMAT_KEY = 'mjliDateFormatPreference';

  let currentEditingKey = null;
  let allNotesData = {}; // Cache for filtering

  function getStorageArea(areaName) {
    try {
      if (!chrome || !chrome.storage || !chrome.storage[areaName] || !chrome.runtime) return null;
      return chrome.storage[areaName];
    } catch (e) {
      return null;
    }
  }

  function storageAreaGet(areaName, query) {
    return new Promise((resolve) => {
      const area = getStorageArea(areaName);
      if (!area) {
        resolve({ ok: false, data: {}, error: 'Storage API unavailable' });
        return;
      }
      area.get(query, (result) => {
        if (chrome.runtime.lastError) {
          resolve({ ok: false, data: {}, error: chrome.runtime.lastError.message });
          return;
        }
        resolve({ ok: true, data: result || {} });
      });
    });
  }

  function storageAreaSet(areaName, data) {
    return new Promise((resolve) => {
      const area = getStorageArea(areaName);
      if (!area) {
        resolve({ ok: false, error: 'Storage API unavailable' });
        return;
      }
      area.set(data, () => {
        if (chrome.runtime.lastError) {
          resolve({ ok: false, error: chrome.runtime.lastError.message });
          return;
        }
        resolve({ ok: true });
      });
    });
  }

  function storageAreaRemove(areaName, keys) {
    return new Promise((resolve) => {
      const area = getStorageArea(areaName);
      if (!area) {
        resolve({ ok: false, error: 'Storage API unavailable' });
        return;
      }
      area.remove(keys, () => {
        if (chrome.runtime.lastError) {
          resolve({ ok: false, error: chrome.runtime.lastError.message });
          return;
        }
        resolve({ ok: true });
      });
    });
  }

  // --- Storage Helpers ---
  async function storageGet(key) {
    try {
      const preferredArea = storageAreaPreference === 'local' ? 'local' : 'sync';
      let result = await storageAreaGet(preferredArea, [key]);
      if (!result.ok && preferredArea === 'sync') {
        storageAreaPreference = 'local';
        console.log('[Memory Jogger] Sync unavailable, switching options storage to local:', result.error || 'unknown error');
        result = await storageAreaGet('local', [key]);
      }
      return result.ok ? (result.data[key] || '') : '';
    } catch (e) {
      return '';
    }
  }

  async function storageSet(key, value) {
    try {
      const preferredArea = storageAreaPreference === 'local' ? 'local' : 'sync';
      let result = await storageAreaSet(preferredArea, { [key]: value });
      if (!result.ok && preferredArea === 'sync') {
        storageAreaPreference = 'local';
        console.log('[Memory Jogger] Sync unavailable, switching options storage to local:', result.error || 'unknown error');
        result = await storageAreaSet('local', { [key]: value });
      }
      if (!result.ok) {
        console.log('[Memory Jogger] Save failed:', key, result.error || 'unknown error');
      }
    } catch (e) {
      // Silent
    }
  }

  async function storageGetAll() {
    try {
      const preferredArea = storageAreaPreference === 'local' ? 'local' : 'sync';
      let result = await storageAreaGet(preferredArea, null);
      if (!result.ok && preferredArea === 'sync') {
        storageAreaPreference = 'local';
        console.log('[Memory Jogger] Sync unavailable, switching options storage to local:', result.error || 'unknown error');
        result = await storageAreaGet('local', null);
      }
      return result.ok ? (result.data || {}) : {};
    } catch (e) {
      return {};
    }
  }

  async function storageRemove(key) {
    try {
      const preferredArea = storageAreaPreference === 'local' ? 'local' : 'sync';
      let result = await storageAreaRemove(preferredArea, [key]);
      if (!result.ok && preferredArea === 'sync') {
        storageAreaPreference = 'local';
        console.log('[Memory Jogger] Sync unavailable, switching options storage to local:', result.error || 'unknown error');
        result = await storageAreaRemove('local', [key]);
      }
      if (!result.ok) {
        console.log('[Memory Jogger] Delete failed:', key, result.error || 'unknown error');
      }
    } catch (e) {
      // Silent
    }
  }

  function getLocalSetting(key, fallbackValue) {
    return new Promise((resolve) => {
      try {
        chrome.storage.local.get([key], (result) => {
          if (chrome.runtime.lastError) {
            resolve(fallbackValue);
            return;
          }
          resolve(typeof result[key] === 'undefined' ? fallbackValue : result[key]);
        });
      } catch (e) {
        resolve(fallbackValue);
      }
    });
  }

  function setLocalSetting(key, value) {
    return new Promise((resolve) => {
      try {
        chrome.storage.local.set({ [key]: value }, () => resolve());
      } catch (e) {
        resolve();
      }
    });
  }

  function updateDevLoggingToggleStyle(isEnabled) {
    const wrapper = devLoggingToggle ? devLoggingToggle.closest('.mjli-dev-toggle') : null;
    if (!wrapper) return;
    wrapper.classList.toggle('is-enabled', !!isEnabled);
  }

  async function loadDateFormatPreference() {
    const format = await getLocalSetting(DATE_FORMAT_KEY, 'yyyy-mm-dd');
    dateFormatPreference = format;
    if (dateFormatSelect) {
      dateFormatSelect.value = format;
    }
  }

  async function loadDevLoggingSetting() {
    if (!devLoggingToggle) return;
    const isEnabled = await getLocalSetting(DEV_LOGGING_KEY, false);
    devLoggingToggle.checked = !!isEnabled;
    updateDevLoggingToggleStyle(isEnabled);
  }

  // --- Utility Functions ---
  function escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  }

  function formatDateForDisplay(isoDate) {
    if (!isoDate || !/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return isoDate || '';
    const [year, month, day] = isoDate.split('-');
    switch (dateFormatPreference) {
      case 'mm-dd-yyyy':
        return `${month}-${day}-${year}`;
      case 'dd-mm-yyyy':
        return `${day}-${month}-${year}`;
      case 'yyyy-mm-dd':
      default:
        return isoDate;
    }
  }

  function getInitials(name) {
    return name.split(' ').map(part => part[0]).join('').toUpperCase().substring(0, 2);
  }

  function formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  }

  // --- Update Storage Info ---
  async function updateStorageInfo() {
    const allData = await storageGetAll();
    const noteKeys = Object.keys(allData).filter(k => k.startsWith('note:'));
    const totalBytes = JSON.stringify(allData).length;
    const quotaBytes = 102400; // chrome.storage.sync quota
    const percentUsed = Math.round((totalBytes / quotaBytes) * 100);
    
    storageInfo.textContent = `${formatBytes(totalBytes)} / ${formatBytes(quotaBytes)} (${percentUsed}%) · ${noteKeys.length} note${noteKeys.length !== 1 ? 's' : ''}`;
  }

  // --- Load and Display Notes ---
  async function loadAndDisplayNotes(filterText = '') {
    notesList.innerHTML = '<div class="mjli-loading">Loading notes...</div>';
    
    const allData = await storageGetAll();
    const prefix = activeTab === 'people' ? 'note:/in/' : 'note:/company/';
    const noteEntries = Object.entries(allData).filter(([key]) => key.startsWith(prefix));
    
    allNotesData = {}; // Store for filtering
    
    await updateStorageInfo();

    if (noteEntries.length === 0) {
      const emptyMsg = activeTab === 'people'
        ? 'Your saved notes will appear here. Add notes when viewing profiles on LinkedIn!'
        : 'Your saved company notes will appear here. Add notes when viewing company pages on LinkedIn!';
      notesList.innerHTML = `
        <div class="mjli-empty-state">
          <div class="mjli-empty-state-icon">📭</div>
          <h3>No notes yet</h3>
          <p>${emptyMsg}</p>
        </div>
      `;
      return;
    }

    notesList.innerHTML = '';
    
    // Build notes data with metadata
    const filter = filterText.toLowerCase();
    let matchedCount = 0;

    for (const [key, noteText] of noteEntries) {
      const profileKey = key.replace('note:', '');
      const metaKey = key.replace('note:', 'meta:');
      const isCompany = activeTab === 'companies';
      // For people: strip /in/ prefix; for companies: strip /company/ prefix
      const profileName = isCompany
        ? profileKey.replace('/company/', '')
        : profileKey.replace('/in/', '');
      
      // Build displayName with multiple fallback strategies
      let displayName = '';
      let initials = '';
      let connectedDate = '';
      
      // Strategy 1: Try to load from metadata first
      if (allData[metaKey]) {
        try {
          const metadata = JSON.parse(allData[metaKey]);
          // Only use metadata name if it's a valid, non-empty string
          if (metadata.name && metadata.name.trim() && metadata.name.length > 1) {
            // Extra validation: reject names that look like UI artifacts
            const name = metadata.name.trim();
            // Skip if it starts with special characters like "(1)", "[", etc
            if (!/^[\(\[\{]/.test(name) && !/^[\d\-]+$/.test(name)) {
              displayName = name;
            }
          }
          // Only store connected date for profile pages, not companies
          if (!isCompany && typeof metadata.con === 'string' && metadata.con.trim()) {
            connectedDate = metadata.con.trim();
          }
        } catch (e) {
          // Metadata parse error, continue to fallback
        }
      }
      
      // Strategy 2: If no valid metadata name, create from profile/company URL
      if (!displayName) {
        if (isCompany) {
          // Company slug: google-deepmind → "Google Deepmind"
          displayName = profileName
            .split('-')
            .map(part => part.length > 0 ? part.charAt(0).toUpperCase() + part.slice(1).toLowerCase() : '')
            .filter(part => part.length > 0)
            .join(' ') || profileName;
        } else {
          // Try to extract just the name parts (remove numeric user IDs if present)
          // LinkedIn URLs like /in/matt-jalove-07057551 should become "Matt Jalove" not "Matt Jalove 07057551"
          let nameFromUrl = profileName;
          
          // Remove trailing numeric ID (common pattern: name-number)
          // Match last segment if it's all numbers, and remove it
          nameFromUrl = nameFromUrl.replace(/-\d+$/, '');
          
          // Now convert remaining URL to a name
          // /in/charles-settles -> "Charles Settles"
          displayName = nameFromUrl
            .split('-')
            .map(part => {
              // Capitalize first letter, lowercase rest
              if (part.length === 0 || /^\d+$/.test(part)) return '';
              return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
            })
            .filter(part => part.length > 0)
            .join(' ');
          
          // Fallback if everything filtered out
          if (!displayName || displayName.length === 0) {
            displayName = profileName.replace(/-/g, ' ').replace(/\d+/g, '').trim() || profileName;
          }
        }
      }
      
      // Generate initials from displayName
      initials = getInitials(displayName || profileName);

      // Store for reference
      allNotesData[key] = {
        profileKey,
        displayName,
        profileImage: '',
        profileName,
        noteText,
        initials,
        connectedDate
      };

      // Filter logic
      if (filter) {
        const matchesDisplay = displayName.toLowerCase().includes(filter);
        const matchesProfileKey = profileKey.toLowerCase().includes(filter);
        const matchesNoteText = noteText.toLowerCase().includes(filter);
        
        if (!matchesDisplay && !matchesProfileKey && !matchesNoteText) {
          continue;
        }
      }

      matchedCount++;

      // Create note item
      const noteItem = document.createElement('div');
      noteItem.className = 'mjli-note-item';
      const avatarClass = isCompany ? 'mjli-profile-avatar mjli-company-avatar' : 'mjli-profile-avatar';
      
      noteItem.innerHTML = `
        <div class="mjli-note-item-header">
          <div class="mjli-note-item-profile">
            <div class="${avatarClass}">${escapeHtml(initials)}</div>
            <div class="mjli-profile-details">
              <a href="https://www.linkedin.com${profileKey}" target="_blank" class="mjli-profile-name">
                ${escapeHtml(displayName)}
              </a>
              <a href="https://www.linkedin.com${profileKey}" target="_blank" class="mjli-profile-key">
                ${escapeHtml(profileKey)}
              </a>
            </div>
          </div>
          <div class="mjli-note-item-actions">
            <button class="mjli-btn-secondary mjli-edit-note-btn" data-key="${escapeHtml(key)}">Edit</button>
            <button class="mjli-btn-danger mjli-delete-note-btn" data-key="${escapeHtml(key)}">Delete</button>
          </div>
        </div>
        <div class="mjli-note-item-content">${escapeHtml(noteText)}</div>
        <div class="mjli-note-metadata">
          ${noteText.length} characters${connectedDate ? ` · Connected: ${formatDateForDisplay(connectedDate)}` : ''}
        </div>
      `;


      // Edit button listener
      noteItem.querySelector('.mjli-edit-note-btn').addEventListener('click', (e) => {
        const key = e.target.getAttribute('data-key');
        const data = allNotesData[key];
        if (data) {
          openEditModal(key, data.displayName, data.noteText);
        }
      });

      // Delete button listener
      noteItem.querySelector('.mjli-delete-note-btn').addEventListener('click', async (e) => {
        const key = e.target.getAttribute('data-key');
        const data = allNotesData[key];
        const name = data ? data.displayName : 'this person';
        if (confirm(`Delete note for ${name}?`)) {
          await storageRemove(key);
          // Also try to remove metadata
          const metaKey = key.replace('note:', 'meta:');
          await storageRemove(metaKey);
          loadAndDisplayNotes(filterText);
        }
      });

      notesList.appendChild(noteItem);
    }

    // Show filter results message if filtering
    if (filter && matchedCount === 0) {
      notesList.innerHTML = `
        <div class="mjli-empty-state">
          <div class="mjli-empty-state-icon">🔍</div>
          <h3>No matches found</h3>
          <p>No notes match "<strong>${escapeHtml(filter)}</strong>"</p>
        </div>
      `;
    } else if (filter && matchedCount < noteEntries.length) {
      const summary = document.createElement('div');
      summary.className = 'mjli-filter-summary';
      summary.textContent = `Showing ${matchedCount} of ${noteEntries.length} notes`;
      notesList.insertBefore(summary, notesList.firstChild);
    }
  }

  // --- Edit Modal ---
  function openEditModal(key, profileName, noteText) {
    currentEditingKey = key;
    editProfileName.textContent = profileName.replace(/-/g, ' ');
    editTextarea.value = noteText;
    const data = allNotesData[key];
    const isCompanyEditModal = activeTab === 'companies';
    
    // Show/hide connected date field based on whether editing company or person
    if (modalConnectedRow) {
      modalConnectedRow.style.display = isCompanyEditModal ? 'none' : 'flex';
    }
    
    if (editConnectedOn && !isCompanyEditModal) {
      editConnectedOn.value = data && data.connectedDate ? data.connectedDate : '';
    }
    updateEditCounter();
    editModal.style.display = 'flex';
    editTextarea.focus();
  }

  function closeEditModal() {
    editModal.style.display = 'none';
    currentEditingKey = null;
  }

  function updateEditCounter() {
    editCounter.textContent = `${editTextarea.value.length} / 200`;
  }

  // Modal event listeners
  modalClose.addEventListener('click', closeEditModal);
  modalCancel.addEventListener('click', closeEditModal);
  editTextarea.addEventListener('input', updateEditCounter);

  modalSave.addEventListener('click', async () => {
    if (!currentEditingKey) return;
    
    const newText = editTextarea.value.trim();
    const isCompanySave = activeTab === 'companies';
    const connectedOn = !isCompanySave && editConnectedOn ? editConnectedOn.value.trim() : '';
    await storageSet(currentEditingKey, newText);

    const metaKey = currentEditingKey.replace('note:', 'meta:');
    const existingMetaRaw = await storageGet(metaKey);
    let meta = {};
    if (existingMetaRaw) {
      try {
        meta = JSON.parse(existingMetaRaw);
      } catch (e) {}
    }
    if (connectedOn) {
      meta.con = connectedOn;
    } else {
      delete meta.con;
    }
    await storageSet(metaKey, JSON.stringify(meta));

    closeEditModal();
    loadAndDisplayNotes();
  });

  // Close modal on escape key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && editModal.style.display === 'flex') {
      closeEditModal();
    }
  });

  // --- Tab Switching ---
  function setActiveTab(tab) {
    activeTab = tab;
    tabPeople.classList.toggle('is-active', tab === 'people');
    tabCompanies.classList.toggle('is-active', tab === 'companies');
    if (searchInput) {
      searchInput.placeholder = tab === 'people'
        ? 'Search people notes by name or content...'
        : 'Search company notes by name or content...';
      searchInput.value = '';
    }
    loadAndDisplayNotes();
  }

  if (tabPeople) {
    tabPeople.addEventListener('click', () => setActiveTab('people'));
  }
  if (tabCompanies) {
    tabCompanies.addEventListener('click', () => setActiveTab('companies'));
  }

  if (dateFormatSelect) {
    dateFormatSelect.addEventListener('change', async (e) => {
      dateFormatPreference = e.target.value;
      await setLocalSetting(DATE_FORMAT_KEY, dateFormatPreference);
      loadAndDisplayNotes(searchInput ? searchInput.value : '');
    });
  }

  // --- Search/Filter ---
  if (searchInput) {
    let searchTimeout;
    searchInput.addEventListener('input', (e) => {
      clearTimeout(searchTimeout);
      searchTimeout = setTimeout(() => {
        loadAndDisplayNotes(e.target.value);
      }, 300); // Debounce for 300ms
    });
  }

  if (devLoggingToggle) {
    devLoggingToggle.addEventListener('change', async (e) => {
      const enabled = !!e.target.checked;
      await setLocalSetting(DEV_LOGGING_KEY, enabled);
      updateDevLoggingToggleStyle(enabled);
    });
  }

  // --- Export Notes ---
  exportBtn.addEventListener('click', async () => {
    const allData = await storageGetAll();
    const noteEntries = Object.entries(allData).filter(([key]) => key.startsWith('note:'));
    
    const exportData = {};
    for (const [key, value] of noteEntries) {
      const profileKey = key.replace('note:', '');
      const metaKey = `meta:${profileKey}`;
      const entry = { note: value };
      if (allData[metaKey]) {
        try {
          const meta = JSON.parse(allData[metaKey]);
          if (meta.name && meta.name.trim()) {
            entry.name = meta.name.trim();
          }
          if (meta.con && String(meta.con).trim()) {
            entry.connectedOn = String(meta.con).trim();
          }
        } catch (e) {}
      }
      exportData[profileKey] = entry;
    }

    const dataStr = JSON.stringify(exportData, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `memory-jogger-notes-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    console.log('[Memory Jogger] Exported', noteEntries.length, 'notes');
  });

  // --- Import Notes ---
  importBtn.addEventListener('click', () => {
    importFile.click();
  });

  importFile.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const importedData = JSON.parse(event.target.result);
        
        if (!importedData || typeof importedData !== 'object') {
          alert('Invalid file format. Please select a valid JSON export file.');
          return;
        }

        let imported = 0;
        let skipped = 0;

        for (const [profileKey, value] of Object.entries(importedData)) {
          // Validate profile key format (supports special characters like %E2%9A%A1)
          if (!profileKey.startsWith('/in/') && !profileKey.startsWith('/company/')) {
            skipped++;
            continue;
          }

          let noteText;
          let metaName;
          let connectedOn;

          if (typeof value === 'string') {
            // Old export format: plain note text string
            noteText = value;
          } else if (value && typeof value === 'object' && typeof value.note === 'string') {
            // New export format: { note, name? }
            noteText = value.note;
            metaName = (typeof value.name === 'string' && value.name.trim()) ? value.name.trim() : null;
            connectedOn = (typeof value.connectedOn === 'string' && value.connectedOn.trim()) ? value.connectedOn.trim() : null;
          } else {
            skipped++;
            continue;
          }

          const key = `note:${profileKey}`;
          await storageSet(key, noteText);

          if (metaName || connectedOn) {
            const metaKey = `meta:${profileKey}`;
            const existingMetaRaw = await storageGet(metaKey);
            let meta = {};
            if (existingMetaRaw) {
              try {
                meta = JSON.parse(existingMetaRaw);
              } catch (e) {}
            }
            if (metaName) meta.name = metaName;
            if (connectedOn) meta.con = connectedOn;
            await storageSet(metaKey, JSON.stringify(meta));
          }

          imported++;
        }

        alert(`Import complete!\n- Imported: ${imported} notes\n- Skipped: ${skipped} invalid entries`);
        importFile.value = ''; // Reset file input
        loadAndDisplayNotes();
      } catch (err) {
        console.error('[Memory Jogger] Import error:', err);
        alert('Error parsing file. Make sure it\'s a valid Memory Jogger export.');
      }
    };

    reader.readAsText(file);
  });

  // --- Diagnostics Button ---
  const diagnosticsBtn = document.getElementById('mjli-diagnostics-btn');
  if (diagnosticsBtn) {
    diagnosticsBtn.addEventListener('click', () => {
      const extensionId = chrome.runtime.id;
      const diagnosticsUrl = `chrome-extension://${extensionId}/diagnostics.html`;
      window.open(diagnosticsUrl, 'diagnostics', 'width=1000,height=800');
    });
  }

  // --- Initial Load ---
  await loadDateFormatPreference();
  loadDevLoggingSetting();
  loadAndDisplayNotes();
})();
