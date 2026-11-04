$ErrorActionPreference = 'Stop'

$serverRoot = $PSScriptRoot
$outputRoot = Join-Path $serverRoot 'dist\shiro-speech'
$venvConfig = Join-Path $serverRoot '.venv_omnivoice\pyvenv.cfg'

if (!(Test-Path $venvConfig)) {
  throw "Missing speech environment file: $venvConfig"
}

$homeLine = Get-Content $venvConfig | Where-Object { $_ -match '^home\s*=' } | Select-Object -First 1
if (!$homeLine) {
  throw "Missing Python home in: $venvConfig"
}
$pythonHome = ($homeLine -replace '^home\s*=\s*', '').Trim()

function Copy-Tree([string] $source, [string] $destination, [string[]] $excludedDirectories = @()) {
  if (!(Test-Path $source)) {
    throw "Required runtime directory is missing: $source"
  }

  $arguments = @(
    $source,
    $destination,
    '/E',
    '/MT:12',
    '/R:2',
    '/W:2',
    '/NFL',
    '/NDL',
    '/NJH',
    '/NJS',
    '/NC',
    '/NS'
  )
  if ($excludedDirectories.Count -gt 0) {
    $arguments += '/XD'
    $arguments += $excludedDirectories
  }

  & robocopy @arguments | Out-Null
  if ($LASTEXITCODE -ge 8) {
    throw "Failed to copy runtime files from $source (robocopy exit code $LASTEXITCODE)."
  }
}

if (Test-Path $outputRoot) {
  Remove-Item $outputRoot -Recurse -Force
}

$pythonRoot = Join-Path $outputRoot 'python'
$sitePackagesRoot = Join-Path $outputRoot 'site-packages'
$serverOutput = Join-Path $outputRoot 'server'
$cacheOutput = Join-Path $outputRoot 'hf_cache'
$licenseOutput = Join-Path $outputRoot 'licenses'
$voiceOutput = Join-Path $outputRoot 'voices'

New-Item -ItemType Directory -Path $pythonRoot, $sitePackagesRoot, $serverOutput, $cacheOutput, $licenseOutput, $voiceOutput -Force | Out-Null

foreach ($fileName in @('python.exe', 'python3.dll', 'python311.dll', 'vcruntime140.dll', 'vcruntime140_1.dll')) {
  $source = Join-Path $pythonHome $fileName
  if (!(Test-Path $source)) {
    throw "Required Python runtime file is missing: $source"
  }
  Copy-Item $source $pythonRoot
}

$pythonArchive = Join-Path $pythonHome 'python311.zip'
if (Test-Path $pythonArchive) {
  Copy-Item $pythonArchive $pythonRoot
}

Copy-Tree (Join-Path $pythonHome 'DLLs') (Join-Path $pythonRoot 'DLLs')
Copy-Tree (Join-Path $pythonHome 'Lib') (Join-Path $pythonRoot 'Lib') @((Join-Path $pythonHome 'Lib\site-packages'))
$pythonSitePackages = Join-Path $pythonRoot 'Lib\site-packages'
New-Item -ItemType Directory -Path $pythonSitePackages -Force | Out-Null
Set-Content -Path (Join-Path $pythonSitePackages 'shiro-runtime.pth') -Value @(
  'import os, site, sys; site.addsitedir(os.path.join(sys.prefix, os.pardir, "site-packages", "core")); site.addsitedir(os.path.join(sys.prefix, os.pardir, "site-packages", "omnivoice"))'
) -Encoding ASCII
Copy-Tree (Join-Path $serverRoot '.venv\Lib\site-packages') (Join-Path $sitePackagesRoot 'core')
Copy-Tree (Join-Path $serverRoot '.venv_omnivoice\Lib\site-packages') (Join-Path $sitePackagesRoot 'omnivoice')

foreach ($fileName in @('omnivoice_server.py', 'speech_api.py', 'transcription.py', 'thai_text.py')) {
  $source = Join-Path $serverRoot $fileName
  if (!(Test-Path $source)) {
    throw "Required speech source file is missing: $source"
  }
  Copy-Item $source $serverOutput
}

foreach ($fileName in @('shiro.wav', 'shiro.txt')) {
  $source = Join-Path (Join-Path $serverRoot 'voices') $fileName
  if (!(Test-Path $source)) {
    throw "Required Shiro voice reference file is missing: $source"
  }
  Copy-Item $source $voiceOutput
}

$modelDirectories = @(
  @{
    Source = Join-Path $serverRoot 'hf_cache\hub\models--hotdogs--omnivoice-thai'
    Destination = Join-Path $cacheOutput 'hub\models--hotdogs--omnivoice-thai'
  },
  @{
    Source = Join-Path $serverRoot 'hf_cache\hub\models--eustlb--higgs-audio-v2-tokenizer'
    Destination = Join-Path $cacheOutput 'hub\models--eustlb--higgs-audio-v2-tokenizer'
  },
  @{
    Source = Join-Path $serverRoot 'hf_cache\faster-whisper\models--Systran--faster-whisper-small'
    Destination = Join-Path $cacheOutput 'faster-whisper\models--Systran--faster-whisper-small'
  }
)

foreach ($modelDirectory in $modelDirectories) {
  Copy-Tree $modelDirectory.Source $modelDirectory.Destination
}

Copy-Tree (Join-Path $serverRoot 'licenses') $licenseOutput

$env:PYTHONHOME = $pythonRoot
Remove-Item Env:PYTHONPATH -ErrorAction SilentlyContinue
$env:HF_HOME = $cacheOutput
$env:HF_HUB_OFFLINE = '1'
$env:TRANSFORMERS_OFFLINE = '1'
$env:PYTHONNOUSERSITE = '1'
$env:PYTHONDONTWRITEBYTECODE = '1'

$python = Join-Path $pythonRoot 'python.exe'
& $python '-c' 'import fastapi, faster_whisper, multipart, omnivoice, soundfile, torch, uvicorn; print(torch.__version__, torch.cuda.is_available())'
if ($LASTEXITCODE -ne 0) {
  throw 'The packaged Python runtime failed its import test.'
}

& $python (Join-Path $serverOutput 'omnivoice_server.py') '--help' | Out-Null
if ($LASTEXITCODE -ne 0) {
  throw 'The packaged speech server failed its command-line test.'
}

Push-Location $serverOutput
try {
  & $python '-c' 'from speech_api import create_app; app = create_app(None, {}, None, None); print(app.title)'
  if ($LASTEXITCODE -ne 0) {
    throw 'The packaged speech API failed its initialization test.'
  }
}
finally {
  Pop-Location
}

$voiceFiles = @(Get-ChildItem -LiteralPath $voiceOutput -File | Select-Object -ExpandProperty Name | Sort-Object)
if (($voiceFiles -join ',') -ne 'shiro.txt,shiro.wav') {
  throw "The build output has an unexpected voice-reference file set: $($voiceFiles -join ', ')"
}

Write-Output "Speech runtime ready: $outputRoot"
