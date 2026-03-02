(() => {
  const ROOT_ID = "mjli-root";
  let lastProfileKey = null;

  function getProfileKey() {
    const path = window.location.pathname.replace(/\/+$/, "");
    if (!path.startsWith("/in/")) return null;
    return path.toLowerCase();
  }

  function storageGet(key) {
    return new Promise((resolve) => {
      chrome.storage.local.get([key], (result) => resolve(result[key] || ""));
    });
  }

  function storageSet(key, value) {
    return new Promise((resolve) => {
      chrome.storage.local.set({ [key]: value }, () => resolve());
    });
  }

  function removeExistingPanel() {
    const existing = document.getElementById(ROOT_ID);
    if (existing) existing.remove();
  }

  function createPanel(profileKey) {
    removeExistingPanel();

    const panel = document.createElement("section");
    panel.id = ROOT_ID;
    panel.innerHTML = `
      <div class="mjli-header">Memory Jogger</div>
      <label class="mjli-label" for="mjli-note">How I know them</label>
      <textarea id="mjli-note" class="mjli-textarea" placeholder="Met at... worked together at..."></textarea>
      <div class="mjli-row">
        <button id="mjli-save" class="mjli-button">Save note</button>
        <span id="mjli-status" class="mjli-status" aria-live="polite"></span>
      </div>
    `;

    document.body.appendChild(panel);

    const textarea = panel.querySelector("#mjli-note");
    const saveButton = panel.querySelector("#mjli-save");
    const status = panel.querySelector("#mjli-status");

    const storageKey = `note:${profileKey}`;

    storageGet(storageKey).then((value) => {
      textarea.value = value;
    });

    saveButton.addEventListener("click", async () => {
      const value = textarea.value.trim();
      await storageSet(storageKey, value);
      status.textContent = "Saved";
      setTimeout(() => {
        status.textContent = "";
      }, 1500);
    });
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
    createPanel(profileKey);
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
