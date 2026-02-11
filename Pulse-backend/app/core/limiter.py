"""
SlowAPI limiter configuration.
"""
from slowapi import Limiter
from slowapi.util import get_remote_address

# Use client IP from request (ProxyHeadersMiddleware in main ensures correct IP behind proxies).
limiter = Limiter(key_func=get_remote_address)
