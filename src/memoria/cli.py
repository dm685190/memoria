from __future__ import annotations

import argparse
import json
import sqlite3
import sys
from datetime import UTC, datetime
from pathlib import Path

from .ingest import ingest_obsidian
from .packet import evidence_packet, serialize_packet
from .security import redact_value
from .store import Store


def _db(command: argparse.ArgumentParser) -> None:
    command.add_argument("--db", required=True)


def _retrieval(command: argparse.ArgumentParser) -> None:
    command.add_argument("--query", required=True)
    command.add_argument("--entity")
    command.add_argument("--limit", type=int, default=8)
    command.add_argument("--after", help="inclusive ISO-8601 timestamp")
    command.add_argument("--before", help="inclusive ISO-8601 timestamp")


def parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(prog="memoria", description="Local-first evidence memory")
    sub = p.add_subparsers(dest="command", required=True)
    for name in ("init", "status", "verify", "rebuild-index"):
        command = sub.add_parser(name)
        _db(command)

    record = sub.add_parser("record", help="append a ledger event")
    _db(record)
    record.add_argument("--kind", required=True)
    record.add_argument("--title", required=True)
    record.add_argument("--body", required=True)
    record.add_argument("--entity", action="append", default=[])
    record.add_argument("--occurred-at", help="ISO-8601 timestamp; defaults to now")

    root = sub.add_parser("authorize-root", help="append an authorized ingestion-root grant")
    _db(root)
    root.add_argument("--root", required=True)
    root.add_argument("--actor", required=True)
    revoke = sub.add_parser("revoke-root", help="append an ingestion-root revocation")
    _db(revoke)
    revoke.add_argument("--root", required=True)
    revoke.add_argument("--actor", required=True)

    ingest = sub.add_parser("ingest-obsidian", help="capture one note from an authorized root")
    _db(ingest)
    ingest.add_argument("--vault", required=True)
    ingest.add_argument("--path", required=True)
    ingest.add_argument("--observed-at", help="ISO-8601 timestamp; defaults to now")

    query = sub.add_parser("query", help="search evidence")
    _db(query)
    _retrieval(query)

    packet = sub.add_parser("packet", help="emit the bounded read-only Hermes adapter packet")
    _db(packet)
    packet.add_argument("--task", required=True)
    _retrieval(packet)
    packet.add_argument("--max-chars", type=int, default=2400)

    proposal = sub.add_parser("propose", help="append, but never apply, a promotion candidate")
    _db(proposal)
    proposal.add_argument("--target", choices=("hermes", "honcho"), required=True)
    proposal.add_argument("--target-profile", required=True)
    proposal.add_argument("--statement", required=True)
    proposal.add_argument("--rationale", required=True)
    proposal.add_argument("--event-id", type=int)
    proposal.add_argument("--conflict-key", required=True)
    proposal.add_argument("--precondition")

    review = sub.add_parser("review", help="append a promotion review decision")
    _db(review)
    review.add_argument("--proposal-id", type=int, required=True)
    review.add_argument("--decision", choices=("approved", "rejected"), required=True)
    review.add_argument("--reviewer", required=True)
    review.add_argument("--rationale", required=True)

    application = sub.add_parser("record-application", help="record external application and read-back evidence")
    _db(application)
    application.add_argument("--proposal-id", type=int, required=True)
    application.add_argument("--applied-by", required=True)
    application.add_argument("--observed-statement", required=True)

    show = sub.add_parser("proposal", help="show one promotion proposal and computed status")
    _db(show)
    show.add_argument("--proposal-id", type=int, required=True)

    backup = sub.add_parser("backup", help="create an atomic verified SQLite backup")
    _db(backup)
    destination = backup.add_mutually_exclusive_group(required=True)
    destination.add_argument("--output")
    destination.add_argument("--output-dir", help="create a UTC timestamped backup in this directory")

    restore = sub.add_parser("restore", help="atomically restore a verified backup")
    _db(restore)
    restore.add_argument("--backup", required=True)
    restore.add_argument("--force", action="store_true")
    return p


def _print(output: object, compact: bool = False) -> None:
    safe = redact_value(output)
    if compact:
        print(serialize_packet(safe))
    else:
        print(json.dumps(safe, indent=2, ensure_ascii=False, sort_keys=True))


def main(argv: list[str] | None = None) -> int:
    args = parser().parse_args(argv)
    if args.command == "restore":
        try:
            _print(Store.restore(args.backup, args.db, args.force))
            return 0
        except (ValueError, OSError, RuntimeError, sqlite3.Error) as error:
            print(f"memoria: {error}", file=sys.stderr)
            return 2

    store = Store(args.db)
    exit_code = 0
    try:
        store.init()
        if args.command == "init":
            output = {"database": str(store.path), "schema_version": 2, "status": "initialized"}
        elif args.command == "status":
            output = {"database": str(store.path), "counts": store.counts()}
        elif args.command == "verify":
            output = store.verify()
            exit_code = 0 if output["ok"] else 1
        elif args.command == "rebuild-index":
            output = store.rebuild_search_index()
        elif args.command == "record":
            output = {
                "event_id": store.record(
                    args.kind, args.title, args.body, args.entity, occurred_at=args.occurred_at
                )
            }
        elif args.command == "authorize-root":
            output = {"authorization_id": store.authorize_root(args.root, args.actor, "grant"), "action": "grant"}
        elif args.command == "revoke-root":
            output = {"authorization_id": store.authorize_root(args.root, args.actor, "revoke"), "action": "revoke"}
        elif args.command == "ingest-obsidian":
            output = ingest_obsidian(store, args.vault, args.path, args.observed_at)
        elif args.command == "query":
            output = [dict(row) for row in store.search(args.query, args.entity, args.limit, args.after, args.before)]
        elif args.command == "packet":
            output = evidence_packet(
                store, args.task, args.query, args.entity, args.max_chars, args.limit, args.after, args.before
            )
            _print(output, compact=True)
            return 0
        elif args.command == "propose":
            proposal_id = store.propose(
                args.target,
                args.target_profile,
                args.statement,
                args.rationale,
                args.event_id,
                args.conflict_key,
                args.precondition,
            )
            output = {"proposal_id": proposal_id, "status": "proposed"}
        elif args.command == "review":
            output = {
                "review_id": store.review_proposal(
                    args.proposal_id, args.decision, args.reviewer, args.rationale
                ),
                "decision": args.decision,
            }
        elif args.command == "record-application":
            output = store.record_application(args.proposal_id, args.applied_by, args.observed_statement)
        elif args.command == "proposal":
            output = store.proposal(args.proposal_id)
        elif args.command == "backup":
            verification = store.verify()
            if not verification["ok"]:
                raise RuntimeError("refusing to back up a database that fails verification")
            if args.output_dir:
                stamp = datetime.now(UTC).strftime("%Y%m%dT%H%M%SZ")
                destination = Path(args.output_dir) / f"memoria-{stamp}.sqlite3"
            else:
                destination = Path(args.output)
            output = store.backup(destination)
        else:
            raise AssertionError("unreachable")
        _print(output)
        return exit_code
    except (ValueError, OSError, RuntimeError, sqlite3.Error) as error:
        print(f"memoria: {error}", file=sys.stderr)
        return 2
    finally:
        store.close()


if __name__ == "__main__":
    raise SystemExit(main())
