# Deployment guide

Memoria has one local Linux first-install path: `deploy/bootstrap`. It creates the dedicated service account, private directories, virtual environment, database, root-only environment file, systemd units, verified backup, and isolated restore drill. It never contacts a network service.

## Preconditions

- Run as root on a systemd Linux host.
- Python 3.11+ with SQLite FTS5, `git`, `findmnt`, `runuser`, and `systemd-analyze`.
- A reviewed local checkout at an immutable Git revision. Bootstrap installs only from that local checkout through its bundled `setup.py` compatibility entry point, because minimal Debian virtual environments omit `wheel`; it does not clone, fetch, or download packages.
- Local (not NFS/SMB/SSHFS) storage for `/var/lib/memoria` and `/var/backups/memoria`.
- The fixed, reviewed layout: service user `memoria`, application `/opt/memoria`, database `/var/lib/memoria/memoria.db`, backups `/var/backups/memoria`.

The script is dry-run by default. It refuses symlinked managed paths, insufficient Python/FTS5, mismatched immutable revisions, nonlocal selected filesystems, and an existing database unless `--adopt-existing` is supplied after inspection. It preserves existing evidence; it does not delete or prune history.

## Baseline installation

From a checked-out release commit:

```bash
sudo ./deploy/bootstrap \
  --source "$PWD" \
  --revision "$(git rev-parse HEAD)"

sudo ./deploy/bootstrap --apply \
  --source "$PWD" \
  --revision "$(git rev-parse HEAD)"
```

The apply run verifies the initialized database, writes `/etc/memoria.env` as `root:root 0600`, installs and validates the four units, creates one verified backup, restores it to an isolated drill database, verifies that drill, then removes only the drill database. Timers are installed but remain disabled.

Enable timers only after the acceptance output has been reviewed:

```bash
sudo ./deploy/bootstrap --apply --adopt-existing --enable-timers \
  --source "$PWD" --revision "$(git rev-parse HEAD)"
systemctl is-enabled memoria-verify.timer memoria-backup.timer
systemctl list-timers --all --no-pager | grep -F memoria
```

The supplied schedule is daily verification at 03:15 UTC and backup at 03:30 UTC with no randomized delay. Backups are append-only; no retention or pruning is installed.

## Explicit note authorization

Authorization is an evidence write and requires a real approved root plus actor. It is optional, and is never inferred from the account's home directory:

```bash
sudo ./deploy/bootstrap --apply \
  --source "$PWD" --revision "$(git rev-parse HEAD)" \
  --authorize-root /srv/approved-notes --actor operator
```

The bootstrap proves that the `memoria` account can read and traverse the root before appending the grant. Ingest one harmless, non-secret note separately; inspect its result, then ingest it again to prove idempotence.

## Optional Hermes retrieval bridge

The root-owned packet bridge is not a baseline default. It grants a named local principal passwordless execution of one read-only, fixed-path command. Review its shell source and use a disposable SSH session with a separate rollback session before enabling it:

```bash
sudo ./deploy/bootstrap --apply \
  --source "$PWD" --revision "$(git rev-parse HEAD)" \
  --install-packet-bridge --packet-user caretaker
```

The script validates sudoers syntax before installation. The caller must separately verify ownership/modes, a successful cited packet, and rejection of `--db` overrides. If the session behaves unexpectedly, remove only `/etc/sudoers.d/USER-memoria-packet` and `/usr/local/sbin/memoria-packet` from the rollback session, then run `visudo -c`.

## Rollback

Do not delete a failed database, its WAL/SHM files, or backups. Disable timers, preserve logs and all evidence, and restore a verified backup to a new path for inspection. The bootstrap intentionally has no destructive rollback mode.
