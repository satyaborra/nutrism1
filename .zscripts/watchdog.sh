#!/bin/sh
# NutriSLM dev-server watchdog.
# Checks port 3000 every 60s; if nothing is listening, restarts the dev server
# (4 GB heap — Turbopack accumulates compile state and can OOM in long sessions).
# Logs its own actions to /home/z/my-project/watchdog.log.

PORT=3000
DIR=/home/z/my-project
LOG=$DIR/watchdog.log
STAMP() { date "+%Y-%m-%d %H:%M:%S"; }

echo "$(STAMP) watchdog started (pid $$)" >> "$LOG"

while true; do
  if ! ss -tln 2>/dev/null | grep -q ":$PORT "; then
    echo "$(STAMP) port $PORT down — restarting dev server" >> "$LOG"
    cd "$DIR" || exit 1
    setsid nohup env NODE_OPTIONS="--max-old-space-size=4096" bun run dev > dev.log 2>&1 < /dev/null &
    # give it time to boot; verify
    sleep 15
    if ss -tln 2>/dev/null | grep -q ":$PORT "; then
      echo "$(STAMP) restart OK" >> "$LOG"
    else
      echo "$(STAMP) restart FAILED — will retry next cycle" >> "$LOG"
    fi
  fi
  sleep 60
done
