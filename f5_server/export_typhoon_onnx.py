#!/usr/bin/env python3
"""Exports Typhoon ASR Realtime from its official NeMo checkpoint to the files that typhoon_onnx.py reads.

Run it once with a Python environment that has `typhoon-asr` (NeMo) installed:

    .venv_typhoon\\Scripts\\python.exe export_typhoon_onnx.py --out models\\typhoon-asr-realtime

The output folder holds the encoder, the decoder and joint network, the mel filterbank, the STFT window,
and the token list. The speech server needs only onnxruntime and numpy to use them.
"""
import argparse
import json
import logging
from pathlib import Path

MODEL_ID = "typhoon-ai/typhoon-asr-realtime"


def main():
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--out", default="models/typhoon-asr-realtime")
    args = parser.parse_args()

    logging.disable(logging.WARNING)
    import numpy as np
    import nemo.collections.asr as nemo_asr

    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    model = nemo_asr.models.ASRModel.from_pretrained(MODEL_ID, map_location="cpu")
    model.eval()
    model.export(str(out / "model.onnx"))

    featurizer = model.preprocessor.featurizer
    np.savez(
        out / "preprocessor.npz",
        filterbank=featurizer.fb.squeeze(0).numpy().astype(np.float32),
        window=featurizer.window.numpy().astype(np.float32),
    )
    config = {
        "model_id": MODEL_ID,
        "sample_rate": int(model.cfg.preprocessor.sample_rate),
        "n_fft": int(featurizer.n_fft),
        "hop_length": int(featurizer.hop_length),
        "win_length": int(featurizer.win_length),
        "preemph": float(featurizer.preemph),
        "log_zero_guard": float(featurizer.log_zero_guard_value),
        "blank_id": int(model.decoder.blank_idx),
        "pred_hidden": int(model.decoder.pred_hidden),
        "pred_layers": int(model.decoder.pred_rnn_layers),
        "max_symbols_per_step": int(model.cfg.decoding.greedy.get("max_symbols", 10) or 10),
    }
    (out / "config.json").write_text(json.dumps(config, indent=2), encoding="utf-8")
    tokens = [model.tokenizer.ids_to_tokens([index])[0] for index in range(model.tokenizer.vocab_size)]
    (out / "tokens.txt").write_text("\n".join(tokens), encoding="utf-8")
    print(f"Exported {MODEL_ID} to {out}")


if __name__ == "__main__":
    main()
