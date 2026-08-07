const CONTENT_REQUEST_TYPES = {
  APPLY_LOCAL_STORAGE: "APPLY_LOCAL_STORAGE"
};

browser.runtime.onMessage.addListener((message) => {
  if (!message || message.type !== CONTENT_REQUEST_TYPES.APPLY_LOCAL_STORAGE) {
    return undefined;
  }

  const key = typeof message.key === "string" ? message.key : "";
  const value = typeof message.value === "string" ? message.value : "";

  if (!key.trim()) {
    return Promise.resolve({ ok: false, error: "A localStorage key is required." });
  }

  try {
    window.localStorage.setItem(key, value);
    return Promise.resolve({ ok: true });
  } catch (error) {
    return Promise.resolve({
      ok: false,
      error: error instanceof Error ? error.message : "Failed to update localStorage."
    });
  }
});
