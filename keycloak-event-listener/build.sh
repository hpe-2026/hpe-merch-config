#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

OUTPUT_JAR="target/keycloak-event-listener-1.0.0.jar"

echo "Building Keycloak Event Listener SPI..."

# Disable Git Bash path conversion (Windows Git Bash mangles /paths)
export MSYS_NO_PATHCONV=1

# Use Maven Docker image to build since Maven may not be installed locally
docker run --rm \
  -v "$SCRIPT_DIR:/src" \
  -w /src \
  maven:3.9-eclipse-temurin-17-alpine \
  sh -c "mvn clean package -q && chown $(id -u):$(id -g) -R target"

if [[ ! -f "$OUTPUT_JAR" ]]; then
  echo "ERROR: Build failed — $OUTPUT_JAR not found" >&2
  exit 1
fi

echo "Build successful: $OUTPUT_JAR"
