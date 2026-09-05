FROM redis:7.4-alpine

HEALTHCHECK --interval=10s --timeout=5s --retries=5 \
    CMD redis-cli ping