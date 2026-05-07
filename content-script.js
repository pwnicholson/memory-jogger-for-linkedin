(() => {
  const BUILD_ID = '2026-05-06-19:55';
  const SCRIPT_FILE = 'content-script.v20260504.js';
  const DEV_LOGGING_KEY = 'mjliDevLoggingEnabled';
  const PAGE_DEBUG_LOGS_KEY = 'mjliPageDebugLogs';
  const MAX_PAGE_DEBUG_LOGS = 300;
  let devLoggingEnabled = false;
  let storageAreaPreference = 'sync';
  let panelMountInFlightNonce = null;
  let panelMountInFlightProfileKey = null;
  let panelDismissedForKey = null; // set when user closes panel; cleared on navigation

  function stringifyLogArg(value) {
    if (value === null) return 'null';
    if (typeof value === 'undefined') return 'undefined';
    if (typeof value === 'string') return value;
    if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
      return String(value);
    }
    try {
      return JSON.stringify(value);
    } catch (e) {
      return String(value);
    }
  }

  function appendPageDebugLog(message) {
    try {
      chrome.storage.local.get([PAGE_DEBUG_LOGS_KEY], (result) => {
        if (chrome.runtime.lastError) return;
        const existing = Array.isArray(result[PAGE_DEBUG_LOGS_KEY]) ? result[PAGE_DEBUG_LOGS_KEY] : [];
        const entry = `[${new Date().toISOString()}] [PAGE] ${message}`;
        const nextLogs = existing.concat(entry);
        while (nextLogs.length > MAX_PAGE_DEBUG_LOGS) {
          nextLogs.shift();
        }
        chrome.storage.local.set({ [PAGE_DEBUG_LOGS_KEY]: nextLogs });
      });
    } catch (e) {
      // Silent - diagnostics logging must not break runtime behavior
    }
  }

  function logBuildStamp() {
    const message = `[Memory Jogger] Content script active file=${SCRIPT_FILE} build=${BUILD_ID} path=${window.location.pathname}`;
    console.log(message);
    appendPageDebugLog(message);
    try {
      chrome.runtime.sendMessage({ action: 'contentLog', message });
    } catch (e) {
      // Silent - service worker may be sleeping
    }
  }

  function debugLog(...args) {
    if (!devLoggingEnabled) return;
    // Always write to the LinkedIn tab's own console (open F12 on the LinkedIn tab to see these)
    console.log(...args);
    const message = args.map(stringifyLogArg).join(' ');
    appendPageDebugLog(message);
    // Also try to forward to service worker so logs appear in the diagnostics page
    try {
      chrome.runtime.sendMessage({ action: 'contentLog', message });
    } catch (e) {
      // Silent - service worker may be sleeping, console.log above is the reliable channel
    }
  }

  function loadDevLoggingSetting() {
    try {
      chrome.storage.local.get([DEV_LOGGING_KEY], (result) => {
        if (chrome.runtime.lastError) return;
        devLoggingEnabled = !!result[DEV_LOGGING_KEY];
        debugLog('[Memory Jogger] Dev logging enabled');
      });
    } catch (e) {
      // Silent - keep logging disabled on access errors
    }
  }

  loadDevLoggingSetting();
  logBuildStamp();

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'local' || !changes[DEV_LOGGING_KEY]) return;
    devLoggingEnabled = !!changes[DEV_LOGGING_KEY].newValue;
    debugLog('[Memory Jogger] Dev logging enabled');
  });

  debugLog('[Memory Jogger] Content script loaded on:', window.location.pathname);
  
  // Check sync status immediately, with error handling
  try {
    chrome.runtime.sendMessage({ action: 'checkSyncStatus' }, (response) => {
      try {
        if (chrome.runtime.lastError) {
          // Silent - context may be invalidated
        } else if (response) {
          debugLog('[Memory Jogger] Sync accessible:', response.accessible, '| Notes:', response.noteCount);
        }
      } catch (e) {
        // Silent - callback error during context invalidation
      }
    });
  } catch (e) {
    // Silent - context not ready yet
  }
  
  // On page load, log storage status with error handling
  try {
    chrome.storage.sync.get(null, (result) => {
      try {
        if (chrome.runtime.lastError) {
          // Silent - context may be invalidated
        } else {
          const noteCount = Object.keys(result).filter(k => k.startsWith('note:')).length;
          const byteUsage = new Blob(Object.values(result)).size;
          debugLog('[Memory Jogger] Storage status on page load:', {
            notes: noteCount,
            totalItems: Object.keys(result).length,
            bytesUsed: byteUsage,
            url: window.location.pathname
          });
        }
      } catch (e) {
        // Silent - callback error during context invalidation
      }
    });
  } catch (e) {
    // Silent - context not ready yet
  }
  
  const ROOT_ID = "mjli-root";
  const TOOLTIP_ID = "mjli-tooltip";
  const INDICATOR_CLASS = "mjli-indicator";
  let lastProfileKey = null;
  let editMode = false;
  let panelMountNonce = 0;
  let scheduledProfileRenderTimer = null;

  function getProfileKeyFromUrl(url) {
    // Match /in/ followed by anything up to the next / or end of string
    // This preserves URL-encoded characters like %E2%9A%A1
    const match = url.match(/\/in\/([^\/\?#]+)/i);
    return match ? `/in/${match[1].toLowerCase()}` : null;
  }

  function getProfileKey() {
    return getProfileKeyFromUrl(window.location.pathname);
  }

  function getCompanyKeyFromUrl(url) {
    const match = url.match(/\/company\/([^\/\?#]+)/i);
    return match ? `/company/${match[1].toLowerCase()}` : null;
  }

  function getEntityKeyFromUrl(url) {
    return getProfileKeyFromUrl(url) || getCompanyKeyFromUrl(url);
  }

  function getEntityKey() {
    return getEntityKeyFromUrl(window.location.pathname);
  }

  function waitForElement(selector, timeout = 3000) {
    return new Promise((resolve) => {
      const element = document.querySelector(selector);
      if (element) {
        resolve(element);
        return;
      }

      const observer = new MutationObserver(() => {
        const el = document.querySelector(selector);
        if (el) {
          observer.disconnect();
          resolve(el);
        }
      });

      observer.observe(document.documentElement, {
        childList: true,
        subtree: true
      });

      // Timeout after specified ms
      setTimeout(() => {
        observer.disconnect();
        resolve(null);
      }, timeout);
    });
  }

  function scheduleRenderForCurrentProfile(delay = 120) {
    if (scheduledProfileRenderTimer) return;
    scheduledProfileRenderTimer = setTimeout(() => {
      scheduledProfileRenderTimer = null;
      renderForCurrentProfile();
    }, delay);
  }

  function getStorageArea(areaName) {
    try {
      if (!chrome || !chrome.storage || !chrome.storage[areaName] || !chrome.runtime) return null;
      return chrome.storage[areaName];
    } catch (e) {
      return null;
    }
  }

  function readStorageArea(areaName, key) {
    return new Promise((resolve) => {
      const area = getStorageArea(areaName);
      if (!area) {
        resolve({ ok: false, value: "", error: 'Storage API unavailable' });
        return;
      }
      const startTime = performance.now();
      area.get([key], (result) => {
        const endTime = performance.now();
        if (chrome.runtime.lastError) {
          resolve({ ok: false, value: "", error: chrome.runtime.lastError.message, durationMs: endTime - startTime });
          return;
        }
        const value = result[key] || "";
        resolve({ ok: true, value, durationMs: endTime - startTime });
      });
    });
  }

  function writeStorageArea(areaName, key, value) {
    return new Promise((resolve) => {
      const area = getStorageArea(areaName);
      if (!area) {
        resolve({ ok: false, error: 'Storage API unavailable' });
        return;
      }
      const startTime = performance.now();
      area.set({ [key]: value }, () => {
        const endTime = performance.now();
        if (chrome.runtime.lastError) {
          resolve({ ok: false, error: chrome.runtime.lastError.message, durationMs: endTime - startTime });
          return;
        }
        resolve({ ok: true, durationMs: endTime - startTime });
      });
    });
  }

  async function storageGet(key) {
    try {
      const preferredArea = storageAreaPreference === 'local' ? 'local' : 'sync';
      const primary = await readStorageArea(preferredArea, key);
      if (primary.ok) {
        debugLog(`[Memory Jogger] storageGet ${preferredArea} success (${primary.durationMs.toFixed(2)}ms):`, key);
        return primary.value || "";
      }

      if (preferredArea === 'sync') {
        storageAreaPreference = 'local';
        debugLog('[Memory Jogger] Sync unavailable, switching to local storage:', primary.error || 'unknown error');
        const fallback = await readStorageArea('local', key);
        if (fallback.ok) {
          debugLog(`[Memory Jogger] storageGet local fallback success (${fallback.durationMs.toFixed(2)}ms):`, key);
          return fallback.value || "";
        }
      }

      debugLog('[Memory Jogger] storageGet failed:', key, primary.error || 'unknown error');
      return "";
    } catch (e) {
      debugLog('[Memory Jogger] storageGet outer error:', key, e.message);
      return "";
    }
  }

  async function storageSet(key, value) {
    try {
      const preferredArea = storageAreaPreference === 'local' ? 'local' : 'sync';
      let writeResult = await writeStorageArea(preferredArea, key, value);

      if (!writeResult.ok && preferredArea === 'sync') {
        storageAreaPreference = 'local';
        debugLog('[Memory Jogger] Sync write failed, switching to local storage:', key, writeResult.error || 'unknown error');
        writeResult = await writeStorageArea('local', key, value);
      }

      if (writeResult.ok) {
        debugLog(`[Memory Jogger] storageSet ${storageAreaPreference === 'local' ? 'local' : preferredArea} success (${writeResult.durationMs.toFixed(2)}ms):`, key);
      } else {
        debugLog('[Memory Jogger] storageSet failed:', key, writeResult.error || 'unknown error');
      }

      // If this is a note, also save metadata; read first to preserve stored fields (e.g. connected date)
      if (key.startsWith('note:') && value.trim()) {
        const displayName = getLinkedInDisplayName();
        const metaKey = key.replace('note:', 'meta:');
        const existingMetaRaw = await storageGet(metaKey);
        let meta = {};
        if (existingMetaRaw) { try { meta = JSON.parse(existingMetaRaw); } catch (e) {} }
        if (displayName) meta.name = displayName;
        await storageSet(metaKey, JSON.stringify(meta));
        debugLog('[Memory Jogger] Saved metadata for:', key);
      }
    } catch (e) {
      debugLog('[Memory Jogger] storageSet outer error:', key, e.message);
    }
  }

  function removeExistingPanel() {
    const existing = document.getElementById(ROOT_ID);
    if (existing) existing.remove();
  }

  function removeExistingTooltip() {
    const existing = document.getElementById(TOOLTIP_ID);
    if (existing) existing.remove();
  }

  function findCtaButtonsAnchor() {
    // Deterministic mount: top of <body>. This avoids LinkedIn SPA swapping hidden
    // main containers during first profile load.
    return {
      container: document.body,
      beforeNode: document.body.firstElementChild
    };
  }

  function createPanel(profileKey, storageKey, options = {}) {
    const allowBodyFallback = options.allowBodyFallback !== false;
    removeExistingPanel();

    const panel = document.createElement("div");
    panel.id = ROOT_ID;
    panel.className = "mjli-panel";
    panel.innerHTML = `
      <div class="mjli-container">
        <div class="mjli-header">
          <span class="mjli-title">Memory Jogger</span>
          <button id="mjli-close" class="mjli-close" title="Close panel">×</button>
        </div>
        <div id="mjli-content" class="mjli-content">
          <!-- Content inserted by JS -->
        </div>
      </div>
    `;

    const mountPoint = findCtaButtonsAnchor();
    if (!mountPoint) {
      if (!allowBodyFallback) {
        return false;
      }
      panel.dataset.mjliBodyFallback = "true";
      debugLog('[Memory Jogger] Using body fallback mount (no active main container yet)');
      document.body.appendChild(panel);
    } else {
      const { container, beforeNode } = mountPoint;
      if (!container) {
        if (!allowBodyFallback) {
          return false;
        }
        panel.dataset.mjliBodyFallback = "true";
        debugLog('[Memory Jogger] Using body fallback mount (mount point container missing)');
        document.body.appendChild(panel);
      } else {
        const containerRect = container.getBoundingClientRect();
        debugLog('[Memory Jogger] Mount container selected:', {
          tag: container.tagName,
          classes: [...container.classList].slice(0, 3).join('.'),
          width: Math.round(containerRect.width),
          height: Math.round(containerRect.height)
        });
        if (beforeNode && beforeNode.parentNode === container) {
          delete panel.dataset.mjliBodyFallback;
          debugLog('[Memory Jogger] Inserting panel before explicit anchor');
          container.insertBefore(panel, beforeNode);
        } else {
          // Deterministic placement: always prepend to chosen container.
          delete panel.dataset.mjliBodyFallback;
          debugLog('[Memory Jogger] Prepending panel to mount container');
          container.prepend(panel);
        }
      }
    }

    const closeBtn = panel.querySelector("#mjli-close");
    closeBtn.addEventListener("click", () => {
      panelDismissedForKey = profileKey;
      panel.remove();
    });

    renderNoteContent(storageKey);
    return true;
  }

  async function mountPanelForProfile(profileKey, nonce) {
    // For first-load reliability, mount immediately to deterministic body-top anchor.
    const waitResult = 'immediate';
    if (nonce !== panelMountNonce || getEntityKey() !== profileKey) return;

    const storageKey = `note:${profileKey}`;
    debugLog('[Memory Jogger] Profile readiness result, mounting panel:', { profileKey, waitResult });
    const didMount = createPanel(profileKey, storageKey, { allowBodyFallback: true });
    debugLog('[Memory Jogger] Panel mount result:', { profileKey, didMount });
    if (didMount) {
      scheduleRenderForCurrentProfile(80);

      // Opportunistically refresh metadata (name + connected date) whenever the panel mounts.
      setTimeout(() => {
        try {
          const name = getLinkedInDisplayName();
          const detectedCon = getLinkedInConnectedDate();
          if (name || detectedCon) {
            const metaKey = `meta:${profileKey}`;
            storageGet(metaKey).then((existingMetaRaw) => {
              let meta = {};
              if (existingMetaRaw) { try { meta = JSON.parse(existingMetaRaw); } catch (e) {} }
              if (name) meta.name = name;
              // Only auto-fill con if not already set (don't overwrite user-entered dates)
              if (detectedCon && !meta.con) meta.con = detectedCon;
              storageSet(metaKey, JSON.stringify(meta)).then(() => {
                debugLog('[Memory Jogger] Refreshed metadata on mount:', meta.name, meta.con || '');
              });
            });
          }
        } catch (e) {
          // Silent — metadata refresh must never break the panel
        }
      }, 500); // Small delay to let the page title / h1 settle after SPA nav
  }
  }

  function requestPanelMount(profileKey) {
    // Avoid spawning overlapping mounts for the same profile.
    if (panelMountInFlightProfileKey === profileKey && panelMountInFlightNonce !== null) {
      return;
    }

    panelMountNonce += 1;
    const nonce = panelMountNonce;
    panelMountInFlightProfileKey = profileKey;
    panelMountInFlightNonce = nonce;

    mountPanelForProfile(profileKey, nonce).finally(() => {
      if (panelMountInFlightNonce === nonce) {
        panelMountInFlightNonce = null;
        panelMountInFlightProfileKey = null;
      }
    });
  }

  function renderNoteContent(storageKey) {
    const panel = document.getElementById(ROOT_ID);
    if (!panel) return;

    const content = panel.querySelector("#mjli-content");
    editMode = false;
    const isCompanyPage = storageKey.includes('/company/');

    const metaKey = storageKey.replace('note:', 'meta:');
    Promise.all([storageGet(storageKey), storageGet(metaKey)]).then(([noteText, metaRaw]) => {
      let connectedDate = null;
      if (!isCompanyPage && metaRaw) { try { connectedDate = JSON.parse(metaRaw).con || null; } catch(e) {} }
      const conHtml = connectedDate
        ? `<div class="mjli-connected-date">🔗 Connected: ${escapeHtml(connectedDate)}</div>`
        : '';

      if (!noteText.trim()) {
        // Empty state: show CTA to add note
        content.innerHTML = `
          <p class="mjli-empty">No note yet. Click to add one.</p>
          ${conHtml}
          <button id="mjli-add" class="mjli-btn-primary">Add note</button>
        `;
        content.querySelector("#mjli-add").addEventListener("click", () =>
          enterEditMode(storageKey)
        );
      } else {
        // Show note with edit/delete buttons
        content.innerHTML = `
          <div class="mjli-note-display">${escapeHtml(noteText)}</div>
          ${conHtml}
          <div class="mjli-actions">
            <button id="mjli-edit" class="mjli-btn-secondary">Edit</button>
            <button id="mjli-delete" class="mjli-btn-danger">Delete</button>
          </div>
        `;
        content.querySelector("#mjli-edit").addEventListener("click", () =>
          enterEditMode(storageKey)
        );
        content.querySelector("#mjli-delete").addEventListener("click", async () => {
          await storageSet(storageKey, "");
          renderNoteContent(storageKey);
          updateAllProfileImageIndicators(); // Refresh indicators
        });
      }
    });
  }

  function enterEditMode(storageKey) {
    const panel = document.getElementById(ROOT_ID);
    if (!panel) return;

    const content = panel.querySelector("#mjli-content");
    editMode = true;
    const isCompanyPage = storageKey.includes('/company/');

    const metaKey = storageKey.replace('note:', 'meta:');
    Promise.all([storageGet(storageKey), storageGet(metaKey)]).then(([noteText, metaRaw]) => {
      let connectedDate = '';
      if (!isCompanyPage && metaRaw) { try { connectedDate = JSON.parse(metaRaw).con || ''; } catch(e) {} }

      const connectedInputRow = !isCompanyPage
        ? `<div class="mjli-connected-input-row">
          <label for="mjli-connected" class="mjli-connected-label">Connected:</label>
          <input
            id="mjli-connected"
            type="date"
            class="mjli-connected-input"
            value="${connectedDate}"
          >
        </div>`
        : '';

      content.innerHTML = `
        <textarea
          id="mjli-textarea"
          class="mjli-textarea"
          placeholder="e.g., Met at TechCon 2024... worked together at Acme Corp..."
          maxlength="200"
        >${escapeHtml(noteText)}</textarea>
        ${connectedInputRow}
        <div class="mjli-edit-footer">
          <div class="mjli-counter-section">
            <span id="mjli-counter" class="mjli-counter"></span>
            <span class="mjli-preview-hint">💡 First 60 characters show in preview</span>
          </div>
          <div class="mjli-edit-buttons">
            <button id="mjli-save" class="mjli-btn-primary">Save</button>
            <button id="mjli-cancel" class="mjli-btn-secondary">Cancel</button>
          </div>
        </div>
      `;

      const textarea = content.querySelector("#mjli-textarea");
      const connectedInput = content.querySelector("#mjli-connected");
      const counter = content.querySelector("#mjli-counter");
      const saveBtn = content.querySelector("#mjli-save");
      const cancelBtn = content.querySelector("#mjli-cancel");

      // Update character counter
      const updateCounter = () => {
        counter.textContent = `${textarea.value.length} / 200`;
      };
      textarea.addEventListener("input", updateCounter);
      updateCounter();

      textarea.focus();

      saveBtn.addEventListener("click", async () => {
        const value = textarea.value.trim();
        const newCon = connectedInput ? connectedInput.value.trim() : '';
        await storageSet(storageKey, value);
        // Save connected date into meta, preserving other stored fields
        const existingMetaRaw = await storageGet(metaKey);
        let meta = {};
        if (existingMetaRaw) { try { meta = JSON.parse(existingMetaRaw); } catch(e) {} }
        if (newCon) {
          meta.con = newCon;
        } else {
          delete meta.con;
        }
        await storageSet(metaKey, JSON.stringify(meta));
        renderNoteContent(storageKey);
        updateAllProfileImageIndicators();
      });

      cancelBtn.addEventListener("click", () => {
        renderNoteContent(storageKey);
      });
    });
  }

  function escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  }

  function getLinkedInDisplayName() {
    // Helper to validate if text is a reasonable name (not UI noise)
    function isValidName(text) {
      if (!text || text.length < 2 || text.length > 100) return false;
      // Reject if starts with special chars like "(1)", "[", etc
      if (/^[\(\[\{]/.test(text)) return false;
      // Reject if looks like an ID or pure number
      if (/^\d+$/.test(text)) return false;
      // Reject if contains only numbers and separators
      if (/^[\d\-\.\s]+$/.test(text)) return false;
      // Reject if contains keywords indicating it's not a name
      if (text.toLowerCase().includes('profile') || text.toLowerCase().includes('view')) return false;
      return true;
    }
    
    // Strategy 1: Check the page title (usually "FirstName LastName | LinkedIn")
    const pageTitle = document.title;
    const titleMatch = pageTitle.match(/^(.+?)\s*\|\s*LinkedIn/);
    if (titleMatch && titleMatch[1]) {
      const name = titleMatch[1].trim();
      if (isValidName(name)) {
        return name;
      }
    }
    
    // Strategy 2: Look for h1 in top card (main profile name) - most reliable
    let h1 = document.querySelector('[data-test-id="top-card"] h1');
    if (!h1) h1 = document.querySelector('h1');
    if (h1) {
      const name = h1.textContent.trim();
      if (isValidName(name)) return name;
    }
    
    // Strategy 3: Look for name directly in top card using specific selectors
    const topCard = document.querySelector('[data-test-id="top-card"]');
    if (topCard) {
      // Look for the name in heading elements
      const headings = topCard.querySelectorAll('h1, h2, h3');
      for (const heading of headings) {
        const name = heading.textContent.trim();
        if (isValidName(name)) return name;
      }
      
      // Look for name in data-test-ids that specifically mention name/headline
      const nameElements = topCard.querySelectorAll('[data-test-id*="headline"], [data-test-id*="name"]');
      for (const el of nameElements) {
        const name = el.textContent.trim();
        if (isValidName(name)) return name;
      }
      
      // Last resort: look for spans that look like names (not badges/counters)
      const spans = topCard.querySelectorAll('span');
      for (const span of spans) {
        const text = span.textContent.trim();
        // Only accept if it matches a real name pattern (at least one letter after cap)
        // Skip if parent looks like a counter/badge
        const parent = span.parentElement;
        if (parent && (parent.className.includes('badge') || parent.className.includes('counter'))) {
          continue;
        }
        // Accept names like "John", "John Smith", "John Paul Smith"
        if (text && /^[A-Z][a-z]+(\s+[A-Z][a-z]+)*$/.test(text) && isValidName(text)) {
          return text;
        }
      }
    }
    
    // Strategy 4: Look for name attribute in profile image alt text
    const profileImg = document.querySelector('[data-test-id="top-card"] img[alt], [class*="profile"] img[alt]');
    if (profileImg && profileImg.alt) {
      // LinkedIn alt format: "View FirstName LastName's profile" or "FirstName LastName"
      const altMatch = profileImg.alt.match(/^(?:View\s+)?([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/);
      if (altMatch && altMatch[1]) {
        const name = altMatch[1].trim();
        if (isValidName(name)) return name;
      }
    }
    
    // Fallback: Return empty string, dashboard will use URL-based name
    return '';
  }

  function getLinkedInProfileImage() {
      // Fallback: Return empty string, dashboard will use URL-based name
      return '';
    }

  function getLinkedInConnectedDate() {
    // Try to find the "Connected on" date from the page.
    // LinkedIn shows this in the Contact info modal when it's open,
    // or occasionally inline on the profile page.

    // Strategy 1: Contact info modal is open — look for a time element near "Connected" text
    const modal = document.querySelector('.artdeco-modal, [role="dialog"]');
    if (modal) {
      const timeEl = modal.querySelector('time[datetime]');
      if (timeEl && timeEl.dateTime) {
        // dateTime may be "2024-01" or "2024-01-15"
        const m = timeEl.dateTime.match(/^(\d{4}-\d{2})/);
        if (m) {
          // Convert YYYY-MM to "Mon YYYY" for readability
          const [year, month] = m[1].split('-');
          const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
          const monthName = monthNames[parseInt(month, 10) - 1];
          if (monthName) return `${monthName} ${year}`;
        }
      }
      // Also try matching "Connected [Month Year]" text inside the modal
      const text = modal.textContent;
      const connMatch = text.match(/Connected\s+((Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\w*\.?\s+\d{4})/i);
      if (connMatch) return connMatch[1].trim();
    }

    // Strategy 2: Look for "Connected [Month Year]" text anywhere visible on the page
    const allSpans = document.querySelectorAll('span, li');
    for (const el of allSpans) {
      if (el.children.length > 0) continue; // skip containers, only leaf text nodes
      const text = el.textContent.trim();
      const m = text.match(/^Connected\s+((Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\w*\.?\s+\d{4})$/i);
      if (m) return m[1].trim();
    }

    return null;
  }

  function truncateText(text, maxLength) {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
  }

  function extractNameFromAlt(altText) {
    // LinkedIn alt text format: "View [Name]'s graphic link" or "View [Name]'s profile"
    // Extract just the name part
    const match = altText.match(/^View\s+(.+?)'s\s+(graphic link|profile)/i);
    if (match && match[1]) {
      return match[1].trim();
    }
    // Fallback to original if pattern doesn't match
    return altText;
  }

  function createTooltip(name, noteText, connectedDate) {
    removeExistingTooltip();
    const tooltip = document.createElement("div");
    tooltip.id = TOOLTIP_ID;
    tooltip.className = "mjli-tooltip";
    const truncatedNote = truncateText(noteText, 60);
    if (connectedDate) {
      const noteDiv = document.createElement('div');
      noteDiv.className = 'mjli-tooltip-note';
      noteDiv.textContent = truncatedNote;
      const conDiv = document.createElement('div');
      conDiv.className = 'mjli-tooltip-connected';
      conDiv.textContent = `Connected: ${connectedDate}`;
      tooltip.appendChild(noteDiv);
      tooltip.appendChild(conDiv);
    } else {
      tooltip.textContent = truncatedNote;
    }
    document.body.appendChild(tooltip);
    return tooltip;
  }

  function updateTooltipPosition(event, tooltip) {
    const rect = event.target.getBoundingClientRect();
    let top = rect.top - tooltip.offsetHeight - 8;
    let left = rect.left + rect.width / 2 - tooltip.offsetWidth / 2;
    
    // Keep tooltip within viewport
    if (top < 10) top = rect.bottom + 8;
    if (left < 10) left = 10;
    if (left + tooltip.offsetWidth > window.innerWidth) {
      left = window.innerWidth - tooltip.offsetWidth - 10;
    }
    
    tooltip.style.left = left + "px";
    tooltip.style.top = top + "px";
  }

  function addProfileImageHoverListener(img, profileKey) {
    const storageKey = `note:${profileKey}`;

    img.addEventListener("mouseenter", async () => {
      debugLog('[Memory Jogger] Hover on image for:', profileKey);
      const metaKey = `meta:${profileKey}`;
      const [noteText, metaRaw] = await Promise.all([storageGet(storageKey), storageGet(metaKey)]);
      debugLog('[Memory Jogger] Note text:', noteText ? noteText.substring(0, 30) : '(empty)');
      if (!noteText.trim()) return; // Only show tooltip if there's a note
      let connectedDate = null;
      if (metaRaw) { try { connectedDate = JSON.parse(metaRaw).con || null; } catch(e) {} }

      // Save original attributes before clearing
      const originalTitle = img.title;
      const originalAlt = img.alt;
      
      // Completely remove the attributes to prevent browser tooltip
      img.removeAttribute('title');
      img.removeAttribute('alt');
      
      // Also handle parent link's title attribute (this is likely where "View [Name]'s graphic link" comes from)
      const parentLink = img.closest('a');
      const originalParentTitle = parentLink ? parentLink.title : null;
      if (parentLink) {
        parentLink.removeAttribute('title');
      }
      
      // Also disable data tooltips if they exist
      img.setAttribute('data-original-title', originalTitle);
      
      // Extract profile name from nearby elements (not from alt)
      let name = originalAlt || "Profile";
      
      // Clean the alt text if it follows LinkedIn's "View [Name]'s graphic link" format
      if (name && name.toLowerCase().includes("view") && name.includes("'s")) {
        name = extractNameFromAlt(name);
      }
      
      if (!name || name.toLowerCase() === "profile") {
        // Try to find name from nearby text
        const parent = img.closest("a, div[data-test-id], li");
        if (parent) {
          const nameEl = parent.querySelector("[class*='name'], h3, h4, span[dir]");
          if (nameEl) name = nameEl.textContent.trim() || name;
        }
      }

      debugLog('[Memory Jogger] Showing tooltip for:', name);
      const tooltip = createTooltip(name, noteText, connectedDate);
      updateTooltipPosition({ target: img }, tooltip);

      const moveHandler = (e) => updateTooltipPosition({ target: img }, tooltip);
      img.addEventListener("mousemove", moveHandler);

      img.addEventListener(
        "mouseleave",
        () => {
          removeExistingTooltip();
          img.removeEventListener("mousemove", moveHandler);
          // Restore original attributes
          if (originalTitle) img.setAttribute('title', originalTitle);
          if (originalAlt) img.setAttribute('alt', originalAlt);
          // Restore parent link's title if it had one
          if (parentLink && originalParentTitle) {
            parentLink.setAttribute('title', originalParentTitle);
          }
        },
        { once: true }
      );
    });
  }

  function addIndicatorBadge(img, profileKey) {
    const storageKey = `note:${profileKey}`;
    
    // Check if image has a direct profile link parent (true for profile avatars)
    // Skip if no direct link, as it's likely post media
    const directLink = img.closest('a[href*="/in/"]');
    if (!directLink) {
      return; // No direct profile link, likely post media
    }

    storageGet(storageKey).then((noteText) => {
      if (!noteText.trim()) {
        return; // Only add indicator if there's a note
      }

      // Check if badge already exists for this image
      if (img.dataset.mjliBadge === "true") return;

      // Find a suitable container - prefer the closest link or button
      let container = img.closest('a, button');
      
      // If no link/button parent, try to find the element containing the image
      if (!container) {
        container = img.parentElement;
      }

      if (!container || container === document.body) {
        debugLog('[Memory Jogger] No suitable container for badge');
        return;
      }

      // Ensure container is positioned so the badge can be positioned relative to it
      const style = window.getComputedStyle(container);
      if (style.position === "static") {
        container.style.position = "relative";
      }

      // Check if a badge already exists on this container (avoid duplicates)
      if (container.querySelector(`.${INDICATOR_CLASS}`)) {
        img.dataset.mjliBadge = "true";
        img.dataset.mjliHasNote = "true"; // Mark image as having a note
        return;
      }

      const indicator = document.createElement("div");
      indicator.className = INDICATOR_CLASS;
      indicator.setAttribute("data-profile-key", profileKey);
      indicator.title = "Memory note saved for this profile";
      
      // Try to use the extension icon, fallback to pencil emoji
      const iconImg = document.createElement("img");
      iconImg.src = chrome.runtime.getURL("icon-16.png");
      iconImg.alt = "Memory note saved";
      iconImg.style.width = "16px";
      iconImg.style.height = "16px";
      iconImg.style.display = "block";
      
      // Fallback to emoji if image fails to load
      iconImg.onerror = () => {
        indicator.textContent = "✏️";
        indicator.style.fontSize = "14px";
      };
      
      indicator.appendChild(iconImg);
      
      container.appendChild(indicator);
      img.dataset.mjliBadge = "true";
      img.dataset.mjliHasNote = "true"; // Mark image as having a note
      
      // Add thick blue outline to the image itself
      img.style.border = "4px solid #0a66c2";
      img.style.borderRadius = "50%";
      img.style.boxSizing = "border-box";
      
      debugLog('[Memory Jogger] Badge added for:', profileKey);
    });
  }

  function findAndEnhanceAllProfileImages() {
    // Special handling for profile/company page main avatar
    const profileKey = getEntityKey();
    if (profileKey) {
      // Look for the main avatar at the top of the page (profile or company)
      const topCard = document.querySelector('[data-test-id="top-card"], .org-top-card, section[class*="org-top-card"]');
      if (topCard) {
        // Find all images in top card and take the first substantial one (likely the avatar)
        const topCardImages = topCard.querySelectorAll('img');
        debugLog('[Memory Jogger] Found', topCardImages.length, 'images in top card');
        
        for (let img of topCardImages) {
          if (!img.dataset.mjliProcessed) {
            // Check if this looks like a profile avatar (not tiny icon)
            const rect = img.getBoundingClientRect();
            if (rect.width > 50 && rect.height > 50) {
              img.dataset.mjliProcessed = "true";
              addProfileImageHoverListener(img, profileKey);
              addIndicatorBadge(img, profileKey);
              debugLog('[Memory Jogger] Processed main profile avatar');
              break; // Only process the first large image
            }
          }
        }
      }
    }

    // Find all other potential profile images across the page
    const allImages = document.querySelectorAll('img');

    let processed = 0;
    allImages.forEach((img) => {
      // Skip if already processed
      if (img.dataset.mjliProcessed) return;

      // Skip obvious non-profile images
      if (img.alt && (img.alt.toLowerCase().includes('logo') || img.alt.toLowerCase().includes('icon'))) {
        return;
      }

      let profileKey = null;

      // Strategy 1: Direct parent is a profile or company link
      const directLink = img.closest('a[href*="/in/"], a[href*="/company/"]');
      if (directLink) {
        profileKey = getEntityKeyFromUrl(directLink.href);
        if (profileKey) {
          img.dataset.mjliProcessed = "true";
          processed++;
          addProfileImageHoverListener(img, profileKey);
          addIndicatorBadge(img, profileKey);
          return;
        }
      }

      // Strategy 2: Search siblings and nearby elements for profile or company links
      let searchParent = img.parentElement;
      for (let depth = 0; depth < 4 && searchParent; depth++) {
        const profileLinks = searchParent.querySelectorAll('a[href*="/in/"], a[href*="/company/"]');
        if (profileLinks.length > 0) {
          profileKey = getEntityKeyFromUrl(profileLinks[0].href);
          if (profileKey) {
            break;
          }
        }
        searchParent = searchParent.parentElement;
      }

      // Strategy 3: Check if image is in a card with a profile or company link somewhere
      if (!profileKey) {
        const card = img.closest('[data-test-id*="feed"], [data-test-id*="card"], article, li');
        if (card) {
          const profileLink = card.querySelector('a[href*="/in/"], a[href*="/company/"]');
          if (profileLink) {
            profileKey = getEntityKeyFromUrl(profileLink.href);
          }
        }
      }

      if (profileKey) {
        img.dataset.mjliProcessed = "true";
        processed++;
        addProfileImageHoverListener(img, profileKey);
        addIndicatorBadge(img, profileKey);
      }
    });

    if (processed > 0) {
      debugLog('[Memory Jogger] Processed', processed, 'profile images for hover/indicator');
    }
  }

  function updateAllProfileImageIndicators() {
    // Re-process all profile images to refresh indicators
    document.querySelectorAll('img[data-mjli-processed]').forEach((img) => {
      delete img.dataset.mjliProcessed;
      // Remove old indicators
      img.closest("a, span, div")?.querySelector(`.${INDICATOR_CLASS}`)?.remove();
    });
    findAndEnhanceAllProfileImages();
  }

  function isPanelEffectivelyHidden() {
    const panel = document.getElementById(ROOT_ID);
    if (!panel) return false;

    const rect = panel.getBoundingClientRect();
    const style = window.getComputedStyle(panel);

    if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) {
      return true;
    }

    // Treat tiny/non-rendered placements as hidden for reliability purposes.
    if (rect.height < 10 || rect.width < 10) {
      return true;
    }

    return false;
  }

  function renderForCurrentProfile() {
    const profileKey = getEntityKey();
    debugLog('[Memory Jogger] Check page:', { profileKey, hasPanel: !!document.getElementById(ROOT_ID) });

    if (!profileKey) {
      removeExistingPanel();
      lastProfileKey = null;
      panelMountNonce += 1;
      panelMountInFlightNonce = null;
      panelMountInFlightProfileKey = null;
      findAndEnhanceAllProfileImages();
      return;
    }

    // If we're on a profile page
    if (profileKey !== lastProfileKey) {
      // Profile changed — mount panel.
      lastProfileKey = profileKey;
      panelDismissedForKey = null; // new profile clears any prior dismissal
      requestPanelMount(profileKey);
    } else {
      // Respect user closing the panel — don't remount until they navigate away.
      if (panelDismissedForKey === profileKey) return;
      const panelExists = !!document.getElementById(ROOT_ID);
      const hidden = panelExists && isPanelEffectivelyHidden();
      if (!panelExists || hidden) {
        // Panel missing or effectively hidden — remount.
        debugLog('[Memory Jogger] Panel remount needed:', { exists: panelExists, hidden });
        requestPanelMount(profileKey);
      }
    }

    // Always update profile images (in case new ones loaded)
    findAndEnhanceAllProfileImages();
  }

  function setupNavigationListener() {
    const pushState = history.pushState;
    const replaceState = history.replaceState;

    // Reset panel immediately on any navigation so we never mount into stale DOM.
    function resetForNavigation() {
      removeExistingPanel();
      lastProfileKey = null;
      panelMountNonce += 1;
      panelMountInFlightNonce = null;
      panelMountInFlightProfileKey = null;
      panelDismissedForKey = null;
      // Clear any pending debounced render so post-nav checks aren't blocked.
      if (scheduledProfileRenderTimer) {
        clearTimeout(scheduledProfileRenderTimer);
        scheduledProfileRenderTimer = null;
      }
      debugLog('[Memory Jogger] Navigation reset, nonce now:', panelMountNonce);
    }

    // After any SPA navigation, LinkedIn may take up to ~2s to settle the
    // final /in/ URL. Poll rapidly so we catch it as soon as it appears.
    function schedulePostNavChecks() {
      [200, 500, 1000, 1800].forEach(delay => setTimeout(renderForCurrentProfile, delay));
    }

    history.pushState = function () {
      pushState.apply(this, arguments);
      resetForNavigation();
      schedulePostNavChecks();
    };

    history.replaceState = function () {
      replaceState.apply(this, arguments);
      resetForNavigation();
      schedulePostNavChecks();
    };

    window.addEventListener("popstate", () => {
      resetForNavigation();
      schedulePostNavChecks();
    });
  }

  // Also watch for dynamic DOM changes (LinkedIn loads content dynamically).
  // We still scan images on mutation, but do NOT log it here — the log noise
  // drowns out meaningful lifecycle events.
  const observer = new MutationObserver(() => {
    findAndEnhanceAllProfileImages();
    scheduleRenderForCurrentProfile(80);
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: false
  });

  setupNavigationListener();
  renderForCurrentProfile();
  setInterval(() => scheduleRenderForCurrentProfile(120), 1000);
})();
