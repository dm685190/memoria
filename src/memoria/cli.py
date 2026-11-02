from __future__ import annotations

import argparse
import json
import sys

from .ingest import ingest_obsidian
from .packet import evidence_packet
from .store import Store


def parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(prog="memoria", description="Local-first evidence memory")
    sub = p.add_subparsers(dest="command", required=True)
    for name in ("init", "status"):
        command = sub.add_parser(name)
        command.add_argument("--db", required=True)
    record = sub.add_parser("record", help="append a ledger event")
    record.add_argument("--db", required=True); record.add_argument("--kind", required=True)
    record.add_argument("--title", required=True); record.add_argument("--body", required=True)
    record.add_argument("--entity", action="append", default=[])
    ingest = sub.add_parser("ingest-obsidian", help="capture one markdown note")
    ingest.add_argument("--db", required=True); ingest.add_argument("--vault", required=True); ingest.add_argument("--path", required=True)
    query = sub.add_parser("query", help="search evidence")
    query.add_argument("--db", required=True); query.add_argument("--query", required=True); query.add_argument("--entity"); query.add_argument("--limit", type=int, default=8)
    packet = sub.add_parser("packet", help="build a bounded cited evidence packet")
    packet.add_argument("--db", required=True); packet.add_argument("--task", required=True); packet.add_argument("--query", required=True)
    packet.add_argument("--entity"); packet.add_argument("--max-chars", type=int, default=2400); packet.add_argument("--limit", type=int, default=8)
    proposal = sub.add_parser("propose", help="record, but never apply, a promotion candidate")
    proposal.add_argument("--db", required=True); proposal.add_argument("--target", choices=("hermes", "honcho"), required=True)
    proposal.add_argument("--statement", required=True); proposal.add_argument("--rationale", required=True); proposal.add_argument("--event-id", type=int)
    return p


def main(argv: list[str] | None = None) -> int:
    args = parser().parse_args(argv)
    store = Store(args.db)
    try:
        store.init()
        if args.command == "init": output = {"database": str(store.path), "status": "initialized"}
        elif args.command == "status": output = {"database": str(store.path), "counts": store.counts()}
        elif args.command == "record": output = {"event_id": store.record(args.kind, args.title, args.body, args.entity)}
        elif args.command == "ingest-obsidian": output = ingest_obsidian(store, args.vault, args.path)
        elif args.command == "query":
            output = [dict(row) for row in store.search(args.query, args.entity, args.limit)]
        elif args.command == "packet":
            output = evidence_packet(store, args.task, args.query, args.entity, args.max_chars, args.limit)
        elif args.command == "propose":
            output = {"proposal_id": store.propose(args.target, args.statement, args.rationale, args.event_id), "status": "proposed"}
        else: raise AssertionError("unreachable")
        print(json.dumps(output, indent=2, sort_keys=True))
        return 0
    except (ValueError, OSError) as error:
        print(f"memoria: {error}", file=sys.stderr)
        return 2
    finally:
        store.close()


if __name__ == "__main__":
    raise SystemExit(main())
