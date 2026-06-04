#!/usr/bin/env bash
###############################################################################
# MongoDB to MinIO Backup Script
# 
# Runs mongodump and uploads archive to MinIO S3 storage
# Usage: ./scripts/backup-mongodb.sh [retention-days]
# Default retention: 7 days
###############################################################################
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR/.."

RETENTION_DAYS="${1:-7}"
BACKUP_BUCKET="nitte-backups"
DATE=$(date +%Y%m%d-%H%M%S)
BACKUP_FILE="mongodb-nitte-merch-${DATE}.archive"
MINIO_USER="${MINIO_ROOT_USER:-minioadmin}"
MINIO_PASS="${MINIO_ROOT_PASSWORD:-minioadmin123}"

echo "[backup] Starting MongoDB backup: $BACKUP_FILE"

# Check if containers are running
if ! docker ps | grep -q "nitte-mongodb"; then
    echo "[backup] ERROR: MongoDB container not running" >&2
    exit 1
fi

if ! docker ps | grep -q "nitte-minio"; then
    echo "[backup] ERROR: MinIO container not running" >&2
    exit 1
fi

# Create backup directory
mkdir -p /tmp/mongodb-backups

# Dump MongoDB to archive format
echo "[backup] Dumping MongoDB database..."
docker exec nitte-mongodb mongodump \
    --host localhost \
    --db nitte_merch \
    --username app_writer \
    --password app_writer_pass \
    --authenticationDatabase nitte_merch \
    --archive=/tmp/${BACKUP_FILE} \
    --gzip

# Copy from container to host
docker cp nitte-mongodb:/tmp/${BACKUP_FILE} /tmp/mongodb-backups/${BACKUP_FILE}

# Upload to MinIO using mc client
echo "[backup] Uploading to MinIO..."
docker run --rm \
    -v /tmp/mongodb-backups:/backups \
    --network hpe-stuff_nitte-network \
    -e MINIO_USER="$MINIO_USER" \
    -e MINIO_PASS="$MINIO_PASS" \
    minio/mc:latest \
    sh -c "
        mc alias set local http://minio:9000 \$MINIO_USER \$MINIO_PASS
        mc cp /backups/${BACKUP_FILE} local/${BACKUP_BUCKET}/
        echo 'Backup uploaded: ${BACKUP_FILE}'
    "

# Cleanup old backups locally
rm /tmp/mongodb-backups/${BACKUP_FILE}

# Cleanup old backups in MinIO (older than retention days)
echo "[backup] Cleaning up old backups (>${RETENTION_DAYS} days)..."
docker run --rm \
    --network hpe-stuff_nitte-network \
    -e MINIO_USER="$MINIO_USER" \
    -e MINIO_PASS="$MINIO_PASS" \
    minio/mc:latest \
    sh -c "
        mc alias set local http://minio:9000 \$MINIO_USER \$MINIO_PASS
        mc find local/${BACKUP_BUCKET} --name 'mongodb-*.archive' --older-than ${RETENTION_DAYS}d --exec 'mc rm {}'
    " || echo "[backup] Cleanup completed (some old backups may remain)"

echo "[backup] ✓ Backup completed: ${BACKUP_FILE}"
echo "[backup] Bucket: ${BACKUP_BUCKET}"
echo "[backup] Retention: ${RETENTION_DAYS} days"
