"""Sample frame dari video source pada interval tertentu."""

import time
from collections.abc import Generator

import numpy as np

from src.mediamtx_source import MediaMtxSource


class FrameSampler:
    """Yield satu frame per interval_ms dari source."""

    def __init__(self, source: MediaMtxSource, interval_ms: int) -> None:
        self.source = source
        self.interval_s = interval_ms / 1000.0

    def frames(self, stop_flag: object) -> Generator[np.ndarray, None, None]:
        """Generator yang yield frame pada interval yang ditentukan.

        stop_flag: threading.Event — generator berhenti saat flag di-set.
        """
        last_yield = 0.0
        while not getattr(stop_flag, "is_set", lambda: False)():
            if not self.source.connected:
                if not self.source.connect():
                    self.source.wait_reconnect()
                    continue

            frame = self.source.read_frame()
            if frame is None:
                self.source.wait_reconnect()
                continue

            now = time.monotonic()
            if now - last_yield >= self.interval_s:
                last_yield = now
                yield frame
