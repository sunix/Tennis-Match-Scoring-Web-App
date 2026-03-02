import React, { useState } from "react";
import type { MatchEvent, MatchState, MatchConfig } from "../types";
import { pointLabel } from "../engine/scoring";

interface Props {
  events: MatchEvent[];
  snapshots: MatchState[];
  config: MatchConfig;
  onDelete: (id: string) => void;
  onEditTimestamp: (id: string, t_s: number) => void;
}

function scoreDescription(snap: MatchState, config: MatchConfig): string {
  if (snap.matchWinner) {
    return `Match: ${snap.matchWinner === "A" ? config.playerA : config.playerB} wins!`;
  }
  const sets = `Sets ${snap.setA}-${snap.setB}`;
  const games = `Games ${snap.gameA}-${snap.gameB}`;

  let points = "";
  if (snap.tbA !== null && snap.tbB !== null) {
    points = `TB ${snap.tbA}-${snap.tbB}`;
  } else {
    const pA = pointLabel(snap.pointA, snap.pointB);
    const pB = pointLabel(snap.pointB, snap.pointA);
    points = `${pA}-${pB}`;
  }
  return `${sets} | ${games} | ${points}`;
}

export default function EventList({ events, snapshots, config, onDelete, onEditTimestamp }: Props) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");

  function startEdit(id: string, t_s: number) {
    setEditingId(id);
    setEditValue(t_s.toFixed(3));
  }

  function commitEdit(id: string) {
    const val = parseFloat(editValue);
    if (!isNaN(val) && val >= 0) {
      onEditTimestamp(id, val);
    }
    setEditingId(null);
  }

  function handleKeyDown(e: React.KeyboardEvent, id: string) {
    if (e.key === "Enter") commitEdit(id);
    if (e.key === "Escape") setEditingId(null);
  }

  if (events.length === 0) {
    return (
      <div className="event-list">
        <h3>Event Log</h3>
        <p className="empty-msg">No events yet. Score a point to begin.</p>
      </div>
    );
  }

  return (
    <div className="event-list">
      <h3>Event Log <span className="event-count">({events.length})</span></h3>
      <div className="event-table-wrapper">
        <table className="event-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Time (s)</th>
              <th>Winner</th>
              <th>Score After</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {events.map((ev, i) => {
              const snap = snapshots[i];
              return (
                <tr key={ev.id}>
                  <td className="col-idx">{i + 1}</td>
                  <td className="col-time">
                    {editingId === ev.id ? (
                      <input
                        className="ts-input"
                        value={editValue}
                        autoFocus
                        onChange={(e) => setEditValue(e.target.value)}
                        onBlur={() => commitEdit(ev.id)}
                        onKeyDown={(e) => handleKeyDown(e, ev.id)}
                      />
                    ) : (
                      <span
                        className="ts-value"
                        onClick={() => startEdit(ev.id, ev.t_s)}
                        title="Click to edit"
                      >
                        {ev.t_s.toFixed(3)}
                      </span>
                    )}
                  </td>
                  <td className={`col-winner winner-${ev.winner}`}>
                    {ev.winner === "A" ? config.playerA : config.playerB}
                  </td>
                  <td className="col-score">
                    {snap ? scoreDescription(snap, config) : "—"}
                  </td>
                  <td className="col-action">
                    <button
                      className="btn-delete"
                      onClick={() => onDelete(ev.id)}
                      title="Delete event"
                    >
                      ✕
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
