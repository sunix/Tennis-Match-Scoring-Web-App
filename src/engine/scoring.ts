import type { MatchConfig, MatchEvent, MatchState } from "../types";

const POINT_LABELS = ["0", "15", "30", "40"];

function initialState(config: MatchConfig): MatchState {
  return {
    setA: 0,
    setB: 0,
    gameA: 0,
    gameB: 0,
    pointA: 0,
    pointB: 0,
    tbA: null,
    tbB: null,
    server: config.serverFirst,
    matchWinner: null,
  };
}

function isSuperTiebreakSet(state: MatchState, config: MatchConfig): boolean {
  // bestOf: 2 means play one set then super tiebreak if 1-1
  if (config.bestOf === 2 && state.setA === 1 && state.setB === 1) return true;
  // Final set super tiebreak: if sets are tied at (bestOf-1)/2 and tiebreakAt is configured
  // This implementation uses the standard tiebreak at tiebreakAt for all sets
  return false;
}

function isInTiebreak(state: MatchState, config: MatchConfig): boolean {
  if (isSuperTiebreakSet(state, config)) return true;
  return state.gameA === config.tiebreakAt && state.gameB === config.tiebreakAt;
}

function getTiebreakTarget(state: MatchState, config: MatchConfig): number {
  if (isSuperTiebreakSet(state, config)) return 10;
  return config.tiebreakPoints;
}

function rotateServer(server: "A" | "B"): "A" | "B" {
  return server === "A" ? "B" : "A";
}

function checkSetWin(
  state: MatchState,
  config: MatchConfig
): MatchState {
  const { gameA, gameB, setA, setB } = state;
  const target = config.gamesPerSet;
  const tiebreakAt = config.tiebreakAt;

  const aWins =
    (gameA >= target && gameA - gameB >= 2) ||
    (gameA === tiebreakAt + 1 && gameB === tiebreakAt); // won tiebreak
  const bWins =
    (gameB >= target && gameB - gameA >= 2) ||
    (gameB === tiebreakAt + 1 && gameA === tiebreakAt);

  if (!aWins && !bWins) return state;

  const winner = aWins ? "A" : "B";
  const newSetA = winner === "A" ? setA + 1 : setA;
  const newSetB = winner === "B" ? setB + 1 : setB;

  // Check match win
  const setsNeeded = config.bestOf === 2 ? 1 : Math.ceil(config.bestOf / 2);
  const matchWinner: "A" | "B" | null =
    newSetA >= setsNeeded ? "A" : newSetB >= setsNeeded ? "B" : null;

  return {
    ...state,
    setA: newSetA,
    setB: newSetB,
    gameA: 0,
    gameB: 0,
    pointA: 0,
    pointB: 0,
    tbA: null,
    tbB: null,
    matchWinner,
  };
}

function checkSuperTiebreakWin(
  state: MatchState,
  _config: MatchConfig
): MatchState {
  const { tbA, tbB, setA, setB } = state;
  if (tbA === null || tbB === null) return state;

  const target = 10;
  const aWins = tbA >= target && tbA - tbB >= 2;
  const bWins = tbB >= target && tbB - tbA >= 2;

  if (!aWins && !bWins) return state;

  const winner = aWins ? "A" : "B";
  const newSetA = winner === "A" ? setA + 1 : setA;
  const newSetB = winner === "B" ? setB + 1 : setB;

  // bestOf: 2 → setsNeeded = 2 for super tiebreak format
  const setsNeeded = 2;
  const matchWinner: "A" | "B" | null =
    newSetA >= setsNeeded ? "A" : newSetB >= setsNeeded ? "B" : null;

  return {
    ...state,
    setA: newSetA,
    setB: newSetB,
    gameA: 0,
    gameB: 0,
    pointA: 0,
    pointB: 0,
    tbA: null,
    tbB: null,
    matchWinner,
  };
}

function applyPoint(
  state: MatchState,
  winner: "A" | "B",
  config: MatchConfig
): MatchState {
  if (state.matchWinner) return state;

  const inSuperTb = isSuperTiebreakSet(state, config);
  const inTb = isInTiebreak(state, config);

  if (inSuperTb) {
    // Super tiebreak mode
    const tbA = (state.tbA ?? 0) + (winner === "A" ? 1 : 0);
    const tbB = (state.tbB ?? 0) + (winner === "B" ? 1 : 0);
    const totalPoints = tbA + tbB;

    // Tiebreak server rotation: first point by current server, then every 2
    let server = state.server;
    if (totalPoints === 1 || (totalPoints > 1 && totalPoints % 2 === 1)) {
      server = rotateServer(state.server);
    }

    const next = { ...state, tbA, tbB, server };
    return checkSuperTiebreakWin(next, config);
  }

  if (inTb) {
    // Regular tiebreak
    const tbA = (state.tbA ?? 0) + (winner === "A" ? 1 : 0);
    const tbB = (state.tbB ?? 0) + (winner === "B" ? 1 : 0);
    const totalPoints = tbA + tbB;
    const target = getTiebreakTarget(state, config);

    // Tiebreak server rotation
    let server = state.server;
    if (totalPoints === 1 || (totalPoints > 1 && totalPoints % 2 === 1)) {
      server = rotateServer(state.server);
    }

    const aWins = tbA >= target && tbA - tbB >= 2;
    const bWins = tbB >= target && tbB - tbA >= 2;

    if (!aWins && !bWins) {
      return { ...state, tbA, tbB, server };
    }

    // Tiebreak won - the server for the next set is the one who served 2nd in the tiebreak
    // After tiebreak, the player who received first serves the next set
    const tbWinner = aWins ? "A" : "B";
    const newGameA = tbWinner === "A" ? state.gameA + 1 : state.gameA;
    const newGameB = tbWinner === "B" ? state.gameB + 1 : state.gameB;

    // After tiebreak: server for next set is rotated (serve mini-game then swap)
    // The original server served first in the tiebreak, so next set starts with the other player
    const nextServer = rotateServer(state.server);

    const stateAfterTb: MatchState = {
      ...state,
      gameA: newGameA,
      gameB: newGameB,
      pointA: 0,
      pointB: 0,
      tbA: null,
      tbB: null,
      server: nextServer,
    };

    return checkSetWin(stateAfterTb, config);
  }

  // Regular game
  const pointA = state.pointA + (winner === "A" ? 1 : 0);
  const pointB = state.pointB + (winner === "B" ? 1 : 0);

  const aWinsGame = pointA >= 4 && pointA - pointB >= 2;
  const bWinsGame = pointB >= 4 && pointB - pointA >= 2;

  if (!aWinsGame && !bWinsGame) {
    return { ...state, pointA, pointB };
  }

  const gameWinner = aWinsGame ? "A" : "B";
  const newGameA = gameWinner === "A" ? state.gameA + 1 : state.gameA;
  const newGameB = gameWinner === "B" ? state.gameB + 1 : state.gameB;
  const newServer = rotateServer(state.server);

  const stateAfterGame: MatchState = {
    ...state,
    gameA: newGameA,
    gameB: newGameB,
    pointA: 0,
    pointB: 0,
    tbA: null,
    tbB: null,
    server: newServer,
  };

  return checkSetWin(stateAfterGame, config);
}

export function computeState(
  events: MatchEvent[],
  config: MatchConfig
): MatchState[] {
  const states: MatchState[] = [];
  let current = initialState(config);

  for (const event of events) {
    current = applyPoint(current, event.winner, config);
    states.push({ ...current });
  }

  return states;
}

export function getInitialState(config: MatchConfig): MatchState {
  return initialState(config);
}

export function pointLabel(p: number, opp: number): string {
  if (p < 3 && opp < 3) return POINT_LABELS[p];
  if (p === 3 && opp < 3) return "40";
  if (p >= 3 && opp >= 3) {
    if (p === opp) return "Deuce";
    if (p > opp) return "Ad";
    return "40";
  }
  return POINT_LABELS[Math.min(p, 3)];
}
