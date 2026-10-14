const REQUEST_TYPES = {
  GET_ACTIVE_ORIGIN: "GET_ACTIVE_ORIGIN",
  APPLY_PRESET: "APPLY_PRESET",
  FETCH_API_VALUE: "FETCH_API_VALUE"
};

const ALLOWED_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"];
const FETCH_TIMEOUT_MS = 15000;

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

function parseHeaders(text) {
  const headers = new Headers();

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();

    if (!line) {
      continue;
    }

    const separator = line.indexOf(":");

    if (separator <= 0) {
      throw new Error(`Invalid header line: "${line}". Use "Name: value".`);
    }

    headers.append(line.slice(0, separator).trim(), line.slice(separator + 1).trim());
  }

  return headers;
}

// Splits "data.items[0].jwt" into ["data", "items", 0, "jwt"].
function parseResponsePath(path) {
  const tokens = [];

  for (const segment of path.split(".")) {
    const match = /^([^[\]]*)((?:\[\d+\])*)$/.exec(segment);

    if (!match || (!match[1] && !match[2])) {
      throw new Error(`Invalid response key path segment: "${segment}".`);
    }

    if (match[1]) {
      tokens.push(match[1]);
    }

    for (const index of match[2].matchAll(/\[(\d+)\]/g)) {
      tokens.push(Number(index[1]));
    }
  }

  return tokens;
}

function resolveResponsePath(data, path) {
  let current = data;

  for (const token of parseResponsePath(path)) {
    if (
      current === null ||
      typeof current !== "object" ||
      !Object.prototype.hasOwnProperty.call(current, token)
    ) {
      throw new Error(`Response key "${path}" was not found in the response.`);
    }

    current = current[token];
  }

  return current;
}

async function fetchApiValue(request, responsePath) {
  const url = typeof request?.url === "string" ? request.url.trim() : "";
  const method = typeof request?.method === "string" ? request.method.toUpperCase() : "GET";
  const body = typeof request?.body === "string" ? request.body : "";
  const path = typeof responsePath === "string" ? responsePath.trim() : "";

  if (!isSupportedPage(url)) {
    throw new Error("Request URL must be a valid http/https URL.");
  }

  if (!ALLOWED_METHODS.includes(method)) {
    throw new Error(`Unsupported request method: ${method}.`);
  }

  const headers = parseHeaders(typeof request?.headers === "string" ? request.headers : "");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  let response;
  let text;

  try {
    response = await fetch(url, {
      method,
      headers,
      body: method === "GET" || !body ? undefined : body,
      signal: controller.signal
    });
    text = await response.text();
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error(`Request timed out after ${FETCH_TIMEOUT_MS / 1000} s.`);
    }

    throw new Error(`Request failed: ${error instanceof Error ? error.message : "network error"}`);
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    throw new Error(`API responded with ${response.status} ${response.statusText}`.trim());
  }

  let data;

  try {
    data = JSON.parse(text);
  } catch {
    if (!path) {
      return text;
    }

    throw new Error("Response is not valid JSON, cannot read the response key.");
  }

  const value = path ? resolveResponsePath(data, path) : data;
  return typeof value === "string" ? value : JSON.stringify(value);
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

  if (message.type === REQUEST_TYPES.FETCH_API_VALUE) {
    try {
      const value = await fetchApiValue(message.request, message.responsePath);
      return { ok: true, value };
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : "API request failed."
      };
    }
  }

  return { ok: false, error: "Unknown request type." };
});
