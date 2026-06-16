#!/usr/bin/env bash
set -euo pipefail

PACKAGE_PATH="${1:-/tmp/crossborder-commerce-kit-deploy.tar.gz}"
APP_USER="${APP_USER:-ubuntu}"
APP_DIR="${APP_DIR:-/opt/crossborder-commerce-kit}"
START_OBSERVABILITY="${START_OBSERVABILITY:-0}"

if [ "$(id -u)" -ne 0 ]; then
  echo "Run this script with sudo." >&2
  exit 1
fi

if [ ! -f "$PACKAGE_PATH" ]; then
  echo "Package not found: $PACKAGE_PATH" >&2
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_USER="$APP_USER" APP_DIR="$APP_DIR" bash "$SCRIPT_DIR/ubuntu-bootstrap.sh"

install -d -o "$APP_USER" -g "$APP_USER" "$APP_DIR"
tar -xzf "$PACKAGE_PATH" -C "$APP_DIR"
chown -R "$APP_USER:$APP_USER" "$APP_DIR"

cd "$APP_DIR"
if [ ! -f .env ]; then
  cp .env.example .env
  chown "$APP_USER:$APP_USER" .env
fi

profiles=(--profile app)
if [ "$START_OBSERVABILITY" = "1" ]; then
  profiles+=(--profile observability)
fi

docker compose "${profiles[@]}" up -d --build
docker compose ps

echo "Server install completed."
echo "Storefront: http://<server-public-ip>:3000"
echo "Admin: http://<server-public-ip>:3001"
