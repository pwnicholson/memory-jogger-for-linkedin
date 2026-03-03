(() => {
  console.log('[Memory Jogger] Content script loaded');
  const ROOT_ID = "mjli-root";
  const TOOLTIP_ID = "mjli-tooltip";
  const INDICATOR_CLASS = "mjli-indicator";
  let lastProfileKey = null;
  let editMode = false;

  function getProfileKeyFromUrl(url) {
    const match = url.match(/\/in\/([a-z0-9-]+)/i);
    return match ? `/in/${match[1].toLowerCase()}` : null;
  }

  function getProfileKey() {
    return getProfileKeyFromUrl(window.location.pathname);
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

  function removeExistingTooltip() {
    const existing = document.getElementById(TOOLTIP_ID);
    if (existing) existing.remove();
  }

  function findCtaButtonsAnchor() {
    // Look for the action buttons container (Message, Follow, Connect)
    const candidates = [
      document.querySelector('[data-test-id="top-card-button-container"]'),
      document.querySelector('[class*="top-card"]'),
      document.evaluate(
        "//button[contains(., 'Message') or contains(., 'Follow') or contains(., 'Connect')]",
        document,
        null,
        XPathResult.FIRST_ORDERED_NODE_TYPE,
        null
      ).singleNodeValue?.closest('[class*="top-card"], section, div[data-test-id*="top"]')
    ].filter(Boolean);

    return candidates[0] || document.body;
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

    const anchor = findCtaButtonsAnchor();
    // Insert just before the anchor (or at end of parent if anchor is body)
    if (anchor === document.body) {
      document.body.appendChild(panel);
    } else {
      anchor.parentNode.insertBefore(panel, anchor);
    }

    console.log('[Memory Jogger] Panel injected near:', anchor.tagName);

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
        updateAllProfileImageIndicators(); // Refresh indicators
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

  function createTooltip(name, noteText) {
    removeExistingTooltip();
    const tooltip = document.createElement("div");
    tooltip.id = TOOLTIP_ID;
    tooltip.className = "mjli-tooltip";
    const displayText = noteText.trim() ? `${name} - ${noteText}` : name;
    tooltip.textContent = displayText;
    document.body.appendChild(tooltip);
    return tooltip;
  }

  function updateTooltipPosition(event, tooltip) {
    const rect = event.target.getBoundingClientRect();
    tooltip.style.left = rect.left + "px";
    tooltip.style.top = rect.top - tooltip.offsetHeight - 8 + "px";
  }

  function addProfileImageHoverListener(img, profileKey) {
    const storageKey = `note:${profileKey}`;

    img.addEventListener("mouseenter", async () => {
      const noteText = await storageGet(storageKey);
      if (!noteText.trim()) return; // Only show tooltip if there's a note

      // Extract profile name from alt text or nearby elements
      let name = img.alt || "Profile";
      if (!name || name.toLowerCase() === "profile") {
        // Try to find name from nearby text
        const parent = img.closest("a, div[data-test-id], li");
        if (parent) {
          const nameEl = parent.querySelector("[class*='name'], h3, h4, span[dir]");
          if (nameEl) name = nameEl.textContent.trim() || name;
        }
      }

      const tooltip = createTooltip(name, noteText);
      updateTooltipPosition({ target: img }, tooltip);

      const moveHandler = (e) => updateTooltipPosition({ target: img }, tooltip);
      img.addEventListener("mousemove", moveHandler);

      img.addEventListener(
        "mouseleave",
        () => {
          removeExistingTooltip();
          img.removeEventListener("mousemove", moveHandler);
        },
        { once: true }
      );
    });
  }

  function addIndicatorBadge(img, profileKey) {
    const storageKey = `note:${profileKey}`;

    storageGet(storageKey).then((noteText) => {
      if (!noteText.trim()) return; // Only add indicator if there's a note

      // Check if indicator already exists
      if (img.querySelector(`.${INDICATOR_CLASS}`)) return;

      // Add indicator to image container
      const container = img.closest("a, span, div");
      if (!container || container === document.body) return;

      // Position relative to container
      if (window.getComputedStyle(container).position === "static") {
        container.style.position = "relative";
      }

      const indicator = document.createElement("div");
      indicator.className = INDICATOR_CLASS;
      indicator.title = "You have a memory note for this profile";
      indicator.innerHTML = "📝";
      container.appendChild(indicator);
    });
  }

  function findAndEnhanceAllProfileImages() {
    // Find all profile images across the page
    const profileImages = document.querySelectorAll(
      'a[href*="/in/"] img, img[alt*="Avatar"], button[data-test-id*="profile"] img'
    );

    console.log('[Memory Jogger] Found profile images:', profileImages.length);

    profileImages.forEach((img) => {
      // Get the profile key from the nearest link
      const link = img.closest('a[href*="/in/"]') || img.closest('[href*="/in/"]');
      if (!link) return;

      const profileKey = getProfileKeyFromUrl(link.href);
      if (!profileKey) return;

      // Skip if already processed
      if (img.dataset.mjliProcessed) return;
      img.dataset.mjliProcessed = "true";

      addIndicatorBadge(img, profileKey);
      addProfileImageHoverListener(img, profileKey);
    });
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

  function renderForCurrentProfile() {
    const profileKey = getProfileKey();
    console.log('[Memory Jogger] Current page:', { profileKey, url: window.location.href });

    if (!profileKey) {
      removeExistingPanel();
      lastProfileKey = null;
      findAndEnhanceAllProfileImages();
      return;
    }

    if (profileKey === lastProfileKey && document.getElementById(ROOT_ID)) {
      findAndEnhanceAllProfileImages();
      return;
    }

    lastProfileKey = profileKey;
    const storageKey = `note:${profileKey}`;
    console.log('[Memory Jogger] Creating panel for:', profileKey);
    createPanel(profileKey, storageKey);
    findAndEnhanceAllProfileImages();
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

  // Also watch for dynamic DOM changes (LinkedIn loads content dynamically)
  const observer = new MutationObserver(() => {
    findAndEnhanceAllProfileImages();
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: false
  });

  setupNavigationListener();
  renderForCurrentProfile();
  setInterval(renderForCurrentProfile, 2000);
})();
