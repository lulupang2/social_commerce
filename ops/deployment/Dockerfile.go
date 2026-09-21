FROM golang:1.27.1-bookworm@sha256:648f440f42a0958804efb24df176f806f9d353b41f1c0627f666428e40310f6b AS source
ENV GOTOOLCHAIN=local GOMAXPROCS=2 GOMEMLIMIT=384MiB
WORKDIR /workspace/apps/api
COPY apps/api/go.mod apps/api/go.sum ./
RUN go mod download
COPY apps/api/ ./
COPY supabase/migrations/ /workspace/supabase/migrations/
COPY ops/deployment/check-go.sh ops/deployment/check-db.sh /workspace/ops/deployment/

FROM source AS verification
RUN mkdir -p /workspace/.foundation-cache/bin && \
    for app in api worker migrate sample; do CGO_ENABLED=0 go build -p=1 -trimpath -o /workspace/.foundation-cache/bin/$app ./cmd/$app; done
ENV FOUNDATION_BIN_DIR=/workspace/.foundation-cache/bin
CMD ["bash", "/workspace/ops/deployment/check-go.sh"]

FROM source AS build
RUN for app in api worker migrate; do CGO_ENABLED=0 go build -p=1 -trimpath -o /out/$app ./cmd/$app; done

FROM alpine:3.22.1 AS runtime
RUN apk add --no-cache ca-certificates
USER 10001:10001
WORKDIR /app
STOPSIGNAL SIGTERM

FROM runtime AS api
COPY --from=build /out/api /app/api
EXPOSE 8080
HEALTHCHECK --interval=5s --timeout=3s --retries=12 CMD wget -q -O /dev/null http://127.0.0.1:8080/health/ready || exit 1
ENTRYPOINT ["/app/api"]

FROM runtime AS worker
COPY --from=build /out/worker /app/worker
ENTRYPOINT ["/app/worker"]

FROM runtime AS migration
COPY --from=build /out/migrate /app/migrate
COPY supabase/migrations/ /app/migrations/
ENTRYPOINT ["/app/migrate", "--app-migrations-dir", "/app/migrations"]
