FROM nginx:1.27-alpine

RUN apk add --no-cache openssl
COPY nginx.conf /etc/nginx/nginx.conf
COPY docker-entrypoint.sh /usr/local/bin/sentryfl-nginx-entrypoint
RUN chmod +x /usr/local/bin/sentryfl-nginx-entrypoint

EXPOSE 80 443

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
    CMD wget --spider --quiet http://localhost/health || exit 1

ENTRYPOINT ["sentryfl-nginx-entrypoint"]