import { useEffect } from "react";

interface Props {
  playerA: string;
  playerB: string;
  onPoint: (winner: "A" | "B") => void;
  onUndo: () => void;
  disabled: boolean;
}

export default function ScoringPanel({ playerA, playerB, onPoint, onUndo, disabled }: Props) {
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === "a" || e.key === "A") {
        if (!disabled) onPoint("A");
      } else if (e.key === "b" || e.key === "B") {
        if (!disabled) onPoint("B");
      } else if ((e.ctrlKey || e.metaKey) && e.key === "z") {
        e.preventDefault();
        onUndo();
      }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onPoint, onUndo, disabled]);

  return (
    <div className="scoring-panel">
      <div className="scoring-buttons">
        <button
          className="btn-point btn-point-a"
          onClick={() => onPoint("A")}
          disabled={disabled}
          title="Press A key"
        >
          <span className="btn-point-label">Point</span>
          <span className="btn-point-player">{playerA}</span>
          <span className="btn-point-key">[ A ]</span>
        </button>

        <button
          className="btn-point btn-point-b"
          onClick={() => onPoint("B")}
          disabled={disabled}
          title="Press B key"
        >
          <span className="btn-point-label">Point</span>
          <span className="btn-point-player">{playerB}</span>
          <span className="btn-point-key">[ B ]</span>
        </button>
      </div>

      <button className="btn-undo" onClick={onUndo} title="Ctrl+Z">
        ↩ Undo
      </button>
    </div>
  );
}
