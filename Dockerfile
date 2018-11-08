FROM rust:1.30.0

WORKDIR /opt/bridge

ADD http://d1h4xl4cr1h0mo.cloudfront.net/nightly/x86_64-unknown-debian-gnu/parity /usr/local/bin/parity
ADD https://github.com/ethereum/solidity/releases/download/v0.4.24/solc-static-linux /usr/local/bin/solc
RUN chmod +x /usr/local/bin/solc /usr/local/bin/parity

# The following commands allow for the rust dependencies to be cached, even if
# the source code changes
COPY Cargo.* ./
COPY contracts/Cargo.toml ./contracts/
COPY bridge/Cargo.toml ./bridge/
COPY cli/Cargo.toml ./cli/
COPY deploy/Cargo.toml ./deploy/
COPY integration-tests/Cargo.toml ./integration-tests/
RUN mkdir ./contracts/src && touch ./contracts/src/lib.rs \
  && mkdir ./bridge/src && touch ./bridge/src/lib.rs \
  && mkdir ./cli/src && echo "fn main() {}" > ./cli/src/main.rs \
  && mkdir ./deploy/src && echo "fn main() {}" > ./deploy/src/main.rs \
  && mkdir ./integration-tests/src && touch ./integration-tests/src/lib.rs
RUN cargo build --release

COPY . .

RUN cargo build -p parity-bridge --release && cargo build -p parity-bridge-deploy --release

ENV RUST_LOG info
CMD ["./target/release/parity-bridge", "--config", "/opt/bridge/config.toml", "--database", "deployment/db.toml"]
