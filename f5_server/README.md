# Shiro Thai Speech Runtime

Shiro uses this local service for Thai speech recognition and speech synthesis.
The Windows portable app includes the Python runtime, offline models, and license notices.

## Build the Windows app

Run this command from `D:\Shiro\airi`:

```powershell
pnpm -F @proj-airi/stage-tamagotchi build:win
```

The build requires the speech environments, model caches, .NET 10 SDK, and Godot 4.7.1 .NET export templates.
Set `GODOT4` to the Godot editor path before you build.
The build creates `apps\stage-tamagotchi\dist\Shiro-windows-x64-portable.zip`.
Extract the ZIP file, then run `shiro.exe` from the extracted folder.

The Windows app is unsigned because this computer has no code-signing certificate.
Windows SmartScreen can warn when you start the app.
Sign the app with a trusted code-signing certificate before public distribution.

The portable app includes the current Shiro voice reference from `voices/shiro.wav` and its transcript.
On first launch, Shiro copies these files to app data if no Shiro voice exists.
An imported voice takes priority and stays in app data.
Import an audio clip that you have permission to use in **Settings > Local AI**.

Ollama remains a separate install.
Install Ollama and a chat model before you select it in **Settings > Local AI**.

## Development server

From `D:\Shiro\f5_server`, run:

```powershell
.\.venv_omnivoice\Scripts\python.exe -m pip install -r requirements-stt.txt
.\start_omnivoice.bat
```

The first launch downloads the TTS model into `hf_cache`.

Speech recognition uses Typhoon ASR Realtime on ONNX Runtime.
Before the first launch, export the model once into `models\typhoon-asr-realtime`.
The export needs NeMo, so it uses its own environment, `.venv_typhoon`:

```powershell
py -3.11 -m venv .venv_typhoon
.\.venv_typhoon\Scripts\python.exe -m pip install typhoon-asr
$env:HF_HOME = "$PWD\hf_cache"
.\.venv_typhoon\Scripts\python.exe export_typhoon_onnx.py --out models\typhoon-asr-realtime
```

The server needs only onnxruntime and numpy to read the exported files.
To use Faster-Whisper instead, start the server with `--stt-engine whisper`.

## Tests

The API packages are in `.venv`, and the speech models are in `.venv_omnivoice`.
The portable runtime merges both `site-packages` folders, so the tests use both too.

From `D:\Shiro\f5_server`, run:

```powershell
$env:PYTHONPATH = "$PWD;$PWD\.venv\Lib\site-packages"
.\.venv_omnivoice\Scripts\python.exe -m unittest discover -s tests
```

## Speech providers

The service uses the OpenAI-compatible API at `http://127.0.0.1:5052/v1/`.
It accepts speech synthesis requests with model `omnivoice-thai` and voice `shiro`.
It accepts Thai transcription requests with model `typhoon-asr-realtime`.
Typhoon ignores the optional `prompt` field.
With `--stt-engine whisper`, the model is `whisper-small`, and a `prompt` of up to 1,000 characters guides Whisper with names or technical terms.

The `build-runtime.ps1` script stages the Python runtime, offline model caches, and the current Shiro voice reference.
The `licenses` folder contains the model license texts and attribution notice.
