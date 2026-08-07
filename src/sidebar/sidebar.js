const REQUEST_TYPES = {
  GET_ACTIVE_ORIGIN: "GET_ACTIVE_ORIGIN",
  APPLY_PRESET: "APPLY_PRESET"
};

const ui = {
  presetGroups: document.getElementById("presetGroups"),
  presetGroup: document.getElementById("presetGroup"),
  presetLabel: document.getElementById("presetLabel"),
  storageKey: document.getElementById("storageKey"),
  storageValue: document.getElementById("storageValue"),
  createBtn: document.getElementById("createBtn"),
  updateBtn: document.getElementById("updateBtn"),
  deleteBtn: document.getElementById("deleteBtn"),
  applyBtn: document.getElementById("applyBtn"),
  status: document.getElementById("status"),
  activeOrigin: document.getElementById("activeOrigin")
};

let presets = [];
let selectedPresetId = null;

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

function clearForm() {
  ui.presetGroup.value = "";
  ui.presetLabel.value = "";
  ui.storageKey.value = "";
  ui.storageValue.value = "";
}

function fillForm(preset) {
  ui.presetGroup.value = preset.group;
  ui.presetLabel.value = preset.label;
  ui.storageKey.value = preset.key;
  ui.storageValue.value = preset.value;
}

function getSelectedPreset() {
  if (!selectedPresetId) {
    return null;
  }

  return presets.find((preset) => preset.id === selectedPresetId) || null;
}

function renderPresetList() {
  ui.presetGroups.innerHTML = "";

  if (!presets.length) {
    const empty = document.createElement("p");
    empty.className = "origin";
    empty.textContent = "No presets yet.";
    ui.presetGroups.append(empty);
  }

  const grouped = new Map();

  for (const preset of presets) {
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
      const item = document.createElement("button");
      item.type = "button";
      item.className = "preset-item";
      item.dataset.presetId = preset.id;

      const title = document.createElement("span");
      title.textContent = preset.label;
      item.append(title);

      const meta = document.createElement("span");
      meta.className = "meta";
      meta.textContent = `key: ${preset.key}`;
      item.append(meta);

      if (preset.id === selectedPresetId) {
        item.classList.add("active");
      }

      list.append(item);
    }

    details.append(list);
    ui.presetGroups.append(details);
  }

  const hasSelection = Boolean(getSelectedPreset());
  ui.updateBtn.disabled = !hasSelection;
  ui.deleteBtn.disabled = !hasSelection;
  ui.applyBtn.disabled = !hasSelection;
}

async function reloadPresets() {
  const store = await window.StorageRepo.getStore();
  presets = store.presets;

  if (!presets.some((preset) => preset.id === selectedPresetId)) {
    selectedPresetId = null;
    clearForm();
  }

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
    group: ui.presetGroup.value,
    label: ui.presetLabel.value,
    key: ui.storageKey.value,
    value: ui.storageValue.value
  };
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

  selectedPresetId = clickedButton.dataset.presetId || null;
  const selected = getSelectedPreset();

  if (!selected) {
    clearForm();
    renderPresetList();
    return;
  }

  fillForm(selected);
  renderPresetList();
}

function bindEvents() {
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
