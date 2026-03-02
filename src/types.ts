export interface MatchEvent {
  id: string;
  t_s: number;
  type: "point";
  winner: "A" | "B";
}

export interface MatchConfig {
  playerA: string;
  playerB: string;
  bestOf: 3 | 5 | 2; // 2 = super tiebreak format
  gamesPerSet: number;
  tiebreakAt: number;
  tiebreakPoints: number;
  serverFirst: "A" | "B";
}

export interface VideoInfo {
  name: string;
  duration_s: number;
  fps_hint: number;
}

export interface MatchState {
  setA: number;
  setB: number;
  gameA: number;
  gameB: number;
  pointA: number;
  pointB: number;
  tbA: number | null;
  tbB: number | null;
  server: "A" | "B";
  matchWinner: "A" | "B" | null;
}
