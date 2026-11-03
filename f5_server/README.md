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
The first transcription request downloads the Whisper `small` model.
Later requests use the local cache.

## Speech providers

The service uses the OpenAI-compatible API at `http://127.0.0.1:5052/v1/`.
It accepts speech synthesis requests with model `omnivoice-thai` and voice `shiro`.
It accepts Thai transcription requests with model `whisper-small`.
Send an optional `prompt` field with up to 1,000 characters to guide Whisper with names or technical terms.
A wrong prompt can change the transcript, so omit it when no useful context exists.

The `build-runtime.ps1` script stages the Python runtime, offline model caches, and the current Shiro voice reference.
The `licenses` folder contains the model license texts and attribution notice.
