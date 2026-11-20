"""Runs OmniVoice in a child process, so Gaming Mode can stop it and give its memory back.

The weights sit on the GPU, but torch and CUDA keep more than 2 GB of RAM while the process lives.
Only an exit frees that RAM. With memory saver on, the child process stops after a quiet period and
starts again for the next reply.
"""
import multiprocessing

from lazy_model import LazyModel


def _serve(connection, engine_options):
    """Child process: loads the engine once, then answers synth requests until it gets None."""
    from omnivoice_server import OmniVoiceEngine

    try:
        engine = OmniVoiceEngine(**engine_options)
    except Exception as error:
        connection.send(("error", f"{type(error).__name__}: {error}"))
        return
    connection.send(("ready", engine.info()))
    while True:
        request = connection.recv()
        if request is None:
            return
        try:
            connection.send(("audio", engine.synth(*request)))
        except Exception as error:
            connection.send(("error", f"{type(error).__name__}: {error}"))


class _Worker:
    def __init__(self, engine_options):
        context = multiprocessing.get_context("spawn")
        self.connection, child_connection = context.Pipe()
        self.process = context.Process(target=_serve, args=(child_connection, engine_options), name="omnivoice-tts", daemon=True)
        self.process.start()
        child_connection.close()
        kind, value = self.connection.recv()
        if kind != "ready":
            self.stop()
            raise RuntimeError(f"The TTS process failed to start: {value}")
        self.info = value

    def synth(self, *request):
        self.connection.send(request)
        kind, value = self.connection.recv()
        if kind == "error":
            raise RuntimeError(value)
        return value

    def stop(self):
        try:
            self.connection.send(None)
        except (BrokenPipeError, OSError):
            pass
        self.process.join(timeout=10)
        if self.process.is_alive():
            self.process.kill()
            self.process.join()
        self.connection.close()


class TtsProcess:
    """The engine interface of speech_api, backed by a child process."""

    def __init__(self, engine_options, idle_seconds=20.0):
        self.worker = LazyModel(lambda: _Worker(engine_options), self._stop, idle_seconds=idle_seconds)
        self._info = self.worker.load().info

    @staticmethod
    def _stop(worker):
        worker.stop()
        print("[memory] TTS process stopped", flush=True)

    def info(self):
        return self._info

    @property
    def loaded(self):
        return self.worker.loaded

    @property
    def memory_saver(self):
        return self.worker.memory_saver

    def set_memory_saver(self, enabled):
        self.worker.set_memory_saver(enabled)

    def synth(self, ref_audio, ref_text, text, speed):
        try:
            with self.worker.use() as worker:
                return worker.synth(ref_audio, ref_text, text, speed)
        except (EOFError, OSError) as error:
            # The child process died, for example after running out of memory. Start a new one next time.
            self.worker.discard()
            raise RuntimeError("The TTS process stopped unexpectedly") from error
