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
      try {
        chrome.storage.sync.get([key], (result) => {
          if (chrome.runtime.lastError) {
            console.warn('[Memory Jogger] Storage error on get:', chrome.runtime.lastError);
            resolve("");
          } else {
            resolve(result[key] || "");
          }
        });
      } catch (e) {
        console.error('[Memory Jogger] Storage exception:', e);
        resolve("");
      }
    });
  }

  function storageSet(key, value) {
    return new Promise((resolve) => {
      try {
        chrome.storage.sync.set({ [key]: value }, () => {
          if (chrome.runtime.lastError) {
            console.warn('[Memory Jogger] Storage error on set:', chrome.runtime.lastError);
          } else {
            console.log('[Memory Jogger] Saved:', key);
          }
          resolve();
        });
      } catch (e) {
        console.error('[Memory Jogger] Storage exception:', e);
        resolve();
      }
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
    // Find the button container in the top card and insert right after it
    const main = document.querySelector('main');
    if (!main) {
      console.log('[Memory Jogger] No main element');
      return document.body;
    }

    // Find the container with the action buttons
    let buttonContainer = document.querySelector('[data-test-id="top-card-button-container"]');
    
    if (buttonContainer) {
      // Insert after this button container
      console.log('[Memory Jogger] Found button container');
      return buttonContainer;
    }

    // Fallback: find any section with Message/Connect/Follow buttons
    const allButtons = main.querySelectorAll('button');
    for (let btn of allButtons) {
      if (btn.textContent.includes('Message') || btn.textContent.includes('Connect') || btn.textContent.includes('Follow')) {
        buttonContainer = btn.closest('section, div[class*="button"], div[class*="action"]');
        if (buttonContainer) {
          console.log('[Memory Jogger] Found button section');
          return buttonContainer;
        }
      }
    }

    console.log('[Memory Jogger] No button container found, using main');
    return main;
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

    const target = findCtaButtonsAnchor();
    
    // Insert right after the button container
    if (target && target !== document.body) {
      target.parentNode.insertBefore(panel, target.nextSibling);
    } else {
      // Fallback to beginning of main
      const main = document.querySelector('main');
      if (main && main.firstChild) {
        main.insertBefore(panel, main.firstChild);
      } else {
        document.body.appendChild(panel);
      }
    }

    console.log('[Memory Jogger] Panel injected');

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
      console.log('[Memory Jogger] Hover on image for:', profileKey);
      const noteText = await storageGet(storageKey);
      console.log('[Memory Jogger] Note text:', noteText ? noteText.substring(0, 30) : '(empty)');
      
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

      console.log('[Memory Jogger] Showing tooltip for:', name);
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
        console.log('[Memory Jogger] No suitable container for badge');
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
        return;
      }

      const indicator = document.createElement("div");
      indicator.className = INDICATOR_CLASS;
      indicator.setAttribute("data-profile-key", profileKey);
      indicator.title = "Memory note saved for this profile";
      indicator.textContent = "📝";
      
      container.appendChild(indicator);
      img.dataset.mjliBadge = "true";
      
      console.log('[Memory Jogger] Badge added for:', profileKey);
    });
  }

  function findAndEnhanceAllProfileImages() {
    // Special handling for profile page main avatar
    const profileKey = getProfileKey();
    if (profileKey) {
      // Look for the main profile avatar at the top of the page
      const topCard = document.querySelector('[data-test-id="top-card"]');
      if (topCard) {
        // Find all images in top card and take the first substantial one (likely the avatar)
        const topCardImages = topCard.querySelectorAll('img');
        console.log('[Memory Jogger] Found', topCardImages.length, 'images in top card');
        
        for (let img of topCardImages) {
          if (!img.dataset.mjliProcessed) {
            // Check if this looks like a profile avatar (not tiny icon)
            const rect = img.getBoundingClientRect();
            if (rect.width > 50 && rect.height > 50) {
              img.dataset.mjliProcessed = "true";
              addProfileImageHoverListener(img, profileKey);
              addIndicatorBadge(img, profileKey);
              console.log('[Memory Jogger] Processed main profile avatar');
              break; // Only process the first large image
            }
          }
        }
      }
    }

    // Find all other potential profile images across the page
    const allImages = document.querySelectorAll('img');
    console.log('[Memory Jogger] Scanning', allImages.length, 'images for profiles');

    let processed = 0;
    allImages.forEach((img) => {
      // Skip if already processed
      if (img.dataset.mjliProcessed) return;

      // Skip obvious non-profile images
      if (img.alt && (img.alt.toLowerCase().includes('logo') || img.alt.toLowerCase().includes('icon'))) {
        return;
      }

      let profileKey = null;

      // Strategy 1: Direct parent is a profile link
      const directLink = img.closest('a[href*="/in/"]');
      if (directLink) {
        profileKey = getProfileKeyFromUrl(directLink.href);
        if (profileKey) {
          img.dataset.mjliProcessed = "true";
          processed++;
          addProfileImageHoverListener(img, profileKey);
          addIndicatorBadge(img, profileKey);
          return;
        }
      }

      // Strategy 2: Search siblings and nearby elements for profile links
      let searchParent = img.parentElement;
      for (let depth = 0; depth < 4 && searchParent; depth++) {
        const profileLinks = searchParent.querySelectorAll('a[href*="/in/"]');
        if (profileLinks.length > 0) {
          profileKey = getProfileKeyFromUrl(profileLinks[0].href);
          if (profileKey) {
            break;
          }
        }
        searchParent = searchParent.parentElement;
      }

      // Strategy 3: Check if image is in a card with a profile link somewhere
      if (!profileKey) {
        const card = img.closest('[data-test-id*="feed"], [data-test-id*="card"], article, li');
        if (card) {
          const profileLink = card.querySelector('a[href*="/in/"]');
          if (profileLink) {
            profileKey = getProfileKeyFromUrl(profileLink.href);
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
      console.log('[Memory Jogger] Processed', processed, 'additional images');
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

  function renderForCurrentProfile() {
    const profileKey = getProfileKey();
    console.log('[Memory Jogger] Check page:', { profileKey, hasPanel: !!document.getElementById(ROOT_ID) });

    if (!profileKey) {
      removeExistingPanel();
      lastProfileKey = null;
      findAndEnhanceAllProfileImages();
      return;
    }

    // If we're on a profile page
    if (profileKey !== lastProfileKey) {
      // Profile changed, recreate panel
      lastProfileKey = profileKey;
      const storageKey = `note:${profileKey}`;
      console.log('[Memory Jogger] New profile detected:', profileKey);
      setTimeout(() => createPanel(profileKey, storageKey), 100);
    } else if (!document.getElementById(ROOT_ID)) {
      // Same profile but panel was removed, recreate it
      const storageKey = `note:${profileKey}`;
      console.log('[Memory Jogger] Panel missing, recreating:', profileKey);
      createPanel(profileKey, storageKey);
    }

    // Always update profile images (in case new ones loaded)
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
