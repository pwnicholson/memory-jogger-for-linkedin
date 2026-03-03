(() => {
  const ROOT_ID = "mjli-root";
  let lastProfileKey = null;
  let editMode = false;

  function getProfileKey() {
    const path = window.location.pathname.replace(/\/+$/, "");
    if (!path.startsWith("/in/")) return null;
    return path.toLowerCase();
  }

  function storageGet(key) {
    return new Promise((resolve) => {
      chrome.storage.sync.get([key], (result) => resolve(result[key] || ""));
    });
  }

  function storageSet(key, value) {
    return new Promise((resolve) => {
      chrome.storage.sync.set({ [key]: value }, () => resolve());
    });
  }

  function removeExistingPanel() {
    const existing = document.getElementById(ROOT_ID);
    if (existing) existing.remove();
  }

  function findProfileHeaderAnchor() {
    // Try common LinkedIn profile header container selectors
    const candidates = [
      document.querySelector('[data-test-id="profile-hero-section"]'),
      document.querySelector('[data-test-id="profile-details-section"]'),
      document.querySelector('section[data-test-id*="profile"]'),
      document.querySelector('[class*="pv-profile"]'),
      document.querySelector('[class*="profile-section"]'),
      document.body.querySelector('main')
    ];

    return candidates.find((el) => el && el.offsetParent !== null) || document.body;
  }

  function createPanel(profileKey, storageKey) {
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

    const anchor = findProfileHeaderAnchor();
    anchor.insertBefore(panel, anchor.firstChild);

    const closeBtn = panel.querySelector("#mjli-close");
    closeBtn.addEventListener("click", () => panel.remove());

    renderNoteContent(storageKey);
  }

  function renderNoteContent(storageKey) {
    const panel = document.getElementById(ROOT_ID);
    if (!panel) return;

    const content = panel.querySelector("#mjli-content");
    editMode = false;

    storageGet(storageKey).then((noteText) => {
      if (!noteText.trim()) {
        // Empty state: show CTA to add note
        content.innerHTML = `
          <p class="mjli-empty">No note yet. Click to add one.</p>
          <button id="mjli-add" class="mjli-btn-primary">Add note</button>
        `;
        content.querySelector("#mjli-add").addEventListener("click", () =>
          enterEditMode(storageKey)
        );
      } else {
        // Show note with edit/delete buttons
        content.innerHTML = `
          <div class="mjli-note-display">${escapeHtml(noteText)}</div>
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
        });
      }
    });
  }

  function enterEditMode(storageKey) {
    const panel = document.getElementById(ROOT_ID);
    if (!panel) return;

    const content = panel.querySelector("#mjli-content");
    editMode = true;

    storageGet(storageKey).then((noteText) => {
      content.innerHTML = `
        <textarea
          id="mjli-textarea"
          class="mjli-textarea"
          placeholder="e.g., Met at TechCon 2024... worked together at Acme Corp..."
          maxlength="500"
        >${escapeHtml(noteText)}</textarea>
        <div class="mjli-edit-footer">
          <span id="mjli-counter" class="mjli-counter"></span>
          <div class="mjli-edit-buttons">
            <button id="mjli-save" class="mjli-btn-primary">Save</button>
            <button id="mjli-cancel" class="mjli-btn-secondary">Cancel</button>
          </div>
        </div>
      `;

      const textarea = content.querySelector("#mjli-textarea");
      const counter = content.querySelector("#mjli-counter");
      const saveBtn = content.querySelector("#mjli-save");
      const cancelBtn = content.querySelector("#mjli-cancel");

      // Update character counter
      const updateCounter = () => {
        counter.textContent = `${textarea.value.length} / 500`;
      };
      textarea.addEventListener("input", updateCounter);
      updateCounter();

      textarea.focus();

      saveBtn.addEventListener("click", async () => {
        const value = textarea.value.trim();
        await storageSet(storageKey, value);
        renderNoteContent(storageKey);
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

  function renderForCurrentProfile() {
    const profileKey = getProfileKey();
    if (!profileKey) {
      removeExistingPanel();
      lastProfileKey = null;
      return;
    }

    if (profileKey === lastProfileKey && document.getElementById(ROOT_ID)) {
      return;
    }

    lastProfileKey = profileKey;
    const storageKey = `note:${profileKey}`;
    createPanel(profileKey, storageKey);
  }

  function setupNavigationListener() {
    const pushState = history.pushState;
    const replaceState = history.replaceState;

    history.pushState = function () {
      pushState.apply(this, arguments);
      setTimeout(renderForCurrentProfile, 150);
    };

    history.replaceState = function () {
      replaceState.apply(this, arguments);
      setTimeout(renderForCurrentProfile, 150);
    };

    window.addEventListener("popstate", () => setTimeout(renderForCurrentProfile, 150));
  }

  setupNavigationListener();
  renderForCurrentProfile();
  setInterval(renderForCurrentProfile, 2000);
})();
