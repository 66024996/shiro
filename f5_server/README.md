# Shiro Thai TTS (OmniVoice)

Local OpenAI-compatible Thai voice-cloning server using the gentle Shiro profile.

## Start

From `D:\Shiro\f5_server`:

```powershell
.\start_omnivoice.bat
```

The first launch downloads the inference checkpoint and audio tokenizer into `hf_cache`.
Subsequent launches use that local cache. The reference voice is `voices\shiro.wav`
with its matching transcript `voices\shiro.txt`; keep both files together.

Connect an OpenAI-compatible speech provider with:

- Base URL: `http://localhost:5052/v1/`
- API key: any non-empty value
- Model: `omnivoice-thai`
- Voice: `shiro`

## Gentle profile

By default, the server uses speed `0.9`, volume `0.9`, phrase-level variation in speed
and loudness, and short pauses at punctuation. Pitch is left to the reference voice.
Phrase-level synthesis adds latency: a 42-character sample took about 5.8 seconds
on the RTX 3050, versus 3.8 seconds for a single-pass request.

Adjust the profile when starting the server:

```powershell
.\start_omnivoice.bat --speed 0.95 --volume 0.85 --pause 0.25
.\start_omnivoice.bat --rhythm off --speed 0.9 --volume 0.9
```

Use `--device cpu` if GPU memory is unavailable. `--steps 16` may reduce synthesis
time but can lower audio quality.

## Runtime files

- `.venv` provides the shared PyTorch/CUDA and audio runtime; keep it.
- `.venv_omnivoice` provides the OmniVoice package; keep it.
- `hf_cache` contains the downloaded model weights and tokenizer; keep it for offline starts.
- `voices\shiro.wav` and `voices\shiro.txt` are the voice-cloning reference; do not remove them.

The OmniVoice Thai checkpoint is licensed CC BY-NC 4.0; use it only in accordance with
that license.
