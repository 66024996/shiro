"""Loads a model on demand and unloads it after a quiet period, while memory saver is on.

Shiro turns memory saver on in Gaming Mode. The TTS model then uses no memory between replies.
One reply sends several TTS requests in a row, so the model unloads only after `idle_seconds`
without a request, not after each request.
"""
import threading
from contextlib import contextmanager


class LazyModel:
    def __init__(self, load, unload, idle_seconds=20.0, timer_factory=threading.Timer):
        self._load = load
        self._unload = unload
        self._idle_seconds = idle_seconds
        self._timer_factory = timer_factory
        self._lock = threading.RLock()
        self._timer = None
        self._model = None
        # Each request or setting change starts a new generation, so a timer that fired late does nothing.
        self._generation = 0
        self.memory_saver = False

    @property
    def loaded(self):
        return self._model is not None

    def load(self):
        with self._lock:
            if self._model is None:
                self._model = self._load()
            return self._model

    @contextmanager
    def use(self):
        """Holds the model for one request. With memory saver on, it unloads after the quiet period."""
        with self._lock:
            self._cancel_timer()
            try:
                yield self.load()
            finally:
                if self.memory_saver:
                    self._schedule_unload()

    def discard(self):
        """Unloads the model now, for example after it broke. The next request loads it again."""
        with self._lock:
            self._cancel_timer()
            self._unload_now()

    def set_memory_saver(self, enabled):
        """With memory saver on, the model unloads now. With it off, the model loads again in the background."""
        with self._lock:
            self.memory_saver = enabled
            self._cancel_timer()
            if enabled:
                self._unload_now()
                return
        threading.Thread(target=self._reload_unless_saving, name="tts-reload", daemon=True).start()

    def _reload_unless_saving(self):
        with self._lock:
            if not self.memory_saver:
                self.load()

    def _schedule_unload(self):
        generation = self._generation
        self._timer = self._timer_factory(self._idle_seconds, lambda: self._unload_if_idle(generation))
        self._timer.daemon = True
        self._timer.start()

    def _unload_if_idle(self, generation):
        with self._lock:
            if self.memory_saver and generation == self._generation:
                self._unload_now()

    def _unload_now(self):
        if self._model is None:
            return
        model, self._model = self._model, None
        self._unload(model)

    def _cancel_timer(self):
        self._generation += 1
        if self._timer is not None:
            self._timer.cancel()
            self._timer = None
