# Kdenlive Score Overlay

This folder contains a companion script for the **Tennis Match Scoring Web App** that lets you add an automatic score overlay to your Kdenlive video project.

## Workflow

```
Web App  ──export──►  tennis-match.json
                              │
                    tennis_score_overlay.py
                              │
                    Kdenlive subtitle track  (score overlay channel)
```

1. **Record the match** in the web app while your video plays.
2. **Export the match** using either button in the header:
   - **⬇ Export JSON** – saves `tennis-match.json` (full project data, re-importable).
   - **⬇ Export SRT** – saves `tennis-score.srt` directly (jump to step 4).
3. *(Optional)* Run the Kdenlive script to generate the SRT automatically (see below).
4. In Kdenlive: **Project → Add Subtitle Track → Import Subtitle File** and choose the `.srt` file.

The subtitle track acts as the *dedicated score channel*, displaying the live score at the correct video timestamp for each point logged.

---

## `tennis_score_overlay.py`

A Python script that reads `tennis-match.json`, recomputes the score state for every logged point, and either:

- **Inside Kdenlive** – adds subtitle entries directly to the current project timeline.
- **Standalone (command line)** – writes a `.srt` file you can import manually.

### Installation as a Kdenlive script

Copy the script to your Kdenlive user scripts directory and restart Kdenlive.  
The script then appears under **Tools → Scripts**.

| Platform | Scripts folder |
|----------|---------------|
| Linux    | `~/.local/share/kdenlive/scripts/` |
| macOS    | `~/Library/Application Support/kdenlive/scripts/` |
| Windows  | `%APPDATA%\kdenlive\scripts\` |

After running the script inside Kdenlive, select the generated subtitle track and style it via **Project → Subtitle Style** to match your broadcast look.

### Standalone command-line usage

```bash
# Generate tennis-score.srt in the current directory
python3 tennis_score_overlay.py tennis-match.json

# Specify a custom output path
python3 tennis_score_overlay.py tennis-match.json /tmp/my-match.srt
```

Requirements: Python 3.8+, no third-party packages needed.

---

## Subtitle format

Each subtitle entry spans from the timestamp of a logged point to the timestamp of the next point (or the end of the video for the final point).  The two-line score reads:

```
Alice ●  1  3  40
Bob      1  2  15
```

Where `●` marks the current server, the three numbers are **sets – games – points**.  
When the match ends a third line is added: `Winner: Alice`.
