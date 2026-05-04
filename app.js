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
  if (!clean.courses.length) clean.courses.push(defaultCourse());
  clean.players = clean.players.map((player) => ({
    id: player.id || uid("player"),
    name: player.name || "Player",
    active: player.active !== false,
  }));
  clean.rounds = clean.rounds.map((round) => ({
    id: round.id || uid("round"),
    name: round.name || "Round",
    courseId: round.courseId || clean.courses[0].id,
    teams: Array.isArray(round.teams) ? round.teams : [],
    scoresByHole: round.scoresByHole || {},
    awards: round.awards || { longestDrivePlayerId: "", nearestPinPlayerId: "" },
    clutchHole: Number(round.clutchHole) || 18,
    clutchEnabled: round.clutchEnabled !== false,
    longestDriveHole: Number(round.longestDriveHole) || 9,
    nearestPinHole: Number(round.nearestPinHole) || 12,
    status: Object.values(STATES).includes(round.status) ? round.status : STATES.NOT_STARTED,
    locked: Boolean(round.locked),
    updatedAt: round.updatedAt || todayIso(),
  }));
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

function teamLabel(team) {
  return team.playerIds.map(playerName).join(" / ") || "Empty team";
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

function teamScore(round, teamId, holeNumber) {
  return round.scoresByHole?.[teamId]?.[holeNumber] ?? "";
}

function scoredHoleCount(round, course) {
  return round.teams.reduce((count, team) => {
    return count + course.holes.filter((hole) => teamScore(round, team.id, hole.holeNumber) !== "").length;
  }, 0);
}

function isRoundComplete(round, course) {
  const allScored = round.teams.length > 0 && scoredHoleCount(round, course) === round.teams.length * course.holes.length;
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

export function calculateRoundWinner(round) {
  if (round.status !== STATES.COMPLETE) return [];
  const totals = round.teams.map((team) => ({ teamId: team.id, total: calculateTeamTotal(round, team.id) }));
  const low = Math.min(...totals.map((entry) => entry.total));
  return totals.filter((entry) => entry.total === low).map((entry) => entry.teamId);
}

export function calculateClutchWinner(round) {
  if (round.status !== STATES.COMPLETE || round.clutchEnabled === false) return "";
  const hole = String(round.clutchHole);
  const scores = round.teams
    .map((team) => ({ teamId: team.id, score: Number(round.scoresByHole?.[team.id]?.[hole]) }))
    .filter((entry) => Number.isFinite(entry.score));
  const low = Math.min(...scores.map((entry) => entry.score));
  const winners = scores.filter((entry) => entry.score === low);
  return winners.length === 1 ? winners[0].teamId : "";
}

export function calculatePlayerPoints(round, playerId, points = DEFAULT_POINTS) {
  return calculatePlayerPointBreakdown(round, playerId, points).total;
}

function calculatePlayerPointBreakdown(round, playerId, points = DEFAULT_POINTS) {
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
  const winners = calculateRoundWinner(round);
  const teamCount = round.teams.length;
  const tiedWin = winners.length > 1 && winners.includes(playerTeam.id);
  const breakdown = { ...empty };

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
      const roundBreakdowns = completedRounds.map((round) => ({
        roundId: round.id,
        roundName: round.name,
        ...calculatePlayerPointBreakdown(round, player.id, points),
      }));
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
  const resumeRound = state.rounds.find((round) => round.id === activeRoundId) || state.rounds.find((round) => round.status !== STATES.COMPLETE) || state.rounds[0];
  return h`
    <section class="hero-panel">
      <p class="tiny">After-round entry</p>
      <h2 class="screen-title">${resumeRound ? escapeHtml(resumeRound.name) : "Set up your trip"}</h2>
      <p>${resumeRound ? escapeHtml(courseFor(resumeRound).name) : "Add players, courses, and rounds to begin."}</p>
      <button class="primary" data-open-round="${resumeRound?.id || ""}">Resume last round</button>
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
          const completeText = `${scoredHoleCount(round, course)} / ${round.teams.length * course.holes.length} scores`;
          return h`
            <article class="card round-item">
              <div class="row">
                <div>
                  <strong>${escapeHtml(round.name)}</strong>
                  <div class="tiny">${escapeHtml(course.name)} · ${completeText}</div>
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

function renderRound() {
  const round = state.rounds.find((item) => item.id === activeRoundId) || state.rounds[0];
  if (!round) return `<section class="card">Create a round in Setup to start.</section>`;
  const course = courseFor(round);
  const complete = isRoundComplete(round, course);
  const missing = [];
  if (!complete) {
    if (scoredHoleCount(round, course) < round.teams.length * course.holes.length) missing.push("scores");
    if (!round.awards.longestDrivePlayerId) missing.push("Longest Drive");
    if (!round.awards.nearestPinPlayerId) missing.push("Nearest Pin");
  }
  return h`
    <section class="section">
      <div class="row wrap">
        <div>
          <h2 class="screen-title">${escapeHtml(round.name)}</h2>
          <div class="muted">${escapeHtml(course.name)} · ${round.locked ? "Locked" : statusLabel(derivedRoundStatus(round, course))}</div>
        </div>
        <button class="${round.locked ? "secondary" : "ghost"}" data-toggle-lock="${round.id}">${round.locked ? "Unlock" : "Lock"}</button>
      </div>
    </section>
    ${missing.length ? `<section class="section card warning">Missing ${missing.join(", ")}.</section>` : ""}
    <section class="section stack">
      ${round.teams.map((team) => renderScorecard(round, course, team)).join("")}
    </section>
    <section class="section card">
      <div class="section-header"><h2>Awards</h2><span class="tiny">Bonus points</span></div>
      <div class="form-grid">
        <label class="field"><span>Longest Drive · hole ${round.longestDriveHole}</span>
          <select class="select" data-award="longestDrivePlayerId" ${round.locked ? "disabled" : ""}>
            <option value="">Select player</option>
            ${renderPlayerOptions(round.awards.longestDrivePlayerId)}
          </select>
        </label>
        <label class="field"><span>Nearest Pin · hole ${round.nearestPinHole}</span>
          <select class="select" data-award="nearestPinPlayerId" ${round.locked ? "disabled" : ""}>
            <option value="">Select player</option>
            ${renderPlayerOptions(round.awards.nearestPinPlayerId)}
          </select>
        </label>
      </div>
    </section>
    <section class="sticky-actions">
      <button class="danger" data-reset-round="${round.id}" ${round.locked ? "disabled" : ""}>Reset</button>
      <button class="primary" data-complete-round="${round.id}" ${round.locked || !complete ? "disabled" : ""}>Complete Round</button>
    </section>
  `;
}

function renderPlayerOptions(selectedId = "") {
  return activePlayers()
    .map((player) => `<option value="${player.id}" ${player.id === selectedId ? "selected" : ""}>${escapeHtml(player.name)}</option>`)
    .join("");
}

function renderScorecard(round, course, team) {
  const total = calculateTeamTotal(round, team.id);
  return h`
    <article class="card scorecard">
      <div class="scorecard-head row">
        <div>
          <strong>${escapeHtml(teamLabel(team))}</strong>
          <div class="tiny">Team total updates instantly</div>
        </div>
        <span class="pill">${total || "—"}</span>
      </div>
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
                  <div class="score-stepper">
                    <button data-score-change="${round.id}|${team.id}|${hole.holeNumber}|-1" ${round.locked ? "disabled" : ""}>−</button>
                    <span class="score-value">${value === "" ? "—" : value}</span>
                    <button data-score-change="${round.id}|${team.id}|${hole.holeNumber}|1" ${round.locked ? "disabled" : ""}>+</button>
                  </div>
                </td>
              </tr>
            `;
          }).join("")}
        </tbody>
      </table>
    </article>
  `;
}

function renderLeaderboard() {
  const leaderboard = calculateLeaderboard(state);
  const clutchActive = state.rounds.some((round) => round.status === STATES.COMPLETE && round.clutchEnabled !== false);
  const leaders = leaderboard.filter((row) => row.rank === 1);
  const leaderPoints = leaders[0]?.points ?? 0;
  const leaderNames = leaders.map((row) => row.name).join(" / ");
  const completedCount = state.rounds.filter((round) => round.status === STATES.COMPLETE).length;
  return h`
    <section class="leader-hero">
      <h2 class="screen-title">🏆 Golf Trip Leaderboard</h2>
      <p class="muted">${completedCount} completed round${completedCount === 1 ? "" : "s"} · ${leaders.length > 1 ? "current leaders" : "current leader"}</p>
      <div class="points">${leaderPoints}</div>
      <strong>${leaderNames || "No players yet"}</strong>
    </section>
    <section class="card" id="leaderboard-card">
      <table class="leaderboard">
        <thead><tr><th>Rank</th><th>Player</th><th>Details</th><th>Points</th></tr></thead>
        <tbody>
          ${leaderboard.map((row) => h`
            <tr class="rank-${row.rank <= 3 ? row.rank : ""}">
              <td data-label="Rank">${row.rank}</td>
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
              <strong>${escapeHtml(round.roundName)}</strong>
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
  const winners = calculateRoundWinner(round);
  const clutchTeamId = calculateClutchWinner(round);
  const playerIds = [...new Set(round.teams.flatMap((team) => team.playerIds))];
  return h`
    <section class="hero-panel summary-hero">
      <p class="tiny">Round complete</p>
      <h2 class="screen-title">${escapeHtml(round.name)}</h2>
      <p>${escapeHtml(course.name)}</p>
    </section>
    <section class="section stack">
      ${round.teams.map((team) => {
        const total = calculateTeamTotal(round, team.id);
        const winner = winners.includes(team.id);
        return h`
          <article class="card summary-team ${winner ? "summary-winner" : ""}">
            <div class="row">
              <div>
                <strong>${escapeHtml(teamLabel(team))}</strong>
                <div class="tiny">${winner ? "Winning team" : "Team total"}</div>
              </div>
              <span class="pill">${total}</span>
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
        ${round.clutchEnabled === false ? "" : `<span>Clutch: ${clutchTeamId ? escapeHtml(teamLabel(round.teams.find((team) => team.id === clutchTeamId))) : "No winner"}</span>`}
      </div>
    </section>
    <section class="section card point-breakdown">
      <div class="section-header"><h2>Points Awarded</h2><span class="tiny">This round</span></div>
      <div class="stack">
        ${playerIds.map((playerId) => {
          const points = calculatePlayerPoints(round, playerId);
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
        ${["players", "courses", "rounds", "backup"].map((tab) => `<button class="tab ${setupTab === tab ? "active" : ""}" data-setup-tab="${tab}">${tab[0].toUpperCase() + tab.slice(1)}</button>`).join("")}
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
      ${state.courses.map((course) => h`
        <article class="card form-grid">
          <label class="field"><span>Course name</span><input class="input" value="${escapeHtml(course.name)}" data-course-name="${course.id}" /></label>
          <div class="pars-grid">
            ${course.holes.map((hole) => h`
              <label class="hole-par tiny">H${hole.holeNumber}
                <input class="input" inputmode="numeric" value="${hole.par}" data-par="${course.id}|${hole.holeNumber}" />
              </label>
            `).join("")}
          </div>
        </article>
      `).join("")}
    </div>
  `;
}

function renderRoundsSetup() {
  return h`
    <div class="stack">
      <button class="primary" data-add-round>Add round</button>
      ${state.rounds.map((round) => {
        const locked = Boolean(round.locked);
        return h`
          <article class="card form-grid">
            ${locked ? `<div class="warning setup-warning">Round is locked. Unlock it on the round screen before editing setup.</div>` : ""}
            <label class="field"><span>Round name</span><input class="input" value="${escapeHtml(round.name)}" data-round-name="${round.id}" ${locked ? "disabled" : ""} /></label>
            <label class="field"><span>Course</span>
              <select class="select" data-round-course="${round.id}" ${locked ? "disabled" : ""}>
                ${state.courses.map((course) => `<option value="${course.id}" ${course.id === round.courseId ? "selected" : ""}>${escapeHtml(course.name)}</option>`).join("")}
              </select>
            </label>
            <div class="row wrap">
              <button class="chip ${round.clutchEnabled === false ? "" : "selected"}" data-toggle-clutch="${round.id}" ${locked ? "disabled" : ""}>${round.clutchEnabled === false ? "Clutch off" : "Clutch on"}</button>
              <span class="tiny">When off, no clutch bonus is awarded for this round.</span>
            </div>
            <div class="three-col">
              <label class="field"><span>Clutch hole</span><input class="input" inputmode="numeric" value="${round.clutchHole}" data-round-hole="${round.id}|clutchHole" ${locked || round.clutchEnabled === false ? "disabled" : ""} /></label>
              <label class="field"><span>Longest Drive hole</span><input class="input" inputmode="numeric" value="${round.longestDriveHole}" data-round-hole="${round.id}|longestDriveHole" ${locked ? "disabled" : ""} /></label>
              <label class="field"><span>Nearest Pin hole</span><input class="input" inputmode="numeric" value="${round.nearestPinHole}" data-round-hole="${round.id}|nearestPinHole" ${locked ? "disabled" : ""} /></label>
            </div>
            <div class="section-header"><h2>Teams</h2><button class="secondary" data-add-team="${round.id}" ${locked ? "disabled" : ""}>Add team</button></div>
            <div class="stack">
              ${round.teams.map((team, teamIndex) => h`
                <div class="team-block">
                  <div class="row"><strong>Team ${teamIndex + 1}</strong><button class="ghost" data-remove-team="${round.id}|${team.id}" ${locked ? "disabled" : ""}>Remove</button></div>
                  <div class="team-picker">
                    ${activePlayers().map((player) => `<button class="chip ${team.playerIds.includes(player.id) ? "selected" : ""}" data-toggle-team-player="${round.id}|${team.id}|${player.id}" ${locked ? "disabled" : ""}>${escapeHtml(player.name)}</button>`).join("")}
                  </div>
                </div>
              `).join("")}
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
  app.querySelectorAll("[data-round-name]").forEach((input) => input.addEventListener("change", () => updateRoundName(input.dataset.roundName, input.value)));
  app.querySelectorAll("[data-round-course]").forEach((select) => select.addEventListener("change", () => updateRoundCourse(select.dataset.roundCourse, select.value)));
  app.querySelectorAll("[data-round-hole]").forEach((input) => input.addEventListener("change", () => updateRoundHole(input.dataset.roundHole, input.value)));
  app.querySelectorAll("[data-toggle-clutch]").forEach((button) => button.addEventListener("click", () => toggleClutch(button.dataset.toggleClutch)));
  app.querySelectorAll("[data-add-team]").forEach((button) => button.addEventListener("click", () => addTeam(button.dataset.addTeam)));
  app.querySelectorAll("[data-remove-team]").forEach((button) => button.addEventListener("click", () => removeTeam(button.dataset.removeTeam)));
  app.querySelectorAll("[data-toggle-team-player]").forEach((button) => button.addEventListener("click", () => toggleTeamPlayer(button.dataset.toggleTeamPlayer)));
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
  setState((draft) => {
    syncRoundStatus(draft, roundId, true);
  });
  go("summary", roundId);
}

function resetRound(roundId) {
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
    const course = draft.courses.find((item) => item.id === courseId);
    const hole = course?.holes.find((item) => item.holeNumber === Number(holeNumber));
    if (hole) hole.par = Math.max(3, Math.min(6, Number(value) || hole.par));
  });
}

function addRound() {
  setState((draft) => {
    const players = activePlayers(draft);
    const midpoint = Math.ceil(players.length / 2);
    draft.rounds.push({
      id: uid("round"),
      name: `Day ${draft.rounds.length + 1}`,
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

function updateRoundName(roundId, name) {
  setState((draft) => {
    const round = draft.rounds.find((item) => item.id === roundId);
    if (round && !round.locked && name.trim()) round.name = name.trim();
  });
}

function updateRoundCourse(roundId, courseId) {
  setState((draft) => {
    const round = draft.rounds.find((item) => item.id === roundId);
    if (round && !round.locked) {
      round.courseId = courseId;
      syncRoundStatus(draft, roundId);
    }
  });
}

function updateRoundHole(payload, value) {
  const [roundId, key] = payload.split("|");
  setState((draft) => {
    const round = draft.rounds.find((item) => item.id === roundId);
    if (round && !round.locked) round[key] = Math.max(1, Math.min(18, Number(value) || round[key]));
  });
}

function toggleClutch(roundId) {
  setState((draft) => {
    const round = draft.rounds.find((item) => item.id === roundId);
    if (!round || round.locked) return;
    round.clutchEnabled = round.clutchEnabled === false;
    round.updatedAt = todayIso();
  });
}

function addTeam(roundId) {
  setState((draft) => {
    const round = draft.rounds.find((item) => item.id === roundId);
    if (!round || round.locked) return;
    round.teams.push({ id: uid("team"), playerIds: [] });
    syncRoundStatus(draft, roundId);
  });
}

function removeTeam(payload) {
  const [roundId, teamId] = payload.split("|");
  setState((draft) => {
    const round = draft.rounds.find((item) => item.id === roundId);
    if (!round || round.locked) return;
    round.teams = round.teams.filter((team) => team.id !== teamId);
    delete round.scoresByHole[teamId];
    syncRoundStatus(draft, roundId);
  });
}

function toggleTeamPlayer(payload) {
  const [roundId, teamId, playerId] = payload.split("|");
  setState((draft) => {
    const round = draft.rounds.find((item) => item.id === roundId);
    if (!round || round.locked) return;
    round.teams.forEach((team) => {
      team.playerIds = team.playerIds.filter((id) => id !== playerId);
    });
    const team = round.teams.find((item) => item.id === teamId);
    if (team) team.playerIds.push(playerId);
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
  const leaderboard = calculateLeaderboard(state);
  const clutchActive = state.rounds.some((round) => round.status === STATES.COMPLETE && round.clutchEnabled !== false);
  const leaders = leaderboard.filter((row) => row.rank === 1);
  const width = 1080;
  const rowHeight = 92;
  const topHeight = 240;
  const height = Math.max(720, topHeight + leaderboard.length * rowHeight + 84);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

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
  ctx.fillText(`${leaders.map((row) => row.name).join(" / ") || "No leader"} · ${leaders[0]?.points || 0} pts`, width / 2, 148);
  ctx.font = "600 22px system-ui";
  ctx.fillStyle = "rgba(255, 255, 255, 0.74)";
  ctx.fillText(`${state.rounds.filter((round) => round.status === STATES.COMPLETE).length} completed rounds`, width / 2, 178);

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

    ctx.textAlign = "left";
    ctx.fillStyle = "#16201d";
    ctx.font = "800 30px system-ui";
    ctx.fillText(row.name, x + 86, y + 33);

    ctx.fillStyle = "#6a746f";
    ctx.font = "700 18px system-ui";
    const detail = [`LD ${row.longestDrivePoints}`, `NP ${row.nearestPinPoints}`];
    if (clutchActive) detail.push(`Clutch ${row.clutchPoints}`);
    ctx.fillText(detail.join("   "), x + 86, y + 58);

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
