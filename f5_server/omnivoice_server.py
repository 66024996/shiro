#!/usr/bin/env python3
"""OpenAI-compatible experimental server for the Thai OmniVoice checkpoint."""
import argparse
import os
import sys
from pathlib import Path

if os.name == "nt":
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8", errors="replace")

import numpy as np

from speech_api import SR, create_app, load_voices, pause_after, split_text


class OmniVoiceEngine:
    def __init__(self, model_id, device, steps, guidance_scale, volume, pause, rhythm):
        import torch
        from huggingface_hub import snapshot_download
        from omnivoice import OmniVoice

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
            f"volume={self.volume} pause={self.pause} rhythm={self.rhythm}"
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
        return np.concatenate(pieces)


def main():
    parser = argparse.ArgumentParser(description="OpenAI-compatible OmniVoice Thai server")
    parser.add_argument("--port", type=int, default=5052)
    parser.add_argument("--voices-dir", default="voices")
    parser.add_argument("--voice", default="shiro")
    parser.add_argument("--model-id", default="hotdogs/omnivoice-thai")
    parser.add_argument("--device", default="cuda", help="Use cuda or cpu")
    parser.add_argument("--steps", type=int, default=32)
    parser.add_argument("--guidance-scale", type=float, default=2.0)
    parser.add_argument("--speed", type=float, default=0.9)
    parser.add_argument("--volume", type=float, default=0.9)
    parser.add_argument("--pause", type=float, default=0.3)
    parser.add_argument("--rhythm", choices=("gentle", "off"), default="gentle")
    args = parser.parse_args()

    if args.steps < 1:
        parser.error("--steps must be positive")
    if not 0.1 <= args.volume <= 1.0:
        parser.error("--volume must be between 0.1 and 1.0")
    if not 0 <= args.pause <= 3:
        parser.error("--pause must be between 0 and 3 seconds")
    os.environ.setdefault("HF_HOME", str(Path(__file__).resolve().parent / "hf_cache"))
    voices = load_voices(Path(args.voices_dir))
    if not voices:
        sys.exit(f"No voice pairs found in {args.voices_dir}: expected matching .wav and .txt files")
    if args.voice not in voices:
        parser.error(f"Voice '{args.voice}' not found; available voices: {', '.join(voices)}")

    engine = OmniVoiceEngine(
        args.model_id,
        args.device,
        args.steps,
        args.guidance_scale,
        args.volume,
        args.pause,
        args.rhythm,
    )
    app = create_app(
        engine,
        voices,
        args.voice,
        default_speed=args.speed,
    )
    print("[system]", engine.info(), flush=True)
    print(f"Ready: http://localhost:{args.port}/v1/ voice={args.voice}", flush=True)

    import uvicorn

    uvicorn.run(app, host="127.0.0.1", port=args.port, log_level="warning")


if __name__ == "__main__":
    main()
