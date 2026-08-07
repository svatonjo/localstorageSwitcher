const STORAGE_KEYS = {
  SCHEMA_VERSION: "schemaVersion",
  PRESETS: "presets"
};

const CURRENT_SCHEMA_VERSION = 1;

function ensurePresetShape(preset) {
  const now = Date.now();
  const normalizedGroup =
    typeof preset.group === "string" && preset.group.trim() ? preset.group.trim() : "General";

  return {
    id: typeof preset.id === "string" && preset.id ? preset.id : makeId(),
    group: normalizedGroup,
    label: typeof preset.label === "string" ? preset.label.trim() : "",
    key: typeof preset.key === "string" ? preset.key : "",
    value: typeof preset.value === "string" ? preset.value : "",
    createdAt: typeof preset.createdAt === "number" ? preset.createdAt : now,
    updatedAt: typeof preset.updatedAt === "number" ? preset.updatedAt : now
  };
}

function makeId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `preset-${Date.now()}-${Math.floor(Math.random() * 1000000)}`;
}

function sortPresets(presets) {
  return presets.slice().sort((a, b) => {
    const byGroup = a.group.localeCompare(b.group);
    if (byGroup !== 0) {
      return byGroup;
    }

    return a.label.localeCompare(b.label);
  });
}

async function getStore() {
  const result = await browser.storage.local.get([STORAGE_KEYS.SCHEMA_VERSION, STORAGE_KEYS.PRESETS]);

  const presets = Array.isArray(result[STORAGE_KEYS.PRESETS])
    ? result[STORAGE_KEYS.PRESETS].map(ensurePresetShape)
    : [];

  return {
    schemaVersion:
      typeof result[STORAGE_KEYS.SCHEMA_VERSION] === "number"
        ? result[STORAGE_KEYS.SCHEMA_VERSION]
        : CURRENT_SCHEMA_VERSION,
    presets: sortPresets(presets)
  };
}

async function saveStore(presets) {
  const normalized = sortPresets((Array.isArray(presets) ? presets : []).map(ensurePresetShape));

  await browser.storage.local.set({
    [STORAGE_KEYS.SCHEMA_VERSION]: CURRENT_SCHEMA_VERSION,
    [STORAGE_KEYS.PRESETS]: normalized
  });

  return normalized;
}

async function createPreset(input) {
  const group = typeof input?.group === "string" && input.group.trim() ? input.group.trim() : "General";
  const label = typeof input?.label === "string" ? input.label.trim() : "";
  const key = typeof input?.key === "string" ? input.key : "";
  const value = typeof input?.value === "string" ? input.value : "";

  if (!label) {
    throw new Error("Preset name is required.");
  }

  if (!key.trim()) {
    throw new Error("localStorage key is required.");
  }

  const store = await getStore();
  const duplicate = store.presets.some(
    (preset) =>
      preset.group.toLowerCase() === group.toLowerCase() &&
      preset.label.toLowerCase() === label.toLowerCase()
  );

  if (duplicate) {
    throw new Error("A preset with this name already exists in this group.");
  }

  const newPreset = ensurePresetShape({ group, label, key, value });
  const updated = [...store.presets, newPreset];
  await saveStore(updated);

  return newPreset;
}

async function updatePreset(id, input) {
  if (!id) {
    throw new Error("Preset id is required.");
  }

  const store = await getStore();
  const index = store.presets.findIndex((preset) => preset.id === id);

  if (index < 0) {
    throw new Error("Preset not found.");
  }

  const original = store.presets[index];
  const group =
    typeof input?.group === "string" && input.group.trim() ? input.group.trim() : original.group;
  const label = typeof input?.label === "string" ? input.label.trim() : original.label;
  const key = typeof input?.key === "string" ? input.key : original.key;
  const value = typeof input?.value === "string" ? input.value : original.value;

  if (!label) {
    throw new Error("Preset name is required.");
  }

  if (!key.trim()) {
    throw new Error("localStorage key is required.");
  }

  const duplicate = store.presets.some(
    (preset) =>
      preset.id !== id &&
      preset.group.toLowerCase() === group.toLowerCase() &&
      preset.label.toLowerCase() === label.toLowerCase()
  );

  if (duplicate) {
    throw new Error("Another preset already uses this name in this group.");
  }

  const updatedPreset = ensurePresetShape({
    ...original,
    group,
    label,
    key,
    value,
    updatedAt: Date.now()
  });

  const next = store.presets.slice();
  next[index] = updatedPreset;
  await saveStore(next);

  return updatedPreset;
}

async function deletePreset(id) {
  if (!id) {
    throw new Error("Preset id is required.");
  }

  const store = await getStore();
  const exists = store.presets.some((preset) => preset.id === id);

  if (!exists) {
    throw new Error("Preset not found.");
  }

  const next = store.presets.filter((preset) => preset.id !== id);
  await saveStore(next);
}

async function getPresetById(id) {
  const store = await getStore();
  return store.presets.find((preset) => preset.id === id) || null;
}

window.StorageRepo = {
  getStore,
  createPreset,
  updatePreset,
  deletePreset,
  getPresetById
};
