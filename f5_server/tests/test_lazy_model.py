import unittest

from lazy_model import LazyModel


class ManualTimer:
    """Stands in for threading.Timer. The test fires it by hand."""

    def __init__(self, seconds, callback):
        self.seconds = seconds
        self.callback = callback
        self.cancelled = False

    def start(self):
        pass

    def cancel(self):
        self.cancelled = True


class LazyModelTests(unittest.TestCase):
    def setUp(self):
        self.events = []
        self.timers = []

        def timer_factory(seconds, callback):
            timer = ManualTimer(seconds, callback)
            self.timers.append(timer)
            return timer

        self.model = LazyModel(
            load=lambda: self.events.append("load") or "model",
            unload=lambda model: self.events.append("unload"),
            idle_seconds=20,
            timer_factory=timer_factory,
        )

    def test_keeps_the_model_without_memory_saver(self):
        with self.model.use() as model:
            self.assertEqual(model, "model")

        self.assertEqual(self.events, ["load"])
        self.assertEqual(self.timers, [])

    def test_memory_saver_unloads_now_and_after_each_quiet_period(self):
        self.model.load()
        self.model.set_memory_saver(True)
        self.assertEqual(self.events, ["load", "unload"])

        with self.model.use():
            pass
        self.assertEqual(self.events, ["load", "unload", "load"])
        self.timers[-1].callback()
        self.assertEqual(self.events, ["load", "unload", "load", "unload"])
        self.assertFalse(self.model.loaded)

    def test_a_reply_with_several_requests_loads_the_model_once(self):
        self.model.set_memory_saver(True)
        for _ in range(3):
            with self.model.use():
                pass

        # A late timer from an earlier request must not unload the model during the next request.
        self.timers[0].callback()
        self.timers[1].callback()
        self.assertEqual(self.events, ["load"])
        self.timers[2].callback()
        self.assertEqual(self.events, ["load", "unload"])


if __name__ == "__main__":
    unittest.main()
