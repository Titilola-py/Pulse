"""
Simple in-memory rate limiting utilities.
"""
from collections import defaultdict, deque
from threading import Lock
import time
from typing import Deque, Dict


class InMemoryRateLimiter:
    """Simple sliding-window rate limiter (per process)."""

    def __init__(self) -> None:
        self._events: Dict[str, Deque[float]] = defaultdict(deque)
        self._lock = Lock()

    def allow(self, key: str, limit: int, window_seconds: int) -> bool:
        now = time.monotonic()
        with self._lock:
            events = self._events[key]
            cutoff = now - window_seconds
            while events and events[0] < cutoff:
                events.popleft()
            if len(events) >= limit:
                return False
            events.append(now)
            if not events:
                self._events.pop(key, None)
            return True


rate_limiter = InMemoryRateLimiter()

# Default limits
LOGIN_ATTEMPT_LIMIT = 5
LOGIN_ATTEMPT_WINDOW_SECONDS = 60

WS_EVENT_LIMIT = 60
WS_EVENT_WINDOW_SECONDS = 30

MESSAGE_EVENT_LIMIT = 20
MESSAGE_EVENT_WINDOW_SECONDS = 10
