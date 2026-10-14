#!/bin/sh
set -eu

ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
LOCAL_NODE="$ROOT/data/tooling/node-v22.19.0/bin"

if [ -x "$LOCAL_NODE/node" ]; then
  PATH="$LOCAL_NODE:$PATH"
  export PATH
fi

if ! command -v node >/dev/null 2>&1; then
  echo "lumi requires Node >=22.19.0, but node was not found" >&2
  exit 1
fi

node -e '
const current = process.versions.node.split(".").map(Number)
const minimum = [22, 19, 0]
for (let index = 0; index < minimum.length; index += 1) {
  if (current[index] > minimum[index]) process.exit(0)
  if (current[index] < minimum[index]) {
    process.stderr.write(`lumi requires Node >=22.19.0; found ${process.versions.node}\n`)
    process.exit(1)
  }
}
'

exec "$@"
