const REQUEST_TYPES = {
  GET_ACTIVE_ORIGIN: "GET_ACTIVE_ORIGIN",
  APPLY_PRESET: "APPLY_PRESET",
  FETCH_API_VALUE: "FETCH_API_VALUE"
};

const DELETE_CONFIRM_TIMEOUT_MS = 4000;
const SVG_NS = "http://www.w3.org/2000/svg";
const ICON_PATHS = {
  apply: "M8 5v14l11-7z",
  fetch:
    "M17.65 6.35A7.95 7.95 0 0 0 12 4a8 8 0 1 0 7.73 10h-2.08A6 6 0 1 1 12 6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"
};

const ui = {
  collectionSelect: document.getElementById("collectionSelect"),
  newCollectionBtn: document.getElementById("newCollectionBtn"),
  renameCollectionBtn: document.getElementById("renameCollectionBtn"),
  deleteCollectionBtn: document.getElementById("deleteCollectionBtn"),
  collectionEditor: document.getElementById("collectionEditor"),
  collectionName: document.getElementById("collectionName"),
  saveCollectionBtn: document.getElementById("saveCollectionBtn"),
  cancelCollectionBtn: document.getElementById("cancelCollectionBtn"),
  presetGroups: document.getElementById("presetGroups"),
  presetGroup: document.getElementById("presetGroup"),
  presetLabel: document.getElementById("presetLabel"),
  storageKey: document.getElementById("storageKey"),
  storageValue: document.getElementById("storageValue"),
  valueMode: document.getElementById("valueMode"),
  apiSection: document.getElementById("apiSection"),
  apiMethod: document.getElementById("apiMethod"),
  apiUrl: document.getElementById("apiUrl"),
  apiHeaders: document.getElementById("apiHeaders"),
  apiBody: document.getElementById("apiBody"),
  responsePath: document.getElementById("responsePath"),
  fetchBtn: document.getElementById("fetchBtn"),
  createBtn: document.getElementById("createBtn"),
  updateBtn: document.getElementById("updateBtn"),
  deleteBtn: document.getElementById("deleteBtn"),
  applyBtn: document.getElementById("applyBtn"),
  status: document.getElementById("status"),
  activeOrigin: document.getElementById("activeOrigin")
};

let collections = [];
let activeCollectionId = null;
let presets = [];
let selectedPresetId = null;
let collectionEditMode = null;
let deleteConfirmTimer = null;
let isFetching = false;

function setStatus(message, tone = "info") {
  ui.status.textContent = message;
  ui.status.className = "status";

  if (tone === "error") {
    ui.status.classList.add("error");
  }

  if (tone === "success") {
    ui.status.classList.add("success");
  }
}

function updateApiVisibility() {
  ui.apiSection.hidden = ui.valueMode.value !== "api";
  updateButtons();
}

function clearForm() {
  ui.presetGroup.value = "";
  ui.presetLabel.value = "";
  ui.storageKey.value = "";
  ui.storageValue.value = "";
  ui.valueMode.value = "static";
  ui.apiMethod.value = "GET";
  ui.apiUrl.value = "";
  ui.apiHeaders.value = "";
  ui.apiBody.value = "";
  ui.responsePath.value = "";
  updateApiVisibility();
}

function fillForm(preset) {
  ui.presetGroup.value = preset.group;
  ui.presetLabel.value = preset.label;
  ui.storageKey.value = preset.key;
  ui.storageValue.value = preset.value;
  ui.valueMode.value = preset.valueMode;
  ui.apiMethod.value = preset.request.method;
  ui.apiUrl.value = preset.request.url;
  ui.apiHeaders.value = preset.request.headers;
  ui.apiBody.value = preset.request.body;
  ui.responsePath.value = preset.responsePath;
  updateApiVisibility();
}

function getVisiblePresets() {
  return presets.filter((preset) => preset.collectionId === activeCollectionId);
}

function getSelectedPreset() {
  if (!selectedPresetId) {
    return null;
  }

  return getVisiblePresets().find((preset) => preset.id === selectedPresetId) || null;
}

function getActiveCollection() {
  return collections.find((collection) => collection.id === activeCollectionId) || null;
}

function updateButtons() {
  const hasSelection = Boolean(getSelectedPreset());
  ui.updateBtn.disabled = !hasSelection;
  ui.deleteBtn.disabled = !hasSelection;
  ui.applyBtn.disabled = !hasSelection;
  ui.fetchBtn.disabled = !hasSelection || isFetching || ui.valueMode.value !== "api";
}

function resetDeleteConfirm() {
  clearTimeout(deleteConfirmTimer);
  deleteConfirmTimer = null;
  ui.deleteCollectionBtn.textContent = "Delete";
  ui.deleteCollectionBtn.classList.remove("danger");
}

function renderCollections() {
  ui.collectionSelect.innerHTML = "";

  for (const collection of collections) {
    const option = document.createElement("option");
    option.value = collection.id;
    option.textContent = collection.name;
    ui.collectionSelect.append(option);
  }

  ui.collectionSelect.value = activeCollectionId;
  ui.deleteCollectionBtn.disabled = collections.length <= 1;
}

function createIconButton(presetId, action, title, pathData, disabled = false) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = `icon-btn icon-${action}`;
  button.dataset.presetId = presetId;
  button.dataset.action = action;
  button.title = title;
  button.setAttribute("aria-label", title);
  button.disabled = disabled;

  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  const path = document.createElementNS(SVG_NS, "path");
  path.setAttribute("d", pathData);
  svg.append(path);
  button.append(svg);

  return button;
}

function renderPresetList() {
  ui.presetGroups.innerHTML = "";
  const visiblePresets = getVisiblePresets();

  if (!visiblePresets.length) {
    const empty = document.createElement("p");
    empty.className = "origin";
    empty.textContent = "No presets in this collection yet.";
    ui.presetGroups.append(empty);
  }

  const grouped = new Map();

  for (const preset of visiblePresets) {
    if (!grouped.has(preset.group)) {
      grouped.set(preset.group, []);
    }

    grouped.get(preset.group).push(preset);
  }

  for (const [groupName, groupPresets] of grouped.entries()) {
    const details = document.createElement("details");
    details.className = "preset-group";
    details.open = groupPresets.some((preset) => preset.id === selectedPresetId);

    const summary = document.createElement("summary");
    summary.textContent = `${groupName} (${groupPresets.length})`;
    details.append(summary);

    const list = document.createElement("div");
    list.className = "preset-list";

    for (const preset of groupPresets) {
      const row = document.createElement("div");
      row.className = "preset-row";

      const item = document.createElement("button");
      item.type = "button";
      item.className = "preset-item";
      item.dataset.presetId = preset.id;

      const title = document.createElement("span");
      title.textContent = preset.label;
      item.append(title);

      const meta = document.createElement("span");
      meta.className = "meta";
      meta.textContent =
        preset.valueMode === "api" ? `key: ${preset.key} | from API` : `key: ${preset.key}`;
      item.append(meta);

      if (preset.id === selectedPresetId) {
        item.classList.add("active");
      }

      const actions = document.createElement("div");
      actions.className = "preset-actions";

      if (preset.valueMode === "api") {
        actions.append(
          createIconButton(preset.id, "fetch", "Fetch from API + save", ICON_PATHS.fetch, isFetching)
        );
      }

      actions.append(
        createIconButton(preset.id, "apply", "Apply to active tab + refresh", ICON_PATHS.apply)
      );

      row.append(item, actions);
      list.append(row);
    }

    details.append(list);
    ui.presetGroups.append(details);
  }

  updateButtons();
}

async function reloadPresets() {
  const store = await window.StorageRepo.getStore();
  collections = store.collections;
  activeCollectionId = store.activeCollectionId;
  presets = store.presets;

  if (!getSelectedPreset()) {
    selectedPresetId = null;
    clearForm();
  }

  renderCollections();
  renderPresetList();
}

async function refreshActiveOrigin() {
  try {
    const result = await browser.runtime.sendMessage({ type: REQUEST_TYPES.GET_ACTIVE_ORIGIN });

    if (!result.ok) {
      ui.activeOrigin.textContent = `Active origin: ${result.error}`;
      return;
    }

    ui.activeOrigin.textContent = `Active origin: ${result.origin}`;
  } catch {
    ui.activeOrigin.textContent = "Active origin: unavailable";
  }
}

function readInput() {
  return {
    collectionId: activeCollectionId,
    group: ui.presetGroup.value,
    label: ui.presetLabel.value,
    key: ui.storageKey.value,
    value: ui.storageValue.value,
    valueMode: ui.valueMode.value,
    request: {
      method: ui.apiMethod.value,
      url: ui.apiUrl.value,
      headers: ui.apiHeaders.value,
      body: ui.apiBody.value
    },
    responsePath: ui.responsePath.value
  };
}

function openCollectionEditor(mode) {
  resetDeleteConfirm();
  collectionEditMode = mode;
  ui.collectionName.value = mode === "rename" ? getActiveCollection()?.name || "" : "";
  ui.collectionEditor.hidden = false;
  ui.collectionName.focus();
  ui.collectionName.select();
}

function closeCollectionEditor() {
  collectionEditMode = null;
  ui.collectionEditor.hidden = true;
  ui.collectionName.value = "";
}

async function handleSaveCollection() {
  try {
    if (collectionEditMode === "rename") {
      await window.StorageRepo.renameCollection(activeCollectionId, ui.collectionName.value);
      setStatus("Collection renamed.", "success");
    } else {
      await window.StorageRepo.createCollection(ui.collectionName.value);
      selectedPresetId = null;
      setStatus("Collection created.", "success");
    }

    closeCollectionEditor();
    await reloadPresets();
  } catch (error) {
    setStatus(error instanceof Error ? error.message : "Failed to save collection.", "error");
  }
}

function handleCollectionNameKeydown(event) {
  if (event.key === "Enter") {
    event.preventDefault();
    handleSaveCollection();
  } else if (event.key === "Escape") {
    closeCollectionEditor();
  }
}

async function handleDeleteCollection() {
  const collection = getActiveCollection();

  if (!collection) {
    return;
  }

  if (!deleteConfirmTimer) {
    closeCollectionEditor();
    ui.deleteCollectionBtn.textContent = "Confirm?";
    ui.deleteCollectionBtn.classList.add("danger");
    deleteConfirmTimer = setTimeout(resetDeleteConfirm, DELETE_CONFIRM_TIMEOUT_MS);
    setStatus(`Click again to delete "${collection.name}" and all its presets.`);
    return;
  }

  resetDeleteConfirm();

  try {
    await window.StorageRepo.deleteCollection(collection.id);
    selectedPresetId = null;
    await reloadPresets();
    setStatus(`Collection "${collection.name}" deleted.`, "success");
  } catch (error) {
    setStatus(error instanceof Error ? error.message : "Failed to delete collection.", "error");
  }
}

async function handleCollectionChange() {
  resetDeleteConfirm();
  closeCollectionEditor();

  try {
    await window.StorageRepo.setActiveCollection(ui.collectionSelect.value);
    selectedPresetId = null;
    await reloadPresets();
    setStatus(`Switched to "${getActiveCollection()?.name || ""}".`);
  } catch (error) {
    setStatus(error instanceof Error ? error.message : "Failed to switch collection.", "error");
  }
}

// Firefox MV3 treats host_permissions as optional, so without a grant the background fetch hits CORS.
function requestHostPermission(url) {
  let parsed;

  try {
    parsed = new URL(url);
  } catch {
    return Promise.resolve(true);
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return Promise.resolve(true);
  }

  return browser.permissions.request({ origins: [`${parsed.protocol}//${parsed.hostname}/*`] });
}

async function handleFetch() {
  const selected = getSelectedPreset();

  if (!selected) {
    setStatus("Select a preset to fetch its value.", "error");
    return;
  }

  const input = readInput();

  if (input.valueMode !== "api") {
    setStatus("Switch value source to \"From API\" first.", "error");
    return;
  }

  // Must run before any await: Firefox only allows permissions.request() inside a user gesture.
  const permissionRequest = requestHostPermission(input.request.url);

  isFetching = true;
  renderPresetList();
  setStatus("Calling API...");

  try {
    if (!(await permissionRequest)) {
      setStatus("Permission to access the API host was denied.", "error");
      return;
    }

    const result = await browser.runtime.sendMessage({
      type: REQUEST_TYPES.FETCH_API_VALUE,
      request: input.request,
      responsePath: input.responsePath
    });

    if (!result?.ok) {
      setStatus(result?.error || "API request failed.", "error");
      return;
    }

    await window.StorageRepo.updatePreset(selected.id, { ...input, value: result.value });
    await reloadPresets();
    const updated = getSelectedPreset();

    if (updated) {
      fillForm(updated);
    }

    setStatus("Value fetched and saved.", "success");
  } catch (error) {
    setStatus(error instanceof Error ? error.message : "Failed to fetch value.", "error");
  } finally {
    isFetching = false;
    renderPresetList();
  }
}

async function handleCreate() {
  setStatus("Creating preset...");

  try {
    const preset = await window.StorageRepo.createPreset(readInput());
    selectedPresetId = preset.id;
    await reloadPresets();
    const current = getSelectedPreset();
    if (current) {
      fillForm(current);
    }
    setStatus("Preset created.", "success");
  } catch (error) {
    setStatus(error instanceof Error ? error.message : "Failed to create preset.", "error");
  }
}

async function handleUpdate() {
  const selected = getSelectedPreset();

  if (!selected) {
    setStatus("Select a preset to update.", "error");
    return;
  }

  setStatus("Updating preset...");

  try {
    await window.StorageRepo.updatePreset(selected.id, readInput());
    await reloadPresets();
    const updated = getSelectedPreset();

    if (updated) {
      fillForm(updated);
    }

    setStatus("Preset updated.", "success");
  } catch (error) {
    setStatus(error instanceof Error ? error.message : "Failed to update preset.", "error");
  }
}

async function handleDelete() {
  const selected = getSelectedPreset();

  if (!selected) {
    setStatus("Select a preset to delete.", "error");
    return;
  }

  setStatus("Deleting preset...");

  try {
    await window.StorageRepo.deletePreset(selected.id);
    selectedPresetId = null;
    clearForm();
    await reloadPresets();
    setStatus("Preset deleted.", "success");
  } catch (error) {
    setStatus(error instanceof Error ? error.message : "Failed to delete preset.", "error");
  }
}

async function handleApply() {
  const selected = getSelectedPreset();

  if (!selected) {
    setStatus("Select a preset to apply.", "error");
    return;
  }

  setStatus("Applying preset to active tab...");

  try {
    const result = await browser.runtime.sendMessage({
      type: REQUEST_TYPES.APPLY_PRESET,
      key: selected.key,
      value: selected.value
    });

    if (!result.ok) {
      setStatus(result.error || "Failed to apply preset.", "error");
      return;
    }

    setStatus(`Applied on ${result.origin}. Tab reloaded.`, "success");
    await refreshActiveOrigin();
  } catch {
    setStatus("Failed to communicate with background script.", "error");
  }
}

function handleListChange(event) {
  const clickedButton = event.target.closest("button[data-preset-id]");

  if (!clickedButton) {
    return;
  }

  const presetId = clickedButton.dataset.presetId || null;
  const action = clickedButton.dataset.action;

  // Keep unsaved form edits when acting on the already selected preset.
  if (presetId !== selectedPresetId || !action) {
    selectedPresetId = presetId;
    const selected = getSelectedPreset();

    if (selected) {
      fillForm(selected);
    } else {
      clearForm();
    }
  }

  renderPresetList();

  if (action === "apply") {
    handleApply();
  } else if (action === "fetch") {
    handleFetch();
  }
}

function bindEvents() {
  ui.collectionSelect.addEventListener("change", handleCollectionChange);
  ui.newCollectionBtn.addEventListener("click", () => openCollectionEditor("create"));
  ui.renameCollectionBtn.addEventListener("click", () => openCollectionEditor("rename"));
  ui.deleteCollectionBtn.addEventListener("click", handleDeleteCollection);
  ui.saveCollectionBtn.addEventListener("click", handleSaveCollection);
  ui.cancelCollectionBtn.addEventListener("click", closeCollectionEditor);
  ui.collectionName.addEventListener("keydown", handleCollectionNameKeydown);
  ui.valueMode.addEventListener("change", updateApiVisibility);
  ui.fetchBtn.addEventListener("click", handleFetch);
  ui.presetGroups.addEventListener("click", handleListChange);
  ui.createBtn.addEventListener("click", handleCreate);
  ui.updateBtn.addEventListener("click", handleUpdate);
  ui.deleteBtn.addEventListener("click", handleDelete);
  ui.applyBtn.addEventListener("click", handleApply);
}

async function initialize() {
  bindEvents();
  await reloadPresets();
  await refreshActiveOrigin();
  setStatus("Ready.");
}

initialize().catch((error) => {
  setStatus(error instanceof Error ? error.message : "Initialization failed.", "error");
});
