# Supabase auth e-mails (pt-BR)

Production does NOT read these files. Paste them into
Supabase dashboard → Authentication → Email Templates:

| Template        | Subject                                   | Body                |
|-----------------|-------------------------------------------|---------------------|
| Confirm signup  | Confirme seu cadastro na MedHelpSpace     | `confirmation.html` |
| Reset password  | Redefina sua senha da MedHelpSpace        | `recovery.html`     |

Local Supabase reads a copy from `supabase/templates/` (gitignored), wired in
`supabase/config.toml`. Keep the three copies identical.

- The link is built from `{{ .SiteURL }}`, NOT `{{ .RedirectTo }}` or
  `{{ .ConfirmationURL }}`: the return path rides on the user as
  `user_metadata.confirm_next` (set by `/auth/signup`) so it survives a resend
  from `/verify` and does not depend on the redirect allow-list.
- `type` is hardcoded (`signup` / `recovery`): `{{ .Type }}` renders EMPTY in
  these templates.
- Verified end to end on local (2026-09-25): signup with
  `next=/clinact/assinar?plano=anual` → 307 to that page; without `next` → no
  stray parameter; recovery → `/reset-password`.
