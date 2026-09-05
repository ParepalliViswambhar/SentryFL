FROM postgres:16-alpine

HEALTHCHECK --interval=10s --timeout=5s --retries=5 \
    CMD pg_isready -U "$${POSTGRES_USER}" -d "$${POSTGRES_DB}"