#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

OUTPUT_JAR="target/keycloak-event-listener-1.0.0.jar"

echo "Building Keycloak Event Listener SPI..."

# Use Maven Docker image to build since Maven may not be installed locally
# On Windows Git Bash, `id` returns SIDs — skip chown if not numeric.
BUILD_CMD="mvn clean package -q"
UID_NUM=""
GID_NUM=""
if command -v id &>/dev/null; then
  UID_NUM=$(id -u 2>/dev/null || echo "")
  GID_NUM=$(id -g 2>/dev/null || echo "")
fi
if [[ "$UID_NUM" =~ ^[0-9]+$ && "$GID_NUM" =~ ^[0-9]+$ ]]; then
  BUILD_CMD="$BUILD_CMD && chown ${UID_NUM}:${GID_NUM} -R target"
fi

docker run --rm \
  -v "$SCRIPT_DIR:/src" \
  -w /src \
  maven:3.9-eclipse-temurin-17-alpine \
  sh -c "$BUILD_CMD"

if [[ ! -f "$OUTPUT_JAR" ]]; then
  echo "ERROR: Build failed — $OUTPUT_JAR not found" >&2
  exit 1
fi

echo "Build successful: $OUTPUT_JAR"
