"""FastAPI application for the SentryFL Python training backend."""

from .app import app, create_app

__all__ = ["app", "create_app"]
