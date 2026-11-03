# Operations runbook

## Health

Run:

```bash
memoria verify --db /var/lib/memoria/memoria.db
```

Success returns JSON with `ok: true`, schema version, SQLite quick-check status, row counts, and no problems. A nonzero result is a failed health check.

If only the derivative FTS index fails, rebuild it from the immutable ledger and verify again:

```bash
memoria rebuild-index --db /var/lib/memoria/memoria.db
```

The command refuses to rebuild when any canonical source, hash-chain, foreign-key, or SQLite check also fails.

## Backup

```bash
memoria backup --db /var/lib/memoria/memoria.db --output-dir /var/backups/memoria
```

The command refuses an unhealthy source, uses SQLite's online backup API, verifies the copied Memoria database, writes mode 0600, atomically renames it, and prints its streaming SHA-256. It never prunes older backups.

## Restore drill

Restore into a new path first:

```bash
memoria restore --backup /var/backups/memoria/memoria-YYYYMMDDTHHMMSSZ.sqlite3 --db /var/lib/memoria-drill/memoria.db
memoria verify --db /var/lib/memoria-drill/memoria.db
```

Replacing an existing database requires `--force`. Stop all writers first. The old database, including committed WAL state through SQLite's backup API, is preserved beside it as `.pre-restore-TIMESTAMP.sqlite3`. Existing WAL/SHM sidecars are renamed beside that preserved copy. The candidate backup is fully verified before the destination changes.

## Concurrency

Writers serialize with `BEGIN IMMEDIATE`; readers use SQLite WAL mode. Busy timeout is five seconds. Run one scheduled backup at a time. SQLite files must remain on a local filesystem with correct locking semantics, not NFS/SMB.

## Upgrade

1. Back up and verify the current database.
2. Install the new package in a new virtual environment.
3. Copy the database and run `memoria init` against the copy to exercise migration.
4. Run `memoria verify` and retrieval smoke tests against the copy.
5. Stop scheduled jobs, switch the executable, run the real migration, verify, then resume timers.
6. Roll back by restoring the package and preserved pre-upgrade database; never downgrade a migrated database in place.

## Retention

Memoria does not delete evidence or backups. Retention is an external, explicitly approved policy. Capacity alerts should precede any archival decision.
