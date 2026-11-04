import tempfile
import unittest
import wave
from pathlib import Path

import numpy as np
from fastapi.testclient import TestClient

from speech_api import create_app, shorten_pauses


class FakeEngine:
    def __init__(self):
        self.last_reference = None

    def synth(self, ref_audio, ref_text, text, speed):
        self.last_reference = (ref_audio, ref_text, text, speed)
        return np.zeros(2400, dtype=np.float32)


class FakeTranscriber:
    model_name = "small"
    loaded = False


class SpeechApiTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.voice_directory = Path(self.directory.name)
        self.engine = FakeEngine()
        app = create_app(
            self.engine,
            {},
            "shiro",
            FakeTranscriber(),
            voices_dir=self.voice_directory,
        )
        self.client = TestClient(app)

    def tearDown(self):
        self.directory.cleanup()

    def test_health_reports_missing_voice_reference(self):
        response = self.client.get("/health")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["voices"], [])
        self.assertFalse(response.json()["voice_configured"])

    def test_speech_requires_a_voice_reference(self):
        response = self.client.post(
            "/v1/audio/speech",
            json={"model": "omnivoice-thai", "input": "สวัสดี", "voice": "shiro"},
        )

        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.json()["detail"], "No voice reference is configured")

    def test_speech_uses_a_voice_imported_after_server_start(self):
        audio_path = self.voice_directory / "shiro.wav"
        with wave.open(str(audio_path), "wb") as audio_file:
            audio_file.setnchannels(1)
            audio_file.setsampwidth(2)
            audio_file.setframerate(24000)
            audio_file.writeframes(b"\0\0" * 24000)
        audio_path.with_suffix(".txt").write_text("สวัสดีค่ะ", encoding="utf-8")

        response = self.client.post(
            "/v1/audio/speech",
            json={"model": "omnivoice-thai", "input": "สวัสดี", "voice": "shiro"},
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(self.engine.last_reference[0], str(audio_path))
        self.assertEqual(self.engine.last_reference[1], "สวัสดีค่ะ")
        self.assertEqual(self.engine.last_reference[2], "สวัสดี")


class ShortenPausesTests(unittest.TestCase):
    def test_halves_long_silence_and_keeps_short_gaps(self):
        sample_rate = 1000
        tone = np.full(100, 0.5, dtype=np.float32)
        long_gap = np.zeros(600, dtype=np.float32)
        short_gap = np.zeros(100, dtype=np.float32)
        audio = np.concatenate([tone, long_gap, tone, short_gap, tone])

        result = shorten_pauses(audio, sample_rate, 0.5)

        self.assertEqual(result.size, audio.size - 300)
        self.assertEqual(int(np.count_nonzero(result)), 300)

    def test_keeps_audio_unchanged_at_scale_one(self):
        audio = np.concatenate([np.ones(100, dtype=np.float32), np.zeros(600, dtype=np.float32)])

        self.assertIs(shorten_pauses(audio, 1000, 1), audio)


if __name__ == "__main__":
    unittest.main()
