FROM mongo:7

HEALTHCHECK --interval=10s --timeout=5s --retries=5 \
    CMD mongosh --quiet --eval "db.adminCommand('ping').ok" || exit 1
