# The sheet music scanner (optical music recognition) behind the app's
# "Scan sheet music" button: Audiveris, run in batch mode by a small Node
# server (server.ts). Built for linux/amd64 because Audiveris only ships an
# x86_64 Linux package; on an Apple Silicon Mac, build and run it with
# --platform linux/amd64 (see README.md).

# Node and the server's dependencies come from the official Node image.
FROM node:22-bookworm-slim AS node
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

FROM ubuntu:24.04

ARG AUDIVERIS_VERSION=5.11.0
# tessdata 4.x holds the "legacy" OCR model Audiveris needs (the newer LSTM-only files do not work).
ARG TESSDATA_VERSION=4.1.0

ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates curl fontconfig fonts-dejavu-core libfreetype6 libgomp1 \
  && curl -fsSL -o /tmp/audiveris.deb \
    "https://github.com/Audiveris/audiveris/releases/download/${AUDIVERIS_VERSION}/Audiveris-${AUDIVERIS_VERSION}-ubuntu24.04-x86_64.deb" \
  # Install what the package depends on, then unpack it without running its
  # install scripts, which register desktop menu and MIME entries that a
  # container has no place for.
  && apt-get install -y --no-install-recommends \
    $(dpkg-deb -f /tmp/audiveris.deb Depends | sed 's/([^)]*)//g; s/,/ /g') \
  && dpkg-deb -x /tmp/audiveris.deb / \
  && rm /tmp/audiveris.deb \
  && rm -rf /var/lib/apt/lists/* \
  && JAVA_TOOL_OPTIONS="-Djava.awt.headless=true -Dsun.java2d.uiScale=1" /opt/audiveris/bin/Audiveris -version

# Audiveris reads lyrics and titles with Tesseract; English is the one language it requires.
ENV TESSDATA_PREFIX=/opt/tessdata
RUN mkdir -p "$TESSDATA_PREFIX" \
  && curl -fsSL -o "$TESSDATA_PREFIX/eng.traineddata" \
    "https://github.com/tesseract-ocr/tessdata/raw/${TESSDATA_VERSION}/eng.traineddata"

COPY --from=node /usr/local/bin/node /usr/local/bin/node
COPY --from=node /app/node_modules /app/node_modules
COPY server.ts /app/server.ts

# No display in the container, and a fixed UI scale so Audiveris does not probe
# GTK for HiDPI scaling at startup (it would fail without libgtk-3). Let the JVM
# use most of the instance's memory.
ENV JAVA_TOOL_OPTIONS="-Djava.awt.headless=true -Dsun.java2d.uiScale=1 -XX:MaxRAMPercentage=75"
ENV AUDIVERIS=/opt/audiveris/bin/Audiveris
ENV PORT=8080
EXPOSE 8080
WORKDIR /app
CMD ["node", "--experimental-strip-types", "--no-warnings=ExperimentalWarning", "server.ts"]
