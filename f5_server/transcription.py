#!/usr/bin/env python3
"""Local Thai speech-to-text inference with Faster-Whisper."""
import io
import threading
from pathlib import Path


class ThaiTranscriber:
    def __init__(self, model_name: str, cache_dir: Path):
        self.model_name = model_name
        self.cache_dir = cache_dir
        self._model = None
        self._lock = threading.Lock()

    @property
    def model_id(self) -> str:
        """The model name that API requests use."""
        return f"whisper-{self.model_name}"

    @property
    def loaded(self) -> bool:
        return self._model is not None

    def transcribe(
        self,
        audio: bytes,
        language: str = "th",
        prompt: str | None = None,
    ) -> dict:
        if not audio:
            raise ValueError("Audio input is empty")
        if language != "th":
            raise ValueError("Only Thai transcription is supported")

        with self._lock:
            if self._model is None:
                from faster_whisper import WhisperModel

                self.cache_dir.mkdir(parents=True, exist_ok=True)
                print(
                    f"[stt] loading Faster-Whisper {self.model_name} on CPU (int8) ...",
                    flush=True,
                )
                self._model = WhisperModel(
                    self.model_name,
                    device="cpu",
                    compute_type="int8",
                    download_root=str(self.cache_dir),
                )
                print(f"[stt] Faster-Whisper {self.model_name} ready", flush=True)

            options = {
                "language": language,
                "task": "transcribe",
                "beam_size": 5,
                "vad_filter": True,
            }
            if prompt and prompt.strip():
                options["initial_prompt"] = prompt.strip()

            segments, info = self._model.transcribe(io.BytesIO(audio), **options)
            segments = list(segments)

        transcript = "".join(segment.text for segment in segments).strip()
        return {
            "text": transcript,
            "language": info.language,
            "duration": info.duration,
            "segments": [
                {
                    "id": index,
                    "start": segment.start,
                    "end": segment.end,
                    "text": segment.text,
                    "avg_logprob": segment.avg_logprob,
                }
                for index, segment in enumerate(segments)
            ],
        }
