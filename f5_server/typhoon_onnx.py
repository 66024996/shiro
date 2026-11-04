#!/usr/bin/env python3
"""Thai speech-to-text with Typhoon ASR Realtime on ONNX Runtime.

It reads the files that export_typhoon_onnx.py writes. The features copy NeMo's
AudioToMelSpectrogramPreprocessor in eval mode, and decoding is greedy RNN-T, as in NeMo.
"""
import io
import json
import threading
from pathlib import Path

import numpy as np

WORD_BOUNDARY = "▁"


def mel_features(audio, filterbank, window, config):
    """Returns normalized log-mel features with shape (80, frames), and the valid frame count."""
    n_fft = config["n_fft"]
    hop = config["hop_length"]
    valid = audio.size // hop

    emphasized = np.concatenate([audio[:1], audio[1:] - config["preemph"] * audio[:-1]]).astype(np.float32)
    padded = np.pad(emphasized, (n_fft // 2, n_fft // 2))
    frame_count = 1 + (padded.size - n_fft) // hop
    frames = np.lib.stride_tricks.as_strided(
        padded,
        shape=(frame_count, n_fft),
        strides=(padded.strides[0] * hop, padded.strides[0]),
    )
    # torch.stft centers a short window inside the FFT size with zeros.
    offset = (n_fft - window.size) // 2
    fft_window = np.zeros(n_fft, dtype=np.float32)
    fft_window[offset:offset + window.size] = window
    power = np.abs(np.fft.rfft(frames * fft_window, n=n_fft, axis=1)) ** 2
    mel = np.log(filterbank @ power.T.astype(np.float32) + config["log_zero_guard"])

    used = mel[:, :valid]
    mean = used.mean(axis=1, keepdims=True)
    std = np.sqrt(((used - mean) ** 2).sum(axis=1, keepdims=True) / max(valid - 1, 1)) + 1e-5
    normalized = (mel - mean) / std
    normalized[:, valid:] = 0.0
    return normalized.astype(np.float32), valid


def read_audio(data, sample_rate):
    """Decodes WAV and other formats to mono float32 at the model sample rate."""
    try:
        import soundfile as sf

        audio, rate = sf.read(io.BytesIO(data), dtype="float32", always_2d=True)
        audio = audio.mean(axis=1)
    except Exception:
        import av

        with av.open(io.BytesIO(data)) as container:
            resampler = av.AudioResampler(format="flt", layout="mono", rate=sample_rate)
            chunks = []
            for frame in container.decode(audio=0):
                for converted in resampler.resample(frame):
                    chunks.append(converted.to_ndarray().reshape(-1))
            audio, rate = (np.concatenate(chunks) if chunks else np.zeros(0, np.float32)), sample_rate
    if rate != sample_rate:
        import soxr

        audio = soxr.resample(audio, rate, sample_rate)
    return np.ascontiguousarray(audio, dtype=np.float32)


class TyphoonOnnxModel:
    """Typhoon ASR Realtime encoder and RNN-T decoder on ONNX Runtime, CPU only."""

    def __init__(self, model_dir, threads=None):
        import onnxruntime as ort

        model_dir = Path(model_dir)
        self.config = json.loads((model_dir / "config.json").read_text(encoding="utf-8"))
        preprocessor = np.load(model_dir / "preprocessor.npz")
        self.filterbank = preprocessor["filterbank"]
        self.window = preprocessor["window"]
        self.tokens = (model_dir / "tokens.txt").read_text(encoding="utf-8").split("\n")

        options = ort.SessionOptions()
        # Without the arena, private memory is about 70 MB lower, and speed is the same.
        options.enable_cpu_mem_arena = False
        if threads:
            options.intra_op_num_threads = threads
        providers = ["CPUExecutionProvider"]
        self.encoder = ort.InferenceSession(str(model_dir / "encoder-model.onnx"), options, providers=providers)
        self.decoder = ort.InferenceSession(str(model_dir / "decoder_joint-model.onnx"), options, providers=providers)

    def transcribe_samples(self, audio):
        if audio.size < self.config["hop_length"] * 2:
            return ""
        features, valid = mel_features(audio, self.filterbank, self.window, self.config)
        encoded, encoded_lengths = self.encoder.run(
            None,
            {"audio_signal": features[None], "length": np.array([valid], dtype=np.int64)},
        )
        return self._decode(encoded, int(encoded_lengths[0]))

    def _decode(self, encoded, length):
        blank = self.config["blank_id"]
        hidden = self.config["pred_hidden"]
        layers = self.config["pred_layers"]
        state_h = np.zeros((layers, 1, hidden), dtype=np.float32)
        state_c = np.zeros((layers, 1, hidden), dtype=np.float32)
        last = blank
        emitted = []
        for frame in range(length):
            frame_input = encoded[:, :, frame:frame + 1]
            for _ in range(self.config["max_symbols_per_step"]):
                logits, _, next_h, next_c = self.decoder.run(
                    None,
                    {
                        "encoder_outputs": frame_input,
                        "targets": np.array([[last]], dtype=np.int32),
                        "target_length": np.array([1], dtype=np.int32),
                        "input_states_1": state_h,
                        "input_states_2": state_c,
                    },
                )
                token = int(np.argmax(logits.reshape(-1)))
                if token == blank:
                    break
                emitted.append(token)
                last = token
                state_h, state_c = next_h, next_c
        return self.detokenize(emitted)

    def detokenize(self, ids):
        pieces = [self.tokens[index] for index in ids if not self.tokens[index].startswith("<")]
        return "".join(pieces).replace(WORD_BOUNDARY, " ").strip()


class TyphoonTranscriber:
    """Thai speech-to-text for the speech API. It loads the model on the first request."""

    model_id = "typhoon-asr-realtime"

    def __init__(self, model_dir):
        self.model_dir = Path(model_dir)
        self.model_name = "typhoon-asr-realtime"
        self._model = None
        self._lock = threading.Lock()

    @property
    def loaded(self):
        return self._model is not None

    def load(self):
        """Loads the model now, so the first request does not wait for it."""
        with self._lock:
            self._load()

    def _load(self):
        if self._model is None:
            print(f"[stt] loading Typhoon ASR from {self.model_dir} ...", flush=True)
            self._model = TyphoonOnnxModel(self.model_dir)
            print("[stt] Typhoon ASR ready", flush=True)

    def transcribe(self, audio, language="th", prompt=None):
        """Returns the text. Typhoon does not take a prompt, so `prompt` has no effect."""
        if not audio:
            raise ValueError("Audio input is empty")
        if language != "th":
            raise ValueError("Only Thai transcription is supported")

        with self._lock:
            self._load()
            samples = read_audio(audio, self._model.config["sample_rate"])
            text = self._model.transcribe_samples(samples)

        duration = samples.size / self._model.config["sample_rate"]
        return {
            "text": text,
            "language": "th",
            "duration": duration,
            "segments": [{"id": 0, "start": 0.0, "end": duration, "text": text}] if text else [],
        }
