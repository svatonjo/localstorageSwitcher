const REQUEST_TYPES = {
  GET_ACTIVE_ORIGIN: "GET_ACTIVE_ORIGIN",
  APPLY_PRESET: "APPLY_PRESET"
};

const CONTENT_REQUEST_TYPES = {
  APPLY_LOCAL_STORAGE: "APPLY_LOCAL_STORAGE"
};

function isSupportedPage(url) {
  if (!url) {
    return false;
  }

  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

async function getActiveTab() {
  const tabs = await browser.tabs.query({ active: true, currentWindow: true });
  return tabs[0] ?? null;
}

function getOrigin(url) {
  try {
    return new URL(url).origin;
  } catch {
    return "unknown";
  }
}

async function applyLocalStorageToTab(tabId, key, value) {
  const result = await browser.tabs.sendMessage(tabId, {
    type: CONTENT_REQUEST_TYPES.APPLY_LOCAL_STORAGE,
    key,
    value
  });

  if (!result || !result.ok) {
    throw new Error(result?.error || "Could not apply localStorage value.");
  }
}

browser.action.onClicked.addListener(async () => {
  try {
    await browser.sidebarAction.open();
  } catch {
    // Ignore sidebar open failures in unsupported contexts.
  }
});

browser.runtime.onMessage.addListener(async (message) => {
  if (!message || typeof message !== "object") {
    return { ok: false, error: "Invalid message." };
  }

  if (message.type === REQUEST_TYPES.GET_ACTIVE_ORIGIN) {
    const tab = await getActiveTab();

    if (!tab) {
      return { ok: false, error: "No active tab found." };
    }

    if (!isSupportedPage(tab.url)) {
      return { ok: false, error: "Active tab URL is not supported." };
    }

    return { ok: true, origin: getOrigin(tab.url), tabId: tab.id };
  }

  if (message.type === REQUEST_TYPES.APPLY_PRESET) {
    const key = typeof message.key === "string" ? message.key : "";
    const value = typeof message.value === "string" ? message.value : "";

    if (!key.trim()) {
      return { ok: false, error: "A localStorage key is required." };
    }

    const tab = await getActiveTab();

    if (!tab?.id) {
      return { ok: false, error: "No active tab found." };
    }

    if (!isSupportedPage(tab.url)) {
      return {
        ok: false,
        error: "This page is restricted. Open a normal http/https website and try again."
      };
    }

    try {
      await applyLocalStorageToTab(tab.id, key, value);
      await browser.tabs.reload(tab.id);
      return { ok: true, origin: getOrigin(tab.url) };
    } catch (error) {
      const defaultError = "Could not reach the page script. Reload the page and try again.";
      return {
        ok: false,
        error: error instanceof Error ? error.message || defaultError : defaultError
      };
    }
  }

  return { ok: false, error: "Unknown request type." };
});
