# Contributing to the excavation

Do not add deployment workflows, hosted storage, telemetry, or automatic Hermes/Honcho writes without an explicit decision record.

Before a change:

1. Add or update an entry in `IDEAS.md` or an ADR when it changes a design invariant.
2. Preserve source history; prefer a new capture or event over mutation.
3. Add a behavior test for retrieval, integrity, or boundary behavior.

Validate with:

```bash
PYTHONPATH=src python -m unittest discover -s tests -v
PYTHONPATH=src python -m memoria.cli --help
python -m build
```

Every release candidate must also pass a clean virtual-environment install, CLI smoke test, backup/restore drill, and `memoria verify`. Do not weaken an append-only trigger or packet budget to make a test convenient.
