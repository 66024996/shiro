# Stage Tamagotchi

The Electron desktop app runs AIRI characters, chat, voice, and desktop tools.
Shared character behavior belongs in `packages/stage-ui`. Use `stage-web` for browser-only features.

## Development

From the repository root, run `pnpm install`, then `pnpm dev:tamagotchi`.
Run `pnpm -F @proj-airi/stage-tamagotchi build` to build the app.

## Computer use

The desktop chat composer starts with **Use computer** on, except on Windows, where it starts off.
On Windows, turn it on to give Shiro access. Shiro asks for approval before each computer action.
The Windows executor supports an allowlist of window, display, mouse, and keyboard commands. It does not run arbitrary shell commands.
The selection is local to the composer. A new composer uses the platform default. While a request runs, its selection is locked.
Turn it off before sending messages that must not receive computer-use tools.

Only the current selection grants access, including retries and tool reruns. Historical messages do not grant access.
The selected request receives `computer_use` and `computer_use_read_image`.
The first tool accepts AUV-style arguments, such as `["invoke", "window.list"]`.
Use `["invoke", "--help"]` and command-specific help to discover supported operations.
The image tool returns a screenshot as model image content. It accepts only PNG and JPEG artifacts inside the app's computer-use store.
Use a model and provider that support tool calls for visual tasks.
With **Use the vision model for tool images** on, the vision model reads the screenshot first for a chat model whose provider does not report image input.
The chat model then gets a text description. It has the visible text and layout, but no pixel positions.
On Windows, use `window.list`, `display.list`, then `display.capture` before an input command. Add the reported screen origin to screenshot pixel coordinates.
On macOS, use AUV commands such as `screen.findText` to get coordinates.

On macOS and Linux, Electron starts the matching AUV SDK and CLI 0.0.16 on demand, over a private local socket.
On Windows, Electron runs the packaged PowerShell script through an argument-safe process call.
The runtime serializes commands across windows, stores artifacts under the app's user-data directory, and stops the daemon during app shutdown.
Model arguments cannot change the device, endpoint, run, or storage root.
On macOS and Linux, nonzero AUV exits retain output and failure details as tool errors.
A zero exit code does not prove that the intended UI change occurred.
On Windows, PowerShell errors appear as tool errors.

On macOS, grant Accessibility and Screen Recording permissions to the launching app when the OS requests them.
Some application actions also need Automation permission. If `app.probePermissions` reports missing screen-recording permission, a capture can contain only the desktop background despite exit code zero. Available commands depend on the OS and AUV backend.
Use this feature for local native applications. It does not expose a remote-device gateway or replace the separate `services/computer-use-mcp` service.

The desktop package includes the platform CLI as an optional dependency and unpacks its executable from ASAR.
Do not omit optional dependencies when building an installer. Windows ARM64 and Linux musl do not have a matching CLI in this version.

## Gaming avatar

Gaming Mode replaces the stage model with a PNG avatar and moves the main window into the bottom-right screen corner.
Turn it on with the gamepad button in the controls island, or in **Settings > Gaming avatar**.
Automatic game detection is not implemented yet.

- **Settings > Gaming avatar** has one image slot for each emotion. Only Normal is required.
- On save, the editor fits every image onto the canvas of the Normal image and stores the set as a `.tachie.zip` display model.
- During Gaming Mode, the main stage window sets a stage model override. The Live2D or VRM scene unmounts, so it stops using the GPU. The saved model selection does not change.
- The main window returns to its earlier bounds when Gaming Mode ends. A size that the user sets while compact is reused until the app quits.

The override does not replace the Godot stage. When the Godot sidecar runs, Gaming Mode keeps the Godot renderer.

## Memory

Shiro remembers a fact only when the user asks, for example "ชิโระ จำไว้ว่าฉันใช้ VS Code".
The user removes a fact by asking Shiro to forget it, or in **Settings > Local AI > Memory**.

The main process owns one DuckDB file at `<userData>/memory/shiro-memory.duckdb`.
Renderer windows read and write it through the eventa contracts in `src/shared/eventa/memory.ts`.
One owner prevents two windows from opening the same database file.

- A long-term memory stays until the user forgets it.
- A temporary memory expires after `ttlHours`, 24 by default. The store removes expired memories before each read.
- The store accepts 200 active memories of at most 500 characters each.

Two tools give the model access: `memory_remember` and `memory_forget`. Both are active in every request.
Before the leader window composes a message, it loads the current memories into the `system:shiro-memory` context block.
If the store fails, the chat continues with the previous block.

The store uses the native `@duckdb/node-api` package. The main build keeps it external, and electron-builder unpacks `duckdb.node` with `duckdb.dll`.
Do not use DuckDB-wasm with `NODE_FS` for this file. Version 1.29 opens an existing database read-only, so writes fail after a restart.

## Verification

Run the focused runtime tests:

```sh
pnpm -F @proj-airi/stage-tamagotchi exec vitest run src/main/services/airi/computer-use/runtime.test.ts src/main/services/airi/computer-use/windows-executor.test.ts
```

Run the memory tests. They open a real DuckDB file in a temporary directory:

```sh
pnpm -F @proj-airi/stage-tamagotchi exec vitest run src/main/services/airi/memory src/renderer/stores/tools/builtin/memory.test.ts
```

Run the gaming avatar tests:

```sh
pnpm -F @proj-airi/stage-tamagotchi exec vitest run src/main/windows/main/compact.test.ts
pnpm -F @proj-airi/stage-tamagotchi exec vitest run --project browser src/renderer/components/settings/gaming-avatar-editor.browser.test.ts
```

Set `AIRI_COMPUTER_USE_LIVE=1` to include the bundled CLI/private-daemon test.
It invokes help and an invalid argument, without injecting desktop input.
For renderer verification, launch with `APP_REMOTE_DEBUG=true` and an unused `APP_REMOTE_DEBUG_PORT`, then attach `agent-browser` to the chat CDP target.
