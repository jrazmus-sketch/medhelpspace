# Database backups

Two layers:

1. **Supabase's own backups** (platform-managed).
2. **Off-platform nightly backup** — private repo
   [`jrazmus-sketch/medhelpspace-backups`](https://github.com/jrazmus-sketch/medhelpspace-backups)
   (set up 2026-09-25). GitHub Actions runs every day at 08:00 UTC: `pg_dump`
   (custom format, whole database incl. `auth`) → GPG AES256 → one private
   Release per backup; releases older than 30 days are deleted. Restore steps
   are in that repo's README.

   Restore verified 2026-09-25: every public table matched production row for
   row, and the 5 `auth.users` rows are present in the dump.

The decryption passphrase is the `BACKUP_GPG_PASSPHRASE` secret of that repo,
with copies in `app/.env.local` (gitignored) and Justin's Downloads folder.
Without it the backups cannot be opened.

Not covered: files on the Bunny CDN (MedVoice/AudioCards audio, images) — they
live on Bunny, not in the database.

The earlier Cloudflare R2 workflow in this repo was never activated and was
removed when the private-repo backup replaced it.
