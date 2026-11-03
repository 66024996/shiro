# Stage Tamagotchi

The Electron desktop app runs AIRI characters, chat, voice, and desktop tools.
Shared character behavior belongs in `packages/stage-ui`. Use `stage-web` for browser-only features.

## Development

From the repository root, run `pnpm install`, then `pnpm dev:tamagotchi`.
Run `pnpm -F @proj-airi/stage-tamagotchi build` to build the app.

## Local chat model

Shiro uses the local Ollama model `shiro`. Build it once from the repository root:

```sh
ollama pull qwen3:4b-instruct-2507-q4_K_M
ollama create shiro -f apps/stage-tamagotchi/ollama/shiro.Modelfile
```

Then select `shiro:latest` in **Settings → Local AI** and click **Use model**.

- The model must support tool calls. The memory and desktop tools do not work without them.
- Do not use `shiro-gemma` or `shiro-gemma-fs` for chat. Ollama rejects tools for them, so the app sends requests without tools.
- Do not use a thinking model, such as `qwen3:4b`. It writes English reasoning into the reply and takes about 90 seconds per command.

On a 4 GB GPU, set these user environment variables, then restart Ollama. They cut the model from 4.2 GB to 3.6 GB and keep more of it on the GPU.

```powershell
[Environment]::SetEnvironmentVariable('OLLAMA_FLASH_ATTENTION', '1', 'User')
[Environment]::SetEnvironmentVariable('OLLAMA_KV_CACHE_TYPE', 'q8_0', 'User')
```

The app limits each request for this small model:

- It sends only the last 5 user turns. The model follows recent tool calls better, and the prompt fits in 8192 tokens.
- It removes emoji from replies, because the speech voice cannot read them.
- It does not send the MCP, debug, spark-command, image journal, widget, or weather tools.
- The `th` locale leaves out the ACT emotion tokens. With them, the model often skipped tool calls.

Free RAM matters most for speed. Part of the model runs on the CPU. When Windows swaps memory to disk, a reply slows from about 9 to about 1.5 tokens per second.

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
Turn it on with the gamepad button in the controls island, in **Settings > Gaming avatar**, or by voice, for example "ชิโระ เข้าโหมดเล่นเกม".

Game detection turns Gaming Mode on while a listed game runs, and off when the game ends.

- The main process checks `tasklist` every 5 seconds. The list has 18 common games, matched by process name.
  Edit it in **Settings > Gaming avatar**. It is saved in `<userData>/gaming/options.json`.
- If you turn Gaming Mode off during a game, it stays off until that game ends.
  If you turn it on yourself, it stays on after a game ends.
- In Gaming Mode, the app unloads the Ollama models and lowers the CPU priority of the model and speech processes.
  The next voice command loads the model again, which takes about 8 seconds.
- The vision capture loop stops, and the background image agent waits. Voice, speech, the avatar, memory, and commands keep working.

- **Settings > Gaming avatar** has one image slot for each avatar state and emotion. Only Normal is required.
- On save, the editor fits every image onto the canvas of the Normal image and stores the set as a `.tachie.zip` display model.
- During Gaming Mode, the main stage window sets a stage model override. The Live2D or VRM scene unmounts, so it stops using the GPU. The saved model selection does not change.
- The main window returns to its earlier bounds when Gaming Mode ends. A size that the user sets while compact is reused until the app quits.

The override does not replace the Godot stage. When the Godot sidecar runs, Gaming Mode keeps the Godot renderer.

## Avatar states

The avatar shows one of 12 states. `useAvatarStateStore` in `packages/stage-ui/src/stores/avatar-state.ts` holds the signals, and `resolveAvatarState` picks the state.
The first matching rule wins:

| State | When |
| --- | --- |
| Permission | A confirmation dialog is open. |
| Error | A desktop action or a chat turn failed in the last 4 seconds. A denied action is not an error. |
| Listening | The user talks, or the wake word "ชิโระ" opened the 8-second command window. |
| Speaking | The voice plays. A reply emotion replaces it. |
| Thinking | A chat request runs. |
| Happy, Angry, Concerned, Sad, Surprised | The reply emotion, until 4 seconds after the reply and the voice end. |
| Gaming | Gaming Mode is on. |
| Idle | Nothing else. |

- The reply emotion comes from Thai phrases in the reply, in `src/renderer/utils/reply-emotion.ts`. Shiro's prompt has no ACT emotion tokens, because the small local model then skips tool calls.
- The main process reports approval dialogs and desktop action results through the `electronAssistantActivity` event. `useAvatarSignals` turns them into signals in the main stage window.
- A PNG avatar has one image for each state. A missing image falls back to a close one, and then to Normal.
- Live2D, VRM, and other renderers show each state as a stage emotion, through `AVATAR_STATE_STAGE_EMOTION`. So a new renderer needs only that mapping, not new state logic.

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

## Desktop control

Shiro controls Windows through 10 tools, for example "ชิโระ เปิด VS Code" or "ชิโระ เช็ก GPU ให้หน่อย".
The tools are active in every request. They are separate from `computer_use`, which clicks and types on the screen.

The main process applies the policy in `src/main/services/airi/desktop-control/policy.ts`. The renderer only forwards arguments.

| Level | Tools |
| --- | --- |
| Safe, runs at once | `system_status`, `process_list`, `app_open`, `web_open`, `file_search`, `file_read`, `file_open` for documents |
| Asks first | `app_close`, `file_delete`, `terminal_run`, `file_open` for programs and scripts |
| Forbidden | Destructive commands, security changes, administrator commands, and Windows system processes |

- `app_open` opens only Start menu apps, through `shell:AppsFolder`, without arguments.
- `app_close` closes a Microsoft Store app, such as Calculator, by its window. It never ends ApplicationFrameHost, because that process owns the windows of all Store apps.
- `web_open` opens only `http` and `https` addresses.
- File tools use the user folder and drives other than the Windows drive. They never use AppData, key folders, or key files.
- `file_delete` moves an item to the Recycle Bin. It never deletes a drive or a main user folder.
- `terminal_run` shows the full command in the dialog. It runs in the home folder and stops after 60 seconds.
- The forbidden command list does not make a command safe. Every terminal command still needs approval.

Each action writes one line to `<userData>/desktop-control/audit.jsonl`. The log keeps the command or path, never file text or command output.
It moves to `audit.jsonl.1` at 1 MiB.

## Verification

Run the focused runtime tests:

```sh
pnpm -F @proj-airi/stage-tamagotchi exec vitest run src/main/services/airi/computer-use/runtime.test.ts src/main/services/airi/computer-use/windows-executor.test.ts
```

Run the memory tests. They open a real DuckDB file in a temporary directory:

```sh
pnpm -F @proj-airi/stage-tamagotchi exec vitest run src/main/services/airi/memory src/renderer/stores/tools/builtin/memory.test.ts
```

Run the desktop control tests. On Windows, they also read this computer's hardware and Start menu, and run PowerShell and CMD:

```sh
pnpm -F @proj-airi/stage-tamagotchi exec vitest run src/main/services/airi/desktop-control src/renderer/stores/tools/built-in.test.ts
```

Run the gaming avatar tests:

```sh
pnpm -F @proj-airi/stage-tamagotchi exec vitest run src/main/windows/main/compact.test.ts
pnpm -F @proj-airi/stage-tamagotchi exec vitest run --project browser src/renderer/components/settings/gaming-avatar-editor.browser.test.ts
```

Set `AIRI_COMPUTER_USE_LIVE=1` to include the bundled CLI/private-daemon test.
It invokes help and an invalid argument, without injecting desktop input.
For renderer verification, launch with `APP_REMOTE_DEBUG=true` and an unused `APP_REMOTE_DEBUG_PORT`, then attach `agent-browser` to the chat CDP target.
