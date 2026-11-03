# Deployment guide

This guide prepares a local Linux deployment. It does not authorize one.

## Preconditions

- Python 3.11 or newer with SQLite FTS5.
- A dedicated unprivileged `memoria` service account.
- Local state and backup filesystems selected and capacity-monitored.
- Authorized Obsidian roots selected explicitly.
- No Vercel, GitLab, hosted database, or public network path.

## Install staging

```bash
python3 -m venv /opt/memoria/.venv
/opt/memoria/.venv/bin/pip install /path/to/memoria-source
install -d -m 0700 -o memoria -g memoria /var/lib/memoria /var/backups/memoria
sudo -u memoria /opt/memoria/.venv/bin/memoria init --db /var/lib/memoria/memoria.db
sudo -u memoria /opt/memoria/.venv/bin/memoria verify --db /var/lib/memoria/memoria.db
```

Authorize each note root separately:

```bash
sudo -u memoria /opt/memoria/.venv/bin/memoria authorize-root \
  --db /var/lib/memoria/memoria.db --root /srv/approved-notes --actor dylan
```

Copy `deploy/memoria.env.example` to `/etc/memoria.env`, restrict it to root, and adjust paths. Install the systemd units only after reviewing their user, executable and paths. Timers verify daily and back up daily; neither prunes history.

## Acceptance test

1. Record a non-sensitive canary with a historical occurrence time.
2. Query it by entity and date.
3. Generate a packet and confirm its actual stdout length is within budget.
4. Ingest one note from an authorized root twice; the second run must report `changed: false`.
5. Back up, restore to a drill path, and verify the restored database.
6. Confirm a secret-like canary is refused and absent from query output.
7. Confirm no network listener or outbound client is created.

## Rollback

Do not delete the failed deployment. Stop timers, preserve the database/WAL/SHM and logs, restore the prior package and verified database to a new path, then point operations at that path after review.
