import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const STORAGE_KEY = "golf-trip-pro-v1";
const ACTIVE_TRIP_KEY = "golf-trip-pro-active-trip";
const SUPABASE_URL = window.GOLF_TRIP_SUPABASE_URL || "https://nyjbtllsxfovfijbpkbi.supabase.co";
const SUPABASE_ANON_KEY = window.GOLF_TRIP_SUPABASE_ANON_KEY || "sb_publishable_alr_Hd_j_MbNxrTj9rliDw_wbkzs19F";
const SUPABASE_ENABLED = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY && SUPABASE_URL.startsWith("https://"));

const ROUND_STATES = {
  NOT_STARTED: "NOT_STARTED",
  IN_PROGRESS: "IN_PROGRESS",
  COMPLETE: "COMPLETE",
};

const ROLES = {
  OWNER: "owner",
  ADMIN: "admin",
  PLAYER: "player",
};

const POINTS = {
  win: 3,
  loss: 1,
  tie: 2,
  clutch: 1,
  longestDrive: 1,
  nearestPin: 1,
};

const GAME_MODES = {
  SCRAMBLE: { label: "Scramble", scoring: "team", higherWins: false, totalLabel: "Strokes" },
  MATCH_PLAY: { label: "Match play", scoring: "match", higherWins: true, totalLabel: "Match" },
  STABLEFORD: { label: "Stableford", scoring: "player", higherWins: true, totalLabel: "Points" },
};

const uid = (prefix) => `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
const nowIso = () => new Date().toISOString();

const defaultPars = [4, 4, 3, 5, 4, 4, 3, 5, 4, 4, 3, 4, 5, 4, 4, 3, 5, 4];

function createDemoDatabase() {
  const tripId = uid("trip");
  const courseId = uid("course");
  const adminUserId = uid("user");
  const playerUserId = uid("user");
  const playerIds = ["Victor", "Alex", "Sam", "Jamie", "Chris", "Taylor"].map((name) => uid(name.toLowerCase()));
  const scrambleRoundId = uid("round");
  const matchRoundId = uid("round");
  const stablefordRoundId = uid("round");
  const scrambleEntries = [uid("entry"), uid("entry")];
  const matchEntries = playerIds.slice(0, 4).map(() => uid("entry"));
  const stablefordEntries = playerIds.map(() => uid("entry"));

  return {
    version: 2,
    session: { userId: adminUserId, tripId, view: "admin", activeRoundId: scrambleRoundId },
    users: [
      { id: adminUserId, name: "Trip Admin", email: "admin@golftrip.local" },
      { id: playerUserId, name: "Victor Player", email: "victor@golftrip.local" },
    ],
    trips: [
      { id: tripId, name: "Portugal Golf Trip", inviteCode: "ALGARVE26", createdBy: adminUserId, createdAt: nowIso() },
    ],
    memberships: [
      { id: uid("member"), tripId, userId: adminUserId, role: ROLES.OWNER, playerId: "" },
      { id: uid("member"), tripId, userId: playerUserId, role: ROLES.PLAYER, playerId: playerIds[0] },
    ],
    players: playerIds.map((id, index) => ({
      id,
      tripId,
      name: ["Victor", "Alex", "Sam", "Jamie", "Chris", "Taylor"][index],
      handicap: [13, 8, 18, 11, 21, 15][index],
      active: true,
    })),
    courses: [
      { id: courseId, tripId, name: "Ocean Dunes", holes: defaultPars.map((par, index) => ({ holeNumber: index + 1, par })) },
    ],
    rounds: [
      { id: scrambleRoundId, tripId, courseId, name: "Day 1 Scramble", gameMode: "SCRAMBLE", clutchEnabled: true, clutchHole: 18, longestDriveHole: 9, nearestPinHole: 12, status: ROUND_STATES.NOT_STARTED, locked: false, updatedAt: nowIso() },
      { id: matchRoundId, tripId, courseId, name: "Day 2 Match Play", gameMode: "MATCH_PLAY", clutchEnabled: true, clutchHole: 16, longestDriveHole: 8, nearestPinHole: 14, status: ROUND_STATES.NOT_STARTED, locked: false, updatedAt: nowIso() },
      { id: stablefordRoundId, tripId, courseId, name: "Final Stableford", gameMode: "STABLEFORD", clutchEnabled: false, clutchHole: 18, longestDriveHole: 10, nearestPinHole: 17, status: ROUND_STATES.NOT_STARTED, locked: false, updatedAt: nowIso() },
    ],
    roundEntries: [
      { id: scrambleEntries[0], roundId: scrambleRoundId, position: 0, scorerPlayerId: playerIds[0], submittedBy: "", submittedAt: "", approvedBy: "", approvedAt: "" },
      { id: scrambleEntries[1], roundId: scrambleRoundId, position: 1, scorerPlayerId: playerIds[3], submittedBy: "", submittedAt: "", approvedBy: "", approvedAt: "" },
      ...matchEntries.map((id, index) => ({ id, roundId: matchRoundId, position: index, scorerPlayerId: playerIds[index], submittedBy: "", submittedAt: "", approvedBy: "", approvedAt: "" })),
      ...stablefordEntries.map((id, index) => ({ id, roundId: stablefordRoundId, position: index, scorerPlayerId: playerIds[index], submittedBy: "", submittedAt: "", approvedBy: "", approvedAt: "" })),
    ],
    roundEntryPlayers: [
      ...playerIds.slice(0, 3).map((playerId) => ({ id: uid("entry_player"), roundEntryId: scrambleEntries[0], playerId })),
      ...playerIds.slice(3).map((playerId) => ({ id: uid("entry_player"), roundEntryId: scrambleEntries[1], playerId })),
      ...matchEntries.map((entryId, index) => ({ id: uid("entry_player"), roundEntryId: entryId, playerId: playerIds[index] })),
      ...stablefordEntries.map((entryId, index) => ({ id: uid("entry_player"), roundEntryId: entryId, playerId: playerIds[index] })),
    ],
    scores: [],
    awards: [],
    auditLog: [],
  };
}

function normalizeDatabase(input) {
  const demo = createDemoDatabase();
  const db = input && typeof input === "object" ? input : demo;
  const allowEmpty = db.remote === true;
  const tripId = db.session?.tripId || db.trips?.[0]?.id || demo.session.tripId;
  return {
    version: 2,
    session: {
      userId: db.session?.userId || db.users?.[0]?.id || demo.session.userId,
      tripId,
      view: db.session?.view || "admin",
      activeRoundId: db.session?.activeRoundId || db.rounds?.find((round) => round.tripId === tripId)?.id || "",
    },
    users: Array.isArray(db.users) ? db.users : demo.users,
    trips: Array.isArray(db.trips) && (allowEmpty || db.trips.length) ? db.trips : demo.trips,
    memberships: Array.isArray(db.memberships) ? db.memberships : demo.memberships,
    players: Array.isArray(db.players) && (allowEmpty || db.players.length) ? db.players : demo.players,
    courses: (Array.isArray(db.courses) && (allowEmpty || db.courses.length) ? db.courses : demo.courses).map((course) => ({
      id: course.id || uid("course"),
      tripId: course.tripId || tripId,
      name: course.name || "Course",
      holes: defaultPars.map((fallbackPar, index) => {
        const source = Array.isArray(course.holes) ? course.holes.find((hole) => Number(hole.holeNumber) === index + 1) || course.holes[index] || {} : {};
        return {
          holeNumber: index + 1,
          par: Math.max(3, Math.min(6, Number(source.par) || fallbackPar)),
        };
      }),
    })),
    rounds: Array.isArray(db.rounds) ? db.rounds.map((round) => ({
      id: round.id || uid("round"),
      tripId: round.tripId || tripId,
      courseId: round.courseId || db.courses?.[0]?.id || demo.courses[0].id,
      name: round.name || "Round",
      gameMode: GAME_MODES[round.gameMode] ? round.gameMode : "SCRAMBLE",
      clutchEnabled: round.clutchEnabled !== false,
      clutchHole: Math.max(1, Math.min(18, Number(round.clutchHole) || 18)),
      longestDriveHole: Math.max(1, Math.min(18, Number(round.longestDriveHole) || 9)),
      nearestPinHole: Math.max(1, Math.min(18, Number(round.nearestPinHole) || 12)),
      status: Object.values(ROUND_STATES).includes(round.status) ? round.status : ROUND_STATES.NOT_STARTED,
      locked: Boolean(round.locked),
      updatedAt: round.updatedAt || nowIso(),
    })) : demo.rounds,
    roundEntries: Array.isArray(db.roundEntries) ? db.roundEntries.map((entry, index) => ({
      id: entry.id || uid("entry"),
      roundId: entry.roundId,
      position: Number(entry.position) || index,
      scorerPlayerId: entry.scorerPlayerId || "",
      submittedBy: entry.submittedBy || "",
      submittedAt: entry.submittedAt || "",
      approvedBy: entry.approvedBy || "",
      approvedAt: entry.approvedAt || "",
    })) : demo.roundEntries,
    roundEntryPlayers: Array.isArray(db.roundEntryPlayers) ? db.roundEntryPlayers.map((item) => ({ id: item.id || uid("entry_player"), roundEntryId: item.roundEntryId, playerId: item.playerId })) : demo.roundEntryPlayers,
    scores: Array.isArray(db.scores) ? db.scores.map((score) => ({ id: score.id || uid("score"), roundEntryId: score.roundEntryId, holeNumber: Math.max(1, Math.min(18, Number(score.holeNumber) || 1)), strokes: Math.max(1, Math.min(12, Number(score.strokes) || 1)), updatedAt: score.updatedAt || nowIso() })) : [],
    awards: Array.isArray(db.awards) ? db.awards.map((award) => ({ id: award.id || uid("award"), roundId: award.roundId, type: award.type, playerId: award.playerId || "" })) : [],
    auditLog: Array.isArray(db.auditLog) ? db.auditLog : [],
  };
}

class LocalDatabaseAdapter {
  load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return normalizeDatabase(raw ? JSON.parse(raw) : createDemoDatabase());
    } catch (error) {
      console.warn("Database restore failed.", error);
      return normalizeDatabase(createDemoDatabase());
    }
  }

  save(db) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
      return true;
    } catch (error) {
      console.warn("Database save failed.", error);
      return false;
    }
  }
}

function rowUser(user) {
  return {
    id: user?.id || "",
    name: user?.user_metadata?.name || user?.email?.split("@")[0] || "Signed-in player",
    email: user?.email || "",
  };
}

function snakeTrip(row) {
  return { id: row.id, name: row.name, inviteCode: row.invite_code, createdBy: row.created_by || "", createdAt: row.created_at || nowIso() };
}

function snakeMembership(row) {
  return { id: row.id, tripId: row.trip_id, userId: row.user_id, role: row.role, playerId: row.player_id || "" };
}

function snakePlayer(row) {
  return { id: row.id, tripId: row.trip_id, name: row.name, handicap: row.handicap ?? "", active: row.active !== false };
}

function snakeRound(row) {
  return {
    id: row.id,
    tripId: row.trip_id,
    courseId: row.course_id,
    name: row.name,
    gameMode: row.game_mode,
    clutchEnabled: row.clutch_enabled !== false,
    clutchHole: row.clutch_hole,
    longestDriveHole: row.longest_drive_hole,
    nearestPinHole: row.nearest_pin_hole,
    status: row.status,
    locked: row.locked,
    updatedAt: row.updated_at || nowIso(),
  };
}

function snakeEntry(row) {
  return {
    id: row.id,
    roundId: row.round_id,
    position: row.position,
    scorerPlayerId: row.scorer_player_id || "",
    submittedBy: row.submitted_by || "",
    submittedAt: row.submitted_at || "",
    approvedBy: row.approved_by || "",
    approvedAt: row.approved_at || "",
  };
}

function snakeEntryPlayer(row) {
  return { id: row.id, roundEntryId: row.round_entry_id, playerId: row.player_id };
}

function snakeScore(row) {
  return { id: row.id, roundEntryId: row.round_entry_id, holeNumber: row.hole_number, strokes: row.strokes, updatedAt: row.updated_at || nowIso() };
}

function snakeAward(row) {
  return { id: row.id, roundId: row.round_id, type: row.type, playerId: row.player_id };
}

function courseFromRows(course, holes) {
  return {
    id: course.id,
    tripId: course.trip_id,
    name: course.name,
    holes: defaultPars.map((fallbackPar, index) => {
      const hole = holes.find((item) => item.course_id === course.id && item.hole_number === index + 1);
      return { holeNumber: index + 1, par: Number(hole?.par) || fallbackPar };
    }),
  };
}

class SupabaseDatabaseAdapter {
  constructor(client) {
    this.client = client;
    this.local = new LocalDatabaseAdapter();
    this.lastSave = Promise.resolve();
  }

  load() {
    return this.local.load();
  }

  async authUser() {
    const { data, error } = await this.client.auth.getUser();
    if (error) throw error;
    return data.user || null;
  }

  async sendMagicLink(email) {
    const redirectTo = window.location.origin + window.location.pathname;
    const { error } = await this.client.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: redirectTo },
    });
    if (error) throw error;
  }

  async signOut() {
    const { error } = await this.client.auth.signOut();
    if (error) throw error;
  }

  async ensureStarterTrip(user) {
    const inviteCode = `GOLF-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
    const { data: trip, error: tripError } = await this.client
      .from("trips")
      .insert({ name: "Golf Trip", invite_code: inviteCode, created_by: user.id })
      .select()
      .single();
    if (tripError) throw tripError;

    const { error: membershipError } = await this.client
      .from("trip_memberships")
      .insert({ trip_id: trip.id, user_id: user.id, role: ROLES.OWNER });
    if (membershipError) throw membershipError;

    const { data: course, error: courseError } = await this.client
      .from("courses")
      .insert({ trip_id: trip.id, name: "Course" })
      .select()
      .single();
    if (courseError) throw courseError;

    const { error: holesError } = await this.client
      .from("course_holes")
      .insert(defaultPars.map((par, index) => ({ course_id: course.id, hole_number: index + 1, par })));
    if (holesError) throw holesError;
    return trip.id;
  }

  async loadRemote() {
    const user = await this.authUser();
    if (!user) return this.load();

    let { data: memberships, error: membershipError } = await this.client.from("trip_memberships").select("*");
    if (membershipError) throw membershipError;
    if (!memberships.length) {
      const tripId = await this.ensureStarterTrip(user);
      localStorage.setItem(ACTIVE_TRIP_KEY, tripId);
      ({ data: memberships, error: membershipError } = await this.client.from("trip_memberships").select("*"));
      if (membershipError) throw membershipError;
    }

    const activeTripId = localStorage.getItem(ACTIVE_TRIP_KEY);
    const tripId = memberships.some((item) => item.trip_id === activeTripId) ? activeTripId : memberships[0].trip_id;
    localStorage.setItem(ACTIVE_TRIP_KEY, tripId);

    const [tripsResult, allMembershipsResult, playersResult, coursesResult, roundsResult] = await Promise.all([
      this.client.from("trips").select("*").eq("id", tripId),
      this.client.from("trip_memberships").select("*").eq("trip_id", tripId),
      this.client.from("players").select("*").eq("trip_id", tripId),
      this.client.from("courses").select("*").eq("trip_id", tripId),
      this.client.from("rounds").select("*").eq("trip_id", tripId),
    ]);
    [tripsResult, allMembershipsResult, playersResult, coursesResult, roundsResult].forEach((result) => {
      if (result.error) throw result.error;
    });

    const courseIds = coursesResult.data.map((course) => course.id);
    const roundIds = roundsResult.data.map((round) => round.id);
    const [holesResult, entriesResult, awardsResult] = await Promise.all([
      courseIds.length ? this.client.from("course_holes").select("*").in("course_id", courseIds) : { data: [], error: null },
      roundIds.length ? this.client.from("round_entries").select("*").in("round_id", roundIds) : { data: [], error: null },
      roundIds.length ? this.client.from("awards").select("*").in("round_id", roundIds) : { data: [], error: null },
    ]);
    [holesResult, entriesResult, awardsResult].forEach((result) => {
      if (result.error) throw result.error;
    });

    const entryIds = entriesResult.data.map((entry) => entry.id);
    const [entryPlayersResult, scoresResult] = await Promise.all([
      entryIds.length ? this.client.from("round_entry_players").select("*").in("round_entry_id", entryIds) : { data: [], error: null },
      entryIds.length ? this.client.from("scores").select("*").in("round_entry_id", entryIds) : { data: [], error: null },
    ]);
    [entryPlayersResult, scoresResult].forEach((result) => {
      if (result.error) throw result.error;
    });

    return normalizeDatabase({
      remote: true,
      session: { userId: user.id, tripId, view: db.session?.view || "admin", activeRoundId: roundsResult.data[0]?.id || "" },
      users: [rowUser(user)],
      trips: tripsResult.data.map(snakeTrip),
      memberships: allMembershipsResult.data.map(snakeMembership),
      players: playersResult.data.map(snakePlayer),
      courses: coursesResult.data.map((course) => courseFromRows(course, holesResult.data)),
      rounds: roundsResult.data.map(snakeRound),
      roundEntries: entriesResult.data.map(snakeEntry),
      roundEntryPlayers: entryPlayersResult.data.map(snakeEntryPlayer),
      scores: scoresResult.data.map(snakeScore),
      awards: awardsResult.data.map(snakeAward),
    });
  }

  save(nextDb) {
    this.local.save(nextDb);
    this.lastSave = this.lastSave.then(() => this.saveRemote(nextDb)).catch((error) => {
      console.warn("Supabase save failed.", error);
      notice = "Saved on this device, but Supabase sync failed. Check your connection.";
      render();
    });
    return true;
  }

  async saveRemote(nextDb) {
    const user = await this.authUser();
    if (!user) return;
    const membership = nextDb.memberships.find((item) => item.tripId === nextDb.session.tripId && item.userId === user.id);
    const isAdmin = [ROLES.OWNER, ROLES.ADMIN].includes(membership?.role);
    if (!isAdmin) {
      await this.savePlayerRemote(nextDb, membership);
      return;
    }
    const trip = nextDb.trips.find((item) => item.id === nextDb.session.tripId);
    if (!trip) return;

    await this.upsertRows("trips", [{ id: trip.id, name: trip.name, invite_code: trip.inviteCode, created_by: trip.createdBy || user.id, created_at: trip.createdAt || nowIso() }]);
    await this.upsertRows("players", nextDb.players.filter((player) => player.tripId === trip.id).map((player) => ({ id: player.id, trip_id: player.tripId, name: player.name, handicap: player.handicap === "" ? null : player.handicap, active: player.active !== false })));
    await this.upsertRows("courses", nextDb.courses.filter((course) => course.tripId === trip.id).map((course) => ({ id: course.id, trip_id: course.tripId, name: course.name })));
    await this.upsertRows("course_holes", nextDb.courses.filter((course) => course.tripId === trip.id).flatMap((course) => course.holes.map((hole) => ({ course_id: course.id, hole_number: hole.holeNumber, par: hole.par }))), "course_id,hole_number");
    const roundIds = nextDb.rounds.filter((round) => round.tripId === trip.id).map((round) => round.id);
    await this.syncChildTable("rounds", "trip_id", [trip.id], nextDb.rounds.filter((round) => round.tripId === trip.id).map((round) => ({ id: round.id, trip_id: round.tripId, course_id: round.courseId, name: round.name, game_mode: round.gameMode, clutch_enabled: round.clutchEnabled !== false, clutch_hole: round.clutchHole, longest_drive_hole: round.longestDriveHole, nearest_pin_hole: round.nearestPinHole, status: round.status, locked: round.locked, updated_at: round.updatedAt || nowIso() })));
    await this.syncChildTable("round_entries", "round_id", roundIds, nextDb.roundEntries.filter((entry) => roundIds.includes(entry.roundId)).map((entry) => ({ id: entry.id, round_id: entry.roundId, position: entry.position, scorer_player_id: entry.scorerPlayerId || null, submitted_by: entry.submittedBy || null, submitted_at: entry.submittedAt || null, approved_by: entry.approvedBy || null, approved_at: entry.approvedAt || null })));
    const entryIds = nextDb.roundEntries.filter((entry) => roundIds.includes(entry.roundId)).map((entry) => entry.id);
    await this.syncChildTable("round_entry_players", "round_entry_id", entryIds, nextDb.roundEntryPlayers.filter((item) => entryIds.includes(item.roundEntryId)).map((item) => ({ id: item.id, round_entry_id: item.roundEntryId, player_id: item.playerId })));
    await this.syncChildTable("scores", "round_entry_id", entryIds, nextDb.scores.filter((score) => entryIds.includes(score.roundEntryId)).map((score) => ({ id: score.id, round_entry_id: score.roundEntryId, hole_number: score.holeNumber, strokes: score.strokes, updated_at: score.updatedAt || nowIso() })));
    await this.syncChildTable("awards", "round_id", roundIds, nextDb.awards.filter((award) => roundIds.includes(award.roundId)).map((award) => ({ id: award.id, round_id: award.roundId, type: award.type, player_id: award.playerId })));
  }

  async savePlayerRemote(nextDb, membership) {
    if (!membership?.playerId) return;
    const editableEntryIds = nextDb.roundEntries
      .filter((entry) => entry.scorerPlayerId === membership.playerId && !entry.approvedAt)
      .map((entry) => entry.id);
    if (!editableEntryIds.length) return;
    await this.upsertRows("round_entries", nextDb.roundEntries.filter((entry) => editableEntryIds.includes(entry.id)).map((entry) => ({
      id: entry.id,
      round_id: entry.roundId,
      position: entry.position,
      scorer_player_id: entry.scorerPlayerId || null,
      submitted_by: entry.submittedBy || null,
      submitted_at: entry.submittedAt || null,
      approved_by: entry.approvedBy || null,
      approved_at: entry.approvedAt || null,
    })));
    await this.syncChildTable("scores", "round_entry_id", editableEntryIds, nextDb.scores.filter((score) => editableEntryIds.includes(score.roundEntryId)).map((score) => ({
      id: score.id,
      round_entry_id: score.roundEntryId,
      hole_number: score.holeNumber,
      strokes: score.strokes,
      updated_at: score.updatedAt || nowIso(),
    })));
  }

  async upsertRows(table, rows, onConflict = "id") {
    if (!rows.length) return;
    const { error } = await this.client.from(table).upsert(rows, { onConflict });
    if (error) throw error;
  }

  async syncChildTable(table, parentColumn, parentIds, rows) {
    if (!parentIds.length) return;
    const { data: existing, error: selectError } = await this.client.from(table).select("id").in(parentColumn, parentIds);
    if (selectError) throw selectError;
    const keep = new Set(rows.map((row) => row.id).filter(Boolean));
    const removeIds = existing.map((row) => row.id).filter((id) => !keep.has(id));
    if (removeIds.length) {
      const { error: deleteError } = await this.client.from(table).delete().in("id", removeIds);
      if (deleteError) throw deleteError;
    }
    await this.upsertRows(table, rows);
  }

  async joinTrip(inviteCode) {
    const { data, error } = await this.client.rpc("join_trip_by_invite", { invite_code_input: inviteCode });
    if (error) throw error;
    const tripId = Array.isArray(data) ? data[0]?.trip_id : data?.trip_id;
    if (tripId) localStorage.setItem(ACTIVE_TRIP_KEY, tripId);
    return tripId;
  }

  async claimPlayer(playerId) {
    const { error } = await this.client.rpc("claim_player_profile", { player_id_input: playerId });
    if (error) throw error;
  }
}

const supabaseClient = SUPABASE_ENABLED ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;
const adapter = supabaseClient ? new SupabaseDatabaseAdapter(supabaseClient) : new LocalDatabaseAdapter();
let db = adapter.load();
let selectedPlayerId = "";
let scoringRoundId = db.session.activeRoundId || "";
let notice = "";
let adminTab = "players";
let pendingDeleteRoundId = "";
let authUser = null;
let booting = SUPABASE_ENABLED;
let authEmailSent = "";

function persist() {
  if (!adapter.save(db)) {
    notice = "This browser is blocking storage. Changes may disappear when the tab closes.";
  }
}

function mutate(action, audit = "") {
  const next = normalizeDatabase(structuredClone(db));
  action(next);
  if (audit) next.auditLog.unshift({ id: uid("audit"), tripId: next.session.tripId, userId: next.session.userId, message: audit, createdAt: nowIso() });
  db = normalizeDatabase(next);
  persist();
  render();
}

function currentTrip() {
  return db.trips.find((trip) => trip.id === db.session.tripId) || db.trips[0];
}

function currentUser() {
  return db.users.find((user) => user.id === db.session.userId) || db.users[0];
}

function currentMembership() {
  return db.memberships.find((membership) => membership.tripId === currentTrip().id && membership.userId === currentUser().id) || { role: ROLES.PLAYER, playerId: "" };
}

function canAdmin() {
  return [ROLES.OWNER, ROLES.ADMIN].includes(currentMembership().role);
}

function currentPlayer() {
  return db.players.find((player) => player.id === currentMembership().playerId) || null;
}

function playerName(playerId) {
  return db.players.find((player) => player.id === playerId)?.name || "Unassigned";
}

function entryPlayerIds(entry) {
  return db.roundEntryPlayers.filter((item) => item.roundEntryId === entry.id).map((item) => item.playerId);
}

function playerCanEditEntry(round, entry, playerId = currentMembership().playerId) {
  if (!playerId || round.locked || entry.approvedAt) return false;
  if (canAdmin()) return true;
  const ids = entryPlayerIds(entry);
  if (round.gameMode === "SCRAMBLE") return entry.scorerPlayerId === playerId;
  return ids.includes(playerId) || entry.scorerPlayerId === playerId;
}

function entryReviewState(entry) {
  if (entry.approvedAt) return "Approved";
  if (entry.submittedAt) return "Submitted";
  return "Open";
}

function roundHasSourceData(round) {
  const entryIds = entriesFor(round).map((entry) => entry.id);
  const hasScores = db.scores.some((score) => entryIds.includes(score.roundEntryId));
  const hasSubmitted = entriesFor(round).some((entry) => entry.submittedAt || entry.approvedAt);
  const hasAwards = db.awards.some((award) => award.roundId === round.id);
  return hasScores || hasSubmitted || hasAwards || round.status !== ROUND_STATES.NOT_STARTED;
}

function roundDeleteLabel(round) {
  if (round.locked) return "Locked";
  if (pendingDeleteRoundId === round.id) return "Confirm";
  return "Remove";
}

function courseHasSourceData(courseId) {
  return tripRounds().some((round) => round.courseId === courseId && roundHasSourceData(round));
}

function tripPlayers(tripId = currentTrip().id) {
  return db.players.filter((player) => player.tripId === tripId && player.active);
}

function tripRounds(tripId = currentTrip().id) {
  return db.rounds.filter((round) => round.tripId === tripId);
}

function tripCourses(tripId = currentTrip().id) {
  return db.courses.filter((course) => course.tripId === tripId);
}

function courseFor(round) {
  return db.courses.find((course) => course.id === round.courseId) || db.courses[0];
}

function entriesFor(round) {
  return db.roundEntries
    .filter((entry) => entry.roundId === round.id)
    .sort((a, b) => a.position - b.position);
}

function playersForEntry(entry) {
  return entryPlayerIds(entry).map((id) => db.players.find((player) => player.id === id)).filter(Boolean);
}

function entryLabel(entry) {
  const names = playersForEntry(entry).map((player) => player.name);
  return names.join(" / ") || "Empty entry";
}

function scoreFor(entryId, holeNumber) {
  return db.scores.find((score) => score.roundEntryId === entryId && score.holeNumber === holeNumber)?.strokes ?? "";
}

function entryScoreCount(round, entry) {
  return courseFor(round).holes.filter((hole) => playersForEntry(entry).length && scoreFor(entry.id, hole.holeNumber) !== "").length;
}

function isEntryComplete(round, entry) {
  return playersForEntry(entry).length > 0 && entryScoreCount(round, entry) === courseFor(round).holes.length;
}

function scoreCount(round) {
  return entriesFor(round).reduce((sum, entry) => sum + entryScoreCount(round, entry), 0);
}

function expectedScoreCount(round) {
  return entriesFor(round).length * courseFor(round).holes.length;
}

function isMatchPairingValid(round) {
  if (round.gameMode !== "MATCH_PLAY") return true;
  const entries = entriesFor(round);
  return entries.length >= 2 && entries.length % 2 === 0 && entries.every((entry) => playersForEntry(entry).length === 1);
}

function entriesReadyForCompletion(round) {
  return entriesFor(round).every((entry) => {
    if (!isEntryComplete(round, entry)) return false;
    return !entry.scorerPlayerId || Boolean(entry.approvedAt);
  });
}

function isRoundComplete(round) {
  return entriesFor(round).length >= 2
    && isMatchPairingValid(round)
    && scoreCount(round) === expectedScoreCount(round)
    && entriesReadyForCompletion(round)
    && Boolean(awardPlayer(round.id, "LONGEST_DRIVE"))
    && Boolean(awardPlayer(round.id, "NEAREST_PIN"));
}

function derivedStatus(round) {
  if (round.status === ROUND_STATES.COMPLETE && isRoundComplete(round)) return ROUND_STATES.COMPLETE;
  if (scoreCount(round) > 0 || awardPlayer(round.id, "LONGEST_DRIVE") || awardPlayer(round.id, "NEAREST_PIN")) return ROUND_STATES.IN_PROGRESS;
  return ROUND_STATES.NOT_STARTED;
}

function awardPlayer(roundId, type) {
  return db.awards.find((award) => award.roundId === roundId && award.type === type)?.playerId || "";
}

function stablefordPoints(strokes, par) {
  const diff = strokes - par;
  if (diff <= -3) return 5;
  if (diff === -2) return 4;
  if (diff === -1) return 3;
  if (diff === 0) return 2;
  if (diff === 1) return 1;
  return 0;
}

function entryStrokeTotal(entry) {
  return db.scores.filter((score) => score.roundEntryId === entry.id).reduce((sum, score) => sum + score.strokes, 0);
}

function entryStablefordTotal(round, entry) {
  return courseFor(round).holes.reduce((sum, hole) => {
    const strokes = Number(scoreFor(entry.id, hole.holeNumber));
    return sum + (Number.isFinite(strokes) ? stablefordPoints(strokes, hole.par) : 0);
  }, 0);
}

function entryTotal(round, entry) {
  return round.gameMode === "STABLEFORD" ? entryStablefordTotal(round, entry) : entryStrokeTotal(entry);
}

function matchOpponent(round, entryId) {
  const entries = entriesFor(round);
  const index = entries.findIndex((entry) => entry.id === entryId);
  if (index < 0) return null;
  return entries[index % 2 === 0 ? index + 1 : index - 1] || null;
}

function matchResult(round, entry) {
  const opponent = matchOpponent(round, entry.id);
  const result = { won: 0, lost: 0, tied: 0, label: "AS", outcome: "Tie" };
  if (!opponent) return { ...result, label: "No opponent", outcome: "Tie" };
  courseFor(round).holes.forEach((hole) => {
    const a = Number(scoreFor(entry.id, hole.holeNumber));
    const b = Number(scoreFor(opponent.id, hole.holeNumber));
    if (!Number.isFinite(a) || !Number.isFinite(b)) return;
    if (a < b) result.won += 1;
    else if (a > b) result.lost += 1;
    else result.tied += 1;
  });
  const margin = result.won - result.lost;
  result.label = margin === 0 ? "AS" : `${Math.abs(margin)} ${margin > 0 ? "up" : "down"}`;
  result.outcome = margin > 0 ? "Win" : margin < 0 ? "Loss" : "Tie";
  return result;
}

function roundWinnerEntryIds(round) {
  if (round.status !== ROUND_STATES.COMPLETE) return [];
  const entries = entriesFor(round);
  if (round.gameMode === "MATCH_PLAY") return entries.filter((entry) => matchResult(round, entry).outcome === "Win").map((entry) => entry.id);
  const totals = entries.map((entry) => ({ id: entry.id, total: entryTotal(round, entry) }));
  const mode = GAME_MODES[round.gameMode];
  const target = mode.higherWins ? Math.max(...totals.map((item) => item.total)) : Math.min(...totals.map((item) => item.total));
  return totals.filter((item) => item.total === target).map((item) => item.id);
}

function clutchWinnerEntryId(round) {
  if (round.status !== ROUND_STATES.COMPLETE || round.clutchEnabled === false) return "";
  const scores = entriesFor(round)
    .map((entry) => ({ id: entry.id, score: Number(scoreFor(entry.id, round.clutchHole)) }))
    .filter((item) => Number.isFinite(item.score));
  if (!scores.length) return "";
  const best = Math.min(...scores.map((item) => item.score));
  const winners = scores.filter((item) => item.score === best);
  return winners.length === 1 ? winners[0].id : "";
}

function playerBreakdown(round, playerId) {
  const breakdown = { roundId: round.id, roundName: round.name, mode: round.gameMode, result: "Not playing", resultPoints: 0, longestDrivePoints: 0, nearestPinPoints: 0, clutchPoints: 0, total: 0 };
  if (round.status !== ROUND_STATES.COMPLETE) return breakdown;
  const entry = entriesFor(round).find((item) => playersForEntry(item).some((player) => player.id === playerId));
  if (!entry) return breakdown;
  const winners = roundWinnerEntryIds(round);
  const tiedWin = winners.length > 1 && winners.includes(entry.id);
  if (round.gameMode === "MATCH_PLAY") breakdown.result = matchResult(round, entry).outcome;
  else breakdown.result = tiedWin ? "Tie" : winners.includes(entry.id) ? "Win" : "Loss";
  breakdown.resultPoints = breakdown.result === "Win" ? POINTS.win : breakdown.result === "Tie" ? POINTS.tie : POINTS.loss;
  breakdown.longestDrivePoints = awardPlayer(round.id, "LONGEST_DRIVE") === playerId ? POINTS.longestDrive : 0;
  breakdown.nearestPinPoints = awardPlayer(round.id, "NEAREST_PIN") === playerId ? POINTS.nearestPin : 0;
  breakdown.clutchPoints = round.clutchEnabled && clutchWinnerEntryId(round) === entry.id ? POINTS.clutch : 0;
  breakdown.total = breakdown.resultPoints + breakdown.longestDrivePoints + breakdown.nearestPinPoints + breakdown.clutchPoints;
  return breakdown;
}

function leaderboard() {
  const completed = tripRounds().filter((round) => round.status === ROUND_STATES.COMPLETE);
  const rows = tripPlayers().map((player) => {
    const rounds = completed.map((round) => playerBreakdown(round, player.id));
    return {
      playerId: player.id,
      name: player.name,
      points: rounds.reduce((sum, round) => sum + round.total, 0),
      resultPoints: rounds.reduce((sum, round) => sum + round.resultPoints, 0),
      longestDrivePoints: rounds.reduce((sum, round) => sum + round.longestDrivePoints, 0),
      nearestPinPoints: rounds.reduce((sum, round) => sum + round.nearestPinPoints, 0),
      clutchPoints: rounds.reduce((sum, round) => sum + round.clutchPoints, 0),
      rounds,
    };
  }).sort((a, b) => b.points - a.points || a.name.localeCompare(b.name));
  let previous = null;
  let previousRank = 0;
  return rows.map((row, index) => {
    const rank = row.points === previous ? previousRank : index + 1;
    previous = row.points;
    previousRank = rank;
    return { ...row, rank };
  });
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function h(strings, ...values) {
  return strings.reduce((html, part, index) => html + part + (values[index] ?? ""), "");
}

function render() {
  const app = document.querySelector("#app");
  if (booting) {
    app.innerHTML = `<main class="main auth-shell"><section class="card auth-card"><h1>Golf Trip Pro</h1><p>Loading your trip...</p></section></main>`;
    return;
  }
  if (SUPABASE_ENABLED && !authUser) {
    app.innerHTML = renderAuthScreen();
    bindAuthEvents(app);
    return;
  }
  const trip = currentTrip();
  app.innerHTML = h`
    <header class="topbar">
      <div class="brand">
        <div>
          <h1>Golf Trip Pro</h1>
          <p>${escapeHtml(trip.name)} · ${escapeHtml(currentMembership().role)}</p>
        </div>
        ${SUPABASE_ENABLED
          ? `<button class="session-action" data-sign-out>Sign out</button>`
          : `<label class="session-switch">
              <span>User</span>
              <select data-session-user>
                ${db.users.map((user) => `<option value="${user.id}" ${user.id === db.session.userId ? "selected" : ""}>${escapeHtml(user.name)}</option>`).join("")}
              </select>
            </label>`}
      </div>
    </header>
    <main class="main">
      ${notice ? `<section class="notice">${escapeHtml(notice)}</section>` : ""}
      ${renderDeploymentModeNotice()}
      ${renderAccountAccess()}
      ${renderView()}
    </main>
    <nav class="bottom-nav">
      <button class="${db.session.view === "admin" ? "active" : ""}" data-view="admin" ${canAdmin() ? "" : "disabled"}>Admin</button>
      <button class="${db.session.view === "player" ? "active" : ""}" data-view="player">Player</button>
      <button class="${db.session.view === "leaderboard" ? "active" : ""}" data-view="leaderboard">Leaderboard</button>
    </nav>
  `;
  bindEvents(app);
}

function renderAuthScreen() {
  return h`
    <main class="main auth-shell">
      <section class="card auth-card">
        <p class="eyebrow">Golf Trip Pro</p>
        <h1>Sign in to your trip</h1>
        <p>Use your email and we’ll send a secure magic link. No password needed.</p>
        ${notice ? `<section class="notice">${escapeHtml(notice)}</section>` : ""}
        ${authEmailSent ? `<section class="notice">Magic link sent to ${escapeHtml(authEmailSent)}. Open it on this device to continue.</section>` : ""}
        <form class="join-form" data-magic-link>
          <input name="email" type="email" placeholder="you@example.com" autocomplete="email" required />
          <button class="primary">Send magic link</button>
        </form>
      </section>
    </main>
  `;
}

function bindAuthEvents(app) {
  app.querySelectorAll("[data-magic-link]").forEach((form) => form.addEventListener("submit", sendMagicLink));
}

function renderAccountAccess() {
  if (currentMembership().id) return "";
  return h`
    <section class="card access-card">
      <div class="section-header"><h2>Join a trip</h2><span>Invite code</span></div>
      <form class="join-form" data-join-trip>
        ${SUPABASE_ENABLED ? "" : `<input name="name" placeholder="Your name" required /><input name="email" placeholder="Email" type="email" required />`}
        <input name="inviteCode" placeholder="Invite code" required />
        <button>Join</button>
      </form>
    </section>
  `;
}

function renderDeploymentModeNotice() {
  if (SUPABASE_ENABLED) {
    return h`
      <section class="deploy-notice live">
        <strong>Supabase connected</strong>
        <span>Signed in as ${escapeHtml(authUser?.email || currentUser().email || "player")}.</span>
      </section>
    `;
  }
  return h`
    <section class="deploy-notice">
      <strong>Local demo storage</strong>
      <span>This deploy is ready for UI testing. Real multi-device login/scoring needs Supabase Auth + database connected.</span>
    </section>
  `;
}

function renderView() {
  if (db.session.view === "leaderboard") return renderLeaderboard();
  if (db.session.view === "player") return renderPlayerPortal();
  return canAdmin() ? renderAdmin() : renderPlayerPortal();
}

function renderAdmin() {
  const rounds = tripRounds();
  if (!scoringRoundId || !rounds.some((round) => round.id === scoringRoundId)) scoringRoundId = rounds[0]?.id || "";
  const activeRound = rounds.find((round) => round.id === scoringRoundId);
  const tabs = [
    { id: "players", label: "Players" },
    { id: "access", label: "Access" },
    { id: "courses", label: "Courses" },
    { id: "rounds", label: "Rounds" },
  ];
  return h`
    <section class="hero-panel">
      <p class="eyebrow">Admin cockpit</p>
      <h2>${escapeHtml(currentTrip().name)}</h2>
      <p>Invite code ${escapeHtml(currentTrip().inviteCode)} · ${tripPlayers().length} players · ${rounds.length} rounds</p>
    </section>
    <section class="admin-tabs">
      ${tabs.map((tab) => `<button class="${adminTab === tab.id ? "active" : ""}" data-admin-tab="${tab.id}">${tab.label}</button>`).join("")}
    </section>
    ${adminTab === "players" ? renderPlayersAdmin() : ""}
    ${adminTab === "access" ? renderAccessAdmin() : ""}
    ${adminTab === "courses" ? renderCoursesAdmin() : ""}
    ${adminTab === "rounds" ? `${renderRoundsAdmin()}${activeRound ? renderScoringAdmin(activeRound) : `<section class="card">Create a round to start scoring.</section>`}` : ""}
  `;
}

function renderPlayersAdmin() {
  return h`
    <section class="card">
      <div class="section-header"><h2>Players</h2><span>${tripPlayers().length} active</span></div>
      <form class="inline-form" data-add-player>
        <input name="name" placeholder="Player name" required />
        <input name="handicap" placeholder="HCP" inputmode="numeric" />
        <button>Add</button>
      </form>
      <div class="list">
        ${tripPlayers().map((player) => `<div class="list-row"><strong>${escapeHtml(player.name)}</strong><span>HCP ${player.handicap || "-"}</span></div>`).join("")}
      </div>
    </section>
  `;
}

function renderAccessAdmin() {
  const trip = currentTrip();
  const rows = tripPlayers().map((player) => {
    const membership = db.memberships.find((item) => item.tripId === trip.id && item.playerId === player.id);
    const user = membership ? db.users.find((item) => item.id === membership.userId) : null;
    return h`
      <div class="list-row">
        <strong>${escapeHtml(player.name)}</strong>
        <span>${user ? escapeHtml(user.email) : "Not claimed"} · ${membership?.role || "invite pending"}</span>
      </div>
    `;
  }).join("");
  return h`
    <section class="card">
      <div class="section-header"><h2>Invites</h2><span>Code ${escapeHtml(trip.inviteCode)}</span></div>
      <form class="inline-form access-code-form" data-update-invite-code>
        <input name="inviteCode" value="${escapeHtml(trip.inviteCode)}" aria-label="Invite code" required />
        <button>Update code</button>
      </form>
      <div class="invite-box">
        <strong>${escapeHtml(trip.inviteCode)}</strong>
        <span>Players use this code to claim their profile and scorecards.</span>
      </div>
      <div class="list">${rows}</div>
    </section>
  `;
}

function renderCoursesAdmin() {
  return h`
    <section class="card">
      <div class="section-header"><h2>Courses</h2><span>${tripCourses().length} saved</span></div>
      <form class="inline-form course-form" data-add-course>
        <input name="name" placeholder="Course name" required />
        <button>Add course</button>
      </form>
      <div class="list">
        ${tripCourses().map((course) => {
          const used = courseHasSourceData(course.id);
          return h`
            <article class="course-card">
              <label class="field"><span>Course name</span><input value="${escapeHtml(course.name)}" data-course-name="${course.id}" /></label>
              ${used ? `<div class="warning">Pars are locked because this course has recorded round data.</div>` : ""}
              <div class="course-holes">
                ${course.holes.map((hole) => h`
                  <div class="course-hole">
                    <strong>H${hole.holeNumber}</strong>
                    <label>Par<input inputmode="numeric" value="${hole.par}" data-course-hole="${course.id}|${hole.holeNumber}|par" ${used ? "disabled" : ""} /></label>
                  </div>
                `).join("")}
              </div>
            </article>
          `;
        }).join("")}
      </div>
    </section>
  `;
}

function renderRoundsAdmin() {
  return h`
    <section class="card">
      <div class="section-header"><h2>Rounds</h2><span>Database records</span></div>
      <form class="inline-form" data-add-round>
        <input name="name" placeholder="Round name" required />
        <select name="courseId">${tripCourses().map((course) => `<option value="${course.id}">${escapeHtml(course.name)}</option>`).join("")}</select>
        <select name="gameMode">${Object.entries(GAME_MODES).map(([id, mode]) => `<option value="${id}">${mode.label}</option>`).join("")}</select>
        <button>Add</button>
      </form>
      <div class="list">
        ${tripRounds().map((round) => {
          const status = derivedStatus(round);
          return h`
            <div class="round-admin-row ${round.id === scoringRoundId ? "selected" : ""}">
              <button class="round-row" data-scoring-round="${round.id}">
                <span><strong>${escapeHtml(round.name)}</strong><small>${GAME_MODES[round.gameMode].label} · ${scoreCount(round)} / ${expectedScoreCount(round)} scores</small></span>
                <em>${status.replace("_", " ")}</em>
              </button>
              <button class="danger-btn ${pendingDeleteRoundId === round.id ? "confirming" : ""}" data-remove-round="${round.id}" ${round.locked ? "disabled" : ""}>${roundDeleteLabel(round)}</button>
            </div>
          `;
        }).join("")}
      </div>
    </section>
  `;
}

function renderScoringAdmin(round) {
  const course = courseFor(round);
  const entries = entriesFor(round);
  return h`
    <section class="card scoring-card">
      <div class="section-header">
        <div><h2>${escapeHtml(round.name)}</h2><span>${GAME_MODES[round.gameMode].label} · ${escapeHtml(course.name)}</span></div>
        <div class="button-row">
          <button class="secondary" data-lock-round="${round.id}">${round.locked ? "Unlock" : "Lock"}</button>
          <button class="primary" data-complete-round="${round.id}" ${round.locked || !isRoundComplete(round) ? "disabled" : ""}>Complete</button>
        </div>
      </div>
      ${!isMatchPairingValid(round) ? `<div class="warning">Complete every Match Play pairing before scoring can be completed.</div>` : ""}
      <div class="review-strip">
        ${entries.map((entry) => `<button class="review-pill ${entry.approvedAt ? "approved" : entry.submittedAt ? "submitted" : ""}" data-approve-entry="${round.id}|${entry.id}" ${round.locked || !entry.submittedAt || entry.approvedAt || !isEntryComplete(round, entry) ? "disabled" : ""}>${escapeHtml(entryLabel(entry))}: ${entryReviewState(entry)}</button>`).join("")}
      </div>
      <div class="entry-grid">
        ${entries.map((entry) => renderEntrySetup(round, entry)).join("")}
      </div>
      <div class="award-grid">
        ${renderAwardSelect(round, "LONGEST_DRIVE", `Longest Drive · hole ${round.longestDriveHole}`)}
        ${renderAwardSelect(round, "NEAREST_PIN", `Nearest Pin · hole ${round.nearestPinHole}`)}
      </div>
      <div class="scorecards">
        ${entries.filter((entry) => playersForEntry(entry).length).map((entry) => renderScorecard(round, entry)).join("")}
      </div>
    </section>
  `;
}

function renderEntrySetup(round, entry) {
  const players = tripPlayers();
  const selected = playersForEntry(entry).map((player) => player.id);
  const title = round.gameMode === "MATCH_PLAY" ? `Match ${Math.floor(entry.position / 2) + 1} · Player ${entry.position % 2 === 0 ? "A" : "B"}` : round.gameMode === "SCRAMBLE" ? `Team ${entry.position + 1}` : `Player ${entry.position + 1}`;
  return h`
    <div class="entry-setup">
      <strong>${title}</strong>
      ${round.gameMode === "SCRAMBLE"
        ? `<div class="chip-list">${players.map((player) => `<button class="chip ${selected.includes(player.id) ? "selected" : ""}" data-toggle-entry-player="${round.id}|${entry.id}|${player.id}" ${round.locked ? "disabled" : ""}>${escapeHtml(player.name)}</button>`).join("")}</div>`
        : `<div class="slot-row"><select data-set-entry-player="${round.id}|${entry.id}" ${round.locked ? "disabled" : ""}><option value="">Select player</option>${players.map((player) => `<option value="${player.id}" ${selected.includes(player.id) ? "selected" : ""}>${escapeHtml(player.name)}</option>`).join("")}</select><button data-remove-entry="${round.id}|${entry.id}" ${round.locked ? "disabled" : ""}>Remove</button></div>`}
      <label class="field"><span>Scorecard owner</span>
        <select data-set-scorer="${round.id}|${entry.id}" ${round.locked ? "disabled" : ""}>
          <option value="">Admin only</option>
          ${players.filter((player) => selected.includes(player.id)).map((player) => `<option value="${player.id}" ${entry.scorerPlayerId === player.id ? "selected" : ""}>${escapeHtml(player.name)}</option>`).join("")}
        </select>
      </label>
      <span class="review-note">${entryReviewState(entry)}${entry.scorerPlayerId ? ` · scorer ${escapeHtml(playerName(entry.scorerPlayerId))}` : " · admin scoring"}</span>
    </div>
  `;
}

function renderAwardSelect(round, type, label) {
  const value = awardPlayer(round.id, type);
  return h`
    <label class="field"><span>${escapeHtml(label)}</span>
      <select data-award="${round.id}|${type}" ${round.locked ? "disabled" : ""}>
        <option value="">Select player</option>
        ${tripPlayers().map((player) => `<option value="${player.id}" ${player.id === value ? "selected" : ""}>${escapeHtml(player.name)}</option>`).join("")}
      </select>
    </label>
  `;
}

function renderScorecard(round, entry, options = {}) {
  const course = courseFor(round);
  const total = round.gameMode === "MATCH_PLAY" ? matchResult(round, entry).label : entryTotal(round, entry);
  const editable = options.editable ?? (canAdmin() || playerCanEditEntry(round, entry));
  const showSubmit = options.showSubmit && editable && !entry.approvedAt;
  const entryComplete = isEntryComplete(round, entry);
  return h`
    <details class="scorecard" open>
      <summary><strong>${escapeHtml(entryLabel(entry))}</strong><span>${GAME_MODES[round.gameMode].totalLabel}: ${total} · ${entryReviewState(entry)}</span></summary>
      <div class="hole-grid">
        ${course.holes.map((hole) => {
          const value = scoreFor(entry.id, hole.holeNumber);
          return h`
            <div class="hole-cell ${value === "" ? "missing" : ""}">
              <span>H${hole.holeNumber} · P${hole.par}</span>
              <div class="stepper">
                <button data-score="${round.id}|${entry.id}|${hole.holeNumber}|-1" ${!editable ? "disabled" : ""}>-</button>
                <strong>${value || "-"}</strong>
                <button data-score="${round.id}|${entry.id}|${hole.holeNumber}|1" ${!editable ? "disabled" : ""}>+</button>
              </div>
            </div>
          `;
        }).join("")}
      </div>
      ${showSubmit ? `<div class="scorecard-actions"><button class="primary" data-submit-entry="${round.id}|${entry.id}" ${!entryComplete ? "disabled" : ""}>${entry.submittedAt ? "Resubmit scorecard" : "Submit scorecard"}</button>${entryComplete ? "" : `<span class="review-note">Score all 18 holes before submitting.</span>`}</div>` : ""}
    </details>
  `;
}

function renderPlayerPortal() {
  const membership = currentMembership();
  if (!membership.id) return renderAccountAccess();
  const player = currentPlayer();
  if (!player) return renderClaimProfile();
  const rows = leaderboard();
  const mine = rows.find((row) => row.playerId === player.id);
  const editableEntries = tripRounds().flatMap((round) => entriesFor(round).filter((entry) => playerCanEditEntry(round, entry, player.id)).map((entry) => ({ round, entry })));
  return h`
    <section class="hero-panel">
      <p class="eyebrow">Player view</p>
      <h2>${escapeHtml(player.name)}</h2>
      <p>${mine ? `Rank ${mine.rank} · ${mine.points} points` : "Your scoring portal"}</p>
    </section>
    <section class="card">
      <div class="section-header"><h2>My scorecards</h2><span>${editableEntries.length} editable</span></div>
      <div class="scorecards">
        ${editableEntries.map(({ round, entry }) => h`
          <div class="player-round-card">
            <div class="section-header"><h2>${escapeHtml(round.name)}</h2><span>${GAME_MODES[round.gameMode].label}</span></div>
            ${renderScorecard(round, entry, { editable: true, showSubmit: true })}
          </div>
        `).join("") || `<div class="empty">No scorecards assigned to you yet.</div>`}
      </div>
    </section>
    <section class="card">
      <div class="section-header"><h2>My rounds</h2><span>Read-only schedule</span></div>
      <div class="list">
        ${tripRounds().map((round) => {
          const entry = entriesFor(round).find((item) => playersForEntry(item).some((entryPlayer) => entryPlayer.id === player.id));
          return `<div class="list-row"><strong>${escapeHtml(round.name)}</strong><span>${entry ? escapeHtml(entryLabel(entry)) : "Not playing"} · ${derivedStatus(round).replace("_", " ")}</span></div>`;
        }).join("")}
      </div>
    </section>
    ${mine ? renderPlayerBreakdown(mine) : ""}
  `;
}

function renderClaimProfile() {
  const claimedIds = new Set(db.memberships.filter((membership) => membership.tripId === currentTrip().id && membership.playerId).map((membership) => membership.playerId));
  return h`
    <section class="card claim-card">
      <div class="section-header"><h2>Claim your player profile</h2><span>${escapeHtml(currentTrip().name)}</span></div>
      <form class="join-form" data-claim-player>
        <select name="playerId" required>
          <option value="">Choose your name</option>
          ${tripPlayers().map((player) => `<option value="${player.id}" ${claimedIds.has(player.id) ? "disabled" : ""}>${escapeHtml(player.name)}${claimedIds.has(player.id) ? " · claimed" : ""}</option>`).join("")}
        </select>
        <button>Claim profile</button>
      </form>
    </section>
  `;
}

function renderLeaderboard() {
  const rows = leaderboard();
  const leaders = rows.filter((row) => row.rank === 1);
  return h`
    <section class="leader-hero">
      <h2>Golf Trip Leaderboard</h2>
      <div class="points">${leaders[0]?.points || 0}</div>
      <strong>${leaders.map((row) => row.name).join(" / ") || "No leader yet"}</strong>
    </section>
    <section class="card">
      <table class="leaderboard">
        <thead><tr><th>Rank</th><th>Player</th><th>Details</th><th>Points</th></tr></thead>
        <tbody>
          ${rows.map((row) => h`
            <tr class="rank-${row.rank <= 3 ? row.rank : ""}">
              <td>${row.rank}</td>
              <td><button class="link-button" data-select-player="${row.playerId}">${escapeHtml(row.name)}</button></td>
              <td><span>LD ${row.longestDrivePoints}</span><span>NP ${row.nearestPinPoints}</span><span>Clutch ${row.clutchPoints}</span></td>
              <td>${row.points}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </section>
    ${selectedPlayerId ? renderPlayerBreakdown(rows.find((row) => row.playerId === selectedPlayerId)) : ""}
  `;
}

function renderPlayerBreakdown(row) {
  if (!row) return "";
  return h`
    <section class="card breakdown">
      <div class="section-header"><h2>${escapeHtml(row.name)}</h2><span>${row.points} points</span></div>
      <div class="metric-grid">
        <div><strong>${row.resultPoints}</strong><span>Result</span></div>
        <div><strong>${row.longestDrivePoints}</strong><span>LD</span></div>
        <div><strong>${row.nearestPinPoints}</strong><span>NP</span></div>
        <div><strong>${row.clutchPoints}</strong><span>Clutch</span></div>
      </div>
      <div class="list">
        ${row.rounds.map((round) => `<div class="list-row"><strong>${escapeHtml(round.roundName)}</strong><span>${round.result} · ${round.total} pts</span></div>`).join("") || `<div class="empty">No completed rounds yet.</div>`}
      </div>
    </section>
  `;
}

function bindEvents(app) {
  app.querySelectorAll("[data-sign-out]").forEach((button) => button.addEventListener("click", signOut));
  app.querySelectorAll("[data-session-user]").forEach((select) => select.addEventListener("change", () => mutate((next) => {
    next.session.userId = select.value;
    const membership = next.memberships.find((item) => item.tripId === next.session.tripId && item.userId === select.value);
    next.session.view = [ROLES.OWNER, ROLES.ADMIN].includes(membership?.role) ? "admin" : "player";
  })));
  app.querySelectorAll("[data-view]").forEach((button) => button.addEventListener("click", () => mutate((next) => { next.session.view = button.dataset.view; })));
  app.querySelectorAll("[data-admin-tab]").forEach((button) => button.addEventListener("click", () => { adminTab = button.dataset.adminTab; pendingDeleteRoundId = ""; render(); }));
  app.querySelectorAll("[data-scoring-round]").forEach((button) => button.addEventListener("click", () => { pendingDeleteRoundId = ""; scoringRoundId = button.dataset.scoringRound; render(); }));
  app.querySelectorAll("[data-select-player]").forEach((button) => button.addEventListener("click", () => { selectedPlayerId = button.dataset.selectPlayer; render(); }));
  app.querySelectorAll("[data-add-player]").forEach((form) => form.addEventListener("submit", addPlayer));
  app.querySelectorAll("[data-add-round]").forEach((form) => form.addEventListener("submit", addRound));
  app.querySelectorAll("[data-add-course]").forEach((form) => form.addEventListener("submit", addCourse));
  app.querySelectorAll("[data-update-invite-code]").forEach((form) => form.addEventListener("submit", updateInviteCode));
  app.querySelectorAll("[data-course-name]").forEach((input) => input.addEventListener("change", () => updateCourseName(input.dataset.courseName, input.value)));
  app.querySelectorAll("[data-course-hole]").forEach((input) => input.addEventListener("change", () => updateCourseHole(input.dataset.courseHole, input.value)));
  app.querySelectorAll("[data-score]").forEach((button) => button.addEventListener("click", () => changeScore(button.dataset.score)));
  app.querySelectorAll("[data-award]").forEach((select) => select.addEventListener("change", () => setAward(select.dataset.award, select.value)));
  app.querySelectorAll("[data-complete-round]").forEach((button) => button.addEventListener("click", () => completeRound(button.dataset.completeRound)));
  app.querySelectorAll("[data-lock-round]").forEach((button) => button.addEventListener("click", () => toggleRoundLock(button.dataset.lockRound)));
  app.querySelectorAll("[data-toggle-entry-player]").forEach((button) => button.addEventListener("click", () => toggleEntryPlayer(button.dataset.toggleEntryPlayer)));
  app.querySelectorAll("[data-set-entry-player]").forEach((select) => select.addEventListener("change", () => setEntryPlayer(select.dataset.setEntryPlayer, select.value)));
  app.querySelectorAll("[data-remove-entry]").forEach((button) => button.addEventListener("click", () => removeEntry(button.dataset.removeEntry)));
  app.querySelectorAll("[data-remove-round]").forEach((button) => button.addEventListener("click", () => removeRound(button.dataset.removeRound)));
  app.querySelectorAll("[data-set-scorer]").forEach((select) => select.addEventListener("change", () => setEntryScorer(select.dataset.setScorer, select.value)));
  app.querySelectorAll("[data-submit-entry]").forEach((button) => button.addEventListener("click", () => submitEntry(button.dataset.submitEntry)));
  app.querySelectorAll("[data-approve-entry]").forEach((button) => button.addEventListener("click", () => approveEntry(button.dataset.approveEntry)));
  app.querySelectorAll("[data-join-trip]").forEach((form) => form.addEventListener("submit", joinTrip));
  app.querySelectorAll("[data-claim-player]").forEach((form) => form.addEventListener("submit", claimPlayer));
}

async function sendMagicLink(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const email = String(new FormData(form).get("email") || "").trim().toLowerCase();
  if (!email) return;
  try {
    await adapter.sendMagicLink(email);
    authEmailSent = email;
    notice = "";
  } catch (error) {
    console.warn("Magic link failed.", error);
    notice = error.message || "Could not send the magic link.";
  }
  render();
}

async function signOut() {
  try {
    await adapter.signOut();
    authUser = null;
    notice = "Signed out.";
  } catch (error) {
    console.warn("Sign out failed.", error);
    notice = error.message || "Could not sign out.";
  }
  render();
}

function joinTrip(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const data = new FormData(form);
  const inviteCode = String(data.get("inviteCode") || "").trim().toUpperCase();
  if (SUPABASE_ENABLED) {
    joinTripRemote(inviteCode);
    return;
  }
  const trip = db.trips.find((item) => item.inviteCode.toUpperCase() === inviteCode);
  if (!trip) {
    notice = "Invite code not found.";
    render();
    return;
  }
  const name = String(data.get("name") || "").trim();
  const email = String(data.get("email") || "").trim().toLowerCase();
  mutate((next) => {
    let user = next.users.find((item) => item.email.toLowerCase() === email);
    if (!user) {
      user = { id: uid("user"), name, email };
      next.users.push(user);
    }
    if (!next.memberships.some((membership) => membership.tripId === trip.id && membership.userId === user.id)) {
      next.memberships.push({ id: uid("member"), tripId: trip.id, userId: user.id, role: ROLES.PLAYER, playerId: "" });
    }
    next.session.userId = user.id;
    next.session.tripId = trip.id;
    next.session.view = "player";
    notice = "You joined the trip. Claim your player profile next.";
  }, `Joined trip ${trip.name}`);
}

async function joinTripRemote(inviteCode) {
  try {
    await adapter.joinTrip(inviteCode);
    db = await adapter.loadRemote();
    db.session.view = "player";
    scoringRoundId = db.session.activeRoundId || "";
    notice = "You joined the trip. Claim your player profile next.";
  } catch (error) {
    console.warn("Join trip failed.", error);
    notice = error.message || "Invite code not found.";
  }
  render();
}

function claimPlayer(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const playerId = String(new FormData(form).get("playerId") || "");
  if (!playerId) return;
  if (SUPABASE_ENABLED) {
    claimPlayerRemote(playerId);
    return;
  }
  mutate((next) => {
    const membership = next.memberships.find((item) => item.tripId === next.session.tripId && item.userId === next.session.userId);
    if (!membership) return;
    const alreadyClaimed = next.memberships.some((item) => item.tripId === next.session.tripId && item.playerId === playerId && item.userId !== next.session.userId);
    if (alreadyClaimed) {
      notice = "That player profile has already been claimed.";
      return;
    }
    membership.playerId = playerId;
    notice = "Profile claimed. Your scorecards are ready when assigned.";
  }, "Claimed player profile");
}

async function claimPlayerRemote(playerId) {
  try {
    await adapter.claimPlayer(playerId);
    db = await adapter.loadRemote();
    db.session.view = "player";
    notice = "Profile claimed. Your scorecards are ready when assigned.";
  } catch (error) {
    console.warn("Claim player failed.", error);
    notice = error.message || "Could not claim that player profile.";
  }
  render();
}

function updateInviteCode(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const raw = String(new FormData(form).get("inviteCode") || "").trim().toUpperCase();
  const inviteCode = raw.replace(/[^A-Z0-9-]/g, "").slice(0, 16);
  if (inviteCode.length < 4) {
    notice = "Invite code must be at least 4 letters or numbers.";
    render();
    return;
  }
  mutate((next) => {
    const taken = next.trips.some((trip) => trip.id !== next.session.tripId && trip.inviteCode.toUpperCase() === inviteCode);
    if (taken) {
      notice = "That invite code is already in use.";
      return;
    }
    const trip = next.trips.find((item) => item.id === next.session.tripId);
    if (trip) trip.inviteCode = inviteCode;
    notice = "Invite code updated.";
  }, "Updated invite code");
}

function addPlayer(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const data = new FormData(form);
  const name = String(data.get("name") || "").trim();
  if (!name) return;
  mutate((next) => {
    next.players.push({ id: uid("player"), tripId: next.session.tripId, name, handicap: Number(data.get("handicap")) || "", active: true });
  }, `Added player ${name}`);
}

function addCourse(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const data = new FormData(form);
  const name = String(data.get("name") || "").trim();
  if (!name) return;
  mutate((next) => {
    next.courses.push({
      id: uid("course"),
      tripId: next.session.tripId,
      name,
      holes: defaultPars.map((par, index) => ({
        holeNumber: index + 1,
        par,
      })),
    });
  }, `Added course ${name}`);
}

function updateCourseName(courseId, name) {
  mutate((next) => {
    const course = next.courses.find((item) => item.id === courseId);
    if (course && name.trim()) course.name = name.trim();
  }, "Updated course name");
}

function updateCourseHole(payload, value) {
  const [courseId, holeNumberRaw, key] = payload.split("|");
  mutate((next) => {
    if (next.rounds.some((round) => round.courseId === courseId && roundHasSourceData(round))) return;
    const course = next.courses.find((item) => item.id === courseId);
    const hole = course?.holes.find((item) => item.holeNumber === Number(holeNumberRaw));
    if (!hole) return;
    hole.par = Math.max(3, Math.min(6, Number(value) || hole.par));
  }, "Updated course hole");
}

function addRound(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const data = new FormData(form);
  const name = String(data.get("name") || "").trim();
  const gameMode = String(data.get("gameMode"));
  const selectedCourseId = String(data.get("courseId") || "");
  const players = tripPlayers();
  mutate((next) => {
    const roundId = uid("round");
    const courseId = selectedCourseId || next.courses.find((course) => course.tripId === next.session.tripId)?.id;
    next.rounds.push({ id: roundId, tripId: next.session.tripId, courseId, name, gameMode, clutchEnabled: true, clutchHole: 18, longestDriveHole: 9, nearestPinHole: 12, status: ROUND_STATES.NOT_STARTED, locked: false, updatedAt: nowIso() });
    const count = gameMode === "SCRAMBLE" ? 2 : Math.max(2, players.length);
    for (let index = 0; index < count; index += 1) {
      const entryId = uid("entry");
      next.roundEntries.push({ id: entryId, roundId, position: index });
      if (gameMode !== "SCRAMBLE" && players[index]) next.roundEntryPlayers.push({ id: uid("entry_player"), roundEntryId: entryId, playerId: players[index].id });
    }
    next.session.activeRoundId = roundId;
    scoringRoundId = roundId;
  }, `Created round ${name}`);
}

function removeRound(roundId) {
  const round = db.rounds.find((item) => item.id === roundId);
  if (!round || round.locked || !canAdmin()) return;
  if (roundHasSourceData(round) && pendingDeleteRoundId !== roundId) {
    pendingDeleteRoundId = roundId;
    notice = "Tap Confirm to remove this round and all its scorecards, scores, awards, submissions, and approvals.";
    render();
    return;
  }
  pendingDeleteRoundId = "";
  mutate((next) => {
    const entryIds = next.roundEntries.filter((entry) => entry.roundId === roundId).map((entry) => entry.id);
    next.rounds = next.rounds.filter((item) => item.id !== roundId);
    next.roundEntries = next.roundEntries.filter((entry) => entry.roundId !== roundId);
    next.roundEntryPlayers = next.roundEntryPlayers.filter((item) => !entryIds.includes(item.roundEntryId));
    next.scores = next.scores.filter((score) => !entryIds.includes(score.roundEntryId));
    next.awards = next.awards.filter((award) => award.roundId !== roundId);
    if (next.session.activeRoundId === roundId) next.session.activeRoundId = next.rounds.find((item) => item.tripId === next.session.tripId)?.id || "";
    if (scoringRoundId === roundId) scoringRoundId = next.session.activeRoundId;
    notice = "Round removed.";
  }, `Removed round ${round.name}`);
}

function changeScore(payload) {
  const [roundId, entryId, holeNumberRaw, deltaRaw] = payload.split("|");
  const holeNumber = Number(holeNumberRaw);
  const delta = Number(deltaRaw);
  mutate((next) => {
    const round = next.rounds.find((item) => item.id === roundId);
    const entry = next.roundEntries.find((item) => item.id === entryId);
    if (!round || !entry || round.locked || !playerCanEditEntry(round, entry)) return;
    entry.submittedBy = "";
    entry.submittedAt = "";
    entry.approvedBy = "";
    entry.approvedAt = "";
    const course = next.courses.find((item) => item.id === round.courseId);
    const par = course?.holes.find((hole) => hole.holeNumber === holeNumber)?.par || 4;
    const existing = next.scores.find((score) => score.roundEntryId === entryId && score.holeNumber === holeNumber);
    if (existing) existing.strokes = Math.max(1, Math.min(12, existing.strokes + delta));
    else next.scores.push({ id: uid("score"), roundEntryId: entryId, holeNumber, strokes: Math.max(1, Math.min(12, par + (delta > 0 ? 0 : -1))), updatedAt: nowIso() });
    round.status = derivedStatus(round);
    round.updatedAt = nowIso();
  });
}

function setAward(payload, playerId) {
  const [roundId, type] = payload.split("|");
  mutate((next) => {
    const round = next.rounds.find((item) => item.id === roundId);
    if (!round || round.locked) return;
    next.awards = next.awards.filter((award) => !(award.roundId === roundId && award.type === type));
    if (playerId) next.awards.push({ id: uid("award"), roundId, type, playerId });
    round.status = derivedStatus(round);
  });
}

function completeRound(roundId) {
  mutate((next) => {
    const round = next.rounds.find((item) => item.id === roundId);
    if (!round || round.locked) return;
    round.status = isRoundComplete(round) ? ROUND_STATES.COMPLETE : derivedStatus(round);
  }, "Completed round");
}

function toggleRoundLock(roundId) {
  mutate((next) => {
    const round = next.rounds.find((item) => item.id === roundId);
    if (round) round.locked = !round.locked;
  }, "Changed round lock");
}

function toggleEntryPlayer(payload) {
  const [roundId, entryId, playerId] = payload.split("|");
  mutate((next) => {
    const round = next.rounds.find((item) => item.id === roundId);
    if (!round || round.locked) return;
    const entryIds = next.roundEntries.filter((entry) => entry.roundId === roundId).map((entry) => entry.id);
    const selected = next.roundEntryPlayers.some((item) => item.roundEntryId === entryId && item.playerId === playerId);
    next.roundEntryPlayers = next.roundEntryPlayers.filter((item) => {
      if (!entryIds.includes(item.roundEntryId)) return true;
      if (item.roundEntryId === entryId && item.playerId === playerId) return false;
      return item.playerId !== playerId;
    });
    if (!selected) next.roundEntryPlayers.push({ id: uid("entry_player"), roundEntryId: entryId, playerId });
  });
}

function setEntryPlayer(payload, playerId) {
  const [roundId, entryId] = payload.split("|");
  mutate((next) => {
    const round = next.rounds.find((item) => item.id === roundId);
    if (!round || round.locked) return;
    const entryIds = next.roundEntries.filter((entry) => entry.roundId === roundId).map((entry) => entry.id);
    next.roundEntryPlayers = next.roundEntryPlayers.filter((item) => {
      if (!entryIds.includes(item.roundEntryId)) return true;
      if (item.roundEntryId === entryId) return false;
      return item.playerId !== playerId;
    });
    if (playerId) next.roundEntryPlayers.push({ id: uid("entry_player"), roundEntryId: entryId, playerId });
  });
}

function setEntryScorer(payload, playerId) {
  const [roundId, entryId] = payload.split("|");
  mutate((next) => {
    const round = next.rounds.find((item) => item.id === roundId);
    const entry = next.roundEntries.find((item) => item.id === entryId);
    if (!round || !entry || round.locked || !canAdmin()) return;
    entry.scorerPlayerId = playerId;
  }, "Changed scorecard owner");
}

function submitEntry(payload) {
  const [roundId, entryId] = payload.split("|");
  mutate((next) => {
    const round = next.rounds.find((item) => item.id === roundId);
    const entry = next.roundEntries.find((item) => item.id === entryId);
    if (!round || !entry || !playerCanEditEntry(round, entry) || !isEntryComplete(round, entry)) return;
    entry.submittedBy = next.session.userId;
    entry.submittedAt = nowIso();
    entry.approvedBy = "";
    entry.approvedAt = "";
  }, "Submitted scorecard");
}

function approveEntry(payload) {
  const [roundId, entryId] = payload.split("|");
  mutate((next) => {
    const round = next.rounds.find((item) => item.id === roundId);
    const entry = next.roundEntries.find((item) => item.id === entryId);
    if (!round || !entry || round.locked || !canAdmin() || !entry.submittedAt || !isEntryComplete(round, entry)) return;
    entry.approvedBy = next.session.userId;
    entry.approvedAt = nowIso();
  }, "Approved scorecard");
}

function removeEntry(payload) {
  const [roundId, entryId] = payload.split("|");
  mutate((next) => {
    const round = next.rounds.find((item) => item.id === roundId);
    if (!round || round.locked) return;
    next.roundEntries = next.roundEntries.filter((entry) => entry.id !== entryId);
    next.roundEntryPlayers = next.roundEntryPlayers.filter((item) => item.roundEntryId !== entryId);
    next.scores = next.scores.filter((score) => score.roundEntryId !== entryId);
  }, "Removed round entry");
}

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch((error) => console.warn("Service worker registration failed.", error));
  });
}

function backfillScorecardOwners() {
  db.roundEntries.forEach((entry) => {
    if (entry.scorerPlayerId) return;
    const firstPlayerId = entryPlayerIds(entry)[0] || "";
    if (firstPlayerId) entry.scorerPlayerId = firstPlayerId;
  });
  persist();
}

async function initializeApp() {
  if (!SUPABASE_ENABLED) {
    backfillScorecardOwners();
    render();
    return;
  }
  try {
    authUser = await adapter.authUser();
    if (authUser) {
      db = await adapter.loadRemote();
      db.session.userId = authUser.id;
      const membership = currentMembership();
      db.session.view = [ROLES.OWNER, ROLES.ADMIN].includes(membership?.role) ? "admin" : "player";
      scoringRoundId = db.session.activeRoundId || tripRounds()[0]?.id || "";
    }
    supabaseClient.auth.onAuthStateChange(async (_event, session) => {
      authUser = session?.user || null;
      if (authUser) {
        try {
          db = await adapter.loadRemote();
          db.session.userId = authUser.id;
          const membership = currentMembership();
          db.session.view = [ROLES.OWNER, ROLES.ADMIN].includes(membership?.role) ? "admin" : "player";
          scoringRoundId = db.session.activeRoundId || tripRounds()[0]?.id || "";
          notice = "Signed in.";
        } catch (error) {
          console.warn("Supabase reload failed.", error);
          notice = error.message || "Could not load your trip.";
        }
      }
      booting = false;
      render();
    });
  } catch (error) {
    console.warn("Supabase startup failed.", error);
    notice = error.message || "Could not connect to Supabase.";
  }
  booting = false;
  render();
}

window.addEventListener("error", (event) => {
  notice = "Recovered from an app error. Your saved data is still intact.";
  console.warn("Recovered from app error.", event.error);
});

initializeApp();
