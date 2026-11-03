import sys
import tempfile
import types
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import Mock, patch

from fastapi.testclient import TestClient

from speech_api import create_app
from transcription import ThaiTranscriber


class FakeEngine:
    pass


class FakeTranscriber:
    model_name = "base"
    loaded = True

    def __init__(self):
        self.last_prompt = None

    def transcribe(self, audio, language="th", prompt=None):
        self.last_prompt = prompt
        return {
            "text": "สวัสดี",
            "language": language,
            "duration": 1.0,
            "segments": [{"id": 0, "start": 0.0, "end": 1.0, "text": "สวัสดี", "avg_logprob": -0.1}],
        }


class TranscriptionApiTests(unittest.TestCase):
    def setUp(self):
        self.transcriber = FakeTranscriber()
        app = create_app(
            FakeEngine(),
            {"shiro": ("reference.wav", "reference transcript")},
            "shiro",
            self.transcriber,
        )
        self.client = TestClient(app)

    def test_returns_openai_json_transcript(self):
        response = self.client.post(
            "/v1/audio/transcriptions",
            files={"file": ("sample.wav", b"sample audio", "audio/wav")},
            data={"model": "whisper-base", "language": "th", "response_format": "json"},
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"text": "สวัสดี"})

    def test_returns_verbose_transcript(self):
        response = self.client.post(
            "/v1/audio/transcriptions",
            files={"file": ("sample.wav", b"sample audio", "audio/wav")},
            data={"model": "whisper-base", "language": "th", "response_format": "verbose_json"},
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["language"], "th")
        self.assertEqual(response.json()["segments"][0]["text"], "สวัสดี")

    def test_passes_trimmed_prompt_to_transcriber(self):
        response = self.client.post(
            "/v1/audio/transcriptions",
            files={"file": ("sample.wav", b"sample audio", "audio/wav")},
            data={"model": "whisper-base", "prompt": "  STT และ TTS  "},
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(self.transcriber.last_prompt, "STT และ TTS")

    def test_rejects_prompt_over_1000_characters(self):
        response = self.client.post(
            "/v1/audio/transcriptions",
            files={"file": ("sample.wav", b"sample audio", "audio/wav")},
            data={"model": "whisper-base", "prompt": "x" * 1001},
        )

        self.assertEqual(response.status_code, 400)

    def test_rejects_non_thai_language(self):
        response = self.client.post(
            "/v1/audio/transcriptions",
            files={"file": ("sample.wav", b"sample audio", "audio/wav")},
            data={"model": "whisper-base", "language": "en"},
        )

        self.assertEqual(response.status_code, 400)

    def test_rejects_unknown_model(self):
        response = self.client.post(
            "/v1/audio/transcriptions",
            files={"file": ("sample.wav", b"sample audio", "audio/wav")},
            data={"model": "whisper-small", "language": "th"},
        )

        self.assertEqual(response.status_code, 400)


class ThaiTranscriberTests(unittest.TestCase):
    def test_loads_cpu_int8_model_once_and_returns_segments(self):
        options_seen = []

        def transcribe(audio, **options):
            options_seen.append(options)
            return (
                iter([SimpleNamespace(start=0.0, end=1.0, text=" สวัสดี", avg_logprob=-0.1)]),
                SimpleNamespace(language="th", duration=1.0),
            )

        model = types.SimpleNamespace(
            transcribe=transcribe,
        )
        fake_module = types.ModuleType("faster_whisper")
        constructor = Mock(return_value=model)
        fake_module.WhisperModel = constructor
        with patch.dict(sys.modules, {"faster_whisper": fake_module}):
            with tempfile.TemporaryDirectory() as directory:
                transcriber = ThaiTranscriber("base", Path(directory))
                first = transcriber.transcribe(b"audio bytes")
                second = transcriber.transcribe(b"audio bytes", prompt="  STT และ TTS  ")
                cache_dir = str(Path(directory))

            self.assertEqual(first["text"], "สวัสดี")
            self.assertEqual(first["segments"][0]["avg_logprob"], -0.1)
            self.assertEqual(second["text"], "สวัสดี")
            self.assertEqual(constructor.call_count, 1)
            self.assertNotIn("initial_prompt", options_seen[0])
            self.assertEqual(options_seen[1]["initial_prompt"], "STT และ TTS")
            constructor.assert_called_once_with(
                "base",
                device="cpu",
                compute_type="int8",
                download_root=cache_dir,
            )

    def test_rejects_empty_audio(self):
        transcriber = ThaiTranscriber("base", Path(tempfile.gettempdir()))

        with self.assertRaisesRegex(ValueError, "Audio input is empty"):
            transcriber.transcribe(b"")


if __name__ == "__main__":
    unittest.main()
