# Tennis Match Scoring Web App

A static web application for logging tennis match scoring events with video timestamps, built with React + TypeScript + Vite and deployed to GitHub Pages.

## Features

- **Video Loading**: Load a local match video via file picker or drag & drop (no upload — runs entirely in browser)
- **Video Controls**: Play/Pause, playback speed (0.25x / 0.5x / 1x), seek bar, frame-level nudge (+1 / -1 frame)
- **Match Setup**: Configure player names, match format (Best of 3/5 or 2+supertiebreak), games per set, tiebreak rules, initial server, and FPS hint
- **Event Logging**: Large Point A / Point B buttons with keyboard shortcuts (`A` / `B` keys, `Ctrl+Z` to undo)
- **Live Scoreboard**: Broadcast-style scoreboard showing sets, games, points, and server indicator
- **Event List**: Editable table of logged points with computed score after each event; supports timestamp editing and deletion
- **Export / Import**: Download a `match.json` file or re-import a previously saved project
- **Kdenlive Export (CLI)**: Generate a `.kdenlive` project with scoreboard overlays from saved match data

## Data Format

```json
{
  "version": 1,
  "video": { "name": "match.mp4", "duration_s": 5432.12, "fps_hint": 30 },
  "match": {
    "playerA": "Player A", "playerB": "Player B",
    "bestOf": 3, "gamesPerSet": 6, "tiebreakAt": 6, "tiebreakPoints": 7, "serverFirst": "A"
  },
  "events": [
    { "t_s": 12.340, "type": "point", "winner": "A" }
  ]
}
```

## Development

```bash
npm install
npm run dev
```

## Build & Deploy

```bash
npm run build
```

Pushes to `main` automatically deploy to GitHub Pages via the included workflow.

## Kdenlive CLI Export

Generate a scored `.kdenlive` file without opening the web app:

```bash
npm run kdenlive:generate -- ./samples/tennis-match.json ./samples/anthony-sun-1.kdenlive ./samples/anthony-sun-1-with-scores-cli.kdenlive
```

Arguments:
- `state.json`: Exported match state JSON (same format as app export)
- `input.kdenlive`: Base Kdenlive project
- `output.kdenlive` (optional): Output filename; if omitted, `-with-scores.kdenlive` is appended to input name

Sample files are stored in `samples/`.
