# Off-platform database backups

A redundancy layer that lives on a **different cloud** than the primary database, so we
survive losing the DB provider account itself (Supabase outage, lockout, billing lapse,
accidental project delete). This is *in addition to* Supabase's own backups/PITR — not a
replacement for them.

## What runs

`.github/workflows/db-backup.yml` runs daily at **08:00 UTC** (05:00 BRT) and on manual
`workflow_dispatch`. Each run (`scripts/backup-db.sh`):

1. `pg_dump --format=custom` of the prod Supabase database
2. GPG symmetric encrypt (AES256) with `BACKUP_GPG_PASSPHRASE`
3. Upload to Cloudflare R2 bucket `medhelpspace-backups` under `backups/`
4. Prune objects older than **30 days**

Prod Postgres is **17.x** — the workflow installs `postgresql-client-17` so `pg_dump`'s
major version matches the server (mismatch aborts the dump).

## What's covered

- **All application data and the `auth` schema** — everything reachable by the connection
  role in one `pg_dump`. Restores the entire logical database: pages, lessons, quizzes,
  flashcards, cohorts, memberships, profiles, leads, orders, etc.

## What's NOT covered

- **Object-storage FILES.** `pg_dump` only captures the database. User-facing media
  (MedVoice / AudioCards MP3s, quiz/lesson images) live on **Bunny CDN**, external to
  both Supabase and this backup. Anything stored in a **Supabase Storage** bucket is also
  not captured. If important blobs land in Supabase Storage later, add a separate `rclone`/
  `aws s3 sync` step — out of scope for v1.

## Secrets (GitHub → Settings → Secrets and variables → Actions)

| Secret | Value |
|---|---|
| `SUPABASE_DB_URL` | Supabase **Session pooler** string, port **5432** (IPv4-reachable from runners; the direct `db.*.supabase.co` host is IPv6-only and fails from Actions) |
| `BACKUP_GPG_PASSPHRASE` | Symmetric passphrase — **the only thing that decrypts these dumps.** Store in the password manager; without it the backups are unrecoverable |
| `R2_S3_ENDPOINT` | `https://<ACCOUNT_ID>.r2.cloudflarestorage.com` |
| `R2_ACCESS_KEY_ID` | R2 API token (scoped to `medhelpspace-backups`, Object Read & Write) |
| `R2_SECRET_ACCESS_KEY` | R2 API token secret |
| `R2_BUCKET` | `medhelpspace-backups` |

## Restore

A backup you've never restored is a hope, not a backup. To restore (or verify) one:

```bash
# 1. Download the latest encrypted dump from R2
aws s3 cp "s3://medhelpspace-backups/backups/medhelpspace-<STAMP>.dump.gpg" . \
  --endpoint-url "https://<ACCOUNT_ID>.r2.cloudflarestorage.com"

# 2. Decrypt (prompts for the passphrase, or pass --passphrase)
gpg --batch --yes --decrypt \
  --passphrase "$BACKUP_GPG_PASSPHRASE" \
  --output medhelpspace.dump \
  "medhelpspace-<STAMP>.dump.gpg"

# 3. Restore into a throwaway Postgres 17 (verify) or the real target
docker run -d --name mhs-restore -e POSTGRES_PASSWORD=pw -p 5433:5432 postgres:17
pg_restore --no-owner --no-privileges \
  --dbname="postgresql://postgres:pw@localhost:5433/postgres" \
  medhelpspace.dump

# 4. Sanity-check a few tables
psql "postgresql://postgres:pw@localhost:5433/postgres" \
  -c "select count(*) from pages;" -c "select count(*) from flashcard_items;"
```
