import process from 'node:process'

import { execFileSync, execSync } from 'node:child_process'
import { existsSync, mkdirSync, renameSync, rmSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * Builds a portable Windows app with offline speech support.
 *
 * Call stack:
 *
 * build-windows.ts
 *   -> dotnet build (Godot C# sidecar)
 *   -> Godot Windows Desktop export
 *   -> build-runtime.ps1 (speech runtime and models)
 *   -> electron-builder --win --dir
 *   -> tar.exe ZIP archive
 *   -> bundled Python ZIP and CRC validation
 */
if (process.platform !== 'win32')
  throw new Error('Build the Windows portable app on Windows.')

const speechServerRoot = resolve(process.cwd(), '../../../f5_server')
const godotRoot = resolve(process.cwd(), '../../engines/stage-tamagotchi-godot')
const godotOutput = resolve(godotRoot, 'out', 'win')
const appOutput = resolve(process.cwd(), 'dist', 'win-unpacked')
const portableArchive = resolve(process.cwd(), 'dist', 'Shiro-windows-x64-portable.zip')
const temporaryArchive = resolve(process.cwd(), 'dist', 'Shiro-windows-x64-portable.building.zip')
const runtimeScript = resolve(speechServerRoot, 'build-runtime.ps1')
const speechRuntimeRoot = resolve(speechServerRoot, 'dist/shiro-speech')
const speechPythonRoot = resolve(appOutput, 'resources', 'shiro-speech', 'python')
const speechPython = resolve(speechPythonRoot, 'python.exe')
let runtimeBuildStarted = false

try {
  execFileSync('dotnet', [
    'build',
    resolve(godotRoot, 'stage-tamagotchi-godot.csproj'),
    '--configuration',
    'Release',
  ], {
    cwd: godotRoot,
    stdio: 'inherit',
  })

  mkdirSync(godotOutput, { recursive: true })
  execFileSync(process.env.GODOT4?.trim() || 'godot', [
    '--headless',
    '--export-release',
    'Windows Desktop',
    resolve(godotOutput, 'godot-stage.exe'),
  ], {
    cwd: godotRoot,
    stdio: 'inherit',
  })

  runtimeBuildStarted = true
  execFileSync('powershell.exe', [
    '-NoProfile',
    '-ExecutionPolicy',
    'Bypass',
    '-File',
    runtimeScript,
  ], { stdio: 'inherit' })

  execSync('electron-builder --win --dir', {
    env: {
      ...process.env,
      SHIRO_BUNDLE_SPEECH_RUNTIME: '1',
    },
    stdio: 'inherit',
  })

  if (!existsSync(resolve(appOutput, 'shiro.exe')))
    throw new Error('The portable Shiro executable was not created.')

  rmSync(temporaryArchive, { force: true })
  execFileSync('tar.exe', [
    '-a',
    '-c',
    '--options',
    'zip:compression=deflate',
    '-f',
    temporaryArchive,
    '-C',
    appOutput,
    '.',
  ], { stdio: 'inherit' })

  execFileSync(speechPython, [
    '-c',
    `
import sys
import zipfile

required = {
    "shiro.exe",
    "resources/godot-stage/godot-stage.exe",
    "resources/shiro-speech/python/python.exe",
    "resources/shiro-speech/server/omnivoice_server.py",
    "resources/shiro-speech/licenses/NOTICE",
    "resources/shiro-speech/licenses/MIT-LICENSE.txt",
    "resources/shiro-speech/voices/shiro.wav",
    "resources/shiro-speech/voices/shiro.txt",
}
voice_files_expected = {
    "resources/shiro-speech/voices/shiro.wav",
    "resources/shiro-speech/voices/shiro.txt",
}
model_prefixes = (
    "resources/shiro-speech/hf_cache/hub/models--hotdogs--omnivoice-thai/",
    "resources/shiro-speech/hf_cache/hub/models--eustlb--higgs-audio-v2-tokenizer/",
    "resources/shiro-speech/hf_cache/faster-whisper/models--Systran--faster-whisper-small/",
)

with zipfile.ZipFile(sys.argv[1]) as archive:
    entries = archive.infolist()
    names = {entry.filename.removeprefix("./") for entry in entries}
    missing = sorted(required - names)
    missing_models = [prefix for prefix in model_prefixes if not any(name.startswith(prefix) for name in names)]
    voice_files = {name for name in names if name.startswith("resources/shiro-speech/voices/") and not name.endswith("/")}
    corrupted = archive.testzip()
    unexpected_voice_files = sorted(voice_files - voice_files_expected)
    if missing or missing_models or unexpected_voice_files or corrupted:
        print(f"Missing files: {missing}", file=sys.stderr)
        print(f"Missing model caches: {missing_models}", file=sys.stderr)
        print(f"Unexpected voice-reference files: {unexpected_voice_files}", file=sys.stderr)
        print(f"Corrupted archive entry: {corrupted}", file=sys.stderr)
        raise SystemExit(1)
    print(f"Portable ZIP passed CRC checks for {len(entries)} entries.")
`,
    temporaryArchive,
  ], {
    cwd: appOutput,
    env: {
      ...process.env,
      PYTHONHOME: speechPythonRoot,
      PYTHONNOUSERSITE: '1',
      PYTHONPATH: '',
    },
    stdio: 'inherit',
  })

  rmSync(portableArchive, { force: true })
  renameSync(temporaryArchive, portableArchive)
}
finally {
  rmSync(temporaryArchive, { force: true })
  if (runtimeBuildStarted && existsSync(speechRuntimeRoot))
    rmSync(speechRuntimeRoot, { recursive: true, force: true })
}
