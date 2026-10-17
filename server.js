require("dotenv").config();
const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const mysql = require("mysql2/promise");
const crypto = require("crypto");
const path = require("path");

const app = express();
app.use(cors());
app.use(express.json({ limit: "10mb" }));

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 5,
  charset: "utf8mb4",
  ssl: { rejectUnauthorized: false },
});

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET || JWT_SECRET.length < 20) {
  console.error("JWT_SECRET missing or too short in .env");
  process.exit(1);
}

function hashChapter(name, cards) {
  const kanjiList = cards.map(c => (c.k || c.kanji || "").trim()).filter(Boolean).sort();
  const h = crypto.createHash("sha256");
  h.update(kanjiList.join("\n"));
  return h.digest("hex");
}
app.patch("/api/vocab/lessons/:id", auth, adminOnly, async (req, res) => {
  const id = Number(req.params.id);
  const { name } = req.body || {};
  if (!name || !name.trim()) return res.status(400).json({ error: "name required" });
  const trimmed = name.trim();
  await pool.query("UPDATE vocab_lessons SET name = ? WHERE id = ?", [trimmed, id]);
  res.json({ ok: true, id, name: trimmed });
});
function sign(user) {
  return jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: "30d" });
}

async function auth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: "no token" });
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const [rows] = await pool.query(
      "SELECT id, username, is_admin, display_name, avatar_emoji FROM users WHERE id = ?",
      [payload.id]
    );
    if (rows.length === 0) return res.status(401).json({ error: "user not found" });
    req.user = rows[0];
    pool.query("UPDATE users SET last_active_at = NOW() WHERE id = ?", [req.user.id]).catch(()=>{});
    next();
  } catch (e) {
    res.status(401).json({ error: "invalid token" });
  }
}

function adminOnly(req, res, next) {
  if (!req.user || !req.user.is_admin) return res.status(403).json({ error: "admin only" });
  next();
}

function publicUser(row) {
  return {
    id: row.id,
    username: row.username,
    display_name: row.display_name || null,
    avatar_emoji: row.avatar_emoji || null,
    is_admin: !!row.is_admin,
  };
}

const VALID_CARD_TYPES = ["kanji", "vocab"];
function normalizeCardType(t) {
  return VALID_CARD_TYPES.includes(t) ? t : "kanji";
}

async function seedUsers() {
  const users = [
    { name: process.env.SEED_USER_1, pass: process.env.SEED_PASSWORD },
    { name: process.env.SEED_USER_2, pass: process.env.SEED_PASSWORD },
  ].filter(u => u.name && u.pass);
  for (const u of users) {
    const [rows] = await pool.query("SELECT id FROM users WHERE username = ?", [u.name]);
    if (rows.length === 0) {
      const hash = await bcrypt.hash(u.pass, 10);
      await pool.query("INSERT INTO users (username, password_hash) VALUES (?, ?)", [u.name, hash]);
      console.log(`created user: ${u.name}`);
    } else {
      console.log(`user exists: ${u.name}`);
    }
  }
}

/* ---------- health ---------- */
app.get("/api/health", async (req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ ok: true, db: true, time: new Date().toISOString() });
  } catch (e) {
    res.status(500).json({ ok: false, db: false, error: e.code || e.message });
  }
});

/* ---------- auth ---------- */
app.post("/api/auth/register", async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: "username and password required" });
  if (username.length > 50) return res.status(400).json({ error: "username too long" });
  if (password.length < 6) return res.status(400).json({ error: "password must be at least 6 characters" });
  try {
    const hash = await bcrypt.hash(password, 10);
    const [r] = await pool.query("INSERT INTO users (username, password_hash) VALUES (?, ?)", [username, hash]);
    const user = { id: r.insertId, username };
    res.json({ token: sign(user), user: { id: user.id, username: user.username, display_name: null, avatar_emoji: null, is_admin: false } });
  } catch (e) {
    if (e.code === "ER_DUP_ENTRY") return res.status(409).json({ error: "username taken" });
    console.error(e);
    res.status(500).json({ error: "server error" });
  }
});

app.post("/api/auth/login", async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: "username and password required" });
  const [rows] = await pool.query(
    "SELECT id, username, password_hash, display_name, avatar_emoji, is_admin FROM users WHERE username = ?",
    [username]
  );
  if (rows.length === 0) return res.status(401).json({ error: "invalid credentials" });
  const ok = await bcrypt.compare(password, rows[0].password_hash);
  if (!ok) return res.status(401).json({ error: "invalid credentials" });
  const user = publicUser(rows[0]);
  await pool.query("UPDATE users SET last_active_at = NOW() WHERE id = ?", [user.id]);
  res.json({ token: sign({ id: user.id, username: user.username }), user });
});

app.post("/api/auth/change-password", auth, async (req, res) => {
  const { current_password, new_password } = req.body || {};
  if (!current_password || !new_password) return res.status(400).json({ error: "current_password and new_password required" });
  if (new_password.length < 6) return res.status(400).json({ error: "new password must be at least 6 characters" });
  if (new_password === current_password) return res.status(400).json({ error: "new password must be different" });
  const [rows] = await pool.query("SELECT password_hash FROM users WHERE id = ?", [req.user.id]);
  if (rows.length === 0) return res.status(404).json({ error: "user not found" });
  const ok = await bcrypt.compare(current_password, rows[0].password_hash);
  if (!ok) return res.status(401).json({ error: "current password is incorrect" });
  const newHash = await bcrypt.hash(new_password, 10);
  await pool.query("UPDATE users SET password_hash = ? WHERE id = ?", [newHash, req.user.id]);
  res.json({ ok: true });
});

/* ---------- me ---------- */
app.get("/api/me", auth, async (req, res) => {
  const [rows] = await pool.query(
    "SELECT id, username, display_name, avatar_emoji, is_admin FROM users WHERE id = ?",
    [req.user.id]
  );
  if (rows.length === 0) return res.status(404).json({ error: "user not found" });
  res.json({ user: publicUser(rows[0]) });
});

app.patch("/api/me", auth, async (req, res) => {
  const { display_name, avatar_emoji } = req.body || {};
  const fields = [];
  const values = [];
  if (display_name !== undefined) {
    const dn = String(display_name || "").trim();
    if (dn.length > 50) return res.status(400).json({ error: "display name too long" });
    fields.push("display_name = ?");
    values.push(dn || null);
  }
  if (avatar_emoji !== undefined) {
    const ae = String(avatar_emoji || "").trim();
    if (ae.length > 8) return res.status(400).json({ error: "emoji too long" });
    fields.push("avatar_emoji = ?");
    values.push(ae || null);
  }
  if (fields.length === 0) return res.status(400).json({ error: "nothing to update" });
  values.push(req.user.id);
  await pool.query(`UPDATE users SET ${fields.join(", ")} WHERE id = ?`, values);
  const [rows] = await pool.query(
    "SELECT id, username, display_name, avatar_emoji, is_admin FROM users WHERE id = ?",
    [req.user.id]
  );
  res.json({ user: publicUser(rows[0]) });
});

/* ---------- presence ---------- */
app.get("/api/presence", auth, async (req, res) => {
  const [rows] = await pool.query(
    `SELECT u.id, u.username, u.display_name, u.avatar_emoji,
            u.last_active_at, u.current_chapter_id, u.current_activity,
            c.name AS chapter_name
     FROM users u
     LEFT JOIN chapters c ON c.id = u.current_chapter_id
     ORDER BY u.id ASC`
  );
  res.json({ users: rows.map(r => ({
    id: r.id,
    username: r.username,
    display_name: r.display_name || r.username,
    avatar_emoji: r.avatar_emoji || null,
    last_active_at: r.last_active_at,
    current_chapter_id: r.current_chapter_id,
    current_chapter_name: r.chapter_name,
    current_activity: r.current_activity,
  })) });
});

app.post("/api/activity", auth, async (req, res) => {
  const { chapter_id, activity } = req.body || {};
  const validActivities = ["browse", "learn", "quick", "review", "idle", null];
  const act = validActivities.includes(activity) ? activity : null;
  const chId = chapter_id ? Number(chapter_id) : null;
  await pool.query(
    "UPDATE users SET current_chapter_id = ?, current_activity = ?, last_active_at = NOW() WHERE id = ?",
    [chId, act, req.user.id]
  );
  res.json({ ok: true });
});

/* ---------- reactions & notifications ---------- */
const VALID_EMOJI = ["🔥", "👋", "💪", "😅", "🤔", "🎮"];
const VALID_KINDS = ["reaction", "quiz_invite"];

app.post("/api/reactions", auth, async (req, res) => {
  const { to_user_id, emoji, kind, payload } = req.body || {};
  const toId = Number(to_user_id);
  if (!toId || !emoji) return res.status(400).json({ error: "to_user_id and emoji required" });
  if (!VALID_EMOJI.includes(emoji)) return res.status(400).json({ error: "invalid emoji" });
  const k = VALID_KINDS.includes(kind) ? kind : "reaction";
  if (toId === req.user.id) return res.status(400).json({ error: "can't react to yourself" });
  const [target] = await pool.query("SELECT id FROM users WHERE id = ?", [toId]);
  if (target.length === 0) return res.status(404).json({ error: "user not found" });
  const payloadJson = payload ? JSON.stringify(payload) : null;
  await pool.query(
    "INSERT INTO reactions (from_user_id, to_user_id, emoji, kind, payload) VALUES (?, ?, ?, ?, ?)",
    [req.user.id, toId, emoji, k, payloadJson]
  );
  res.json({ ok: true });
});

app.get("/api/reactions/unseen", auth, async (req, res) => {
  const [rows] = await pool.query(
    `SELECT r.id, r.emoji, r.kind, r.payload, r.created_at,
            u.id AS from_user_id, u.username AS from_username,
            u.display_name AS from_display_name, u.avatar_emoji AS from_avatar_emoji
     FROM reactions r
     JOIN users u ON u.id = r.from_user_id
     WHERE r.to_user_id = ? AND r.seen = 0
     ORDER BY r.created_at ASC`,
    [req.user.id]
  );
  res.json({ reactions: rows.map(r => ({
    id: r.id,
    emoji: r.emoji,
    kind: r.kind || "reaction",
    payload: r.payload ? (typeof r.payload === "string" ? JSON.parse(r.payload) : r.payload) : null,
    created_at: r.created_at,
    from_user_id: r.from_user_id,
    from_display_name: r.from_display_name || r.from_username,
    from_avatar_emoji: r.from_avatar_emoji || null,
  })) });
});

app.post("/api/reactions/seen", auth, async (req, res) => {
  const ids = Array.isArray(req.body?.ids) ? req.body.ids : [];
  if (ids.length === 0) return res.json({ ok: true });
  const safeIds = ids.map(n => Number(n)).filter(Boolean);
  if (safeIds.length === 0) return res.json({ ok: true });
  await pool.query(
    `UPDATE reactions SET seen = 1 WHERE to_user_id = ? AND id IN (${safeIds.map(()=>"?").join(",")})`,
    [req.user.id, ...safeIds]
  );
  res.json({ ok: true });
});

/* ---------- settings sync ---------- */
app.get("/api/settings", auth, async (req, res) => {
  const [rows] = await pool.query("SELECT data, updated_at FROM user_settings WHERE user_id = ?", [req.user.id]);
  if (rows.length === 0) return res.json({ data: null, updated_at: null });
  let parsed = null;
  try { parsed = typeof rows[0].data === "string" ? JSON.parse(rows[0].data) : rows[0].data; } catch(e){}
  res.json({ data: parsed, updated_at: rows[0].updated_at });
});

app.post("/api/settings", auth, async (req, res) => {
  const { data } = req.body || {};
  if (!data || typeof data !== "object") return res.status(400).json({ error: "data object required" });
  const json = JSON.stringify(data);
  await pool.query(
    `INSERT INTO user_settings (user_id, data) VALUES (?, ?)
     ON DUPLICATE KEY UPDATE data = VALUES(data), updated_at = CURRENT_TIMESTAMP`,
    [req.user.id, json]
  );
  res.json({ ok: true });
});

/* ---------- weak cards sync ---------- */
app.get("/api/weak", auth, async (req, res) => {
  const cardType = normalizeCardType(req.query.card_type);
  const [rows] = await pool.query(
    "SELECT card_id, misses FROM weak_cards WHERE user_id = ? AND card_type = ?",
    [req.user.id, cardType]
  );
  res.json({ weak: rows, card_type: cardType });
});

app.post("/api/weak", auth, async (req, res) => {
  const items = Array.isArray(req.body?.items) ? req.body.items : null;
  if (!items) return res.status(400).json({ error: "items array required" });
  if (items.length === 0) return res.json({ ok: true });
  const values = items.map(it => [
    req.user.id,
    normalizeCardType(it.card_type),
    Number(it.card_id),
    Math.max(0, Number(it.misses) || 0),
  ]);
  await pool.query(
    `INSERT INTO weak_cards (user_id, card_type, card_id, misses) VALUES ?
     ON DUPLICATE KEY UPDATE misses = VALUES(misses)`,
    [values]
  );
  res.json({ ok: true });
});

app.delete("/api/weak/:cardType/:cardId", auth, async (req, res) => {
  const cardType = normalizeCardType(req.params.cardType);
  await pool.query(
    "DELETE FROM weak_cards WHERE user_id = ? AND card_type = ? AND card_id = ?",
    [req.user.id, cardType, Number(req.params.cardId)]
  );
  res.json({ ok: true });
});

/* ---------- daily seen sync ---------- */
app.get("/api/daily", auth, async (req, res) => {
  const date = req.query.date || new Date().toISOString().slice(0,10);
  const cardType = normalizeCardType(req.query.card_type);
  const [rows] = await pool.query(
    "SELECT card_id FROM daily_seen WHERE user_id = ? AND card_type = ? AND seen_date = ?",
    [req.user.id, cardType, date]
  );
  res.json({ date, card_type: cardType, cardIds: rows.map(r => r.card_id) });
});

app.post("/api/daily", auth, async (req, res) => {
  const { date, cardIds } = req.body || {};
  const cardType = normalizeCardType(req.body?.card_type);
  if (!date || !Array.isArray(cardIds)) return res.status(400).json({ error: "date and cardIds required" });
  if (cardIds.length === 0) return res.json({ ok: true });
  const values = cardIds.map(cid => [req.user.id, cardType, Number(cid), date]);
  await pool.query("INSERT IGNORE INTO daily_seen (user_id, card_type, card_id, seen_date) VALUES ?", [values]);
  res.json({ ok: true });
});

/* ---------- chapters (kanji) ---------- */
app.get("/api/chapters", auth, async (req, res) => {
  const [rows] = await pool.query(
    "SELECT id, name, card_count, created_by, created_at, updated_at FROM chapters ORDER BY id ASC"
  );
  res.json({ chapters: rows });
});

app.get("/api/chapters/:id", auth, async (req, res) => {
  const id = Number(req.params.id);
  const [chRows] = await pool.query("SELECT * FROM chapters WHERE id = ?", [id]);
  if (chRows.length === 0) return res.status(404).json({ error: "not found" });
  const [cardRows] = await pool.query(
    "SELECT id, position, kanji, reading, meaning, sentence FROM cards WHERE chapter_id = ? ORDER BY position ASC",
    [id]
  );
  res.json({ chapter: chRows[0], cards: cardRows });
});

app.post("/api/chapters", auth, adminOnly, async (req, res) => {
  const { name, cards } = req.body || {};
  if (!name || !Array.isArray(cards) || cards.length === 0) return res.status(400).json({ error: "name and non-empty cards array required" });
  const cleaned = cards.map(c => ({
    k: (c.k || c.kanji || "").trim(),
    r: (c.r || c.reading || "").trim(),
    m: (c.m || c.meaning || "").trim(),
    s: (c.s || c.sentence || "").trim(),
  })).filter(c => c.k && c.r);
  if (cleaned.length === 0) return res.status(400).json({ error: "no valid cards" });
  const contentHash = hashChapter(name, cleaned);
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [r] = await conn.query(
      "INSERT INTO chapters (name, content_hash, card_count, created_by) VALUES (?, ?, ?, ?)",
      [name, contentHash, cleaned.length, req.user.id]
    );
    const chapterId = r.insertId;
    const values = cleaned.map((c, i) => [chapterId, i, c.k, c.r, c.m, c.s]);
    await conn.query("INSERT INTO cards (chapter_id, position, kanji, reading, meaning, sentence) VALUES ?", [values]);
    await conn.commit();
    res.json({ id: chapterId, name, card_count: cleaned.length });
  } catch (e) {
    await conn.rollback();
    if (e.code === "ER_DUP_ENTRY") {
      const [existing] = await pool.query("SELECT id, name, created_at FROM chapters WHERE content_hash = ?", [contentHash]);
      return res.status(409).json({ error: "duplicate", existing: existing[0] || null });
    }
    console.error(e);
    res.status(500).json({ error: "server error" });
  } finally {
    conn.release();
  }
});

app.patch("/api/chapters/:id", auth, adminOnly, async (req, res) => {
  const id = Number(req.params.id);
  const { name } = req.body || {};
  if (!name || !name.trim()) return res.status(400).json({ error: "name required" });
  const trimmed = name.trim();
  if (trimmed.length > 200) return res.status(400).json({ error: "name too long" });
  const [rows] = await pool.query("SELECT id FROM chapters WHERE id = ?", [id]);
  if (rows.length === 0) return res.status(404).json({ error: "not found" });
  await pool.query("UPDATE chapters SET name = ? WHERE id = ?", [trimmed, id]);
  res.json({ ok: true, id, name: trimmed });
});

app.delete("/api/chapters/:id", auth, adminOnly, async (req, res) => {
  const id = Number(req.params.id);
  const [rows] = await pool.query("SELECT id FROM chapters WHERE id = ?", [id]);
  if (rows.length === 0) return res.status(404).json({ error: "not found" });
  await pool.query("DELETE FROM chapters WHERE id = ?", [id]);
  res.json({ ok: true });
});

/* ---------- progress ---------- */
app.get("/api/progress", auth, async (req, res) => {
  const cardType = normalizeCardType(req.query.card_type);
  const [rows] = await pool.query(
    "SELECT card_id, box, due, misses, last_seen, level2_at FROM progress WHERE user_id = ? AND card_type = ?",
    [req.user.id, cardType]
  );
  res.json({ progress: rows, card_type: cardType });
});

app.post("/api/progress", auth, async (req, res) => {
  const items = Array.isArray(req.body?.items) ? req.body.items : null;
  if (!items) return res.status(400).json({ error: "items array required" });
  if (items.length === 0) return res.json({ ok: true, updated: 0 });
  const values = items.map(it => [
    req.user.id,
    normalizeCardType(it.card_type),
    Number(it.card_id),
    Math.max(0, Math.min(5, Number(it.box) || 0)),
    it.due ? new Date(it.due) : null,
    Math.max(0, Number(it.misses) || 0),
    it.last_seen ? new Date(it.last_seen) : new Date(),
    it.level2_at ? new Date(it.level2_at) : null,
  ]);
  await pool.query(
    `INSERT INTO progress (user_id, card_type, card_id, box, due, misses, last_seen, level2_at)
     VALUES ?
     ON DUPLICATE KEY UPDATE
       box = IF(VALUES(last_seen) >= last_seen, VALUES(box), box),
       due = IF(VALUES(last_seen) >= last_seen, VALUES(due), due),
       misses = IF(VALUES(last_seen) >= last_seen, VALUES(misses), misses),
       level2_at = IF(VALUES(last_seen) >= last_seen, VALUES(level2_at), level2_at),
       last_seen = GREATEST(last_seen, VALUES(last_seen))`,
    [values]
  );
  res.json({ ok: true, updated: items.length });
});

/* ---------- streaks ---------- */
app.get("/api/streak", auth, async (req, res) => {
  const [rows] = await pool.query("SELECT date FROM streaks WHERE user_id = ?", [req.user.id]);
  res.json({ dates: rows.map(r => r.date.toISOString().slice(0, 10)) });
});

app.post("/api/streak", auth, async (req, res) => {
  const dates = Array.isArray(req.body?.dates) ? req.body.dates : [];
  if (dates.length === 0) return res.json({ ok: true });
  const values = dates.map(d => [req.user.id, d]);
  await pool.query("INSERT IGNORE INTO streaks (user_id, date) VALUES ?", [values]);
  res.json({ ok: true });
});

/* =========================================================
   KOTOBA (vocabulary) routes
   ========================================================= */

/* list all units + lessons (for the Kotoba home screen) */
app.get("/api/vocab/units", auth, async (req, res) => {
  const [units] = await pool.query(
    "SELECT id, name, position FROM vocab_units ORDER BY position ASC, id ASC"
  );
  const [lessons] = await pool.query(
    `SELECT l.id, l.unit_id, l.name, l.position,
            COUNT(c.id) AS card_count
     FROM vocab_lessons l
     LEFT JOIN vocab_cards c ON c.lesson_id = l.id
     GROUP BY l.id
     ORDER BY l.position ASC, l.id ASC`
  );
  res.json({ units, lessons });
});

/* full lesson detail: lesson + all cards (grouped client-side) */
app.get("/api/vocab/lessons/:id", auth, async (req, res) => {
  const id = Number(req.params.id);
  const [lessonRows] = await pool.query(
    `SELECT l.id, l.unit_id, l.name, u.name AS unit_name
     FROM vocab_lessons l JOIN vocab_units u ON u.id = l.unit_id
     WHERE l.id = ?`,
    [id]
  );
  if (lessonRows.length === 0) return res.status(404).json({ error: "not found" });
  const [cards] = await pool.query(
    `SELECT id, group_title, group_kind, position, kind,
            kanji, kana, meaning, def_ja, note, sentence
     FROM vocab_cards WHERE lesson_id = ? ORDER BY position ASC, id ASC`,
    [id]
  );
  res.json({ lesson: lessonRows[0], cards });
});

/* import one lesson at a time (admin only).
   Body: { unit, lesson, groups: [{ title, kind, cards: [...] }] }
   Creates the unit and lesson if they don't exist. Appends cards. */
app.post("/api/vocab/import", auth, adminOnly, async (req, res) => {
  const { unit, lesson, groups } = req.body || {};
  if (!unit || !lesson || !Array.isArray(groups) || groups.length === 0) {
    return res.status(400).json({ error: "unit, lesson, and non-empty groups array required" });
  }

  const cleanedGroups = groups.map(g => {
    const kind = (g.kind === "meaning") ? "meaning" : "reading";
    const title = String(g.title || "").trim().slice(0, 100);
    const cards = (Array.isArray(g.cards) ? g.cards : []).map(c => ({
      kanji: String(c.kanji || "").trim().slice(0, 200),
      kana: String(c.kana || "").trim().slice(0, 200),
      meaning: String(c.meaning || "").trim().slice(0, 500),
      def_ja: String(c.def_ja || "").trim().slice(0, 500),
      note: String(c.note || "").trim().slice(0, 500),
      sentence: String(c.sentence || "").trim(),
    })).filter(c => c.kana && (c.kanji || c.kana));
    return { kind, title, cards };
  }).filter(g => g.cards.length > 0);

  if (cleanedGroups.length === 0) {
    return res.status(400).json({ error: "no valid cards" });
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // unit (upsert by name)
    const [uRows] = await conn.query("SELECT id FROM vocab_units WHERE name = ?", [unit]);
    let unitId;
    if (uRows.length > 0) {
      unitId = uRows[0].id;
    } else {
      const [maxPos] = await conn.query("SELECT COALESCE(MAX(position), -1) + 1 AS p FROM vocab_units");
      const [r] = await conn.query(
        "INSERT INTO vocab_units (name, position) VALUES (?, ?)",
        [unit, maxPos[0].p]
      );
      unitId = r.insertId;
    }

    // lesson (upsert by unit_id + name)
    const [lRows] = await conn.query(
      "SELECT id FROM vocab_lessons WHERE unit_id = ? AND name = ?",
      [unitId, lesson]
    );
    let lessonId;
    if (lRows.length > 0) {
      lessonId = lRows[0].id;
    } else {
      const [maxPos] = await conn.query(
        "SELECT COALESCE(MAX(position), -1) + 1 AS p FROM vocab_lessons WHERE unit_id = ?",
        [unitId]
      );
      const [r] = await conn.query(
        "INSERT INTO vocab_lessons (unit_id, name, position) VALUES (?, ?, ?)",
        [unitId, lesson, maxPos[0].p]
      );
      lessonId = r.insertId;
    }

    // starting position (append after existing cards in this lesson)
    const [posRow] = await conn.query(
      "SELECT COALESCE(MAX(position), -1) + 1 AS start FROM vocab_cards WHERE lesson_id = ?",
      [lessonId]
    );
    let pos = posRow[0].start;

    const values = [];
    for (const g of cleanedGroups) {
      for (const c of g.cards) {
        values.push([
          lessonId, g.title, g.kind, pos++,
          g.kind,               // card kind defaults to group kind
          c.kanji, c.kana, c.meaning, c.def_ja, c.note, c.sentence,
        ]);
      }
    }

    await conn.query(
      `INSERT INTO vocab_cards
       (lesson_id, group_title, group_kind, position, kind, kanji, kana, meaning, def_ja, note, sentence)
       VALUES ?`,
      [values]
    );

    await conn.commit();
    res.json({
      ok: true,
      unit_id: unitId,
      lesson_id: lessonId,
      cards_added: values.length,
    });
  } catch (e) {
    await conn.rollback();
    console.error(e);
    res.status(500).json({ error: "server error", detail: e.message });
  } finally {
    conn.release();
  }
});
app.patch("/api/vocab/units/:id", auth, adminOnly, async (req, res) => {
  const id = Number(req.params.id);
  const { name } = req.body || {};
  if (!name || !name.trim()) return res.status(400).json({ error: "name required" });
  await pool.query("UPDATE vocab_units SET name = ? WHERE id = ?", [name.trim(), id]);
  res.json({ ok: true });
});
/* delete a whole unit (admin only) */
app.delete("/api/vocab/units/:id", auth, adminOnly, async (req, res) => {
  const id = Number(req.params.id);
  const [rows] = await pool.query("SELECT id FROM vocab_units WHERE id = ?", [id]);
  if (rows.length === 0) return res.status(404).json({ error: "not found" });
  await pool.query("DELETE FROM vocab_units WHERE id = ?", [id]);
  res.json({ ok: true });
});

/* delete a lesson (admin only) */
app.delete("/api/vocab/lessons/:id", auth, adminOnly, async (req, res) => {
  const id = Number(req.params.id);
  const [rows] = await pool.query("SELECT id FROM vocab_lessons WHERE id = ?", [id]);
  if (rows.length === 0) return res.status(404).json({ error: "not found" });
  await pool.query("DELETE FROM vocab_lessons WHERE id = ?", [id]);
  res.json({ ok: true });
});

/* ---------- static frontend ---------- */
app.use(express.static(path.join(__dirname, "public")));
app.get(/^\/(?!api\/).*/, (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

/* ---------- boot ---------- */
(async () => {
  try {
    await pool.query("SELECT 1");
    console.log("connected to MySQL");
    await seedUsers();
    const port = Number(process.env.PORT || 3000);
    app.listen(port, "0.0.0.0", () => {
      console.log(`server listening on http://0.0.0.0:${port}`);
    });
  } catch (e) {
    console.error("startup failed:", e.message);
    process.exit(1);
  }
})();