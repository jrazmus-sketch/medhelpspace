#!/usr/bin/env bash
set -euo pipefail

: "${SUPABASE_DB_URL:?Set SUPABASE_DB_URL}"
: "${BACKUP_GPG_PASSPHRASE:?Set BACKUP_GPG_PASSPHRASE}"
: "${R2_S3_ENDPOINT:?Set R2_S3_ENDPOINT}"
: "${R2_ACCESS_KEY_ID:?Set R2_ACCESS_KEY_ID}"
: "${R2_SECRET_ACCESS_KEY:?Set R2_SECRET_ACCESS_KEY}"
: "${R2_BUCKET:?Set R2_BUCKET}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"
BACKUP_PREFIX="${BACKUP_PREFIX:-medhelpspace}"

STAMP="$(date -u +%Y-%m-%dT%H-%M-%SZ)"
DUMP="${BACKUP_PREFIX}-${STAMP}.dump"
ENC="${DUMP}.gpg"
KEY="backups/${ENC}"

export AWS_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID"
export AWS_SECRET_ACCESS_KEY="$R2_SECRET_ACCESS_KEY"
export AWS_DEFAULT_REGION="auto"

cleanup() { rm -f "$DUMP" "$ENC"; }
trap cleanup EXIT

echo "→ Dumping database (pg_dump custom format)…"
pg_dump --format=custom --no-owner --no-privileges --file="$DUMP" "$SUPABASE_DB_URL"

if [ ! -s "$DUMP" ]; then
  echo "✗ Dump file is empty — aborting (nothing uploaded)." >&2
  exit 1
fi
SIZE="$(du -h "$DUMP" | cut -f1)"
echo "  dump size: $SIZE"

echo "→ Encrypting (AES256, symmetric)…"
gpg --batch --yes --symmetric --cipher-algo AES256 \
  --passphrase "$BACKUP_GPG_PASSPHRASE" --output "$ENC" "$DUMP"

echo "→ Uploading to R2: s3://${R2_BUCKET}/${KEY}…"
aws s3 cp "$ENC" "s3://${R2_BUCKET}/${KEY}" --endpoint-url "$R2_S3_ENDPOINT" --only-show-errors
echo "  uploaded ${KEY}"

echo "→ Pruning backups older than ${RETENTION_DAYS} days…"
CUTOFF="$(date -u -d "${RETENTION_DAYS} days ago" +%s)"
# The dump is already uploaded by this point, so a hiccup listing or deleting old
# objects must not fail the run and report a good backup as broken — hence the
# `|| true` on the whole pipeline (NOT on the aws call: `A || true | while` would
# parse as `A || (true | while)` and skip the prune whenever the listing works).
# An empty bucket (the first run) yields nothing or the literal "None", which
# would reach `date -d` as garbage and abort under `set -e`.
aws s3api list-objects-v2 --bucket "$R2_BUCKET" --prefix "backups/${BACKUP_PREFIX}-" \
  --endpoint-url "$R2_S3_ENDPOINT" \
  --query 'Contents[].{Key:Key,LastModified:LastModified}' --output text 2>/dev/null \
  | while read -r k lm; do
    [ -z "${k:-}" ] && continue
    [ "$k" = "None" ] && continue
    [ -z "${lm:-}" ] && continue
    obj_ts="$(date -u -d "$lm" +%s)"
    if [ "$obj_ts" -lt "$CUTOFF" ]; then
      echo "  deleting old backup: $k"
      aws s3 rm "s3://${R2_BUCKET}/${k}" --endpoint-url "$R2_S3_ENDPOINT" --only-show-errors
    fi
  done || true

echo "✓ Backup complete: ${KEY} (${SIZE})"
