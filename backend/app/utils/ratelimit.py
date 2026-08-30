"""Einfaches In-Process-Token-Bucket-Rate-Limiting (per Schlüssel, z. B. IP+Route).
Für Mehr-Instanz-Betrieb am Reverse Proxy bzw. via Redis ersetzen."""
import threading
import time


class RateLimiter:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._buckets: dict[str, tuple[float, float]] = {}  # key -> (tokens, last_ts)

    def allow(self, key: str, per_minute: int) -> bool:
        rate = per_minute / 60.0
        capacity = float(per_minute)
        now = time.monotonic()
        with self._lock:
            tokens, last = self._buckets.get(key, (capacity, now))
            tokens = min(capacity, tokens + (now - last) * rate)
            if tokens < 1.0:
                self._buckets[key] = (tokens, now)
                return False
            self._buckets[key] = (tokens - 1.0, now)
            return True


rate_limiter = RateLimiter()
