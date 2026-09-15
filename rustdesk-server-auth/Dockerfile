FROM rust:1.90-bookworm AS builder

ARG RUSTDESK_SERVER_COMMIT=a7736be5e40f85bfc141120dce587e836e5d4b80
RUN apt-get update && apt-get install -y --no-install-recommends \
    clang cmake git libclang-dev libssl-dev pkg-config \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /build
RUN git clone https://github.com/rustdesk/rustdesk-server.git server \
    && cd server \
    && git checkout "${RUSTDESK_SERVER_COMMIT}" \
    && git submodule update --init --depth 1 libs/hbb_common
COPY rustdesk-server-auth/account-auth.patch /build/account-auth.patch
WORKDIR /build/server
RUN --mount=type=cache,target=/usr/local/cargo/registry \
    --mount=type=cache,target=/usr/local/cargo/git \
    --mount=type=cache,target=/build/server/target \
    git apply --check /build/account-auth.patch \
    && git apply /build/account-auth.patch \
    && touch build.rs \
    && cargo build --locked --release --bin hbbs \
    && cp target/release/hbbs /build/hbbs

FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates libssl3 \
    && rm -rf /var/lib/apt/lists/*
COPY --from=builder /build/hbbs /usr/local/bin/hbbs
WORKDIR /root
ENTRYPOINT ["/usr/local/bin/hbbs"]
