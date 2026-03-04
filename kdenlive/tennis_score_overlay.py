#!/usr/bin/env python3
"""
Tennis Score Overlay – Kdenlive companion script
=================================================
Reads a ``tennis-match.json`` file exported from the *Tennis Match Scoring
Web App* and creates subtitle entries in the **current** Kdenlive project so
that the score appears as an automatic overlay channel.

Installation
------------
Copy this file to your Kdenlive user scripts folder:

  Linux : ~/.local/share/kdenlive/scripts/
  macOS : ~/Library/Application Support/kdenlive/scripts/
  Windows: %APPDATA%\\kdenlive\\scripts\\

Then restart Kdenlive.  The script appears under **Tools → Scripts**.

Standalone use (no Kdenlive)
-----------------------------
You can also run this script from the command line to generate a plain SRT
file without opening Kdenlive:

    python3 tennis_score_overlay.py match.json          # writes tennis-score.srt
    python3 tennis_score_overlay.py match.json out.srt  # custom output path

The resulting .srt file can be imported into Kdenlive via
  Project → Add Subtitle Track → Import Subtitle File.
"""

from __future__ import annotations

import json
import os
import sys
from typing import Optional

# ---------------------------------------------------------------------------
# Tennis scoring logic (mirrors src/engine/scoring.ts)
# ---------------------------------------------------------------------------

POINT_LABELS = ["0", "15", "30", "40"]


def _point_label(p: int, opp: int) -> str:
    if p < 3 and opp < 3:
        return POINT_LABELS[p]
    if p == 3 and opp < 3:
        return "40"
    if p >= 3 and opp >= 3:
        if p == opp:
            return "Deuce"
        return "Ad" if p > opp else "40"
    return POINT_LABELS[min(p, 3)]


def _initial_state(config: dict) -> dict:
    return {
        "setA": 0, "setB": 0,
        "gameA": 0, "gameB": 0,
        "pointA": 0, "pointB": 0,
        "tbA": None, "tbB": None,
        "server": config.get("serverFirst", "A"),
        "matchWinner": None,
    }


def _rotate(server: str) -> str:
    return "B" if server == "A" else "A"


def _is_super_tb_set(state: dict, config: dict) -> bool:
    return (
        config.get("bestOf") == 2
        and state["setA"] == 1
        and state["setB"] == 1
    )


def _in_tiebreak(state: dict, config: dict) -> bool:
    if _is_super_tb_set(state, config):
        return True
    return (
        state["gameA"] == config.get("tiebreakAt", 6)
        and state["gameB"] == config.get("tiebreakAt", 6)
    )


def _check_set_win(state: dict, config: dict) -> dict:
    target = config.get("gamesPerSet", 6)
    tb_at = config.get("tiebreakAt", 6)
    ga, gb = state["gameA"], state["gameB"]

    a_wins = (ga >= target and ga - gb >= 2) or (ga == tb_at + 1 and gb == tb_at)
    b_wins = (gb >= target and gb - ga >= 2) or (gb == tb_at + 1 and ga == tb_at)

    if not a_wins and not b_wins:
        return state

    winner = "A" if a_wins else "B"
    new_sa = state["setA"] + (1 if winner == "A" else 0)
    new_sb = state["setB"] + (1 if winner == "B" else 0)

    best_of = config.get("bestOf", 3)
    sets_needed = 2 if best_of == 2 else (best_of + 1) // 2
    match_winner = "A" if new_sa >= sets_needed else ("B" if new_sb >= sets_needed else None)

    return {**state, "setA": new_sa, "setB": new_sb,
            "gameA": 0, "gameB": 0, "pointA": 0, "pointB": 0,
            "tbA": None, "tbB": None, "matchWinner": match_winner}


def _check_super_tb_win(state: dict) -> dict:
    ta, tb = state.get("tbA"), state.get("tbB")
    if ta is None or tb is None:
        return state

    a_wins = ta >= 10 and ta - tb >= 2
    b_wins = tb >= 10 and tb - ta >= 2

    if not a_wins and not b_wins:
        return state

    winner = "A" if a_wins else "B"
    new_sa = state["setA"] + (1 if winner == "A" else 0)
    new_sb = state["setB"] + (1 if winner == "B" else 0)
    match_winner = "A" if new_sa >= 2 else ("B" if new_sb >= 2 else None)

    return {**state, "setA": new_sa, "setB": new_sb,
            "gameA": 0, "gameB": 0, "pointA": 0, "pointB": 0,
            "tbA": None, "tbB": None, "matchWinner": match_winner}


def _apply_point(state: dict, winner: str, config: dict) -> dict:
    if state.get("matchWinner"):
        return state

    super_tb = _is_super_tb_set(state, config)
    tb = _in_tiebreak(state, config)

    if super_tb:
        ta = (state["tbA"] or 0) + (1 if winner == "A" else 0)
        tb_b = (state["tbB"] or 0) + (1 if winner == "B" else 0)
        total = ta + tb_b
        server = _rotate(state["server"]) if total == 1 or (total > 1 and total % 2 == 1) else state["server"]
        return _check_super_tb_win({**state, "tbA": ta, "tbB": tb_b, "server": server})

    if tb:
        ta = (state["tbA"] or 0) + (1 if winner == "A" else 0)
        tb_b = (state["tbB"] or 0) + (1 if winner == "B" else 0)
        total = ta + tb_b
        server = _rotate(state["server"]) if total == 1 or (total > 1 and total % 2 == 1) else state["server"]
        target = config.get("tiebreakPoints", 7)

        a_wins = ta >= target and ta - tb_b >= 2
        b_wins = tb_b >= target and tb_b - ta >= 2
        if not a_wins and not b_wins:
            return {**state, "tbA": ta, "tbB": tb_b, "server": server}

        tb_winner = "A" if a_wins else "B"
        new_ga = state["gameA"] + (1 if tb_winner == "A" else 0)
        new_gb = state["gameB"] + (1 if tb_winner == "B" else 0)
        after_tb = {**state, "gameA": new_ga, "gameB": new_gb,
                    "pointA": 0, "pointB": 0, "tbA": None, "tbB": None,
                    "server": _rotate(state["server"])}
        return _check_set_win(after_tb, config)

    # Regular game
    pa = state["pointA"] + (1 if winner == "A" else 0)
    pb = state["pointB"] + (1 if winner == "B" else 0)

    a_wins_game = pa >= 4 and pa - pb >= 2
    b_wins_game = pb >= 4 and pb - pa >= 2

    if not a_wins_game and not b_wins_game:
        return {**state, "pointA": pa, "pointB": pb}

    gw = "A" if a_wins_game else "B"
    new_ga = state["gameA"] + (1 if gw == "A" else 0)
    new_gb = state["gameB"] + (1 if gw == "B" else 0)
    after_game = {**state, "gameA": new_ga, "gameB": new_gb,
                  "pointA": 0, "pointB": 0, "tbA": None, "tbB": None,
                  "server": _rotate(state["server"])}
    return _check_set_win(after_game, config)


def compute_states(events: list, config: dict) -> list:
    """Return the match state after each event (same order as events)."""
    states: list = []
    state = _initial_state(config)
    for event in events:
        state = _apply_point(state, event["winner"], config)
        states.append(dict(state))
    return states


# ---------------------------------------------------------------------------
# Score text & SRT formatting
# ---------------------------------------------------------------------------

def format_score_text(state: dict, config: dict) -> str:
    player_a = config.get("playerA", "Player A")
    player_b = config.get("playerB", "Player B")

    ta, tb = state.get("tbA"), state.get("tbB")
    if ta is not None and tb is not None:
        pts_a, pts_b = str(ta), str(tb)
    else:
        pts_a = _point_label(state.get("pointA", 0), state.get("pointB", 0))
        pts_b = _point_label(state.get("pointB", 0), state.get("pointA", 0))
        if pts_a == "Deuce":
            pts_b = "Deuce"

    srv = state.get("server", "A")
    dot_a = " \u25cf" if srv == "A" else ""
    dot_b = " \u25cf" if srv == "B" else ""

    line1 = f"{player_a}{dot_a}  {state.get('setA', 0)}  {state.get('gameA', 0)}  {pts_a}"
    line2 = f"{player_b}{dot_b}  {state.get('setB', 0)}  {state.get('gameB', 0)}  {pts_b}"

    if state.get("matchWinner"):
        winner_name = player_a if state["matchWinner"] == "A" else player_b
        return f"{line1}\n{line2}\nWinner: {winner_name}"

    return f"{line1}\n{line2}"


def _fmt_time(seconds: float) -> str:
    h = int(seconds // 3600)
    m = int((seconds % 3600) // 60)
    s = int(seconds % 60)
    ms = int(round((seconds % 1) * 1000))
    return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"


def generate_srt(data: dict) -> str:
    """Generate SRT subtitle content from exported match data."""
    config = data.get("match", {})
    events = data.get("events", [])
    video = data.get("video")
    duration = video["duration_s"] if video else 0

    states = compute_states(events, config)
    entries: list[str] = []

    for i, (event, state) in enumerate(zip(events, states)):
        start_t = float(event["t_s"])
        if i + 1 < len(events):
            raw_end = float(events[i + 1]["t_s"]) - 0.1
        else:
            raw_end = float(duration) if duration else start_t + 5.0
        end_t = max(start_t + 0.1, raw_end)

        text = format_score_text(state, config)
        entries.append(f"{i + 1}\n{_fmt_time(start_t)} --> {_fmt_time(end_t)}\n{text}")

    return "\n\n".join(entries) + "\n"


# ---------------------------------------------------------------------------
# Kdenlive scripting integration
# ---------------------------------------------------------------------------

def _add_subtitles_to_kdenlive(data: dict) -> None:
    """
    Add subtitle entries to the active Kdenlive project timeline.

    This function is called when the script is executed inside Kdenlive.
    It relies on the ``kdenlivescriptapi`` module bundled with Kdenlive ≥ 23.04.
    """
    from kdenlivescriptapi import kdenlivescriptapi as api  # type: ignore[import]

    config = data.get("match", {})
    events = data.get("events", [])
    video = data.get("video")
    duration = video["duration_s"] if video else 0

    states = compute_states(events, config)

    for i, (event, state) in enumerate(zip(events, states)):
        start_t = float(event["t_s"])
        if i + 1 < len(events):
            raw_end = float(events[i + 1]["t_s"]) - 0.1
        else:
            raw_end = float(duration) if duration else start_t + 5.0
        end_t = max(start_t + 0.1, raw_end)

        text = format_score_text(state, config)
        # Kdenlive subtitle API expects milliseconds
        api.addSubtitle(int(start_t * 1000), int(end_t * 1000), text)

    api.info(f"Added {len(events)} subtitle entries for tennis score overlay.")


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

def _pick_file_kdenlive() -> Optional[str]:
    """Show a file-open dialog inside Kdenlive and return the chosen path."""
    try:
        from kdenlivescriptapi import kdenlivescriptapi as api  # type: ignore[import]
        path = api.openFileDialog(
            "Open Tennis Match JSON",
            os.path.expanduser("~"),
            "Tennis Match JSON (*.json)",
        )
        return path if path else None
    except Exception:
        return None


def main() -> None:
    # --- Determine whether we are running inside Kdenlive ---
    in_kdenlive = False
    try:
        import kdenlivescriptapi  # type: ignore[import]  # noqa: F401
        in_kdenlive = True
    except ImportError:
        pass

    # --- Determine the input JSON path ---
    json_path: Optional[str] = None

    if len(sys.argv) >= 2:
        json_path = sys.argv[1]
    elif in_kdenlive:
        json_path = _pick_file_kdenlive()

    if not json_path:
        if in_kdenlive:
            try:
                from kdenlivescriptapi import kdenlivescriptapi as api  # type: ignore[import]
                api.warning(
                    "Tennis Score Overlay: no JSON file selected. "
                    "Export your match from the web app first, then run this script again."
                )
            except Exception:
                pass
        else:
            print(
                "Usage: python3 tennis_score_overlay.py <match.json> [output.srt]\n\n"
                "  match.json  – file exported by the Tennis Match Scoring Web App\n"
                "  output.srt  – optional output path (default: tennis-score.srt)\n",
                file=sys.stderr,
            )
            sys.exit(1)
        return

    # --- Load JSON ---
    with open(json_path, encoding="utf-8") as fh:
        data = json.load(fh)

    if data.get("version") != 1:
        raise ValueError(f"Unsupported match file version: {data.get('version')}")

    # --- Kdenlive: add subtitles directly to the timeline ---
    if in_kdenlive:
        _add_subtitles_to_kdenlive(data)
        return

    # --- Standalone: write SRT file ---
    srt_path = sys.argv[2] if len(sys.argv) >= 3 else "tennis-score.srt"
    srt_content = generate_srt(data)
    with open(srt_path, "w", encoding="utf-8") as fh:
        fh.write(srt_content)
    print(f"Wrote {len(data.get('events', []))} subtitle entries to {srt_path}")
    print(
        "\nTo import into Kdenlive:\n"
        "  Project → Add Subtitle Track → Import Subtitle File"
    )


if __name__ == "__main__":
    main()
