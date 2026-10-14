const STORAGE_KEYS = {
  SCHEMA_VERSION: "schemaVersion",
  PRESETS: "presets",
  COLLECTIONS: "collections",
  ACTIVE_COLLECTION_ID: "activeCollectionId"
};

const CURRENT_SCHEMA_VERSION = 2;
const DEFAULT_COLLECTION_NAME = "Default";
const HTTP_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"];
const VALUE_MODES = ["static", "api"];

function asString(value) {
  return typeof value === "string" ? value : "";
}

function ensureRequestShape(request) {
  const method = asString(request?.method).toUpperCase();

  return {
    method: HTTP_METHODS.includes(method) ? method : "GET",
    url: asString(request?.url).trim(),
    headers: asString(request?.headers),
    body: asString(request?.body)
  };
}

function ensurePresetShape(preset) {
  const now = Date.now();
  const normalizedGroup =
    typeof preset.group === "string" && preset.group.trim() ? preset.group.trim() : "General";

  return {
    id: typeof preset.id === "string" && preset.id ? preset.id : makeId(),
    collectionId: asString(preset.collectionId),
    group: normalizedGroup,
    label: typeof preset.label === "string" ? preset.label.trim() : "",
    key: typeof preset.key === "string" ? preset.key : "",
    value: typeof preset.value === "string" ? preset.value : "",
    valueMode: VALUE_MODES.includes(preset.valueMode) ? preset.valueMode : "static",
    request: ensureRequestShape(preset.request),
    responsePath: asString(preset.responsePath).trim(),
    createdAt: typeof preset.createdAt === "number" ? preset.createdAt : now,
    updatedAt: typeof preset.updatedAt === "number" ? preset.updatedAt : now
  };
}

function ensureCollectionShape(collection) {
  const now = Date.now();

  return {
    id: typeof collection.id === "string" && collection.id ? collection.id : makeId(),
    name: asString(collection.name).trim() || DEFAULT_COLLECTION_NAME,
    createdAt: typeof collection.createdAt === "number" ? collection.createdAt : now,
    updatedAt: typeof collection.updatedAt === "number" ? collection.updatedAt : now
  };
}

function makeId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `id-${Date.now()}-${Math.floor(Math.random() * 1000000)}`;
}

function sortCollections(collections) {
  return collections.slice().sort((a, b) => a.name.localeCompare(b.name));
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
  const result = await browser.storage.local.get(Object.values(STORAGE_KEYS));

  let collections = Array.isArray(result[STORAGE_KEYS.COLLECTIONS])
    ? result[STORAGE_KEYS.COLLECTIONS].map(ensureCollectionShape)
    : [];
  let presets = Array.isArray(result[STORAGE_KEYS.PRESETS])
    ? result[STORAGE_KEYS.PRESETS].map(ensurePresetShape)
    : [];
  let needsSave = result[STORAGE_KEYS.SCHEMA_VERSION] !== CURRENT_SCHEMA_VERSION;

  if (!collections.length) {
    collections = [ensureCollectionShape({ name: DEFAULT_COLLECTION_NAME })];
    needsSave = true;
  }

  // Presets from schema v1 (or orphans) land in the first collection.
  const fallbackCollectionId = collections[0].id;
  const collectionIds = new Set(collections.map((collection) => collection.id));
  presets = presets.map((preset) => {
    if (collectionIds.has(preset.collectionId)) {
      return preset;
    }

    needsSave = true;
    return { ...preset, collectionId: fallbackCollectionId };
  });

  let activeCollectionId = result[STORAGE_KEYS.ACTIVE_COLLECTION_ID];
  if (!collectionIds.has(activeCollectionId)) {
    activeCollectionId = fallbackCollectionId;
    needsSave = true;
  }

  const store = {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    collections: sortCollections(collections),
    presets: sortPresets(presets),
    activeCollectionId
  };

  if (needsSave) {
    await writeStore(store);
  }

  return store;
}

async function writeStore(store) {
  await browser.storage.local.set({
    [STORAGE_KEYS.SCHEMA_VERSION]: CURRENT_SCHEMA_VERSION,
    [STORAGE_KEYS.COLLECTIONS]: sortCollections(store.collections.map(ensureCollectionShape)),
    [STORAGE_KEYS.PRESETS]: sortPresets(store.presets.map(ensurePresetShape)),
    [STORAGE_KEYS.ACTIVE_COLLECTION_ID]: store.activeCollectionId
  });
}

function readPresetInput(input, fallback) {
  const group =
    typeof input?.group === "string" && input.group.trim()
      ? input.group.trim()
      : fallback?.group || "General";
  const label = typeof input?.label === "string" ? input.label.trim() : fallback?.label || "";
  const key = typeof input?.key === "string" ? input.key : fallback?.key || "";
  const value = typeof input?.value === "string" ? input.value : fallback?.value || "";
  const valueMode = VALUE_MODES.includes(input?.valueMode)
    ? input.valueMode
    : fallback?.valueMode || "static";
  const request = ensureRequestShape(input?.request ?? fallback?.request);
  const responsePath =
    typeof input?.responsePath === "string"
      ? input.responsePath.trim()
      : fallback?.responsePath || "";

  if (!label) {
    throw new Error("Preset name is required.");
  }

  if (!key.trim()) {
    throw new Error("localStorage key is required.");
  }

  if (valueMode === "api" && !request.url) {
    throw new Error("Request URL is required for API presets.");
  }

  return { group, label, key, value, valueMode, request, responsePath };
}

function hasDuplicatePreset(presets, { id, collectionId, group, label }) {
  return presets.some(
    (preset) =>
      preset.id !== id &&
      preset.collectionId === collectionId &&
      preset.group.toLowerCase() === group.toLowerCase() &&
      preset.label.toLowerCase() === label.toLowerCase()
  );
}

async function createPreset(input) {
  const fields = readPresetInput(input);
  const store = await getStore();
  const collectionId = asString(input?.collectionId);

  if (!store.collections.some((collection) => collection.id === collectionId)) {
    throw new Error("Select a collection first.");
  }

  if (hasDuplicatePreset(store.presets, { collectionId, ...fields })) {
    throw new Error("A preset with this name already exists in this group.");
  }

  const newPreset = ensurePresetShape({ ...fields, collectionId });
  await writeStore({ ...store, presets: [...store.presets, newPreset] });

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
  const fields = readPresetInput(input, original);

  if (hasDuplicatePreset(store.presets, { id, collectionId: original.collectionId, ...fields })) {
    throw new Error("Another preset already uses this name in this group.");
  }

  const updatedPreset = ensurePresetShape({
    ...original,
    ...fields,
    updatedAt: Date.now()
  });

  const next = store.presets.slice();
  next[index] = updatedPreset;
  await writeStore({ ...store, presets: next });

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
  await writeStore({ ...store, presets: next });
}

async function getPresetById(id) {
  const store = await getStore();
  return store.presets.find((preset) => preset.id === id) || null;
}

function readCollectionName(name, collections, excludeId) {
  const trimmed = asString(name).trim();

  if (!trimmed) {
    throw new Error("Collection name is required.");
  }

  const duplicate = collections.some(
    (collection) =>
      collection.id !== excludeId && collection.name.toLowerCase() === trimmed.toLowerCase()
  );

  if (duplicate) {
    throw new Error("A collection with this name already exists.");
  }

  return trimmed;
}

async function createCollection(name) {
  const store = await getStore();
  const collection = ensureCollectionShape({ name: readCollectionName(name, store.collections) });

  await writeStore({
    ...store,
    collections: [...store.collections, collection],
    activeCollectionId: collection.id
  });

  return collection;
}

async function renameCollection(id, name) {
  const store = await getStore();
  const index = store.collections.findIndex((collection) => collection.id === id);

  if (index < 0) {
    throw new Error("Collection not found.");
  }

  const renamed = {
    ...store.collections[index],
    name: readCollectionName(name, store.collections, id),
    updatedAt: Date.now()
  };
  const next = store.collections.slice();
  next[index] = renamed;
  await writeStore({ ...store, collections: next });

  return renamed;
}

async function deleteCollection(id) {
  const store = await getStore();

  if (!store.collections.some((collection) => collection.id === id)) {
    throw new Error("Collection not found.");
  }

  if (store.collections.length <= 1) {
    throw new Error("The last collection cannot be deleted.");
  }

  const collections = store.collections.filter((collection) => collection.id !== id);
  const presets = store.presets.filter((preset) => preset.collectionId !== id);
  const activeCollectionId =
    store.activeCollectionId === id ? collections[0].id : store.activeCollectionId;

  await writeStore({ ...store, collections, presets, activeCollectionId });
}

async function setActiveCollection(id) {
  const store = await getStore();

  if (!store.collections.some((collection) => collection.id === id)) {
    throw new Error("Collection not found.");
  }

  await browser.storage.local.set({ [STORAGE_KEYS.ACTIVE_COLLECTION_ID]: id });
}

window.StorageRepo = {
  getStore,
  createPreset,
  updatePreset,
  deletePreset,
  getPresetById,
  createCollection,
  renameCollection,
  deleteCollection,
  setActiveCollection
};
