const STORAGE_KEY = "golf-trip-scramble-v1";
const STATES = {
  NOT_STARTED: "NOT_STARTED",
  IN_PROGRESS: "IN_PROGRESS",
  COMPLETE: "COMPLETE",
};
const DEFAULT_POINTS = {
  win: 3,
  loss: 1,
  tie: 2,
  clutch: 1,
  longestDrive: 1,
  nearestPin: 1,
};
const GAME_MODES = {
  SCRAMBLE: { label: "Scramble", scoring: "team", totalLabel: "Strokes", higherWins: false },
  MATCH_PLAY: { label: "Match play", scoring: "match", totalLabel: "Match", higherWins: true },
  STABLEFORD: { label: "Stableford", scoring: "player", totalLabel: "Points", higherWins: true },
};

const uid = (prefix) => `${prefix}_${Math.random().toString(36).slice(2, 9)}`;
const todayIso = () => new Date().toISOString();

const defaultCourse = () => ({
  id: uid("course"),
  name: "Trip Course",
  holes: Array.from({ length: 18 }, (_, index) => ({
    holeNumber: index + 1,
    par: [4, 4, 3, 5, 4, 4, 3, 5, 4, 4, 3, 4, 5, 4, 4, 3, 5, 4][index],
  })),
});

const starterData = () => {
  const course = defaultCourse();
  return {
    version: 1,
    lastView: "rounds",
    lastRoundId: "",
    players: [],
    courses: [course],
    rounds: [],
  };
};

let state = loadState();
let view = state.lastView || "rounds";
let setupTab = "players";
let activeRoundId = state.lastRoundId || state.rounds[0]?.id || "";
let selectedLeaderboardPlayerId = "";
let leaderboardRoundId = "all";
let pendingResetRoundId = "";
let storageWarning = "";

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return starterData();
    const parsed = JSON.parse(raw);
    return normalizeData(parsed);
  } catch (error) {
    console.warn("Restore failed, using safe defaults.", error);
    return starterData();
  }
}

function normalizeData(data) {
  const clean = {
    version: 1,
    lastView: data.lastView || "rounds",
    lastRoundId: data.lastRoundId || "",
    players: Array.isArray(data.players) ? data.players : [],
    courses: Array.isArray(data.courses) ? data.courses : [],
    rounds: Array.isArray(data.rounds) ? data.rounds : [],
  };
  clean.courses = clean.courses.map((course, courseIndex) => {
    const fallback = defaultCourse();
    const sourceHoles = Array.isArray(course?.holes) ? course.holes : [];
    const holes = fallback.holes.map((fallbackHole, index) => {
      const sourceHole = sourceHoles.find((hole) => Number(hole?.holeNumber) === fallbackHole.holeNumber) || sourceHoles[index] || {};
      return {
        holeNumber: fallbackHole.holeNumber,
        par: Math.max(3, Math.min(6, Number(sourceHole.par) || fallbackHole.par)),
      };
    });
    return {
      id: course?.id || uid("course"),
      name: course?.name || `Course ${courseIndex + 1}`,
      holes,
    };
  });
  if (!clean.courses.length) clean.courses.push(defaultCourse());
  clean.players = clean.players.map((player) => ({
    id: player.id || uid("player"),
    name: player.name || "Player",
    active: player.active !== false,
  }));
  clean.rounds = clean.rounds.map((round) => {
    const teams = Array.isArray(round.teams)
      ? round.teams.map((team) => ({
        id: team?.id || uid("team"),
        playerIds: Array.isArray(team?.playerIds) ? team.playerIds.filter((id) => typeof id === "string") : [],
      }))
      : [];
    const teamIds = new Set(teams.map((team) => team.id));
    const scoresByHole = {};
    if (round.scoresByHole && typeof round.scoresByHole === "object") {
      Object.entries(round.scoresByHole).forEach(([teamId, scores]) => {
        if (!teamIds.has(teamId) || !scores || typeof scores !== "object") return;
        const cleanScores = {};
        Object.entries(scores).forEach(([holeNumber, value]) => {
          const hole = Math.max(1, Math.min(18, Number(holeNumber) || 0));
          const score = Math.max(1, Math.min(12, Number(value) || 0));
          if (hole && score) cleanScores[hole] = score;
        });
        scoresByHole[teamId] = cleanScores;
      });
    }
    return {
      id: round.id || uid("round"),
      name: round.name || "Round",
      gameMode: GAME_MODES[round.gameMode === "STROKE_PLAY" ? "MATCH_PLAY" : round.gameMode] ? (round.gameMode === "STROKE_PLAY" ? "MATCH_PLAY" : round.gameMode) : "SCRAMBLE",
      courseId: round.courseId || clean.courses[0].id,
      teams,
      scoresByHole,
      awards: {
        longestDrivePlayerId: round.awards?.longestDrivePlayerId || "",
        nearestPinPlayerId: round.awards?.nearestPinPlayerId || "",
      },
      clutchHole: Number(round.clutchHole) || 18,
      clutchEnabled: round.clutchEnabled !== false,
      longestDriveHole: Number(round.longestDriveHole) || 9,
      nearestPinHole: Number(round.nearestPinHole) || 12,
      notes: round.notes || "",
      status: Object.values(STATES).includes(round.status) ? round.status : STATES.NOT_STARTED,
      locked: Boolean(round.locked),
      updatedAt: round.updatedAt || todayIso(),
    };
  });
  return clean;
}

function saveState() {
  const next = { ...state, lastView: view, lastRoundId: activeRoundId };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    storageWarning = "";
    return true;
  } catch (error) {
    storageWarning = "Changes are only kept until this tab closes. Browser storage is unavailable.";
    console.warn("Save failed.", error);
    return false;
  }
}

function setState(mutator) {
  const draft = cloneData(state);
  mutator(draft);
  state = normalizeData(draft);
  saveState();
  render();
}

function cloneData(value) {
  if (typeof structuredClone === "function") return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

function courseFor(round) {
  return state.courses.find((course) => course.id === round.courseId) || state.courses[0] || defaultCourse();
}

function playerName(playerId) {
  return state.players.find((player) => player.id === playerId)?.name || "Unknown";
}

function gameModeFor(round) {
  return GAME_MODES[round?.gameMode] || GAME_MODES.SCRAMBLE;
}

function isIndividualMode(round) {
  return ["player", "match"].includes(gameModeFor(round).scoring);
}

function isMatchPlay(round) {
  return gameModeFor(round).scoring === "match";
}

function teamLabel(team, round = null) {
  if (round && isIndividualMode(round)) return playerName(team.playerIds[0]) || "Empty player";
  return team.playerIds.map(playerName).join(" / ") || "Empty team";
}

function teamShortLabel(team) {
  const names = team.playerIds.map(playerName).filter((name) => name !== "Unknown");
  if (!names.length) return "Empty";
  return names.map((name) => name.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase()).join(" / ");
}

function nextActionRound() {
  return state.rounds.find((round) => round.status === STATES.IN_PROGRESS)
    || state.rounds.find((round) => round.status === STATES.NOT_STARTED)
    || state.rounds[0];
}

function activePlayers(data = state) {
  return data.players.filter((player) => player.active);
}

function roundHasSourceData(round) {
  const hasScores = Object.values(round.scoresByHole || {}).some((scores) => Object.keys(scores || {}).length > 0);
  return hasScores || Boolean(round.awards.longestDrivePlayerId || round.awards.nearestPinPlayerId) || round.status !== STATES.NOT_STARTED;
}

function playerIsUsed(playerId, data = state) {
  return data.rounds.some((round) => {
    if (!roundHasSourceData(round)) return false;
    const onTeam = round.teams.some((team) => team.playerIds.includes(playerId));
    const hasAward = round.awards.longestDrivePlayerId === playerId || round.awards.nearestPinPlayerId === playerId;
    return onTeam || hasAward;
  });
}

function courseHasSourceData(courseId, data = state) {
  return data.rounds.some((round) => round.courseId === courseId && roundHasSourceData(round));
}

function teamScore(round, teamId, holeNumber) {
  return round.scoresByHole?.[teamId]?.[holeNumber] ?? "";
}

function scoredHoleCount(round, course) {
  return scoringTeams(round).reduce((count, team) => {
    return count + course.holes.filter((hole) => team.playerIds.length > 0 && teamScore(round, team.id, hole.holeNumber) !== "").length;
  }, 0);
}

function expectedScoreCount(round, course) {
  return scoringTeams(round).length * course.holes.length;
}
function playableTeams(round) {
  return round.teams.filter((team) => team.playerIds.length > 0);
}

function scoringTeams(round) {
  return isMatchPlay(round) ? round.teams : playableTeams(round);
}

function scoringEntityName(round) {
  return isIndividualMode(round) ? "players" : "teams";
}

function hasValidMatchPairings(round) {
  return !isMatchPlay(round) || (round.teams.length >= 2 && round.teams.length % 2 === 0 && round.teams.every((team) => team.playerIds.length > 0));
}

function roundPlayerIds(round) {
  return new Set(round.teams.flatMap((team) => team.playerIds));
}

function cleanRoundAwards(round) {
  const assigned = roundPlayerIds(round);
  if (!assigned.has(round.awards.longestDrivePlayerId)) round.awards.longestDrivePlayerId = "";
  if (!assigned.has(round.awards.nearestPinPlayerId)) round.awards.nearestPinPlayerId = "";
}

function isRoundComplete(round, course) {
  const scoringGroups = playableTeams(round);
  const hasEnoughGroups = scoringGroups.length >= 2 && hasValidMatchPairings(round);
  const allScored = hasEnoughGroups && scoredHoleCount(round, course) === expectedScoreCount(round, course);
  return Boolean(allScored && round.awards.longestDrivePlayerId && round.awards.nearestPinPlayerId);
}

function derivedRoundStatus(round, course) {
  if (round.status === STATES.COMPLETE && isRoundComplete(round, course)) return STATES.COMPLETE;
  if (scoredHoleCount(round, course) > 0 || round.awards.longestDrivePlayerId || round.awards.nearestPinPlayerId) return STATES.IN_PROGRESS;
  return STATES.NOT_STARTED;
}

export function calculateTeamTotal(round, teamId) {
  const scores = round.scoresByHole?.[teamId] || {};
  return Object.values(scores).reduce((sum, value) => sum + (Number(value) || 0), 0);
}

function stablefordHolePoints(score, par) {
  if (!Number.isFinite(score) || !Number.isFinite(par)) return 0;
  const diff = score - par;
  if (diff <= -3) return 5;
  if (diff === -2) return 4;
  if (diff === -1) return 3;
  if (diff === 0) return 2;
  if (diff === 1) return 1;
  return 0;
}

function calculateStablefordTotal(round, teamId, course = courseFor(round)) {
  const scores = round.scoresByHole?.[teamId] || {};
  return course.holes.reduce((sum, hole) => sum + stablefordHolePoints(Number(scores[hole.holeNumber]), hole.par), 0);
}

function calculateScoringTotal(round, teamId, course = courseFor(round)) {
  return round.gameMode === "STABLEFORD" ? calculateStablefordTotal(round, teamId, course) : calculateTeamTotal(round, teamId);
}

function matchOpponent(round, teamId) {
  const teams = scoringTeams(round);
  const index = teams.findIndex((team) => team.id === teamId);
  if (index < 0) return null;
  const opponent = teams[index % 2 === 0 ? index + 1 : index - 1] || null;
  return opponent?.playerIds.length ? opponent : null;
}

function calculateMatchPlayResult(round, teamId, course = courseFor(round)) {
  const opponent = matchOpponent(round, teamId);
  const result = { holesWon: 0, holesLost: 0, holesTied: 0, holesPlayed: 0, result: "—" };
  if (!opponent) return result;
  course.holes.forEach((hole) => {
    const score = Number(round.scoresByHole?.[teamId]?.[hole.holeNumber]);
    const opponentScore = Number(round.scoresByHole?.[opponent.id]?.[hole.holeNumber]);
    if (!Number.isFinite(score) || !Number.isFinite(opponentScore)) return;
    result.holesPlayed += 1;
    if (score < opponentScore) result.holesWon += 1;
    else if (score > opponentScore) result.holesLost += 1;
    else result.holesTied += 1;
  });
  if (result.holesPlayed === 0) result.result = "—";
  else if (result.holesWon > result.holesLost) result.result = "Win";
  else if (result.holesWon < result.holesLost) result.result = "Loss";
  else result.result = "Tie";
  return result;
}

function matchPlayLabel(round, teamId, course = courseFor(round)) {
  const result = calculateMatchPlayResult(round, teamId, course);
  if (result.result === "—") return "—";
  const margin = result.holesWon - result.holesLost;
  if (margin === 0) return "AS";
  return `${Math.abs(margin)} ${margin > 0 ? "up" : "down"}`;
}

function teamHasScores(round, teamId) {
  return Object.keys(round.scoresByHole?.[teamId] || {}).length > 0;
}

function displayScoringTotal(round, teamId, course = courseFor(round)) {
  if (!teamHasScores(round, teamId)) return "—";
  if (isMatchPlay(round)) return matchPlayLabel(round, teamId, course);
  return calculateScoringTotal(round, teamId, course);
}

export function calculateRoundWinner(round, course = courseFor(round)) {
  if (round.status !== STATES.COMPLETE) return [];
  if (isMatchPlay(round)) {
    return playableTeams(round)
      .filter((team) => calculateMatchPlayResult(round, team.id, course).result === "Win")
      .map((team) => team.id);
  }
  const mode = gameModeFor(round);
  const totals = playableTeams(round).map((team) => ({ teamId: team.id, total: calculateScoringTotal(round, team.id, course) }));
  if (!totals.length) return [];
  const target = mode.higherWins ? Math.max(...totals.map((entry) => entry.total)) : Math.min(...totals.map((entry) => entry.total));
  return totals.filter((entry) => entry.total === target).map((entry) => entry.teamId);
}

export function calculateClutchWinner(round) {
  if (round.status !== STATES.COMPLETE || round.clutchEnabled === false) return "";
  const hole = String(round.clutchHole);
  const scores = playableTeams(round)
    .map((team) => ({ teamId: team.id, score: Number(round.scoresByHole?.[team.id]?.[hole]) }))
    .filter((entry) => Number.isFinite(entry.score));
  const low = Math.min(...scores.map((entry) => entry.score));
  const winners = scores.filter((entry) => entry.score === low);
  return winners.length === 1 ? winners[0].teamId : "";
}

export function calculatePlayerPoints(round, playerId, points = DEFAULT_POINTS, course = courseFor(round)) {
  return calculatePlayerPointBreakdown(round, playerId, points, course).total;
}

function calculatePlayerPointBreakdown(round, playerId, points = DEFAULT_POINTS, course = courseFor(round)) {
  const empty = {
    total: 0,
    resultPoints: 0,
    clutchPoints: 0,
    longestDrivePoints: 0,
    nearestPinPoints: 0,
    result: "—",
  };
  if (round.status !== STATES.COMPLETE) return empty;
  const playerTeam = round.teams.find((team) => team.playerIds.includes(playerId));
  if (!playerTeam) return empty;
  const winners = calculateRoundWinner(round, course);
  const teamCount = playableTeams(round).length;
  const breakdown = { ...empty };

  if (isMatchPlay(round)) {
    const match = calculateMatchPlayResult(round, playerTeam.id, course);
    breakdown.result = match.result;
    if (match.result === "Win") breakdown.resultPoints = points.win;
    else if (match.result === "Tie") breakdown.resultPoints = points.tie;
    else if (match.result === "Loss") breakdown.resultPoints = points.loss;
  } else {
    const tiedWin = winners.length > 1 && winners.includes(playerTeam.id);
    if (tiedWin) {
      breakdown.resultPoints = points.tie;
      breakdown.result = "Tie";
    } else if (winners.includes(playerTeam.id)) {
      breakdown.resultPoints = points.win;
      breakdown.result = "Win";
    } else if (teamCount > 1) {
      breakdown.resultPoints = points.loss;
      breakdown.result = "Loss";
    }
  }

  breakdown.clutchPoints = round.clutchEnabled === false ? 0 : calculateClutchWinner(round) === playerTeam.id ? points.clutch : 0;
  breakdown.longestDrivePoints = round.awards.longestDrivePlayerId === playerId ? points.longestDrive : 0;
  breakdown.nearestPinPoints = round.awards.nearestPinPlayerId === playerId ? points.nearestPin : 0;
  breakdown.total = breakdown.resultPoints + breakdown.clutchPoints + breakdown.longestDrivePoints + breakdown.nearestPinPoints;
  return breakdown;
}

export function calculateLeaderboard(data, points = DEFAULT_POINTS) {
  const rows = data.players
    .filter((player) => {
      if (player.active) return true;
      return data.rounds.some((round) => {
        if (round.status !== STATES.COMPLETE) return false;
        const onTeam = round.teams.some((team) => team.playerIds.includes(player.id));
        const hasAward = round.awards.longestDrivePlayerId === player.id || round.awards.nearestPinPlayerId === player.id;
        return onTeam || hasAward;
      });
    })
    .map((player) => {
      const completedRounds = data.rounds.filter((round) => round.status === STATES.COMPLETE);
      const roundBreakdowns = completedRounds.map((round) => {
        const course = data.courses.find((item) => item.id === round.courseId) || data.courses[0] || defaultCourse();
        return {
          roundId: round.id,
          roundName: round.name,
          gameMode: round.gameMode || "SCRAMBLE",
          ...calculatePlayerPointBreakdown(round, player.id, points, course),
        };
      });
      return {
        playerId: player.id,
        name: player.name,
        points: roundBreakdowns.reduce((sum, round) => sum + round.total, 0),
        roundsPlayed: roundBreakdowns.filter((round) => round.total > 0 || round.result !== "—").length,
        wins: roundBreakdowns.filter((round) => round.result === "Win").length,
        ties: roundBreakdowns.filter((round) => round.result === "Tie").length,
        losses: roundBreakdowns.filter((round) => round.result === "Loss").length,
        clutchPoints: roundBreakdowns.reduce((sum, round) => sum + round.clutchPoints, 0),
        longestDrivePoints: roundBreakdowns.reduce((sum, round) => sum + round.longestDrivePoints, 0),
        nearestPinPoints: roundBreakdowns.reduce((sum, round) => sum + round.nearestPinPoints, 0),
        resultPoints: roundBreakdowns.reduce((sum, round) => sum + round.resultPoints, 0),
        lastRoundPoints: roundBreakdowns.at(-1)?.total || 0,
        roundBreakdowns,
      };
    })
    .sort((a, b) => b.points - a.points || a.name.localeCompare(b.name));

  let previousPoints = null;
  let previousRank = 0;
  return rows.map((row, index) => {
    const rank = row.points === previousPoints ? previousRank : index + 1;
    previousPoints = row.points;
    previousRank = rank;
    return { ...row, rank };
  });
}


function leaderboardDataThrough(roundId) {
  if (!roundId || roundId === "all") return state;
  const index = state.rounds.findIndex((round) => round.id === roundId);
  if (index < 0) return state;
  return { ...state, rounds: state.rounds.slice(0, index + 1) };
}

function calculateLeaderboardTrends(data) {
  const completedRounds = data.rounds.filter((round) => round.status === STATES.COMPLETE);
  const lastCompleted = completedRounds.at(-1);
  const currentRows = calculateLeaderboard(data);
  if (!lastCompleted || completedRounds.length < 2) {
    return currentRows.map((row) => ({ ...row, trend: "flat", previousRank: row.rank }));
  }

  const previousData = {
    ...data,
    rounds: data.rounds.filter((round) => round.id !== lastCompleted.id),
  };
  const previousRanks = new Map(calculateLeaderboard(previousData).map((row) => [row.playerId, row.rank]));

  return currentRows.map((row) => {
    const previousRank = previousRanks.get(row.playerId);
    let trend = "flat";
    const movement = previousRank ? previousRank - row.rank : 0;
    if (movement > 0) trend = "up";
    else if (movement < 0) trend = "down";
    return { ...row, trend, previousRank: previousRank || row.rank };
  });
}
function syncRoundStatus(draft, roundId, forceComplete = false) {
  const round = draft.rounds.find((item) => item.id === roundId);
  if (!round) return;
  const course = draft.courses.find((item) => item.id === round.courseId) || draft.courses[0];
  if (!course) return;
  round.status = forceComplete ? STATES.COMPLETE : derivedRoundStatus(round, course);
  if (round.status === STATES.COMPLETE && !isRoundComplete(round, course)) {
    round.status = derivedRoundStatus(round, course);
  }
  round.updatedAt = todayIso();
}

function go(nextView, roundId = activeRoundId) {
  view = nextView;
  activeRoundId = roundId || activeRoundId;
  selectedLeaderboardPlayerId = "";
  pendingResetRoundId = "";
  saveState();
  render();
}

function h(strings, ...values) {
  return strings.reduce((html, part, index) => html + part + (values[index] ?? ""), "");
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function statusLabel(status) {
  return {
    [STATES.NOT_STARTED]: "⬜ Not started",
    [STATES.IN_PROGRESS]: "🟡 In progress",
    [STATES.COMPLETE]: "✅ Complete",
  }[status];
}

function trendSymbol(row) {
  if (!row || row.trend === "flat" || row.previousRank === row.rank) return "–";
  const symbol = row.trend === "up" ? "▲" : "▼";
  return symbol + " " + row.previousRank + "→" + row.rank;
}

function trendLabel(trend) {
  return { up: "Moved up", down: "Moved down", flat: "No change" }[trend] || "No change";
}


function render() {
  const app = document.querySelector("#app");
  app.innerHTML = h`
    <header class="topbar">
      <div class="brand">
        <h1>Golf Trip App</h1>
        ${view === "leaderboard" ? `<button class="icon-btn" data-export-image aria-label="Export leaderboard image" title="Export leaderboard image">⇩</button>` : ""}
      </div>
    </header>
    <main class="main">${storageWarning ? `<section class="card warning">${escapeHtml(storageWarning)}</section>` : ""}${renderView()}</main>
    <nav class="bottom-nav">
      <button class="nav-btn ${view === "rounds" || view === "round" || view === "summary" ? "active" : ""}" data-go="rounds">Rounds</button>
      <button class="nav-btn ${view === "leaderboard" ? "active" : ""}" data-go="leaderboard">Leaderboard</button>
      <button class="nav-btn ${view === "setup" ? "active" : ""}" data-go="setup">Setup</button>
    </nav>
  `;
  bindEvents(app);
}

function renderView() {
  if (view === "leaderboard") return renderLeaderboard();
  if (view === "setup") return renderSetup();
  if (view === "round") return renderRound();
  if (view === "summary") return renderRoundSummary();
  return renderDashboard();
}

function renderDashboard() {
  const resumeRound = nextActionRound();
  const nextText = resumeRound
    ? `${resumeRound.status === STATES.COMPLETE ? "Review" : "Enter scores for"} ${resumeRound.name}`
    : "Start setup";
  return h`
    <section class="hero-panel">
      <p class="tiny">Next action</p>
      <h2 class="screen-title">${escapeHtml(nextText)}</h2>
      <p>${resumeRound ? `${escapeHtml(courseFor(resumeRound).name)} · ${statusLabel(derivedRoundStatus(resumeRound, courseFor(resumeRound)))}` : "Add players, courses, and your first round."}</p>
      <button class="primary" data-open-round="${resumeRound?.id || ""}">${resumeRound ? "Open round" : "Open setup"}</button>
    </section>
    <section class="section">
      <div class="button-grid">
        <button class="secondary" data-go="leaderboard">View Leaderboard</button>
        <button class="ghost" data-go="setup">Setup</button>
      </div>
    </section>
    <section class="section">
      <div class="section-header"><h2>Rounds</h2><span class="tiny">${state.rounds.length} scheduled</span></div>
      <div class="stack">
        ${state.rounds.map((round) => {
          const course = courseFor(round);
          const status = derivedRoundStatus(round, course);
          const completeText = `${scoredHoleCount(round, course)} / ${expectedScoreCount(round, course)} scores`;
          return h`
            <article class="card round-item">
              <div class="row">
                <div>
                  <strong>${escapeHtml(round.name)}</strong>
                  <div class="tiny">${escapeHtml(course.name)} · ${gameModeFor(round).label} · ${completeText}</div>
                </div>
                <span class="status ${status}">${statusLabel(status)}</span>
              </div>
              <button class="primary" data-open-round="${round.id}">Open round</button>
            </article>
          `;
        }).join("") || `<div class="card">No rounds yet.</div>`}
      </div>
    </section>
  `;
}
function renderRoundScoreSummary(round) {
  const course = courseFor(round);
  const mode = gameModeFor(round);
  const teams = playableTeams(round).map((team) => ({ team, total: calculateScoringTotal(round, team.id, course) }));
  const entered = scoredHoleCount(round, course);
  const expected = expectedScoreCount(round, course);
  return h`
    <section class="section card score-summary">
      <div class="section-header"><h2>Round totals</h2><span class="tiny">${mode.totalLabel} · ${entered} / ${expected} scores entered</span></div>
      <div class="summary-grid">
        ${teams.map(({ team }) => `<div><span>${escapeHtml(isIndividualMode(round) ? teamLabel(team, round) : teamShortLabel(team))}</span><strong>${displayScoringTotal(round, team.id, course)}</strong></div>`).join("")}
      </div>
    </section>
  `;
}

function renderRound() {
  const round = state.rounds.find((item) => item.id === activeRoundId) || state.rounds[0];
  if (!round) return `<section class="card">Create a round in Setup to start.</section>`;
  const course = courseFor(round);
  const complete = isRoundComplete(round, course);
  const missing = [];
  const missingScores = expectedScoreCount(round, course) - scoredHoleCount(round, course);
  if (!complete) {
    if (playableTeams(round).length < 2) missing.push("2 " + scoringEntityName(round) + " required");
    if (!hasValidMatchPairings(round)) missing.push("complete match pairings");
    if (missingScores > 0) missing.push(missingScores + " score" + (missingScores === 1 ? "" : "s"));
    if (!round.awards.longestDrivePlayerId) missing.push("LD not selected");
    if (!round.awards.nearestPinPlayerId) missing.push("NP not selected");
  }
  return h`
    <section class="section">
      <div class="row wrap">
        <div>
          <h2 class="screen-title">${escapeHtml(round.name)}</h2>
          <div class="muted">${escapeHtml(course.name)} · ${gameModeFor(round).label} · ${round.locked ? "Locked" : statusLabel(derivedRoundStatus(round, course))}</div>
        </div>
        <button class="${round.locked ? "secondary" : "ghost"}" data-toggle-lock="${round.id}">${round.locked ? "Unlock" : "Lock"}</button>
      </div>
    </section>
    ${missing.length ? `<section class="section card warning">Missing ${missing.join(" · ")}.</section>` : ""}
    ${renderRoundScoreSummary(round)}
    <section class="section stack">
      ${scoringTeams(round).filter((team) => team.playerIds.length > 0).map((team) => renderScorecard(round, course, team)).join("") || `<div class="card warning">Assign players in Setup before entering scores.</div>`}
    </section>
    <section class="section card">
      <div class="section-header"><h2>Awards</h2><span class="tiny">Bonus points</span></div>
      <div class="form-grid">
        <label class="field"><span>Longest Drive · hole ${round.longestDriveHole}</span>
          <select class="select" data-award="longestDrivePlayerId" ${round.locked ? "disabled" : ""}>
            <option value="">Select player</option>
            ${renderPlayerOptions(round.awards.longestDrivePlayerId, round)}
          </select>
        </label>
        <label class="field"><span>Nearest Pin · hole ${round.nearestPinHole}</span>
          <select class="select" data-award="nearestPinPlayerId" ${round.locked ? "disabled" : ""}>
            <option value="">Select player</option>
            ${renderPlayerOptions(round.awards.nearestPinPlayerId, round)}
          </select>
        </label>
      </div>
    </section>
    <section class="section card">
      <label class="field"><span>Round notes</span><textarea class="input" rows="3" data-round-notes="${round.id}" ${round.locked ? "disabled" : ""}>${escapeHtml(round.notes || "")}</textarea></label>
    </section>
    <section class="sticky-actions">
      <button class="danger ${pendingResetRoundId === round.id ? "confirming" : ""}" data-reset-round="${round.id}" ${round.locked ? "disabled" : ""}>${pendingResetRoundId === round.id ? "Tap again to reset" : "Reset"}</button>
      <button class="primary" data-complete-round="${round.id}" ${round.locked || !complete ? "disabled" : ""}>Complete Round</button>
    </section>
  `;
}

function renderPlayerOptions(selectedId = "", round = null) {
  const allowedIds = round ? roundPlayerIds(round) : null;
  return state.players
    .filter((player) => !allowedIds || allowedIds.has(player.id) || player.id === selectedId)
    .filter((player) => player.active || allowedIds?.has(player.id) || player.id === selectedId)
    .map((player) => `<option value="${player.id}" ${player.id === selectedId ? "selected" : ""}>${escapeHtml(player.name)}${player.active ? "" : " (inactive)"}</option>`)
    .join("");
}
function renderScorecard(round, course, team) {
  return h`
    <details class="card scorecard" open>
      <summary class="scorecard-head row">
        <div>
          <strong>${escapeHtml(teamLabel(team, round))}</strong>
          <div class="tiny">${isMatchPlay(round) ? "vs " + escapeHtml(teamLabel(matchOpponent(round, team.id) || { playerIds: [] }, round)) : round.gameMode === "STABLEFORD" ? "Stableford points calculate from strokes" : teamShortLabel(team) + " · adjust with plus/minus"}</div>
        </div>
        <span class="pill">${displayScoringTotal(round, team.id, course)}</span>
      </summary>
      <table class="score-table">
        <thead><tr><th>Hole</th><th>Par</th><th>Score</th></tr></thead>
        <tbody>
          ${course.holes.map((hole) => {
            const value = teamScore(round, team.id, hole.holeNumber);
            return h`
              <tr class="${value === "" ? "missing" : ""}">
                <td>${hole.holeNumber}</td>
                <td>${hole.par}</td>
                <td>
                  <div class="score-entry">
                    <div class="score-stepper">
                      <button data-score-change="${round.id}|${team.id}|${hole.holeNumber}|-1" ${round.locked ? "disabled" : ""}>−</button>
                      <span class="score-value">${value === "" ? "—" : value}</span>
                      <button data-score-change="${round.id}|${team.id}|${hole.holeNumber}|1" ${round.locked ? "disabled" : ""}>+</button>
                    </div>
                  </div>
                </td>
              </tr>
            `;
          }).join("")}
        </tbody>
      </table>
    </details>
  `;
}

function renderLeaderboard() {
  const completedRounds = state.rounds.filter((round) => round.status === STATES.COMPLETE);
  if (leaderboardRoundId !== "all" && !completedRounds.some((round) => round.id === leaderboardRoundId)) leaderboardRoundId = "all";
  const leaderboardData = leaderboardDataThrough(leaderboardRoundId);
  const leaderboard = calculateLeaderboardTrends(leaderboardData);
  const clutchActive = leaderboardData.rounds.some((round) => round.status === STATES.COMPLETE && round.clutchEnabled !== false);
  const leaders = leaderboard.filter((row) => row.rank === 1);
  const leaderPoints = leaders[0]?.points ?? 0;
  const leaderNames = leaders.map((row) => row.name).join(" / ");
  const completedCount = leaderboardData.rounds.filter((round) => round.status === STATES.COMPLETE).length;
  const historyLabel = leaderboardRoundId === "all" ? "Latest standings" : `After ${state.rounds.find((round) => round.id === leaderboardRoundId)?.name || "selected round"}`;
  return h`
    <section class="leader-hero">
      <h2 class="screen-title">🏆 Golf Trip Leaderboard</h2>
      <p class="muted">${completedCount} completed round${completedCount === 1 ? "" : "s"} · ${leaders.length > 1 ? "current leaders" : "current leader"}</p>
      <div class="points">${leaderPoints}</div>
      <strong>${leaderNames || "No players yet"}</strong>
    </section>
    <section class="section card history-card">
      <label class="field"><span>Leaderboard view</span>
        <select class="select" data-leaderboard-round>
          <option value="all" ${leaderboardRoundId === "all" ? "selected" : ""}>Latest standings</option>
          ${completedRounds.map((round) => `<option value="${round.id}" ${leaderboardRoundId === round.id ? "selected" : ""}>After ${escapeHtml(round.name)}</option>`).join("")}
        </select>
      </label>
      <div class="tiny">${escapeHtml(historyLabel)} · movement compares against the previous completed round.</div>
    </section>
    <section class="card" id="leaderboard-card">
      <table class="leaderboard">
        <thead><tr><th>Rank</th><th>Move</th><th>Player</th><th>Details</th><th>Points</th></tr></thead>
        <tbody>
          ${leaderboard.map((row) => h`
            <tr class="rank-${row.rank <= 3 ? row.rank : ""}">
              <td data-label="Rank">${row.rank}</td>
              <td data-label="Move"><span class="trend trend-${row.trend}" aria-label="${trendLabel(row.trend)}" title="${trendLabel(row.trend)}">${trendSymbol(row)}</span></td>
              <td data-label="Player"><button class="leader-name" data-leader-player="${row.playerId}">${escapeHtml(row.name)}</button></td>
              <td data-label="Bonus">
                <div class="leader-detail">
                  <span>LD ${row.longestDrivePoints}</span>
                  <span>NP ${row.nearestPinPoints}</span>
                  ${clutchActive ? `<span>Clutch ${row.clutchPoints}</span>` : ""}
                </div>
              </td>
              <td data-label="Points">${row.points}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </section>
    ${renderLeaderboardBreakdown(leaderboard)}
  `;
}

function renderLeaderboardBreakdown(leaderboard) {
  const selected = leaderboard.find((row) => row.playerId === selectedLeaderboardPlayerId);
  if (!selected) return "";
  return h`
    <section class="section card point-breakdown">
      <div class="row">
        <div>
          <h2>${escapeHtml(selected.name)}</h2>
          <div class="tiny">${selected.points} total points</div>
        </div>
        <button class="ghost" data-close-breakdown>Close</button>
      </div>
      <div class="breakdown-total-grid">
        <div><strong>${selected.resultPoints}</strong><span>Result</span></div>
        <div><strong>${selected.longestDrivePoints}</strong><span>LD</span></div>
        <div><strong>${selected.nearestPinPoints}</strong><span>NP</span></div>
        ${selected.clutchPoints > 0 ? `<div><strong>${selected.clutchPoints}</strong><span>Clutch</span></div>` : ""}
      </div>
      <div class="stack">
        ${selected.roundBreakdowns.map((round) => h`
          <article class="breakdown-round">
            <div class="row">
              <div><strong>${escapeHtml(round.roundName)}</strong><div class="tiny">${gameModeFor(round).label}</div></div>
              <span class="pill">${round.total}</span>
            </div>
            <div class="round-points">
              <span>${round.result}: ${round.resultPoints}</span>
              ${round.longestDrivePoints ? `<span>LD +${round.longestDrivePoints}</span>` : ""}
              ${round.nearestPinPoints ? `<span>NP +${round.nearestPinPoints}</span>` : ""}
              ${round.clutchPoints ? `<span>Clutch +${round.clutchPoints}</span>` : ""}
            </div>
          </article>
        `).join("") || `<div class="tiny">No completed rounds yet.</div>`}
      </div>
    </section>
  `;
}


function renderRoundSummary() {
  const round = state.rounds.find((item) => item.id === activeRoundId && item.status === STATES.COMPLETE) || state.rounds.find((item) => item.status === STATES.COMPLETE);
  if (!round) return `<section class="card">Complete a round to see a summary.</section>`;
  const course = courseFor(round);
  const teams = playableTeams(round);
  const winners = calculateRoundWinner(round, course);
  const clutchTeamId = calculateClutchWinner(round);
  const clutchTeam = teams.find((team) => team.id === clutchTeamId);
  const playerIds = [...new Set(teams.flatMap((team) => team.playerIds))];
  return h`
    <section class="hero-panel summary-hero">
      <p class="tiny">Round complete</p>
      <h2 class="screen-title">${escapeHtml(round.name)}</h2>
      <p>${escapeHtml(course.name)} · ${gameModeFor(round).label}</p>
    </section>
    <section class="section stack">
      ${teams.map((team) => {
        const winner = winners.includes(team.id);
        return h`
          <article class="card summary-team ${winner ? "summary-winner" : ""}">
            <div class="row">
              <div>
                <strong>${escapeHtml(teamLabel(team, round))}</strong>
                <div class="tiny">${winner ? "Winning " + (isIndividualMode(round) ? "player" : "team") : gameModeFor(round).totalLabel}</div>
              </div>
              <span class="pill">${displayScoringTotal(round, team.id, course)}</span>
            </div>
          </article>
        `;
      }).join("")}
    </section>
    <section class="section card point-breakdown">
      <div class="section-header"><h2>Awards</h2><span class="tiny">Bonus points</span></div>
      <div class="round-points">
        <span>LD: ${escapeHtml(playerName(round.awards.longestDrivePlayerId))}</span>
        <span>NP: ${escapeHtml(playerName(round.awards.nearestPinPlayerId))}</span>
        ${round.clutchEnabled === false ? "" : `<span>Clutch: ${clutchTeam ? escapeHtml(teamLabel(clutchTeam, round)) : "No winner"}</span>`}
      </div>
    </section>
    <section class="section card point-breakdown">
      <div class="section-header"><h2>Points Awarded</h2><span class="tiny">This round</span></div>
      <div class="stack">
        ${playerIds.map((playerId) => {
          const points = calculatePlayerPoints(round, playerId, DEFAULT_POINTS, course);
          return `<div class="row"><strong>${escapeHtml(playerName(playerId))}</strong><span class="pill">${points}</span></div>`;
        }).join("") || `<div class="tiny">No players assigned.</div>`}
      </div>
    </section>
    <section class="section button-grid">
      <button class="secondary" data-open-round="${round.id}">Edit Round</button>
      <button class="primary" data-go="leaderboard">View Leaderboard</button>
    </section>
  `;
}


function renderTeamSetupBlock(round, team, teamIndex, disabled) {
  return h`
    <div class="team-block">
      <div class="row">
        <strong>${isIndividualMode(round) ? "Player" : "Team"} ${teamIndex + 1} · ${escapeHtml(isIndividualMode(round) ? teamLabel(team, round) : teamShortLabel(team))}</strong>
        <button class="ghost" data-remove-team="${round.id}|${team.id}" ${disabled ? "disabled" : ""}>Remove</button>
      </div>
      <div class="team-picker">
        ${activePlayers().map((player) => `<button class="chip ${team.playerIds.includes(player.id) ? "selected" : ""}" data-toggle-team-player="${round.id}|${team.id}|${player.id}" ${disabled ? "disabled" : ""}>${escapeHtml(player.name)}</button>`).join("")}
      </div>
    </div>
  `;
}

function renderMatchPlayerOptions(team, round) {
  const selectedId = team.playerIds[0] || "";
  const assignedToOtherCard = new Set(round.teams
    .filter((item) => item.id !== team.id)
    .flatMap((item) => item.playerIds));
  return [
    `<option value="">Select player</option>`,
    ...state.players
      .filter((player) => player.active || player.id === selectedId)
      .map((player) => {
        const assigned = assignedToOtherCard.has(player.id);
        const label = `${player.name}${player.active ? "" : " (inactive)"}${assigned ? " · currently in another match" : ""}`;
        return `<option value="${player.id}" ${player.id === selectedId ? "selected" : ""}>${escapeHtml(label)}</option>`;
      }),
  ].join("");
}

function renderMatchPairingsSetup(round, disabled) {
  const pairs = [];
  for (let index = 0; index < scoringTeams(round).length; index += 2) {
    pairs.push(scoringTeams(round).slice(index, index + 2));
  }
  return h`
    <div class="match-pair-grid">
      ${pairs.map((pair, pairIndex) => {
        const [first, second] = pair;
        return h`
          <div class="match-pair-card">
            <div class="match-pair-head">
              <strong>Match ${pairIndex + 1}</strong>
              <span>${escapeHtml(teamLabel(first, round))} vs ${second ? escapeHtml(teamLabel(second, round)) : "Needs opponent"}</span>
            </div>
            ${pair.map((team, offset) => h`
              <div class="match-slot">
                <label class="field">
                  <span>Player ${offset === 0 ? "A" : "B"}</span>
                  <select class="select" data-set-team-player="${round.id}|${team.id}" ${disabled ? "disabled" : ""}>
                    ${renderMatchPlayerOptions(team, round)}
                  </select>
                </label>
                <button class="ghost" data-remove-team="${round.id}|${team.id}" ${disabled ? "disabled" : ""}>Remove</button>
              </div>
            `).join("")}
            ${second ? "" : `<div class="warning setup-warning">Add one more player card to complete this match.</div>`}
          </div>
        `;
      }).join("")}
    </div>
  `;
}

function renderBackupSetup() {
  return h`
    <div class="stack">
      <article class="card form-grid">
        <div>
          <strong>Trip backup</strong>
          <div class="tiny">Exports players, courses, rounds, scores, awards, teams, and locks. No calculated leaderboard data is stored.</div>
        </div>
        <button class="primary" data-export-backup>Export backup</button>
        <label class="field"><span>Restore backup</span><input class="input" type="file" accept="application/json" data-import-backup /></label>
      </article>
    </div>
  `;
}


function renderSetup() {
  return h`
    <section>
      <h2 class="screen-title">Setup</h2>
      <div class="tabs">
        ${[{ id: "players", label: "Players" }, { id: "courses", label: "Courses" }, { id: "rounds", label: "Rounds" }, { id: "backup", label: "Settings" }].map((tab) => `<button class="tab ${setupTab === tab.id ? "active" : ""}" data-setup-tab="${tab.id}">${tab.label}</button>`).join("")}
      </div>
      ${setupTab === "players" ? renderPlayersSetup() : setupTab === "courses" ? renderCoursesSetup() : setupTab === "rounds" ? renderRoundsSetup() : renderBackupSetup()}
    </section>
  `;
}

function renderPlayersSetup() {
  return h`
    <div class="stack">
      <form class="card form-grid" data-add-player>
        <label class="field"><span>Name</span><input class="input" name="name" required /></label>
        <button class="primary">Add player</button>
      </form>
      ${state.players.map((player) => {
        const used = playerIsUsed(player.id);
        return h`
          <article class="card form-grid">
            <label class="field"><span>Player</span><input class="input" value="${escapeHtml(player.name)}" data-player-name="${player.id}" /></label>
            <div class="row">
              <button class="chip ${player.active ? "selected" : ""}" data-toggle-player="${player.id}">${player.active ? "Active" : "Inactive"}</button>
              <button class="danger" data-remove-player="${player.id}" ${used ? "disabled" : ""}>${used ? "In use" : "Remove"}</button>
            </div>
            <span class="tiny">${used ? "This player has recorded round data, so they cannot be removed without changing history." : "Remove clears this player from unplayed setup rounds."}</span>
          </article>
        `;
      }).join("")}
    </div>
  `;
}

function renderCoursesSetup() {
  return h`
    <div class="stack">
      <button class="primary" data-add-course>Add course</button>
      ${state.courses.map((course) => {
        const used = courseHasSourceData(course.id);
        return h`
          <article class="card form-grid">
            <label class="field"><span>Course name</span><input class="input" value="${escapeHtml(course.name)}" data-course-name="${course.id}" /></label>
            ${used ? `<div class="warning setup-warning">Pars are locked because this course has recorded round data.</div>` : ""}
            <div class="pars-grid">
              ${course.holes.map((hole) => h`
                <label class="hole-par tiny">H${hole.holeNumber}
                  <input class="input" inputmode="numeric" value="${hole.par}" data-par="${course.id}|${hole.holeNumber}" ${used ? "disabled" : ""} />
                </label>
              `).join("")}
            </div>
          </article>
        `;
      }).join("")}
    </div>
  `;
}

function renderRoundsSetup() {
  return h`
    <div class="stack">
      <button class="primary" data-add-round ${activePlayers().length < 2 ? "disabled" : ""}>Add round</button>
      ${activePlayers().length < 2 ? `<div class="card warning">Add at least 2 active players before creating rounds.</div>` : ""}
      ${state.rounds.map((round) => {
        const locked = Boolean(round.locked);
        const sourceLocked = roundHasSourceData(round);
        return h`
          <article class="card form-grid">
            ${locked ? `<div class="warning setup-warning">Round is locked. Unlock it on the round screen before editing setup.</div>` : ""}
            <label class="field"><span>Round name</span><input class="input" value="${escapeHtml(round.name)}" data-round-name="${round.id}" ${locked ? "disabled" : ""} /></label>
            <label class="field"><span>Course</span>
              <select class="select" data-round-course="${round.id}" ${locked || sourceLocked ? "disabled" : ""}>
                ${state.courses.map((course) => `<option value="${course.id}" ${course.id === round.courseId ? "selected" : ""}>${escapeHtml(course.name)}</option>`).join("")}
              </select>
            </label>
            <label class="field"><span>Game mode</span>
              <select class="select" data-round-mode="${round.id}" ${locked || sourceLocked ? "disabled" : ""}>
                ${Object.entries(GAME_MODES).map(([id, mode]) => `<option value="${id}" ${round.gameMode === id ? "selected" : ""}>${mode.label}</option>`).join("")}
              </select>
              <span class="tiny">${sourceLocked ? "Mode locks after scores or awards exist." : isMatchPlay(round) ? "Pairings are Player 1 vs Player 2, Player 3 vs Player 4." : isIndividualMode(round) ? "Individual scorecards, one player per card." : "Team scorecards for scramble."}</span>
            </label>
            <div class="row wrap">
              <button class="chip ${round.clutchEnabled === false ? "" : "selected"}" data-toggle-clutch="${round.id}" ${locked || sourceLocked ? "disabled" : ""}>${round.clutchEnabled === false ? "Clutch off" : "Clutch on"}</button>
              <span class="tiny">When off, no clutch bonus is awarded for this round.</span>
            </div>
            <div class="three-col">
              <label class="field"><span>Clutch hole</span><input class="input" inputmode="numeric" value="${round.clutchHole}" data-round-hole="${round.id}|clutchHole" ${locked || sourceLocked || round.clutchEnabled === false ? "disabled" : ""} /></label>
              <label class="field"><span>Longest Drive hole</span><input class="input" inputmode="numeric" value="${round.longestDriveHole}" data-round-hole="${round.id}|longestDriveHole" ${locked || sourceLocked ? "disabled" : ""} /></label>
              <label class="field"><span>Nearest Pin hole</span><input class="input" inputmode="numeric" value="${round.nearestPinHole}" data-round-hole="${round.id}|nearestPinHole" ${locked || sourceLocked ? "disabled" : ""} /></label>
            </div>
            <div class="button-grid"><button class="secondary" data-duplicate-round="${round.id}">Duplicate this round</button><button class="secondary" data-add-team="${round.id}" ${locked || sourceLocked ? "disabled" : ""}>${isIndividualMode(round) ? "Add player card" : "Add team"}</button></div>
            ${isMatchPlay(round) && !hasValidMatchPairings(round) ? `<div class="warning setup-warning">Match play needs an even number of player cards.</div>` : ""}
            <div class="section-header"><h2>${isIndividualMode(round) ? "Players" : "Teams"}</h2><span class="tiny">${round.teams.length} ${isIndividualMode(round) ? "scorecards" : "teams"}</span></div>
            <div class="stack">
              ${isMatchPlay(round)
                ? renderMatchPairingsSetup(round, locked || sourceLocked)
                : round.teams.map((team, teamIndex) => renderTeamSetupBlock(round, team, teamIndex, locked || sourceLocked)).join("")}
            </div>
          </article>
        `;
      }).join("")}
    </div>
  `;
}

function bindEvents(app) {
  app.querySelectorAll("[data-go]").forEach((button) => button.addEventListener("click", () => go(button.dataset.go)));
  app.querySelectorAll("[data-open-round]").forEach((button) => button.addEventListener("click", () => {
    if (!button.dataset.openRound) return go("setup");
    go("round", button.dataset.openRound);
  }));
  app.querySelectorAll("[data-score-change]").forEach((button) => button.addEventListener("click", () => changeScore(button.dataset.scoreChange)));
  app.querySelectorAll("[data-award]").forEach((select) => {
    select.value = state.rounds.find((round) => round.id === activeRoundId)?.awards[select.dataset.award] || "";
    select.addEventListener("change", () => updateAward(select.dataset.award, select.value));
  });
  app.querySelectorAll("[data-complete-round]").forEach((button) => button.addEventListener("click", () => completeRound(button.dataset.completeRound)));
  app.querySelectorAll("[data-reset-round]").forEach((button) => button.addEventListener("click", () => resetRound(button.dataset.resetRound)));
  app.querySelectorAll("[data-toggle-lock]").forEach((button) => button.addEventListener("click", () => toggleLock(button.dataset.toggleLock)));
  app.querySelectorAll("[data-setup-tab]").forEach((button) => button.addEventListener("click", () => { setupTab = button.dataset.setupTab; render(); }));
  app.querySelectorAll("[data-add-player]").forEach((form) => form.addEventListener("submit", addPlayer));
  app.querySelectorAll("[data-player-name]").forEach((input) => input.addEventListener("change", () => updatePlayerName(input.dataset.playerName, input.value)));
  app.querySelectorAll("[data-toggle-player]").forEach((button) => button.addEventListener("click", () => togglePlayer(button.dataset.togglePlayer)));
  app.querySelectorAll("[data-remove-player]").forEach((button) => button.addEventListener("click", () => removePlayer(button.dataset.removePlayer)));
  app.querySelectorAll("[data-add-course]").forEach((button) => button.addEventListener("click", addCourse));
  app.querySelectorAll("[data-course-name]").forEach((input) => input.addEventListener("change", () => updateCourseName(input.dataset.courseName, input.value)));
  app.querySelectorAll("[data-par]").forEach((input) => input.addEventListener("change", () => updatePar(input.dataset.par, input.value)));
  app.querySelectorAll("[data-add-round]").forEach((button) => button.addEventListener("click", addRound));
  app.querySelectorAll("[data-duplicate-round]").forEach((button) => button.addEventListener("click", () => duplicateRound(button.dataset.duplicateRound)));
  app.querySelectorAll("[data-round-name]").forEach((input) => input.addEventListener("change", () => updateRoundName(input.dataset.roundName, input.value)));
  app.querySelectorAll("[data-round-course]").forEach((select) => select.addEventListener("change", () => updateRoundCourse(select.dataset.roundCourse, select.value)));
  app.querySelectorAll("[data-round-mode]").forEach((select) => select.addEventListener("change", () => updateRoundGameMode(select.dataset.roundMode, select.value)));
  app.querySelectorAll("[data-round-hole]").forEach((input) => input.addEventListener("change", () => updateRoundHole(input.dataset.roundHole, input.value)));
  app.querySelectorAll("[data-round-notes]").forEach((input) => input.addEventListener("change", () => updateRoundNotes(input.dataset.roundNotes, input.value)));
  app.querySelectorAll("[data-toggle-clutch]").forEach((button) => button.addEventListener("click", () => toggleClutch(button.dataset.toggleClutch)));
  app.querySelectorAll("[data-add-team]").forEach((button) => button.addEventListener("click", () => addTeam(button.dataset.addTeam)));
  app.querySelectorAll("[data-remove-team]").forEach((button) => button.addEventListener("click", () => removeTeam(button.dataset.removeTeam)));
  app.querySelectorAll("[data-toggle-team-player]").forEach((button) => button.addEventListener("click", () => toggleTeamPlayer(button.dataset.toggleTeamPlayer)));
  app.querySelectorAll("[data-set-team-player]").forEach((select) => select.addEventListener("change", () => setTeamPlayer(select.dataset.setTeamPlayer, select.value)));
  app.querySelectorAll("[data-leaderboard-round]").forEach((select) => select.addEventListener("change", () => { leaderboardRoundId = select.value; selectedLeaderboardPlayerId = ""; render(); }));
  app.querySelectorAll("[data-export-image]").forEach((button) => button.addEventListener("click", exportLeaderboardImage));
  app.querySelectorAll("[data-leader-player]").forEach((button) => button.addEventListener("click", () => { selectedLeaderboardPlayerId = button.dataset.leaderPlayer; render(); }));
  app.querySelectorAll("[data-close-breakdown]").forEach((button) => button.addEventListener("click", () => { selectedLeaderboardPlayerId = ""; render(); }));
  app.querySelectorAll("[data-export-backup]").forEach((button) => button.addEventListener("click", exportBackup));
  app.querySelectorAll("[data-import-backup]").forEach((input) => input.addEventListener("change", importBackup));
}

function changeScore(payload) {
  const [roundId, teamId, holeNumber, delta] = payload.split("|");
  setState((draft) => {
    const round = draft.rounds.find((item) => item.id === roundId);
    if (!round || round.locked) return;
    const course = draft.courses.find((item) => item.id === round.courseId);
    const par = course?.holes.find((hole) => hole.holeNumber === Number(holeNumber))?.par || 4;
    round.scoresByHole[teamId] ||= {};
    const currentRaw = round.scoresByHole[teamId][holeNumber];
    const current = currentRaw === "" || currentRaw === undefined ? null : Number(currentRaw);
    const nextValue = current === null ? (Number(delta) > 0 ? par : par - 1) : current + Number(delta);
    const next = Math.max(1, Math.min(12, nextValue));
    round.scoresByHole[teamId][holeNumber] = next;
    syncRoundStatus(draft, roundId);
  });
}

function updateAward(key, value) {
  setState((draft) => {
    const round = draft.rounds.find((item) => item.id === activeRoundId);
    if (!round || round.locked) return;
    round.awards[key] = value;
    syncRoundStatus(draft, round.id);
  });
}

function completeRound(roundId) {
  let completed = false;
  setState((draft) => {
    syncRoundStatus(draft, roundId, true);
    const round = draft.rounds.find((item) => item.id === roundId);
    completed = round?.status === STATES.COMPLETE;
  });
  if (completed) go("summary", roundId);
}
function resetRound(roundId) {
  if (pendingResetRoundId !== roundId) {
    pendingResetRoundId = roundId;
    render();
    return;
  }
  pendingResetRoundId = "";
  setState((draft) => {
    const round = draft.rounds.find((item) => item.id === roundId);
    if (!round || round.locked) return;
    round.scoresByHole = {};
    round.awards = { longestDrivePlayerId: "", nearestPinPlayerId: "" };
    round.status = STATES.NOT_STARTED;
    round.updatedAt = todayIso();
  });
}

function toggleLock(roundId) {
  setState((draft) => {
    const round = draft.rounds.find((item) => item.id === roundId);
    if (!round) return;
    round.locked = !round.locked;
    round.updatedAt = todayIso();
  });
}

function addPlayer(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const data = new FormData(form);
  const name = String(data.get("name") || "").trim();
  if (!name) return;
  setState((draft) => {
    draft.players.push({ id: uid("player"), name, active: true });
  });
}

function updatePlayerName(playerId, name) {
  setState((draft) => {
    const player = draft.players.find((item) => item.id === playerId);
    if (player && name.trim()) player.name = name.trim();
  });
}

function togglePlayer(playerId) {
  setState((draft) => {
    const player = draft.players.find((item) => item.id === playerId);
    if (player) player.active = !player.active;
  });
}

function removePlayer(playerId) {
  setState((draft) => {
    if (playerIsUsed(playerId, draft)) return;
    draft.rounds.forEach((round) => {
      if (roundHasSourceData(round)) return;
      round.teams.forEach((team) => {
        team.playerIds = team.playerIds.filter((id) => id !== playerId);
      });
    });
    draft.players = draft.players.filter((player) => player.id !== playerId);
  });
}

function addCourse() {
  setState((draft) => {
    draft.courses.push({ ...defaultCourse(), name: `Course ${draft.courses.length + 1}` });
  });
}

function updateCourseName(courseId, name) {
  setState((draft) => {
    const course = draft.courses.find((item) => item.id === courseId);
    if (course && name.trim()) course.name = name.trim();
  });
}

function updatePar(payload, value) {
  const [courseId, holeNumber] = payload.split("|");
  setState((draft) => {
    if (courseHasSourceData(courseId, draft)) return;
    const course = draft.courses.find((item) => item.id === courseId);
    const hole = course?.holes.find((item) => item.holeNumber === Number(holeNumber));
    if (hole) hole.par = Math.max(3, Math.min(6, Number(value) || hole.par));
  });
}

function addRound() {
  setState((draft) => {
    const players = activePlayers(draft);
    if (players.length < 2) return;
    const midpoint = Math.ceil(players.length / 2);
    draft.rounds.push({
      id: uid("round"),
      name: `Day ${draft.rounds.length + 1}`,
      gameMode: "SCRAMBLE",
      courseId: draft.courses[0]?.id,
      teams: [
        { id: uid("team"), playerIds: players.slice(0, midpoint).map((player) => player.id) },
        { id: uid("team"), playerIds: players.slice(midpoint).map((player) => player.id) },
      ],
      scoresByHole: {},
      awards: { longestDrivePlayerId: "", nearestPinPlayerId: "" },
      clutchHole: 18,
      clutchEnabled: true,
      longestDriveHole: 9,
      nearestPinHole: 12,
      status: STATES.NOT_STARTED,
      locked: false,
      updatedAt: todayIso(),
    });
  });
}

function duplicateRound(roundId) {
  setState((draft) => {
    const source = draft.rounds.find((round) => round.id === roundId) || draft.rounds.at(-1);
    if (!source) return;
    const copy = cloneData(source);
    copy.id = uid("round");
    copy.name = `${source.name} copy`;
    const activeIds = new Set(activePlayers(draft).map((player) => player.id));
    copy.teams = source.teams.map((team) => {
      const nextId = uid("team");
      return { id: nextId, playerIds: team.playerIds.filter((id) => activeIds.has(id)) };
    }).filter((team) => team.playerIds.length > 0);
    copy.scoresByHole = {};
    copy.awards = { longestDrivePlayerId: "", nearestPinPlayerId: "" };
    copy.status = STATES.NOT_STARTED;
    copy.locked = false;
    copy.updatedAt = todayIso();
    draft.rounds.push(copy);
  });
}

function updateRoundName(roundId, name) {
  setState((draft) => {
    const round = draft.rounds.find((item) => item.id === roundId);
    if (round && !round.locked && name.trim()) round.name = name.trim();
  });
}

function updateRoundCourse(roundId, courseId) {
  setState((draft) => {
    const round = draft.rounds.find((item) => item.id === roundId);
    if (round && !round.locked && !roundHasSourceData(round)) {
      round.courseId = courseId;
      syncRoundStatus(draft, roundId);
    }
  });
}

function buildDefaultTeamsForMode(modeId, players) {
  if (["player", "match"].includes(GAME_MODES[modeId]?.scoring)) {
    return players.map((player) => ({ id: uid("team"), playerIds: [player.id] }));
  }
  const midpoint = Math.ceil(players.length / 2);
  return [
    { id: uid("team"), playerIds: players.slice(0, midpoint).map((player) => player.id) },
    { id: uid("team"), playerIds: players.slice(midpoint).map((player) => player.id) },
  ];
}

function updateRoundGameMode(roundId, modeId) {
  if (!GAME_MODES[modeId]) return;
  setState((draft) => {
    const round = draft.rounds.find((item) => item.id === roundId);
    if (!round || round.locked || roundHasSourceData(round)) return;
    round.gameMode = modeId;
    round.teams = buildDefaultTeamsForMode(modeId, activePlayers(draft));
    round.scoresByHole = {};
    round.awards = { longestDrivePlayerId: "", nearestPinPlayerId: "" };
    syncRoundStatus(draft, roundId);
  });
}

function updateRoundNotes(roundId, value) {
  setState((draft) => {
    const round = draft.rounds.find((item) => item.id === roundId);
    if (round && !round.locked) {
      round.notes = value;
      round.updatedAt = todayIso();
    }
  });
}

function updateRoundHole(payload, value) {
  const [roundId, key] = payload.split("|");
  setState((draft) => {
    const round = draft.rounds.find((item) => item.id === roundId);
    if (round && !round.locked && !roundHasSourceData(round)) round[key] = Math.max(1, Math.min(18, Number(value) || round[key]));
  });
}

function toggleClutch(roundId) {
  setState((draft) => {
    const round = draft.rounds.find((item) => item.id === roundId);
    if (!round || round.locked || roundHasSourceData(round)) return;
    round.clutchEnabled = round.clutchEnabled === false;
    round.updatedAt = todayIso();
  });
}

function addTeam(roundId) {
  setState((draft) => {
    const round = draft.rounds.find((item) => item.id === roundId);
    if (!round || round.locked || roundHasSourceData(round)) return;
    round.teams.push({ id: uid("team"), playerIds: [] });
    syncRoundStatus(draft, roundId);
  });
}

function removeTeam(payload) {
  const [roundId, teamId] = payload.split("|");
  setState((draft) => {
    const round = draft.rounds.find((item) => item.id === roundId);
    if (!round || round.locked || roundHasSourceData(round)) return;
    round.teams = round.teams.filter((team) => team.id !== teamId);
    delete round.scoresByHole[teamId];
    cleanRoundAwards(round);
    syncRoundStatus(draft, roundId);
  });
}

function toggleTeamPlayer(payload) {
  const [roundId, teamId, playerId] = payload.split("|");
  setState((draft) => {
    const round = draft.rounds.find((item) => item.id === roundId);
    if (!round || round.locked || roundHasSourceData(round)) return;
    const team = round.teams.find((item) => item.id === teamId);
    if (!team) return;
    const alreadySelected = team.playerIds.includes(playerId);
    round.teams.forEach((item) => {
      item.playerIds = item.playerIds.filter((id) => id !== playerId);
    });
    if (!alreadySelected) team.playerIds = isIndividualMode(round) ? [playerId] : [...team.playerIds, playerId];
    cleanRoundAwards(round);
    syncRoundStatus(draft, roundId);
  });
}


function setTeamPlayer(payload, playerId) {
  const [roundId, teamId] = payload.split("|");
  setState((draft) => {
    const round = draft.rounds.find((item) => item.id === roundId);
    if (!round || round.locked || roundHasSourceData(round)) return;
    const team = round.teams.find((item) => item.id === teamId);
    if (!team) return;
    team.playerIds = [];
    if (playerId) {
      round.teams.forEach((item) => {
        if (item.id !== teamId) item.playerIds = item.playerIds.filter((id) => id !== playerId);
      });
      team.playerIds = [playerId];
    }
    cleanRoundAwards(round);
    syncRoundStatus(draft, roundId);
  });
}

function downloadFile(filename, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function exportBackup() {
  const backup = {
    ...state,
    exportedAt: todayIso(),
  };
  downloadFile("golf-trip-backup.json", JSON.stringify(backup, null, 2), "application/json");
}

function importBackup(event) {
  const file = event.currentTarget.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const restored = normalizeData(JSON.parse(String(reader.result)));
      state = restored;
      activeRoundId = state.lastRoundId || state.rounds[0]?.id || "";
      selectedLeaderboardPlayerId = "";
      saveState();
      render();
    } catch (error) {
      storageWarning = "Backup could not be restored. The file does not look valid.";
      console.warn("Backup import failed.", error);
      render();
    }
  };
  reader.readAsText(file);
}

function exportLeaderboardImage() {
  const leaderboardData = leaderboardDataThrough(leaderboardRoundId);
  const leaderboard = calculateLeaderboardTrends(leaderboardData);
  const clutchActive = leaderboardData.rounds.some((round) => round.status === STATES.COMPLETE && round.clutchEnabled !== false);
  const leaders = leaderboard.filter((row) => row.rank === 1);
  const completedRounds = leaderboardData.rounds.filter((round) => round.status === STATES.COMPLETE);
  const selectedRound = leaderboardRoundId === "all" ? null : state.rounds.find((round) => round.id === leaderboardRoundId);
  const exportLabel = selectedRound ? "After " + selectedRound.name : "Latest standings";
  const width = 1080;
  const rowHeight = 92;
  const topHeight = 240;
  const height = Math.max(720, topHeight + leaderboard.length * rowHeight + 84);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const fitText = (text, maxWidth) => {
    const value = String(text || "");
    if (ctx.measureText(value).width <= maxWidth) return value;
    let next = value;
    while (next.length > 1 && ctx.measureText(next + "…").width > maxWidth) {
      next = next.slice(0, -1);
    }
    return next + "…";
  };

  const roundRect = (x, y, w, h, r) => {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
    ctx.fill();
  };

  ctx.fillStyle = "#F7F5EF";
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = "#16392f";
  roundRect(44, 36, width - 88, 164, 18);

  ctx.fillStyle = "#FFFFFF";
  ctx.textAlign = "center";
  ctx.font = "800 52px system-ui";
  ctx.fillText("Golf Trip Leaderboard", width / 2, 98);
  ctx.font = "700 30px system-ui";
  ctx.fillText(fitText(`${leaders.map((row) => row.name).join(" / ") || "No leader"} · ${leaders[0]?.points || 0} pts`, width - 160), width / 2, 148);
  ctx.font = "600 22px system-ui";
  ctx.fillStyle = "rgba(255, 255, 255, 0.74)";
  ctx.fillText(exportLabel + " · " + completedRounds.length + " completed round" + (completedRounds.length === 1 ? "" : "s"), width / 2, 178);

  leaderboard.forEach((row, index) => {
    const y = topHeight + index * rowHeight;
    const x = 64;
    const w = width - 128;
    const h = 72;
    ctx.fillStyle = row.rank === 1 ? "#FFF4CC" : row.rank === 2 ? "#E6E6E6" : row.rank === 3 ? "#F4E1D2" : "#FFFFFF";
    roundRect(x, y, w, h, 14);

    ctx.fillStyle = "#16392f";
    ctx.font = "900 28px system-ui";
    ctx.textAlign = "center";
    ctx.fillText(String(row.rank), x + 42, y + 46);

    ctx.fillStyle = row.trend === "up" ? "#19754f" : row.trend === "down" ? "#b84b42" : "#9a6700";
    ctx.font = "900 24px system-ui";
    ctx.fillText(trendSymbol(row), x + 96, y + 46);

    ctx.textAlign = "left";
    ctx.fillStyle = "#16201d";
    ctx.font = "800 30px system-ui";
    ctx.fillText(fitText(row.name, w - 330), x + 190, y + 33);

    ctx.fillStyle = "#6a746f";
    ctx.font = "700 18px system-ui";
    const detail = [`LD ${row.longestDrivePoints}`, `NP ${row.nearestPinPoints}`];
    if (clutchActive) detail.push(`Clutch ${row.clutchPoints}`);
    ctx.fillText(fitText(detail.join("   "), w - 330), x + 190, y + 58);

    ctx.textAlign = "right";
    ctx.fillStyle = "#16392f";
    ctx.font = "900 34px system-ui";
    ctx.fillText(String(row.points), x + w - 38, y + 46);
  });

  canvas.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "golf-trip-leaderboard.png";
    link.click();
    URL.revokeObjectURL(url);
  }, "image/png");
}


if (typeof navigator !== "undefined" && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch((error) => {
      console.warn("Service worker registration failed.", error);
    });
  });
}

window.addEventListener("error", (event) => {
  console.warn("Recovered from app error", event.error);
});

render();
