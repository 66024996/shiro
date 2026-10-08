import type {
  ClickActionInput,
  ComputerUseConfig,
  DesktopExecutor,
  DisplayInfo,
  ExecutionTarget,
  ExecutorActionResult,
  FocusAppActionInput,
  ForegroundContext,
  ObserveWindowsRequest,
  OpenAppActionInput,
  PermissionInfo,
  PointerTracePoint,
  PressKeysActionInput,
  ScrollActionInput,
  TypeTextActionInput,
  WaitActionInput,
  WindowObservation,
} from '../types'

import process, { platform } from 'node:process'

import { execFile } from 'node:child_process'
import { hostname } from 'node:os'

import { errorMessageFromValue } from '../utils/error-message'
import { writeScreenshotArtifact } from '../utils/screenshot'

/**
 * Shiro: Windows local executor.
 *
 * Design rules:
 * - Every PowerShell script below is a STATIC string. User/LLM supplied values
 *   (app names, text, coordinates) are passed through environment variables
 *   (`CU_*`) and are never interpolated into script text, so they cannot inject
 *   commands.
 * - Approval, policy and audit stay in the host (`policy.ts`, `action-executor`);
 *   this file only performs already-approved actions.
 * - NOTICE: written without access to a Windows machine. It type-checks against
 *   the executor contract but MUST be smoke-tested on real Windows.
 */

const WIN32_PRELUDE = `
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms, System.Drawing
Add-Type @"
using System;
using System.Text;
using System.Runtime.InteropServices;
public static class W32 {
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left, Top, Right, Bottom; }
  [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
  [DllImport("user32.dll")] public static extern void mouse_event(uint f, uint dx, uint dy, int d, UIntPtr e);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int c);
}
"@
[void][W32]::SetProcessDPIAware()
`

export const WINDOWS_SCRIPTS = {
  foreground: `${WIN32_PRELUDE}
$h = [W32]::GetForegroundWindow()
if ($h -eq [IntPtr]::Zero) { '{"available":false}'; exit 0 }
$sb = New-Object System.Text.StringBuilder 512
[void][W32]::GetWindowText($h, $sb, 512)
$pid2 = 0; [void][W32]::GetWindowThreadProcessId($h, [ref]$pid2)
$r = New-Object W32+RECT; [void][W32]::GetWindowRect($h, [ref]$r)
$p = Get-Process -Id $pid2 -ErrorAction SilentlyContinue
@{ available = $true; appName = $p.ProcessName; windowTitle = $sb.ToString(); pid = $pid2;
   x = $r.Left; y = $r.Top; width = $r.Right - $r.Left; height = $r.Bottom - $r.Top } | ConvertTo-Json -Compress
`,
  windows: `${WIN32_PRELUDE}
$w = @(Get-Process | Where-Object { $_.MainWindowHandle -ne 0 -and $_.MainWindowTitle } |
  Select-Object -First ([int]$env:CU_LIMIT) @{n='id';e={[string]$_.Id}}, @{n='appName';e={$_.ProcessName}}, @{n='title';e={$_.MainWindowTitle}}, @{n='ownerPid';e={$_.Id}})
ConvertTo-Json -InputObject $w -Compress
`,
  display: `${WIN32_PRELUDE}
$b = [System.Windows.Forms.SystemInformation]::VirtualScreen
@{ width = $b.Width; height = $b.Height; x = $b.X; y = $b.Y; count = [System.Windows.Forms.Screen]::AllScreens.Length } | ConvertTo-Json -Compress
`,
  screenshot: `${WIN32_PRELUDE}
$b = [System.Windows.Forms.SystemInformation]::VirtualScreen
$bmp = New-Object System.Drawing.Bitmap $b.Width, $b.Height
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.CopyFromScreen($b.X, $b.Y, 0, 0, $bmp.Size)
$ms = New-Object System.IO.MemoryStream
$bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
$g.Dispose(); $bmp.Dispose()
[Convert]::ToBase64String($ms.ToArray())
`,
  openApp: `
$ErrorActionPreference = 'Stop'
Start-Process -FilePath $env:CU_APP
`,
  focusApp: `${WIN32_PRELUDE}
$name = $env:CU_APP
$p = Get-Process | Where-Object { $_.MainWindowHandle -ne 0 -and ($_.ProcessName -eq $name -or $_.MainWindowTitle -like "*$name*") } | Select-Object -First 1
if (-not $p) { throw 'window not found' }
[void][W32]::ShowWindow($p.MainWindowHandle, 9)
[void][W32]::SetForegroundWindow($p.MainWindowHandle)
`,
  click: `${WIN32_PRELUDE}
[void][W32]::SetCursorPos([int]$env:CU_X, [int]$env:CU_Y)
$down = @{ left = 0x0002; right = 0x0008; middle = 0x0020 }[$env:CU_BUTTON]
$up = @{ left = 0x0004; right = 0x0010; middle = 0x0040 }[$env:CU_BUTTON]
for ($i = 0; $i -lt [int]$env:CU_COUNT; $i++) {
  [W32]::mouse_event($down, 0, 0, 0, [UIntPtr]::Zero)
  [W32]::mouse_event($up, 0, 0, 0, [UIntPtr]::Zero)
  Start-Sleep -Milliseconds 40
}
`,
  moveCursor: `${WIN32_PRELUDE}
[void][W32]::SetCursorPos([int]$env:CU_X, [int]$env:CU_Y)
`,
  sendKeys: `${WIN32_PRELUDE}
[System.Windows.Forms.SendKeys]::SendWait($env:CU_KEYS)
`,
  scroll: `${WIN32_PRELUDE}
if ($env:CU_X -ne '') { [void][W32]::SetCursorPos([int]$env:CU_X, [int]$env:CU_Y) }
if ([int]$env:CU_DY -ne 0) { [W32]::mouse_event(0x0800, 0, 0, [int]$env:CU_DY, [UIntPtr]::Zero) }
if ([int]$env:CU_DX -ne 0) { [W32]::mouse_event(0x1000, 0, 0, [int]$env:CU_DX, [UIntPtr]::Zero) }
`,
} as const

/** Friendly names -> launchable targets (App Paths / PATH resolvable). */
const WINDOWS_LAUNCH_TARGETS: Record<string, string> = {
  'visual studio code': 'code',
  'vs code': 'code',
  'vscode': 'code',
  'code': 'code',
  'google chrome': 'chrome',
  'chrome': 'chrome',
  'windows terminal': 'wt',
  'terminal': 'wt',
  'notepad': 'notepad',
  'calculator': 'calc',
  'file explorer': 'explorer',
  'explorer': 'explorer',
}

/** Pure helper (exported for tests): resolve what Start-Process should launch. */
export function resolveWindowsLaunchTarget(app: string): string {
  const key = app.trim().toLowerCase()
  return WINDOWS_LAUNCH_TARGETS[key] ?? app.trim()
}

const SENDKEYS_SPECIAL_RE = /[+^%~(){}[\]]/g

/** Pure helper (exported for tests): escape literal text for SendKeys. */
export function escapeSendKeysText(text: string): string {
  return text.replace(SENDKEYS_SPECIAL_RE, m => `{${m}}`).replace(/\r?\n/g, '{ENTER}')
}

const NAMED_KEYS: Record<string, string> = {
  enter: '{ENTER}',
  return: '{ENTER}',
  tab: '{TAB}',
  escape: '{ESC}',
  esc: '{ESC}',
  backspace: '{BACKSPACE}',
  delete: '{DELETE}',
  space: ' ',
  up: '{UP}',
  down: '{DOWN}',
  left: '{LEFT}',
  right: '{RIGHT}',
  home: '{HOME}',
  end: '{END}',
  pageup: '{PGUP}',
  pagedown: '{PGDN}',
}

const MODIFIERS: Record<string, string> = {
  ctrl: '^',
  control: '^',
  alt: '%',
  option: '%',
  shift: '+',
  cmd: '^', // Map macOS-style "cmd" shortcuts to Ctrl on Windows.
  command: '^',
  meta: '^',
}

/** Pure helper (exported for tests): ["ctrl","shift","p"] -> "^+p". */
export function keysToSendKeys(keys: string[]): string {
  let modifiers = ''
  let main = ''
  for (const raw of keys) {
    const key = raw.trim().toLowerCase()
    if (MODIFIERS[key]) {
      modifiers += MODIFIERS[key]
    }
    else if (NAMED_KEYS[key]) {
      main += NAMED_KEYS[key]
    }
    else if (/^f(?:[1-9]|1[0-6])$/.test(key)) {
      main += `{${key.toUpperCase()}}`
    }
    else {
      main += key.length === 1 ? escapeSendKeysText(key) : ''
    }
  }
  return modifiers && main ? `${modifiers}(${main})` : `${modifiers}${main}`
}

function runPowerShell(script: string, params: Record<string, string>, timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const env: NodeJS.ProcessEnv = { ...process.env }
    for (const [key, value] of Object.entries(params))
      env[`CU_${key}`] = value

    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script],
      { env, timeout: timeoutMs, windowsHide: true, maxBuffer: 64 * 1024 * 1024 },
      (error, stdout, stderr) => {
        if (error)
          reject(new Error(stderr?.toString().trim() || error.message))
        else
          resolve(stdout.toString().trim())
      },
    )
  })
}

export function createWindowsLocalExecutor(config: ComputerUseConfig): DesktopExecutor {
  const executionTarget: ExecutionTarget = {
    mode: 'local-windowed',
    transport: 'local',
    hostName: hostname(),
    sessionTag: config.sessionTag,
    isolated: false,
    tainted: false,
    note: 'windows-local drives the interactive desktop through PowerShell/Win32',
  }

  const ps = (script: string, params: Record<string, string> = {}) =>
    runPowerShell(script, params, config.timeoutMs)

  const done = (notes: string[]): ExecutorActionResult => ({
    performed: true,
    backend: 'windows-local',
    notes,
    executionTarget,
  })

  const ensureWindows = () => {
    if (platform !== 'win32')
      throw new Error(`windows-local executor requires a win32 host, current platform is ${platform}`)
  }

  async function getForegroundContext(): Promise<ForegroundContext> {
    try {
      ensureWindows()
      const info = JSON.parse(await ps(WINDOWS_SCRIPTS.foreground))
      if (!info.available)
        return { available: false, platform, unavailableReason: 'no foreground window' }
      return {
        available: true,
        platform,
        appName: info.appName,
        windowTitle: info.windowTitle,
        windowBounds: { x: info.x, y: info.y, width: info.width, height: info.height },
      }
    }
    catch (error) {
      return { available: false, platform, unavailableReason: errorMessageFromValue(error) }
    }
  }

  return {
    kind: 'windows-local',
    describe: () => ({
      kind: 'windows-local',
      notes: [
        'approval, trace and audit stay on the host',
        'desktop actions run locally via PowerShell + Win32 (SendInput-style mouse_event, SendKeys)',
        'LLM-supplied values are passed via environment variables, never interpolated into scripts',
      ],
    }),
    getExecutionTarget: async () => executionTarget,
    getForegroundContext,
    getDisplayInfo: async (): Promise<DisplayInfo> => {
      try {
        ensureWindows()
        const d = JSON.parse(await ps(WINDOWS_SCRIPTS.display))
        return {
          available: true,
          platform,
          logicalWidth: d.width,
          logicalHeight: d.height,
          pixelWidth: d.width,
          pixelHeight: d.height,
          scaleFactor: 1,
          displayCount: d.count,
          combinedBounds: { x: d.x, y: d.y, width: d.width, height: d.height },
          capturedAt: new Date().toISOString(),
          note: 'DPI-aware virtual screen; coordinates are physical pixels',
        }
      }
      catch (error) {
        return { available: false, platform, note: errorMessageFromValue(error) }
      }
    },
    getPermissionInfo: async (): Promise<PermissionInfo> => {
      const probe = (target: string) => ({
        status: 'unsupported' as const,
        target,
        note: 'Windows has no per-app screen/accessibility permission prompt; elevated (admin) windows may ignore input from a non-elevated process',
      })
      return {
        screenRecording: probe('screen-recording'),
        accessibility: probe('accessibility'),
        automationToSystemEvents: probe('automation'),
      }
    },
    observeWindows: async (request: ObserveWindowsRequest): Promise<WindowObservation> => {
      ensureWindows()
      const limit = String(Math.max(1, Math.min(request.limit ?? 20, 100)))
      const raw = await ps(WINDOWS_SCRIPTS.windows, { LIMIT: limit })
      const parsed = raw ? JSON.parse(raw) : []
      const windows = (Array.isArray(parsed) ? parsed : [parsed])
        .filter((w: { appName: string }) => !request.app || w.appName.toLowerCase().includes(request.app.toLowerCase()))
      const front = await getForegroundContext()
      return {
        frontmostAppName: front.appName,
        frontmostWindowTitle: front.windowTitle,
        windows,
        observedAt: new Date().toISOString(),
      }
    },
    takeScreenshot: async (request) => {
      ensureWindows()
      const base64 = await runPowerShell(WINDOWS_SCRIPTS.screenshot, {}, Math.max(config.timeoutMs, 30_000))
      return await writeScreenshotArtifact({
        label: request.label,
        screenshotsDir: config.screenshotsDir,
        dataBase64: base64,
        executionTarget,
      })
    },
    openApp: async (input: OpenAppActionInput) => {
      ensureWindows()
      const target = resolveWindowsLaunchTarget(input.app)
      await ps(WINDOWS_SCRIPTS.openApp, { APP: target })
      return done([`opened ${input.app}`])
    },
    focusApp: async (input: FocusAppActionInput) => {
      ensureWindows()
      await ps(WINDOWS_SCRIPTS.focusApp, { APP: resolveWindowsLaunchTarget(input.app) })
      return done([`focused ${input.app}`])
    },
    click: async (input: ClickActionInput & { pointerTrace: PointerTracePoint[] }) => {
      ensureWindows()
      await ps(WINDOWS_SCRIPTS.click, {
        X: String(Math.round(input.x)),
        Y: String(Math.round(input.y)),
        BUTTON: input.button ?? 'left',
        COUNT: String(Math.max(1, Math.min(input.clickCount ?? 1, 3))),
      })
      return { ...done(['clicked']), pointerTrace: input.pointerTrace }
    },
    typeText: async (input: TypeTextActionInput) => {
      ensureWindows()
      if (typeof input.x === 'number' && typeof input.y === 'number') {
        await ps(WINDOWS_SCRIPTS.click, { X: String(Math.round(input.x)), Y: String(Math.round(input.y)), BUTTON: 'left', COUNT: '1' })
      }
      const keys = escapeSendKeysText(input.text) + (input.pressEnter ? '{ENTER}' : '')
      await ps(WINDOWS_SCRIPTS.sendKeys, { KEYS: keys })
      return done(['typed text'])
    },
    pressKeys: async (input: PressKeysActionInput) => {
      ensureWindows()
      const keys = keysToSendKeys(input.keys)
      if (!keys)
        throw new Error('no recognizable keys to press')
      await ps(WINDOWS_SCRIPTS.sendKeys, { KEYS: keys })
      return done([`pressed ${input.keys.join('+')}`])
    },
    scroll: async (input: ScrollActionInput) => {
      ensureWindows()
      const hasPoint = typeof input.x === 'number' && typeof input.y === 'number'
      await ps(WINDOWS_SCRIPTS.scroll, {
        X: hasPoint ? String(Math.round(input.x!)) : '',
        Y: hasPoint ? String(Math.round(input.y!)) : '',
        // WHEEL_DELTA is 120 per notch; positive deltaY from the host means "scroll down".
        DY: String(Math.round(-input.deltaY * 120)),
        DX: String(Math.round((input.deltaX ?? 0) * 120)),
      })
      return done(['scrolled'])
    },
    wait: async (input: WaitActionInput) => {
      await new Promise(resolve => setTimeout(resolve, Math.max(input.durationMs, 0)))
      return done(['waited'])
    },
  }
}
