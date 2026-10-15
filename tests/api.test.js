'use strict';

const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs/promises');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const { test } = require('node:test');

async function freePort() {
  const listener = net.createServer();
  await new Promise((resolve, reject) => listener.once('error', reject).listen(0, '127.0.0.1', resolve));
  const address = listener.address();
  await new Promise((resolve, reject) => listener.close((error) => error ? reject(error) : resolve()));
  return address.port;
}

async function waitForHealth(baseUrl, child) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (child.exitCode !== null) throw new Error(`CineMate API exited during startup (code ${child.exitCode}).`);
    try {
      const response = await fetch(`${baseUrl}/api/health`);
      if (response.ok) return;
    } catch { /* API is still starting. */ }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('Timed out waiting for CineMate API to start.');
}

function api(baseUrl, cookie = '') {
  return async (route, options = {}) => {
    const headers = { ...(options.body === undefined ? {} : { 'Content-Type': 'application/json' }), ...(cookie ? { Cookie: cookie } : {}), ...(options.headers || {}) };
    const response = await fetch(`${baseUrl}${route}`, { ...options, headers });
    const raw = await response.text();
    let payload;
    try { payload = raw ? JSON.parse(raw) : undefined; } catch { payload = raw; }
    return { response, payload, cookie: response.headers.get('set-cookie')?.split(';')[0] || cookie };
  };
}

test('auth sessions and the private movie/series library work end to end', async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'cinemate-api-test-'));
  const port = await freePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, ['src/server/index.js'], {
    cwd: path.resolve(__dirname, '..'),
    env: { ...process.env, NODE_ENV: 'test', PORT: String(port), DATABASE_PATH: path.join(directory, 'test.db'), JWT_SECRET: 'integration-test-secret-keep-this-over-thirty-two-characters' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let logs = '';
  child.stdout.on('data', (chunk) => { logs += chunk.toString(); });
  child.stderr.on('data', (chunk) => { logs += chunk.toString(); });

  t.after(async () => {
    if (child.exitCode === null) {
      child.kill('SIGTERM');
      await Promise.race([
        new Promise((resolve) => child.once('exit', resolve)),
        new Promise((resolve) => setTimeout(resolve, 2500)),
      ]);
      if (child.exitCode === null) child.kill('SIGKILL');
    }
    await fs.rm(directory, { recursive: true, force: true });
  });

  try {
    await waitForHealth(baseUrl, child);
  } catch (error) {
    throw new Error(`${error.message}\n${logs}`);
  }

  const anonymous = api(baseUrl);
  const registration = await anonymous('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({ username: 'cine_user', email: 'Cine.User@example.com', password: 'correct-horse-123' }),
  });
  assert.equal(registration.response.status, 201);
  assert.equal(registration.payload.user.email, 'cine.user@example.com');
  assert.match(registration.cookie, /^cinemate_session=/, 'registration should set the session cookie');
  assert.match(registration.response.headers.get('set-cookie') || '', /HttpOnly/i, 'the browser must not expose the session cookie to JavaScript');

  const userApi = api(baseUrl, registration.cookie);
  const session = await userApi('/api/auth/me');
  assert.equal(session.response.status, 200);
  assert.equal(session.payload.user.username, 'cine_user');

  const duplicate = await anonymous('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({ username: 'other_name', email: 'CINE.USER@example.com', password: 'another-password-123' }),
  });
  assert.equal(duplicate.response.status, 409, 'email uniqueness should be case-insensitive');

  const badLogin = await anonymous('/api/auth/login', {
    method: 'POST', body: JSON.stringify({ email: 'cine.user@example.com', password: 'wrong-password' }),
  });
  assert.equal(badLogin.response.status, 401, 'incorrect passwords must not create a session');
  const validLogin = await anonymous('/api/auth/login', {
    method: 'POST', body: JSON.stringify({ email: 'CINE.USER@example.com', password: 'correct-horse-123' }),
  });
  assert.equal(validLogin.response.status, 200, 'login should accept normalized email addresses');
  assert.match(validLogin.cookie, /^cinemate_session=/);

  const added = await userApi('/api/watchlist', {
    method: 'POST',
    body: JSON.stringify({ mediaType: 'tv', title: 'Sample Series', status: 'planned', genres: ['Drama'] }),
  });
  assert.equal(added.response.status, 201);
  const itemId = added.payload.id;
  assert.equal(added.payload.mediaType, 'tv');

  const progress = await userApi(`/api/watchlist/${itemId}/progress`, {
    method: 'PUT',
    body: JSON.stringify({ currentSeason: 2, currentEpisode: 4 }),
  });
  assert.equal(progress.response.status, 200);
  assert.equal(progress.payload.status, 'watching');
  assert.equal(progress.payload.currentSeason, 2);
  assert.equal(progress.payload.currentEpisode, 4);

  const invalidRating = await userApi(`/api/watchlist/${itemId}/rate`, {
    method: 'PUT', body: JSON.stringify({ rating: 12 }),
  });
  assert.equal(invalidRating.response.status, 400, 'ratings outside 1–10 should be rejected');

  const secondRegistration = await anonymous('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({ username: 'second_user', email: 'second@example.com', password: 'another-password-456' }),
  });
  assert.equal(secondRegistration.response.status, 201);
  const secondLibrary = await api(baseUrl, secondRegistration.cookie)('/api/watchlist');
  assert.equal(secondLibrary.response.status, 200);
  assert.deepEqual(secondLibrary.payload, [], 'one user must not see another user\'s titles');

  const library = await userApi('/api/watchlist');
  assert.equal(library.payload.length, 1);
  const deleted = await userApi(`/api/watchlist/${itemId}`, { method: 'DELETE' });
  assert.equal(deleted.response.status, 204);

  const logout = await userApi('/api/auth/logout', { method: 'POST' });
  assert.equal(logout.response.status, 200);
  const afterLogout = await anonymous('/api/watchlist');
  assert.equal(afterLogout.response.status, 401, 'requests without a session must be rejected after logout');
  assert.match(logout.response.headers.get('set-cookie') || '', /cinemate_session=;/, 'logout should clear the browser session cookie');
});
