# shellcheck shell=bash
#
# Wraps script steps in a nice UI: captures output, shows a spinner with
# a rolling preview of the last few lines, and prints done/failed on finish.
# 
# Set VERBOSE=true before sourcing to skip all that and stream output raw.
#
# Usage:
#   source "$(dirname "$0")/lib/step-utils.sh"
#
#   step_begin "Do something"
#   some_command
#   step_end
#

VERBOSE="${VERBOSE:-false}"

RED='\033[0;31m'
GREEN='\033[0;32m'
CYAN='\033[0;36m'
NC='\033[0m'

STEP_OUTPUT=""
STEP_LABEL=""
STEP_START=""
TAIL_PID=""
TAIL_COUNT_FILE=""
STEP_STOP_FILE=""
PREVIEW_LINES=5

format_duration() {
    local secs=$1
    if [ "$secs" -ge 60 ]; then
        printf "%dm %ds" $((secs / 60)) $((secs % 60))
    else
        printf "%ds" "$secs"
    fi
}

# Polls the output file and redraws a "volatile region" (the spinner label plus
# the last N output lines, dimmed) on the terminal. Uses fd 3 since stdout/stderr
# are redirected during a step.
#
# The volatile region is always the last thing on screen. Each iteration returns
# to its top (moving up the exact number of lines rendered last time) and clears
# to end of screen (\033[0J) before redrawing, so a leftover partial line can
# never corrupt the redraw. The loop is stopped cooperatively via a flag file
# checked only at the top of the loop, so it is never terminated mid-render and
# TAIL_COUNT_FILE always reflects what is actually on screen. This is what keeps
# teardown from moving the cursor too far and clobbering earlier "done" lines.

tail_start() {
    TAIL_COUNT_FILE=$(mktemp)
    STEP_STOP_FILE=$(mktemp)
    echo "0" > "$TAIL_COUNT_FILE"
    (
        drawn=0
        spinner_chars='|/-\'
        spinner_i=0
        cols=$(tput cols 2>/dev/null || echo 120)
        max_width=$((cols - 4))
        # Loop exits only when the stop flag file becomes non-empty, and only at
        # the top of the loop, i.e. between complete renders.
        while [ ! -s "$STEP_STOP_FILE" ]; do
            # Collapse the previous volatile region in one shot.
            if [ "$drawn" -gt 0 ]; then
                printf "\033[%dA\r\033[0J" "$drawn" >&3
            fi

            printf "${CYAN}[STEP]${NC} ${STEP_LABEL}... %s\n" "${spinner_chars:spinner_i%4:1}" >&3
            spinner_i=$((spinner_i + 1))
            drawn=1

            if [ -s "$STEP_OUTPUT" ]; then
                lines=$(tail -n "$PREVIEW_LINES" "$STEP_OUTPUT" 2>/dev/null || true)
                if [ -n "$lines" ]; then
                    while IFS= read -r line; do
                        printf "\033[2m  %.${max_width}s\033[0m\n" "$line" >&3
                        drawn=$((drawn + 1))
                    done <<< "$lines"
                fi
            fi

            echo "$drawn" > "$TAIL_COUNT_FILE"
            sleep 0.15
        done
    ) &
    TAIL_PID=$!
}

tail_stop() {
    if [ -n "${TAIL_PID:-}" ]; then
        # Ask the loop to stop, then wait for it to finish its current render so
        # TAIL_COUNT_FILE is guaranteed accurate before we touch the cursor.
        [ -n "${STEP_STOP_FILE:-}" ] && echo stop > "$STEP_STOP_FILE"
        wait "$TAIL_PID" 2>/dev/null || true
        TAIL_PID=""
    fi
    # Collapse the whole volatile region back to its top, clearing to end of
    # screen. The cursor lands where the committed line will be printed.
    if [ -n "${TAIL_COUNT_FILE:-}" ] && [ -f "$TAIL_COUNT_FILE" ]; then
        local count
        count=$(cat "$TAIL_COUNT_FILE")
        if [ "$count" -gt 0 ]; then
            printf "\033[%dA\r\033[0J" "$count" >&3
        fi
        rm -f "$TAIL_COUNT_FILE"
        TAIL_COUNT_FILE=""
    fi
    if [ -n "${STEP_STOP_FILE:-}" ]; then
        rm -f "$STEP_STOP_FILE"
        STEP_STOP_FILE=""
    fi
}

step_begin() {
    STEP_LABEL="$1"
    STEP_START=$(date +%s)
    if [ "$VERBOSE" = false ]; then
        STEP_OUTPUT=$(mktemp)
        # The tail loop renders the label (with spinner) as part of the volatile
        # region, so we don't echo it here.
        exec 3>&1 4>&2 1>"$STEP_OUTPUT" 2>&1
        tail_start
    else
        echo -e "${CYAN}[STEP]${NC} ${STEP_LABEL}"
    fi
}

step_end() {
    local duration=""
    if [ -n "$STEP_START" ]; then
        duration=" ($(format_duration $(( $(date +%s) - STEP_START ))))"
    fi
    if [ "$VERBOSE" = false ]; then
        tail_stop
        exec 1>&3 2>&4 3>&- 4>&-
        echo -e "${CYAN}[STEP]${NC} ${STEP_LABEL}... ${GREEN}done${NC}${duration}"
        rm -f "$STEP_OUTPUT"
        STEP_OUTPUT=""
    else
        echo -e "${CYAN}[STEP]${NC} ${STEP_LABEL}... ${GREEN}done${NC}${duration}"
    fi
}

on_error() {
    local duration=""
    if [ -n "${STEP_START:-}" ]; then
        duration=" ($(format_duration $(( $(date +%s) - STEP_START ))))"
    fi
    if [ "$VERBOSE" = false ] && [ -n "$STEP_OUTPUT" ] && [ -f "$STEP_OUTPUT" ]; then
        tail_stop
        exec 1>&3 2>&4 3>&- 4>&-
        echo -e "${CYAN}[STEP]${NC} ${STEP_LABEL}... ${RED}failed${NC}${duration}"
        cat "$STEP_OUTPUT"
        rm -f "$STEP_OUTPUT"
    fi
}
trap on_error ERR

on_interrupt() {
    local duration=""
    if [ -n "${STEP_START:-}" ]; then
        duration=" ($(format_duration $(( $(date +%s) - STEP_START ))))"
    fi
    if [ "$VERBOSE" = false ] && [ -n "${STEP_OUTPUT:-}" ] && [ -f "$STEP_OUTPUT" ]; then
        tail_stop
        exec 1>&3 2>&4 3>&- 4>&-
        echo -e "${CYAN}[STEP]${NC} ${STEP_LABEL}... ${RED}interrupted${NC}${duration}"
        rm -f "$STEP_OUTPUT"
    fi
    exit 130
}
trap on_interrupt INT TERM
