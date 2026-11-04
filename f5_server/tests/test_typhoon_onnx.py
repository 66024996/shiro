import unittest

import numpy as np

from typhoon_onnx import TyphoonOnnxModel, mel_features

CONFIG = {"n_fft": 512, "hop_length": 160, "preemph": 0.97, "log_zero_guard": 2**-24}


class MelFeaturesTests(unittest.TestCase):
    def test_normalizes_each_mel_band_over_valid_frames(self):
        rng = np.random.default_rng(1)
        audio = rng.normal(0, 0.1, 16000).astype(np.float32)
        filterbank = np.abs(rng.normal(0, 1, (80, 257))).astype(np.float32)
        window = np.hanning(400).astype(np.float32)

        features, valid = mel_features(audio, filterbank, window, CONFIG)

        self.assertEqual(valid, 100)
        self.assertEqual(features.shape, (80, 101))
        np.testing.assert_allclose(features[:, :valid].mean(axis=1), 0, atol=1e-4)
        np.testing.assert_allclose(features[:, :valid].std(axis=1, ddof=1), 1, atol=1e-3)
        self.assertTrue(np.all(features[:, valid:] == 0))


class DetokenizeTests(unittest.TestCase):
    def test_joins_pieces_and_drops_special_tokens(self):
        model = TyphoonOnnxModel.__new__(TyphoonOnnxModel)
        model.tokens = ["<unk>", "▁ชิ", "โระ", "▁เปิด", "<pad>"]

        self.assertEqual(model.detokenize([1, 2, 3, 4, 0]), "ชิโระ เปิด")


if __name__ == "__main__":
    unittest.main()
