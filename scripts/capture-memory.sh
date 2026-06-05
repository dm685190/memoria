#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'USAGE'
Usage:
  npm run memory:capture -- --kind <kind> --summary "..." [--metadata '{...}']

Examples:
  npm run memory:capture -- --kind deployment --summary "Search UI deployed and verified" --metadata-file metadata.json
  npm run memory:capture -- --kind handoff --summary "Memoria search/capture workflow ready for next phase"
USAGE
}

kind=""
summary=""
metadata="{}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --kind)
      kind="${2:-}"
      shift 2
      ;;
    --summary)
      summary="${2:-}"
      shift 2
      ;;
    --metadata)
      metadata="${2:-{}}"
      shift 2
      ;;
    --metadata-file)
      metadata="$(cat "${2:-}")"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

if [[ -z "$kind" || -z "$summary" ]]; then
  usage >&2
  exit 2
fi

commit="$(git rev-parse --short HEAD 2>/dev/null || true)"
branch="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || true)"

python3 - <<'PY' "$metadata" "$commit" "$branch" "$kind" "$summary"
import json
import subprocess
import sys

metadata_raw, commit, branch, kind, summary = sys.argv[1:]
try:
    metadata = json.loads(metadata_raw or '{}')
except json.JSONDecodeError as exc:
    raise SystemExit(f"metadata must be valid JSON: {exc}")
if not isinstance(metadata, dict):
    raise SystemExit('metadata must be a JSON object')
metadata.setdefault('project', 'memoria')
if commit:
    metadata.setdefault('commit', commit)
if branch:
    metadata.setdefault('branch', branch)

import os
import shutil

capture_bin = os.environ.get('MEMORIA_CAPTURE_BIN') or shutil.which('memoria-capture')
if not capture_bin:
    raise SystemExit(
        'memoria-capture command not found. Set MEMORIA_CAPTURE_BIN=/path/to/memoria-capture '
        'or install a compatible capture wrapper.'
    )

cmd = [
    capture_bin,
    '--kind', kind,
    '--summary', summary,
    '--metadata', json.dumps(metadata, separators=(',', ':')),
]
raise SystemExit(subprocess.call(cmd))
PY
