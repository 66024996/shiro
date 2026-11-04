#!/usr/bin/env python3
"""OpenAI-compatible experimental server for the Thai OmniVoice checkpoint."""
import argparse
import os
import sys
import threading
from pathlib import Path

if os.name == "nt":
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8", errors="replace")

import numpy as np

from speech_api import SR, create_app, load_voices, pause_after, shorten_pauses, split_text
from transcription import ThaiTranscriber
from typhoon_onnx import TyphoonTranscriber


class OmniVoiceEngine:
    def __init__(self, model_id, device, steps, guidance_scale, volume, pause, rhythm, pause_scale):
        import torch
        from huggingface_hub import snapshot_download
        from omnivoice import OmniVoice

        if device == "auto":
            device = "cuda" if torch.cuda.is_available() else "cpu"
        if device.startswith("cuda") and not torch.cuda.is_available():
            raise RuntimeError("CUDA requested, but it is unavailable in this environment")

        dtype = torch.float16 if device.startswith("cuda") else torch.float32
        print(f"Loading OmniVoice model {model_id} on {device} (dtype={dtype}) ...", flush=True)
        model_path = snapshot_download(
            model_id,
            allow_patterns=["*.json", "*.safetensors", "*.jinja", "*.txt"],
        )
        self.model = OmniVoice.from_pretrained(
            model_path,
            device_map=device,
            dtype=dtype,
            load_asr=False,
        )
        self.steps = steps
        self.guidance_scale = guidance_scale
        self.volume = volume
        self.pause = pause
        self.rhythm = rhythm
        self.pause_scale = pause_scale
        self.sample_rate = int(self.model.sampling_rate)
        if self.sample_rate != SR:
            raise RuntimeError(
                f"OmniVoice sample rate is {self.sample_rate} Hz; server requires {SR} Hz"
            )

    def info(self):
        import torch

        return (
            f"torch {torch.__version__} | cuda={torch.cuda.is_available()} | "
            f"device={self.model.device} | sample_rate={self.sample_rate} | "
            f"steps={self.steps} cfg={self.guidance_scale} | "
            f"volume={self.volume} pause={self.pause} rhythm={self.rhythm} pause_scale={self.pause_scale}"
        )

    def _synth_phrase(self, ref_audio, ref_text, text, speed, phrase_index):
        audio = self.model.generate(
            text=text,
            language="Thai",
            ref_audio=ref_audio,
            ref_text=ref_text,
            speed=speed,
            num_step=self.steps,
            guidance_scale=self.guidance_scale,
        )[0]
        result = np.array(audio, dtype=np.float32, copy=True).reshape(-1)
        if result.size == 0:
            raise RuntimeError("OmniVoice returned an empty audio result")

        fade_frames = min(round(self.sample_rate * 0.008), result.size // 2)
        if fade_frames:
            fade = np.linspace(0, 1, fade_frames, endpoint=False, dtype=np.float32)
            result[:fade_frames] *= fade
            result[-fade_frames:] *= fade[::-1]

        if self.rhythm == "gentle":
            gain = self.volume * (1.0, 0.82, 0.94, 0.86)[phrase_index % 4]
        else:
            gain = self.volume
        peak = float(np.max(np.abs(result)))
        if peak:
            result *= min(gain, 0.92 / peak)
        return result

    def synth(self, ref_audio, ref_text, text, speed):
        phrases = split_text(text) if self.rhythm == "gentle" else [text]
        if len(phrases) > 5:
            group_size = (len(phrases) + 4) // 5
            phrases = [
                " ".join(phrases[i:i + group_size])
                for i in range(0, len(phrases), group_size)
            ]

        speed_offsets = (0.0, -0.04, 0.05, -0.02)
        pieces = []
        for index, phrase in enumerate(phrases):
            offset = speed_offsets[index % len(speed_offsets)] if self.rhythm == "gentle" else 0.0
            phrase_speed = min(1.5, max(0.5, speed + offset))
            audio = self._synth_phrase(ref_audio, ref_text, phrase, phrase_speed, index)
            pieces.append(audio)
            if index < len(phrases) - 1:
                silence = round(self.sample_rate * pause_after(phrase, self.pause))
                if silence:
                    pieces.append(np.zeros(silence, dtype=np.float32))
        return shorten_pauses(np.concatenate(pieces), self.sample_rate, self.pause_scale)


def main():
    parser = argparse.ArgumentParser(description="OpenAI-compatible OmniVoice Thai server")
    parser.add_argument("--port", type=int, default=5052)
    parser.add_argument(
        "--voices-dir",
        default=os.environ.get("SHIRO_SPEECH_VOICE_DIR", "voices"),
    )
    parser.add_argument("--voice", default="shiro")
    parser.add_argument("--model-id", default="hotdogs/omnivoice-thai")
    parser.add_argument("--device", choices=("auto", "cuda", "cpu"), default="auto")
    parser.add_argument("--steps", type=int, default=32)
    parser.add_argument("--guidance-scale", type=float, default=2.0)
    parser.add_argument("--speed", type=float, default=0.9)
    parser.add_argument("--volume", type=float, default=0.9)
    parser.add_argument("--pause", type=float, default=0.3)
    parser.add_argument("--rhythm", choices=("gentle", "off"), default="gentle")
    parser.add_argument(
        "--pause-scale",
        type=float,
        default=0.5,
        help="Length factor for silent runs of 0.2 s or more. 1 keeps them unchanged.",
    )
    parser.add_argument(
        "--stt-engine",
        choices=("typhoon", "whisper"),
        default="typhoon",
        help="typhoon: Typhoon ASR Realtime on ONNX Runtime. whisper: Faster-Whisper.",
    )
    parser.add_argument(
        "--stt-model-dir",
        default=os.environ.get("SHIRO_STT_MODEL_DIR", str(Path(__file__).resolve().parent / "models" / "typhoon-asr-realtime")),
        help="The folder that export_typhoon_onnx.py wrote.",
    )
    parser.add_argument("--stt-model", default="small", help="The Faster-Whisper model, for --stt-engine whisper.")
    args = parser.parse_args()

    if args.steps < 1:
        parser.error("--steps must be positive")
    if not 0.1 <= args.volume <= 1.0:
        parser.error("--volume must be between 0.1 and 1.0")
    if not 0 <= args.pause <= 3:
        parser.error("--pause must be between 0 and 3 seconds")
    if not 0.1 <= args.pause_scale <= 1:
        parser.error("--pause-scale must be between 0.1 and 1")
    os.environ.setdefault("HF_HOME", str(Path(__file__).resolve().parent / "hf_cache"))
    voice_directory = Path(args.voices_dir)
    voices = load_voices(voice_directory)
    if not voices:
        print(f"No voice reference is configured in {voice_directory}", flush=True)
    elif args.voice not in voices:
        parser.error(f"Voice '{args.voice}' not found; available voices: {', '.join(voices)}")

    engine = OmniVoiceEngine(
        args.model_id,
        args.device,
        args.steps,
        args.guidance_scale,
        args.volume,
        args.pause,
        args.rhythm,
        args.pause_scale,
    )
    if args.stt_engine == "typhoon":
        transcriber = TyphoonTranscriber(args.stt_model_dir)
        # The model loads in about 5 seconds. Loading it now keeps the first voice command fast.
        threading.Thread(target=transcriber.load, name="stt-preload", daemon=True).start()
    else:
        transcriber = ThaiTranscriber(args.stt_model, Path(os.environ["HF_HOME"]) / "faster-whisper")
    app = create_app(
        engine,
        voices,
        args.voice,
        default_speed=args.speed,
        transcriber=transcriber,
        voices_dir=voice_directory,
    )
    print("[system]", engine.info(), flush=True)
    print(f"Ready: http://localhost:{args.port}/v1/ voice={args.voice}", flush=True)

    import uvicorn

    uvicorn.run(app, host="127.0.0.1", port=args.port, log_level="warning")


if __name__ == "__main__":
    main()
