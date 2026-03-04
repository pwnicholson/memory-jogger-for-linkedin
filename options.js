(() => {
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

  let currentEditingKey = null;

  // --- Storage Helpers ---
  function storageGet(key) {
    return new Promise((resolve) => {
      try {
        if (!chrome || !chrome.storage || !chrome.storage.sync || !chrome.runtime) {
          resolve("");
          return;
        }
        
        chrome.storage.sync.get([key], (result) => {
          try {
            if (chrome.runtime.lastError) {
              resolve("");
            } else {
              resolve(result[key] || "");
            }
          } catch (e) {
            resolve("");
          }
        });
      } catch (e) {
        resolve("");
      }
    });
  }

  function storageSet(key, value) {
    return new Promise((resolve) => {
      try {
        if (!chrome || !chrome.storage || !chrome.storage.sync || !chrome.runtime) {
          resolve();
          return;
        }
        
        chrome.storage.sync.set({ [key]: value }, () => {
          try {
            if (chrome.runtime.lastError) {
              console.log('[Memory Jogger] Note saved (sync may be pending)');
            } else {
              console.log('[Memory Jogger] Saved:', key);
            }
          } catch (e) {
            // Silent
          }
          resolve();
        });
      } catch (e) {
        resolve();
      }
    });
  }

  function storageGetAll() {
    return new Promise((resolve) => {
      try {
        if (!chrome || !chrome.storage || !chrome.storage.sync || !chrome.runtime) {
          resolve({});
          return;
        }
        
        chrome.storage.sync.get(null, (result) => {
          try {
            if (chrome.runtime.lastError) {
              resolve({});
            } else {
              resolve(result || {});
            }
          } catch (e) {
            resolve({});
          }
        });
      } catch (e) {
        resolve({});
      }
    });
  }

  function storageRemove(key) {
    return new Promise((resolve) => {
      try {
        if (!chrome || !chrome.storage || !chrome.storage.sync || !chrome.runtime) {
          resolve();
          return;
        }
        
        chrome.storage.remove([key], () => {
          try {
            if (chrome.runtime.lastError) {
              console.log('[Memory Jogger] Note deleted (sync may be pending)');
            } else {
              console.log('[Memory Jogger] Deleted:', key);
            }
          } catch (e) {
            // Silent
          }
          resolve();
        });
      } catch (e) {
        resolve();
      }
    });
  }

  // --- Utility Functions ---
  function escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
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
  async function loadAndDisplayNotes() {
    notesList.innerHTML = '<div class="mjli-loading">Loading notes...</div>';
    
    const allData = await storageGetAll();
    const noteEntries = Object.entries(allData).filter(([key]) => key.startsWith('note:'));
    
    await updateStorageInfo();

    if (noteEntries.length === 0) {
      notesList.innerHTML = `
        <div class="mjli-empty-state">
          <div class="mjli-empty-state-icon">📭</div>
          <h3>No notes yet</h3>
          <p>Your saved notes will appear here. Add notes when viewing profiles on LinkedIn!</p>
        </div>
      `;
      return;
    }

    notesList.innerHTML = '';
    
    // Sort notes by profile name
    noteEntries.sort((a, b) => {
      const nameA = a[0].replace('note:/in/', '').toLocaleLowerCase();
      const nameB = b[0].replace('note:/in/', '').toLocaleLowerCase();
      return nameA.localeCompare(nameB);
    });

    for (const [key, noteText] of noteEntries) {
      const profileKey = key.replace('note:', '');
      const profileName = profileKey.replace('/in/', '');
      const initials = getInitials(profileName.replace(/-/g, ' '));
      
      const noteItem = document.createElement('div');
      noteItem.className = 'mjli-note-item';
      noteItem.innerHTML = `
        <div class="mjli-note-item-header">
          <div class="mjli-note-item-profile">
            <div class="mjli-profile-avatar">${escapeHtml(initials)}</div>
            <div class="mjli-profile-details">
              <a href="https://www.linkedin.com${profileKey}" target="_blank" class="mjli-profile-name">
                ${escapeHtml(profileName.replace(/-/g, ' '))}
              </a>
              <span class="mjli-profile-key">${escapeHtml(profileKey)}</span>
            </div>
          </div>
          <div class="mjli-note-item-actions">
            <button class="mjli-btn-secondary mjli-edit-note-btn" data-key="${escapeHtml(key)}">Edit</button>
            <button class="mjli-btn-danger mjli-delete-note-btn" data-key="${escapeHtml(key)}">Delete</button>
          </div>
        </div>
        <div class="mjli-note-item-content">${escapeHtml(noteText)}</div>
        <div class="mjli-note-metadata">
          ${noteText.length} characters
        </div>
      `;

      // Edit button listener
      noteItem.querySelector('.mjli-edit-note-btn').addEventListener('click', (e) => {
        const key = e.target.getAttribute('data-key');
        openEditModal(key, profileName, noteText);
      });

      // Delete button listener
      noteItem.querySelector('.mjli-delete-note-btn').addEventListener('click', async (e) => {
        const key = e.target.getAttribute('data-key');
        if (confirm(`Delete note for ${profileName}?`)) {
          await storageRemove(key);
          loadAndDisplayNotes();
        }
      });

      notesList.appendChild(noteItem);
    }
  }

  // --- Edit Modal ---
  function openEditModal(key, profileName, noteText) {
    currentEditingKey = key;
    editProfileName.textContent = profileName.replace(/-/g, ' ');
    editTextarea.value = noteText;
    updateEditCounter();
    editModal.style.display = 'flex';
    editTextarea.focus();
  }

  function closeEditModal() {
    editModal.style.display = 'none';
    currentEditingKey = null;
  }

  function updateEditCounter() {
    editCounter.textContent = `${editTextarea.value.length} / 500`;
  }

  // Modal event listeners
  modalClose.addEventListener('click', closeEditModal);
  modalCancel.addEventListener('click', closeEditModal);
  editTextarea.addEventListener('input', updateEditCounter);

  modalSave.addEventListener('click', async () => {
    if (!currentEditingKey) return;
    
    const newText = editTextarea.value.trim();
    await storageSet(currentEditingKey, newText);
    closeEditModal();
    loadAndDisplayNotes();
  });

  // Close modal on escape key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && editModal.style.display === 'flex') {
      closeEditModal();
    }
  });

  // --- Export Notes ---
  exportBtn.addEventListener('click', async () => {
    const allData = await storageGetAll();
    const noteEntries = Object.entries(allData).filter(([key]) => key.startsWith('note:'));
    
    const exportData = {};
    for (const [key, value] of noteEntries) {
      const profileKey = key.replace('note:', '');
      exportData[profileKey] = value;
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

        for (const [profileKey, noteText] of Object.entries(importedData)) {
          // Validate profile key format
          if (!profileKey.startsWith('/in/') || typeof noteText !== 'string') {
            skipped++;
            continue;
          }

          const key = `note:${profileKey}`;
          await storageSet(key, noteText);
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

  // --- Initial Load ---
  loadAndDisplayNotes();
})();
