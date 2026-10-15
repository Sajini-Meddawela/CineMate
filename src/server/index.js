'use strict';

const fs = require('node:fs');
const path = require('node:path');
const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const Database = require('better-sqlite3');
const { z } = require('zod');

const envPath = path.resolve(__dirname, '../../.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const index = trimmed.indexOf('=');
    if (index < 1) continue;
    const key = trimmed.slice(0, index).trim();
    let value = trimmed.slice(index + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', process.env.TRUST_PROXY === 'true' ? 1 : false);

const NODE_ENV = process.env.NODE_ENV || 'development';
const COOKIE_NAME = 'cinemate_session';
const COOKIE_SAME_SITE = String(process.env.COOKIE_SAME_SITE || 'lax').toLowerCase();
const COOKIE_SECURE = NODE_ENV === 'production' || process.env.COOKIE_SECURE === 'true';
if (!['lax', 'strict', 'none'].includes(COOKIE_SAME_SITE)) throw new Error('COOKIE_SAME_SITE must be lax, strict, or none.');
if (COOKIE_SAME_SITE === 'none' && !COOKIE_SECURE) throw new Error('SameSite=None cookies require COOKIE_SECURE=true or NODE_ENV=production.');
const configuredJwtSecret = (process.env.JWT_SECRET || '').trim();
const JWT_SECRET = configuredJwtSecret || (NODE_ENV === 'production' ? '' : 'local-development-secret-change-before-deploy-please');
if (NODE_ENV === 'production' && (JWT_SECRET.length < 32 || /replace-with|change.me|your.secret|development.only/i.test(JWT_SECRET))) {
  throw new Error('Production requires JWT_SECRET to be set to a random secret of at least 32 characters.');
}
if (NODE_ENV !== 'production' && !process.env.JWT_SECRET) {
  console.warn('[security] Using development JWT secret. Set JWT_SECRET before deployment.');
}

const databasePath = process.env.DATABASE_PATH
  ? path.resolve(process.env.DATABASE_PATH)
  : path.resolve(__dirname, '../../movies.db');
fs.mkdirSync(path.dirname(databasePath), { recursive: true });
const db = new Database(databasePath);
db.pragma('foreign_keys = ON');
db.pragma('journal_mode = WAL');
db.pragma('busy_timeout = 5000');

const allowedOrigins = (process.env.CORS_ORIGIN || 'http://localhost:3000,http://127.0.0.1:3000,http://localhost:5173,http://127.0.0.1:5173')
  .split(',')
  .map((origin) => origin.trim().replace(/\/$/, ''))
  .filter(Boolean);

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  next();
});
app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin.replace(/\/$/, ''))) return callback(null, true);
    return callback(new Error('Origin is not allowed by CORS'));
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  maxAge: 600,
  credentials: true,
}));
app.use(express.json({ limit: '1mb' }));

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL,
    email TEXT NOT NULL,
    password TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS watchlist (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    movie_id INTEGER,
    watched INTEGER NOT NULL DEFAULT 0,
    favorite INTEGER NOT NULL DEFAULT 0,
    rating INTEGER,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
  );
`);

function ensureColumn(table, column, definition) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all();
  if (!columns.some((item) => item.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

ensureColumn('users', 'created_at', "TEXT NOT NULL DEFAULT ''");
ensureColumn('watchlist', 'media_type', "TEXT NOT NULL DEFAULT 'movie'");
ensureColumn('watchlist', 'title', "TEXT NOT NULL DEFAULT ''");
ensureColumn('watchlist', 'overview', "TEXT NOT NULL DEFAULT ''");
ensureColumn('watchlist', 'poster_path', "TEXT NOT NULL DEFAULT ''");
ensureColumn('watchlist', 'backdrop_path', "TEXT NOT NULL DEFAULT ''");
ensureColumn('watchlist', 'release_date', "TEXT NOT NULL DEFAULT ''");
ensureColumn('watchlist', 'vote_average', 'REAL NOT NULL DEFAULT 0');
ensureColumn('watchlist', 'status', "TEXT NOT NULL DEFAULT 'planned'");
ensureColumn('watchlist', 'notes', "TEXT NOT NULL DEFAULT ''");
ensureColumn('watchlist', 'genres', "TEXT NOT NULL DEFAULT '[]'");
ensureColumn('watchlist', 'source', "TEXT NOT NULL DEFAULT 'manual'");
ensureColumn('watchlist', 'file_path', "TEXT NOT NULL DEFAULT ''");
ensureColumn('watchlist', 'media_url', "TEXT NOT NULL DEFAULT ''");
ensureColumn('watchlist', 'current_season', 'INTEGER NOT NULL DEFAULT 0');
ensureColumn('watchlist', 'current_episode', 'INTEGER NOT NULL DEFAULT 0');
ensureColumn('watchlist', 'created_at', "TEXT NOT NULL DEFAULT ''");
ensureColumn('watchlist', 'updated_at', "TEXT NOT NULL DEFAULT ''");

db.exec(`
  UPDATE watchlist SET status = CASE WHEN watched = 1 THEN 'watched' ELSE 'planned' END
  WHERE status IS NULL OR status = '' OR status = 'planned';
  UPDATE watchlist SET title = 'Saved title' WHERE title IS NULL OR title = '';
`);
db.exec(`UPDATE users SET created_at = CURRENT_TIMESTAMP WHERE created_at IS NULL OR created_at = '';
  UPDATE watchlist SET created_at = CURRENT_TIMESTAMP WHERE created_at IS NULL OR created_at = '';
  UPDATE watchlist SET updated_at = COALESCE(created_at, CURRENT_TIMESTAMP) WHERE updated_at IS NULL OR updated_at = '';`);
function ensureUniqueIndexSafely(label, duplicateQuery, createIndexSql) {
  if (db.prepare(duplicateQuery).get()) {
    console.warn(`[migration] Existing duplicate ${label} detected; preserving records and skipping its unique index.`);
    return;
  }
  db.exec(createIndexSql);
}

ensureUniqueIndexSafely(
  'email addresses',
  'SELECT 1 FROM users WHERE email IS NOT NULL GROUP BY lower(email) HAVING COUNT(*) > 1 LIMIT 1',
  'CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_nocase ON users(email COLLATE NOCASE)'
);
ensureUniqueIndexSafely(
  'usernames',
  'SELECT 1 FROM users WHERE username IS NOT NULL GROUP BY lower(username) HAVING COUNT(*) > 1 LIMIT 1',
  'CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username_nocase ON users(username COLLATE NOCASE)'
);
ensureUniqueIndexSafely(
  'TMDB library items',
  'SELECT 1 FROM watchlist WHERE movie_id IS NOT NULL GROUP BY user_id, media_type, movie_id HAVING COUNT(*) > 1 LIMIT 1',
  'CREATE UNIQUE INDEX IF NOT EXISTS idx_watchlist_unique_tmdb ON watchlist(user_id, media_type, movie_id) WHERE movie_id IS NOT NULL'
);
db.exec(`CREATE INDEX IF NOT EXISTS idx_watchlist_user_updated ON watchlist(user_id, updated_at DESC);
  CREATE INDEX IF NOT EXISTS idx_watchlist_user_status ON watchlist(user_id, status);`);

const emailSchema = z.string().trim().email().max(254);
const registerSchema = z.object({
  username: z.string().trim().min(3).max(40).regex(/^[\p{L}\p{N}_. -]+$/u, 'Username contains unsupported characters'),
  email: emailSchema,
  password: z.string().min(8).max(72),
});
const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(72),
});
const mediaTypeSchema = z.enum(['movie', 'tv']);
const statusSchema = z.enum(['planned', 'watching', 'watched', 'on_hold', 'dropped']);
const ratingSchema = z.number().int().min(1).max(10).nullable();

function publicUser(user) {
  return { id: user.id, username: user.username, email: user.email, createdAt: user.created_at };
}
function cookieOptions() {
  return { httpOnly: true, secure: COOKIE_SECURE, sameSite: COOKIE_SAME_SITE, path: '/', maxAge: 24 * 60 * 60 * 1000 };
}
function clearSessionCookie(res) {
  const options = cookieOptions();
  delete options.maxAge;
  res.clearCookie(COOKIE_NAME, options);
}
function readCookie(req, name) {
  const cookieHeader = req.headers.cookie || '';
  for (const segment of cookieHeader.split(';')) {
    const separator = segment.indexOf('=');
    if (separator < 0 || segment.slice(0, separator).trim() !== name) continue;
    return segment.slice(separator + 1).trim();
  }
  return '';
}
function issueToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, username: user.username },
    JWT_SECRET,
    { algorithm: 'HS256', expiresIn: '24h', issuer: 'cinemate-api', audience: 'cinemate-web' }
  );
}
function validateMediaUrl(value) {
  if (!value) return '';
  try {
    const parsed = new URL(value);
    return ['http:', 'https:'].includes(parsed.protocol) ? parsed.toString() : null;
  } catch {
    return null;
  }
}
function normalizeGenres(genres) {
  if (Array.isArray(genres)) return genres.slice(0, 30).map((genre) => String(genre).trim()).filter(Boolean);
  if (typeof genres === 'string') {
    try {
      const parsed = JSON.parse(genres);
      if (Array.isArray(parsed)) return parsed.slice(0, 30).map(String);
    } catch {
      return genres.split(',').map((genre) => genre.trim()).filter(Boolean).slice(0, 30);
    }
  }
  return [];
}
function serializeLibraryItem(row) {
  return {
    id: row.id,
    movieId: row.movie_id,
    mediaType: row.media_type,
    title: row.title,
    overview: row.overview || '',
    posterPath: row.poster_path || '',
    backdropPath: row.backdrop_path || '',
    releaseDate: row.release_date || '',
    voteAverage: Number(row.vote_average || 0),
    status: row.status || (row.watched ? 'watched' : 'planned'),
    watched: Boolean(row.watched),
    favorite: Boolean(row.favorite),
    rating: row.rating == null ? null : Number(row.rating),
    notes: row.notes || '',
    genres: normalizeGenres(row.genres),
    source: row.source || 'manual',
    filePath: row.file_path || '',
    mediaUrl: row.media_url || '',
    currentSeason: Number(row.current_season || 0),
    currentEpisode: Number(row.current_episode || 0),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
function asyncRoute(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}
const authAttempts = new Map();
const AUTH_WINDOW_MS = 15 * 60 * 1000;
const AUTH_MAX_REQUESTS = 20;
const authRateLimit = (req, res, next) => {
  const key = req.ip || req.socket.remoteAddress || 'unknown';
  const now = Date.now();
  let record = authAttempts.get(key);
  if (!record || now >= record.resetAt) record = { count: 0, resetAt: now + AUTH_WINDOW_MS };
  record.count += 1;
  authAttempts.set(key, record);
  if (authAttempts.size > 5000) {
    for (const [candidate, value] of authAttempts) if (now >= value.resetAt) authAttempts.delete(candidate);
  }
  res.setHeader('RateLimit-Limit', String(AUTH_MAX_REQUESTS));
  res.setHeader('RateLimit-Remaining', String(Math.max(0, AUTH_MAX_REQUESTS - record.count)));
  if (record.count > AUTH_MAX_REQUESTS) {
    res.setHeader('Retry-After', String(Math.ceil((record.resetAt - now) / 1000)));
    return res.status(429).json({ message: 'Too many sign-in attempts. Please try again in a few minutes.' });
  }
  next();
};

const auth = (req, res, next) => {
  const header = req.headers.authorization || '';
  const match = /^Bearer\s+(.+)$/i.exec(header);
  const token = (match && match[1]) || readCookie(req, COOKIE_NAME);
  if (!token) return res.status(401).json({ message: 'Please sign in to continue.' });
  try {
    const decoded = jwt.verify(token, JWT_SECRET, {
      algorithms: ['HS256'], issuer: 'cinemate-api', audience: 'cinemate-web',
    });
    if (!decoded || !Number.isInteger(Number(decoded.id))) throw new Error('Invalid token subject');
    const user = db.prepare('SELECT id, username, email, created_at FROM users WHERE id = ?').get(Number(decoded.id));
    if (!user) {
      clearSessionCookie(res);
      return res.status(401).json({ message: 'Your session is no longer valid. Please sign in again.' });
    }
    req.user = user;
    next();
  } catch {
    clearSessionCookie(res);
    return res.status(401).json({ message: 'Your session has expired or is invalid. Please sign in again.' });
  }
};

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'cinemate-api', timestamp: new Date().toISOString() });
});

app.post('/api/auth/register', authRateLimit, asyncRoute(async (req, res) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: parsed.error.issues[0]?.message || 'Please check the registration details.' });
  }
  const username = parsed.data.username.trim();
  const email = parsed.data.email.toLowerCase();
  if (Buffer.byteLength(parsed.data.password, 'utf8') > 72) {
    return res.status(400).json({ message: 'Password must be 72 bytes or fewer.' });
  }
  const duplicate = db.prepare('SELECT id FROM users WHERE lower(email) = lower(?) OR lower(username) = lower(?)').get(email, username);
  if (duplicate) return res.status(409).json({ message: 'That email or username is already registered.' });

  const passwordHash = await bcrypt.hash(parsed.data.password, 12);
  let result;
  try {
    result = db.prepare('INSERT INTO users (username, email, password) VALUES (?, ?, ?)').run(username, email, passwordHash);
  } catch (error) {
    if (String(error.code || '').startsWith('SQLITE_CONSTRAINT')) {
      return res.status(409).json({ message: 'That email or username is already registered.' });
    }
    throw error;
  }
  const user = db.prepare('SELECT id, username, email, created_at FROM users WHERE id = ?').get(result.lastInsertRowid);
  res.cookie(COOKIE_NAME, issueToken(user), cookieOptions());
  return res.status(201).json({ user: publicUser(user) });
}));

app.post('/api/auth/login', authRateLimit, asyncRoute(async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: 'Enter a valid email address and password.' });
  const email = parsed.data.email.toLowerCase();
  const user = db.prepare('SELECT * FROM users WHERE lower(email) = lower(?)').get(email);
  // Keep the same response for an unknown email and an incorrect password.
  if (!user || !(await bcrypt.compare(parsed.data.password, user.password))) {
    return res.status(401).json({ message: 'Invalid email or password.' });
  }
  res.cookie(COOKIE_NAME, issueToken(user), cookieOptions());
  return res.json({ user: publicUser(user) });
}));

app.get('/api/auth/me', auth, (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  return res.json({ user: publicUser(req.user) });
});
app.post('/api/auth/logout', (req, res) => {
  clearSessionCookie(res);
  return res.json({ message: 'Signed out successfully.' });
});

function getUserLibrary(userId) {
  return db.prepare(`SELECT * FROM watchlist WHERE user_id = ? ORDER BY favorite DESC, updated_at DESC, id DESC`).all(userId).map(serializeLibraryItem);
}

app.get('/api/watchlist/stats', auth, (req, res) => {
  res.setHeader('Cache-Control', 'private, no-store');
  const stats = db.prepare(`
    SELECT COUNT(*) AS total,
      SUM(CASE WHEN status = 'watched' OR watched = 1 THEN 1 ELSE 0 END) AS watched,
      SUM(CASE WHEN status = 'watching' THEN 1 ELSE 0 END) AS watching,
      SUM(CASE WHEN favorite = 1 THEN 1 ELSE 0 END) AS favorites,
      SUM(CASE WHEN media_type = 'tv' THEN 1 ELSE 0 END) AS series
    FROM watchlist WHERE user_id = ?
  `).get(req.user.id);
  res.json(Object.fromEntries(Object.entries(stats).map(([key, value]) => [key, Number(value || 0)])));
});

app.get('/api/watchlist', auth, (req, res) => {
  const items = getUserLibrary(req.user.id);
  const { q = '', status = '', type = '', favorite = '' } = req.query;
  const query = String(q).trim().toLocaleLowerCase();
  const results = items.filter((item) => {
    if (query && !`${item.title} ${item.overview} ${item.genres.join(' ')}`.toLocaleLowerCase().includes(query)) return false;
    if (status && statusSchema.safeParse(String(status)).success && item.status !== status) return false;
    if (type && mediaTypeSchema.safeParse(String(type)).success && item.mediaType !== type) return false;
    if (favorite === 'true' && !item.favorite) return false;
    return true;
  });
  res.setHeader('Cache-Control', 'private, no-store');
  res.json(results);
});

const addItemSchema = z.object({
  movieId: z.union([z.number().int().positive(), z.string().regex(/^\d+$/).transform(Number)]).optional().nullable(),
  mediaType: mediaTypeSchema.optional().default('movie'),
  title: z.string().trim().min(1).max(200),
  overview: z.string().max(5000).optional().default(''),
  posterPath: z.string().max(1000).optional().default(''),
  backdropPath: z.string().max(1000).optional().default(''),
  releaseDate: z.string().max(20).optional().default(''),
  voteAverage: z.number().min(0).max(10).optional().default(0),
  status: statusSchema.optional().default('planned'),
  favorite: z.boolean().optional().default(false),
  rating: ratingSchema.optional().default(null),
  notes: z.string().max(5000).optional().default(''),
  genres: z.array(z.string().trim().min(1).max(80)).max(30).optional().default([]),
  source: z.enum(['tmdb', 'manual', 'local', 'streaming']).optional().default('manual'),
  filePath: z.string().max(1000).optional().default(''),
  mediaUrl: z.string().max(2000).optional().default(''),
  currentSeason: z.number().int().min(0).max(1000).optional().default(0),
  currentEpisode: z.number().int().min(0).max(100000).optional().default(0),
});

async function addLibraryItem(req, res) {
  const parsed = addItemSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: parsed.error.issues[0]?.message || 'Please check the movie or series details.' });
  const item = parsed.data;
  const mediaUrl = validateMediaUrl(item.mediaUrl);
  if (mediaUrl === null) return res.status(400).json({ message: 'Playback link must be a valid HTTP or HTTPS URL.' });
  const movieId = item.movieId == null ? null : Number(item.movieId);
  if (movieId !== null) {
    const exists = db.prepare('SELECT id FROM watchlist WHERE user_id = ? AND movie_id = ? AND media_type = ?').get(req.user.id, movieId, item.mediaType);
    if (exists) return res.status(409).json({ message: 'This title is already in your library.', item: serializeLibraryItem(db.prepare('SELECT * FROM watchlist WHERE id = ?').get(exists.id)) });
  }
  const now = new Date().toISOString();
  let result;
  try {
    result = db.prepare(`
    INSERT INTO watchlist (
      user_id, movie_id, watched, favorite, rating, media_type, title, overview,
      poster_path, backdrop_path, release_date, vote_average, status, notes, genres,
      source, file_path, media_url, current_season, current_episode, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    req.user.id, movieId, item.status === 'watched' ? 1 : 0, item.favorite ? 1 : 0,
    item.rating, item.mediaType, item.title, item.overview, item.posterPath, item.backdropPath,
    item.releaseDate, item.voteAverage, item.status, item.notes, JSON.stringify(item.genres),
    movieId !== null ? 'tmdb' : item.source, item.filePath, mediaUrl, item.currentSeason,
    item.currentEpisode, now, now
    );
  } catch (error) {
    if (String(error.code || '').startsWith('SQLITE_CONSTRAINT') && movieId !== null) {
      const duplicate = db.prepare('SELECT * FROM watchlist WHERE user_id = ? AND movie_id = ? AND media_type = ?').get(req.user.id, movieId, item.mediaType);
      if (duplicate) return res.status(409).json({ message: 'This title is already in your library.', item: serializeLibraryItem(duplicate) });
    }
    throw error;
  }
  const created = db.prepare('SELECT * FROM watchlist WHERE id = ? AND user_id = ?').get(result.lastInsertRowid, req.user.id);
  return res.status(201).json(serializeLibraryItem(created));
}
app.post('/api/watchlist', auth, asyncRoute(addLibraryItem));
// Backward-compatible endpoint name used by the first frontend version.
app.post('/api/watchlist/add', auth, asyncRoute(async (req, res) => {
  const body = { ...req.body };
  if (!body.movieId && body.movie_id) body.movieId = body.movie_id;
  if (!body.title && body.movieId) body.title = `TMDB title ${body.movieId}`;
  if (!body.title) return res.status(400).json({ message: 'Title details are required. Please update the app and retry.' });
  return addLibraryItem({ ...req, body }, res);
}));

const getOwnedItem = (userId, id) => db.prepare('SELECT * FROM watchlist WHERE id = ? AND user_id = ?').get(id, userId);
const writeUpdatedItem = (itemId, userId, updates) => {
  const fields = Object.keys(updates);
  if (!fields.length) return getOwnedItem(userId, itemId);
  const assignments = fields.map((field) => `${field} = ?`).join(', ');
  db.prepare(`UPDATE watchlist SET ${assignments}, updated_at = ? WHERE id = ? AND user_id = ?`)
    .run(...fields.map((field) => updates[field]), new Date().toISOString(), itemId, userId);
  return getOwnedItem(userId, itemId);
};

app.patch('/api/watchlist/:id', auth, (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id < 1) return res.status(400).json({ message: 'Invalid library item.' });
  if (!getOwnedItem(req.user.id, id)) return res.status(404).json({ message: 'Library item not found.' });
  const bodySchema = z.object({
    title: z.string().trim().min(1).max(200).optional(),
    overview: z.string().max(5000).optional(),
    posterPath: z.string().max(1000).optional(),
    releaseDate: z.string().max(20).optional(),
    genres: z.array(z.string().trim().min(1).max(80)).max(30).optional(),
    status: statusSchema.optional(),
    favorite: z.boolean().optional(),
    rating: ratingSchema.optional(),
    notes: z.string().max(5000).optional(),
    filePath: z.string().max(1000).optional(),
    mediaUrl: z.string().max(2000).optional(),
    currentSeason: z.number().int().min(0).max(1000).optional(),
    currentEpisode: z.number().int().min(0).max(100000).optional(),
  }).strict();
  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: parsed.error.issues[0]?.message || 'Invalid update.' });
  const updates = {};
  const names = {
    title: 'title', overview: 'overview', posterPath: 'poster_path', releaseDate: 'release_date', status: 'status',
    favorite: 'favorite', rating: 'rating', notes: 'notes', filePath: 'file_path',
    currentSeason: 'current_season', currentEpisode: 'current_episode',
  };
  for (const [key, column] of Object.entries(names)) {
    if (parsed.data[key] !== undefined) updates[column] = key === 'favorite' ? (parsed.data[key] ? 1 : 0) : parsed.data[key];
  }
  if (parsed.data.genres !== undefined) updates.genres = JSON.stringify(parsed.data.genres);
  if (parsed.data.status !== undefined) updates.watched = parsed.data.status === 'watched' ? 1 : 0;
  if (parsed.data.mediaUrl !== undefined) {
    const url = validateMediaUrl(parsed.data.mediaUrl);
    if (url === null) return res.status(400).json({ message: 'Playback link must be a valid HTTP or HTTPS URL.' });
    updates.media_url = url;
  }
  const updated = writeUpdatedItem(id, req.user.id, updates);
  res.json(serializeLibraryItem(updated));
});

// Convenient action routes for the original UI.
app.put('/api/watchlist/:id/status', auth, (req, res) => {
  const parsed = z.object({ status: statusSchema }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: 'Invalid status.' });
  const id = Number(req.params.id);
  if (!getOwnedItem(req.user.id, id)) return res.status(404).json({ message: 'Library item not found.' });
  const item = writeUpdatedItem(id, req.user.id, { status: parsed.data.status, watched: parsed.data.status === 'watched' ? 1 : 0 });
  res.json(serializeLibraryItem(item));
});
app.put('/api/watchlist/:id/favorite', auth, (req, res) => {
  const id = Number(req.params.id);
  const item = getOwnedItem(req.user.id, id);
  if (!item) return res.status(404).json({ message: 'Library item not found.' });
  const updated = writeUpdatedItem(id, req.user.id, { favorite: item.favorite ? 0 : 1 });
  res.json(serializeLibraryItem(updated));
});
app.put('/api/watchlist/:id/rate', auth, (req, res) => {
  const parsed = z.object({ rating: z.number().int().min(1).max(10).nullable() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: 'Rating must be between 1 and 10.' });
  const id = Number(req.params.id);
  if (!getOwnedItem(req.user.id, id)) return res.status(404).json({ message: 'Library item not found.' });
  const updated = writeUpdatedItem(id, req.user.id, { rating: parsed.data.rating });
  res.json(serializeLibraryItem(updated));
});
app.put('/api/watchlist/:id/progress', auth, (req, res) => {
  const parsed = z.object({ currentSeason: z.number().int().min(0).max(1000), currentEpisode: z.number().int().min(0).max(100000) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: 'Season and episode must be valid non-negative numbers.' });
  const id = Number(req.params.id);
  const item = getOwnedItem(req.user.id, id);
  if (!item) return res.status(404).json({ message: 'Library item not found.' });
  if (item.media_type !== 'tv') return res.status(400).json({ message: 'Episode progress is only available for series.' });
  const updated = writeUpdatedItem(id, req.user.id, { current_season: parsed.data.currentSeason, current_episode: parsed.data.currentEpisode, status: item.status === 'planned' ? 'watching' : item.status });
  res.json(serializeLibraryItem(updated));
});
app.put('/api/watchlist/:id/watched', auth, (req, res) => {
  const id = Number(req.params.id);
  if (!getOwnedItem(req.user.id, id)) return res.status(404).json({ message: 'Library item not found.' });
  const item = getOwnedItem(req.user.id, id);
  const status = item.status === 'watched' ? 'planned' : 'watched';
  const updated = writeUpdatedItem(id, req.user.id, { status, watched: status === 'watched' ? 1 : 0 });
  res.json(serializeLibraryItem(updated));
});
app.delete('/api/watchlist/:id', auth, (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id < 1) return res.status(400).json({ message: 'Invalid library item.' });
  const result = db.prepare('DELETE FROM watchlist WHERE id = ? AND user_id = ?').run(id, req.user.id);
  if (!result.changes) return res.status(404).json({ message: 'Library item not found.' });
  res.status(204).end();
});

const tmdbApiKey = process.env.TMDB_API_KEY || '';
app.get('/api/discover', asyncRoute(async (req, res) => {
  if (!tmdbApiKey) return res.status(503).json({ message: 'Movie discovery is not configured yet. Add TMDB_API_KEY to the server .env file, or add titles manually to your library.' });
  const mediaType = mediaTypeSchema.safeParse(String(req.query.type || 'movie'));
  if (!mediaType.success) return res.status(400).json({ message: 'Type must be movie or tv.' });
  const mode = String(req.query.mode || 'trending');
  const query = String(req.query.query || '').trim().slice(0, 150);
  let url;
  if (mode === 'search') {
    if (!query) return res.json({ results: [] });
    url = new URL(`https://api.themoviedb.org/3/search/${mediaType.data}`);
    url.searchParams.set('query', query);
    url.searchParams.set('include_adult', 'false');
    url.searchParams.set('page', '1');
  } else if (mode === 'trending') {
    url = new URL(`https://api.themoviedb.org/3/trending/${mediaType.data}/week`);
  } else {
    return res.status(400).json({ message: 'Mode must be search or trending.' });
  }
  url.searchParams.set('api_key', tmdbApiKey);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  let response;
  try {
    response = await fetch(url, { signal: controller.signal, headers: { Accept: 'application/json' } });
  } catch {
    return res.status(502).json({ message: 'Movie discovery service could not be reached. Please try again.' });
  } finally {
    clearTimeout(timeout);
  }
  if (!response.ok) return res.status(response.status === 401 ? 502 : 502).json({ message: 'Movie discovery is temporarily unavailable. Check the server TMDB_API_KEY setting.' });
  const data = await response.json();
  res.setHeader('Cache-Control', 'private, max-age=60');
  res.json({ results: (data.results || []).slice(0, 30).map((item) => ({
    movieId: item.id,
    mediaType: mediaType.data,
    title: item.title || item.name || 'Untitled',
    overview: item.overview || '',
    posterPath: item.poster_path || '',
    backdropPath: item.backdrop_path || '',
    releaseDate: item.release_date || item.first_air_date || '',
    voteAverage: Number(item.vote_average || 0),
    genres: [],
    source: 'tmdb',
  })) });
}));

app.use((req, res) => res.status(404).json({ message: 'Endpoint not found.' }));
app.use((error, req, res, next) => {
  if (res.headersSent) return next(error);
  if (error && error.message === 'Origin is not allowed by CORS') return res.status(403).json({ message: 'This origin is not allowed to access CineMate.' });
  console.error('[api error]', error && error.stack ? error.stack : error);
  return res.status(500).json({ message: 'Something went wrong. Please try again.' });
});

const PORT = Number(process.env.PORT || 3001);
const server = app.listen(PORT, () => {
  console.log(`CineMate API listening on port ${PORT}`);
  console.log(`Database: ${databasePath}`);
});

function shutdown(signal) {
  console.log(`${signal} received; closing CineMate API...`);
  server.close(() => {
    db.close();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10000).unref();
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));