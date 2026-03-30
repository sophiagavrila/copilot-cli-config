#!/bin/bash
# Copilot Auto-Approve Watchdog
# Monitors tmux session 0 for permission prompts and auto-approves them.
# Also detects when Copilot is idle/done.
#
# Usage: nohup ~/.copilot/watchdog.sh &
# Kill:  kill $(cat /tmp/copilot-watchdog.pid)

TMUX_SESSION=0
CHECK_INTERVAL=5
LOG="/tmp/copilot-watchdog.log"
PIDFILE="/tmp/copilot-watchdog.pid"

echo $$ > "$PIDFILE"
echo "[$(date)] Watchdog started (PID $$)" > "$LOG"

idle_count=0
last_content_hash=""

while true; do
    # Capture current pane content
    output=$(tmux capture-pane -t "$TMUX_SESSION" -p 2>/dev/null)

    if [ $? -ne 0 ]; then
        echo "[$(date)] tmux session $TMUX_SESSION not found, exiting" >> "$LOG"
        break
    fi

    # Check for permission prompts and auto-approve (select option 2: "Yes, and don't ask again")
    if echo "$output" | grep -q "Do you want to run this command"; then
        echo "[$(date)] Permission prompt detected - auto-approving (option 2)" >> "$LOG"
        tmux send-keys -t "$TMUX_SESSION" Down Enter
        idle_count=0
        sleep 2
        continue
    fi

    # Check for file write permission prompts
    if echo "$output" | grep -q "Do you want to write"; then
        echo "[$(date)] Write permission prompt detected - auto-approving" >> "$LOG"
        tmux send-keys -t "$TMUX_SESSION" Down Enter
        idle_count=0
        sleep 2
        continue
    fi

    # Check for any "Do you want to" style prompts
    if echo "$output" | grep -q "Do you want to"; then
        echo "[$(date)] Generic permission prompt detected - auto-approving" >> "$LOG"
        tmux send-keys -t "$TMUX_SESSION" Down Enter
        idle_count=0
        sleep 2
        continue
    fi

    # Check for "Allow" prompts
    if echo "$output" | grep -qE "^.*Allow.*\?"; then
        echo "[$(date)] Allow prompt detected - auto-approving" >> "$LOG"
        tmux send-keys -t "$TMUX_SESSION" Enter
        idle_count=0
        sleep 2
        continue
    fi

    # Check for "Press Enter to continue" style prompts
    if echo "$output" | grep -q "Press Enter"; then
        echo "[$(date)] Press Enter prompt detected - sending Enter" >> "$LOG"
        tmux send-keys -t "$TMUX_SESSION" Enter
        idle_count=0
        sleep 2
        continue
    fi

    # Track content changes to detect idle state
    content_hash=$(echo "$output" | md5 2>/dev/null || echo "$output" | md5sum 2>/dev/null)
    if [ "$content_hash" = "$last_content_hash" ]; then
        idle_count=$((idle_count + 1))
    else
        idle_count=0
        last_content_hash="$content_hash"
    fi

    # If idle for 2 minutes (24 checks * 5s), log it
    if [ $idle_count -eq 24 ]; then
        echo "[$(date)] Copilot appears idle for 2 minutes" >> "$LOG"
    fi

    # If idle for 5 minutes (60 checks), signal completion
    if [ $idle_count -eq 60 ]; then
        echo "[$(date)] Copilot appears DONE (idle 5 min). Writing completion marker." >> "$LOG"
        echo "$(date)" > /tmp/copilot-watchdog-complete
        # Don't exit - keep watching in case it starts again
    fi

    sleep "$CHECK_INTERVAL"
done

echo "[$(date)] Watchdog exiting" >> "$LOG"
rm -f "$PIDFILE"
