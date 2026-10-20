#!/usr/bin/env bash
cd "$(dirname "$0")" || exit 1
command -v node >/dev/null 2>&1 || { echo "Node.js fehlt. Installieren: https://nodejs.org (LTS)"; exit 1; }
exec node sim.js
