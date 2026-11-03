# Pre-deployment readiness audit

This audit records the prototype failures and their required closure. It is evidence, not marketing.

## Prototype findings

| Finding | Required closure | Verification |
|---|---|---|
| Evidence rows could be updated or deleted | SQLite rejection triggers plus a tamper-evident event chain | append-only and tamper tests; `memoria verify` |
| No schema lifecycle | explicit schema version and legacy migration | legacy migration test |
| Database was world-readable | database mode 0600 and newly created state directories 0700 | permissions test |
| Direct record bypassed secret checks | shared secret-like-content guard on every write path and output redaction | adversarial write-path tests |
| Any caller-selected vault was trusted | append-only root grant/revoke ledger | authorization and escape tests |
| Unchanged notes created duplicate events | content/revision split and idempotent ingestion | unchanged/reversion tests |
| Same-stem notes collapsed | vault-relative path entity identity | path identity test |
| Event time could not be preserved | timezone-required `--occurred-at` and `--observed-at` | date-filter tests |
| FTS syntax and negative limits escaped validation | literalized token search and 1..100 limits | malformed-query tests |
| Packets exceeded their advertised budget | compact serialization budget includes the complete envelope | CLI and packet-size tests |
| Promotion lacked review/read-back evidence | append-only proposal, decision, application, and exact read-back hash | promotion workflow test |
| Backup/restore and health checks were absent | verified SQLite backup, preflighted atomic restore, `verify` | round-trip test |
| No deployment contract | systemd examples, operations runbook, privacy model, CI | repository review and CI |

## Release gate

Deployment is permitted only when:

1. The full test suite passes on all supported Python versions.
2. A clean package installs and the CLI smoke test passes.
3. `memoria verify` passes on a fresh database and a restored backup.
4. No automatic writer to Hermes or Honcho exists.
5. Deployment paths, service account, authorized roots, backup destination, and rollback owner are explicitly chosen.

Passing this gate means deployable, not deployed.
