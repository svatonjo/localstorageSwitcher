# LocalStorage Switcher (Firefox)

A Firefox WebExtension to save localStorage presets (single key + value), apply one to the active tab, and automatically refresh the page.

## Features

- Global preset list saved in extension storage.
- Group field for organizing presets.
- Accordion-style grouped list in the sidebar.
- Sidebar UI for create, update, delete, and apply.
- Applies to the current active tab only.
- Automatically refreshes after successful update.

## Project Structure

- `manifest.json`: extension metadata and permissions.
- `src/background.js`: active tab checks, apply orchestration, and reload.
- `src/content-script.js`: writes to page localStorage.
- `src/shared/storage.js`: preset persistence helpers.
- `src/sidebar/`: sidebar UI files.

## Run in Firefox

1. Open Firefox and go to `about:debugging#/runtime/this-firefox`.
2. Click **Load Temporary Add-on...**.
3. Select `manifest.json` from this project.
4. Click the extension toolbar icon to open the sidebar.

## Usage

1. Enter group, preset name, localStorage key, and value.
2. Click **Create**.
3. Expand a group and select a preset in the accordion list.
4. Click **Apply to active tab + refresh**.

## Preset Persistence

- Presets are already persisted by the extension in `browser.storage.local`.
- They survive browser restarts **when the add-on stays installed with the same add-on ID**.
- This project now sets a fixed Firefox add-on ID in `manifest.json`, which is important for stable storage identity.
- If you load as a **temporary** add-on from `about:debugging`, Firefox removes it after restart, so your data may be lost when it is unloaded.

To keep presets long-term:

1. Install the add-on as a normal signed add-on (see next section), not only as temporary.
2. Keep the same `browser_specific_settings.gecko.id` value across updates.
3. Do not clear extension site data in Firefox settings.

Current project ID example:

- `localstorage-switch@svatonjo.github`

## Make It Fully Usable (Installable) Add-on

### 1) Prepare metadata

- Keep `name`, `version`, `description`, and `browser_specific_settings.gecko.id` stable.
- Add extension icons before publishing (for example 48px and 96px).

### 2) Package

Create a zip containing your extension root files and folders, then rename it to `.xpi`.
The package must include `manifest.json` at the root of the archive.

### 3) Sign for Firefox

1. Create a Firefox Add-ons developer account at addons.mozilla.org.
2. Submit the extension for signing (listed or unlisted).
3. Download the signed `.xpi`.

### 4) Install permanently

- Open Firefox Add-ons manager and install the signed `.xpi`.
- From then on, presets in `browser.storage.local` persist across browser restarts and extension updates (same ID).

## Notes and Limits

- Works on normal `http` and `https` pages.
- Restricted pages (for example `about:*`) are blocked by browser policy.
- localStorage stores string values; this extension writes values as strings.
