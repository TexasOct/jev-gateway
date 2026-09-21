FROM python:3.10-slim AS builder

WORKDIR /build
RUN pip install --no-cache-dir uv
COPY pyproject.toml uv.lock README.md ./
COPY jev_gateway ./jev_gateway
RUN uv build --wheel

FROM python:3.10-slim

ENV HOME=/home/jev \
    JEV_GATEWAY_HOME=/home/jev/.jev-gateway \
    PYTHONUNBUFFERED=1

RUN useradd --create-home --uid 10001 jev
WORKDIR /opt/jev-gateway
COPY --from=builder /build/dist/ /tmp/dist/
RUN pip install --no-cache-dir /tmp/dist/*.whl && rm -rf /tmp/dist
COPY models.example.json .env.example ./
COPY scripts/container-entrypoint.sh /usr/local/bin/jev-gateway-entrypoint
RUN chmod +x /usr/local/bin/jev-gateway-entrypoint \
    && mkdir -p /home/jev/.jev-gateway \
    && chown -R jev:jev /home/jev

USER jev
EXPOSE 8000
VOLUME ["/home/jev/.jev-gateway"]
ENTRYPOINT ["jev-gateway-entrypoint"]
