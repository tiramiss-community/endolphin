#!/bin/sh
set -eu

cd "$(dirname "$0")/../../.."
pnpm --filter backend test:fed:setup
