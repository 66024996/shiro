#!/usr/bin/env python3
"""Shared OpenAI-compatible speech API and voice-reference helpers."""
import io
import re
import threading
import time
from collections import OrderedDict
from pathlib import Path

from thai_text import normalize_for_speech


SR = 24000
HEARTBEAT = 20
TOKEN_RE = re.compile(r"<\|.*?\|>", re.S)
EMOJI_RE = re.compile("[\U0001F000-\U0001FAFF\u2600-\u27BF\uFE0F\u200d]")
MD_RE = re.compile(r"[*_`#>~|]+")


def clean_text(text: str) -> str:
    text = TOKEN_RE.sub(" ", text)
    text = EMOJI_RE.sub("", text)
    text = MD_RE.sub("", text)
    text = text.replace("…", " ").replace("...", " ")
    return re.sub(r"\s+", " ", text).strip()


def split_text(text):
    boundary = r"(?<=[,，;；.!?。！？])(?=[^,，;；.!?。！？])|[\r\n]+"
    return [phrase.strip() for phrase in re.split(boundary, text) if phrase.strip()]


def pause_after(phrase, base_pause):
    if base_pause == 0:
        return 0
    if phrase.endswith((",", "，", ";", "；")):
        return min(base_pause, 0.3)
    if phrase.endswith((".", "!", "?", "。", "！", "？")):
        return max(base_pause, 0.65)
    return base_pause


def shorten_pauses(audio, sample_rate, scale, min_gap=0.2, threshold=0.02):
    """Shortens each silent run of at least `min_gap` seconds to `scale` times its length.

    The Thai model puts about 0.5 s of silence at each space, which sounds slow.
    Shorter quiet runs are gaps between syllables, so they stay unchanged.
    """
    import numpy as np

    window = max(1, round(sample_rate * 0.01))
    count = audio.size // window
    if scale >= 1 or count == 0:
        return audio

    peaks = np.abs(audio[:count * window]).reshape(count, window).max(axis=1)
    quiet = peaks < threshold
    min_windows = max(1, round(min_gap * sample_rate / window))
    keep = np.ones(audio.size, dtype=bool)
    start = None
    for index in range(count + 1):
        if index < count and quiet[index]:
            if start is None:
                start = index
            continue
        if start is not None and index - start >= min_windows:
            length = (index - start) * window
            removed = length - round(length * scale)
            # Cut the middle of the run, so the fade at each edge stays.
            cut_start = start * window + (length - removed) // 2
            keep[cut_start:cut_start + removed] = False
        start = None
    return audio[keep]


def load_voices(directory: Path):
    voices = {}
    for audio_path in sorted(
        list(directory.glob("*.wav"))
        + list(directory.glob("*.mp3"))
        + list(directory.glob("*.flac"))
    ):
        transcript_path = audio_path.with_suffix(".txt")
        if not transcript_path.exists():
            print(f"[skip] {audio_path.name}: missing {transcript_path.name}")
            continue
        voices[audio_path.stem] = (
            str(audio_path),
            transcript_path.read_text(encoding="utf-8").strip(),
        )
        import soundfile as sf

        info = sf.info(str(audio_path))
        duration = info.frames / info.samplerate
        if duration > 10 or duration < 2:
            print(
                f"[warning] {audio_path.name} is {duration:.1f}s; "
                "OmniVoice recommends a 3-10s reference clip"
            )
    return voices


def create_app(engine, voices, default_voice, transcriber, default_speed=0.9, voices_dir=None):
    import numpy as np
    import soundfile as sf
    from fastapi import FastAPI, File, Form, HTTPException, UploadFile
    from fastapi.middleware.cors import CORSMiddleware
    from fastapi.responses import Response
    from pydantic import BaseModel, ConfigDict

    class SpeechReq(BaseModel):
        model_config = ConfigDict(extra="ignore")
        model: str | None = None
        input: str
        voice: str | None = None
        response_format: str | None = None
        speed: float | None = None

    app = FastAPI(title="Shiro OmniVoice TTS server")
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_methods=["*"],
        allow_headers=["*"],
    )
    lock, cache = threading.Lock(), OrderedDict()

    def refresh_voices():
        if voices_dir is None:
            return

        updated_voices = load_voices(Path(voices_dir))
        with lock:
            voices.clear()
            voices.update(updated_voices)

    def wav_bytes(audio):
        buffer = io.BytesIO()
        sf.write(buffer, audio, SR, format="WAV", subtype="PCM_16")
        return buffer.getvalue()

    @app.get("/health")
    def health():
        refresh_voices()
        with lock:
            voice_names = list(voices)
        return {
            "ok": True,
            "voices": voice_names,
            "default": default_voice if default_voice in voice_names else None,
            "voice_configured": bool(voice_names),
            "stt": {"model": transcriber.model_name, "loaded": transcriber.loaded},
        }

    @app.get("/v1/models")
    def models():
        return {
            "object": "list",
            "data": [
                {"id": "omnivoice-thai", "object": "model"},
                {"id": transcriber.model_id, "object": "model"},
            ],
        }

    @app.post("/v1/audio/transcriptions")
    def transcribe(
        file: UploadFile = File(...),
        model: str = Form(default=""),
        language: str = Form(default="th"),
        response_format: str = Form(default="json"),
        prompt: str = Form(default=""),
    ):
        if model != transcriber.model_id:
            raise HTTPException(400, f"Use model {transcriber.model_id}")
        if language.lower() not in ("th", "thai"):
            raise HTTPException(400, "Only Thai transcription is supported")
        if response_format not in ("json", "verbose_json", "text"):
            raise HTTPException(400, "response_format must be json, verbose_json, or text")
        prompt = prompt.strip()
        if len(prompt) > 1000:
            raise HTTPException(400, "prompt exceeds the 1000-character limit")

        audio = file.file.read(25 * 1024 * 1024 + 1)
        if not audio:
            raise HTTPException(400, "Audio input is empty")
        if len(audio) > 25 * 1024 * 1024:
            raise HTTPException(413, "Audio input exceeds the 25 MB limit")

        try:
            result = transcriber.transcribe(audio, language="th", prompt=prompt or None)
        except Exception as error:
            print(f"[stt-error] {type(error).__name__}: {error}", flush=True)
            raise HTTPException(500, f"transcription failed: {error}") from error

        if response_format == "text":
            return Response(result["text"], media_type="text/plain; charset=utf-8")
        if response_format == "verbose_json":
            return result
        return {"text": result["text"]}

    @app.post("/v1/audio/speech")
    def speech(request: SpeechReq):
        text = normalize_for_speech(clean_text(request.input))
        print("[request] TTS request received", flush=True)
        if text and not re.search(r"[\u0e00-\u0e7fA-Za-z0-9]", text):
            print("[warning] input has no Thai/English letters or digits; returning silence", flush=True)
            text = ""
        if not text:
            return Response(
                wav_bytes(np.zeros(round(SR * 0.3), dtype="float32")),
                media_type="audio/wav",
            )

        refresh_voices()
        with lock:
            if not voices:
                raise HTTPException(503, "No voice reference is configured")

            voice_name = request.voice if request.voice in voices else default_voice
            if voice_name not in voices:
                raise HTTPException(503, "The default voice reference is unavailable")
            ref_audio, ref_text = voices[voice_name]
            speed = min(1.5, max(0.5, request.speed or default_speed))
            key = (voice_name, text, round(speed, 2))
            if key in cache:
                cache.move_to_end(key)
                return Response(cache[key], media_type="audio/wav")

        started = time.time()
        done = threading.Event()

        def heartbeat():
            while not done.wait(HEARTBEAT):
                print(f"[synthesizing] {time.time() - started:.0f}s elapsed", flush=True)

        threading.Thread(target=heartbeat, daemon=True).start()
        try:
            with lock:
                audio = engine.synth(ref_audio, ref_text, text, speed)
        except Exception as error:
            done.set()
            print(f"[error] {type(error).__name__}: {error}", flush=True)
            raise HTTPException(500, f"synthesis failed: {error}") from error
        done.set()

        duration = len(audio) / SR
        elapsed = time.time() - started
        print(
            f"[tts] {len(text)} chars -> {duration:.1f}s audio in {elapsed:.1f}s "
            f"(RTF {elapsed / max(duration, 0.01):.2f})",
            flush=True,
        )
        data = wav_bytes(audio)
        cache[key] = data
        if len(cache) > 64:
            cache.popitem(last=False)
        return Response(data, media_type="audio/wav")

    return app
