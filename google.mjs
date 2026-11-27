import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

// The Library API can no longer read a user's albums (since 2025-03-31); the Picker API is the supported route
const SCOPE = 'https://www.googleapis.com/auth/photospicker.mediaitems.readonly';
const PICKER = 'https://photospicker.googleapis.com/v1';
const CONFIG_DIR = path.join(process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config'), 'pixelate');
const TOKEN_FILE = path.join(CONFIG_DIR, 'token.json');

const client = () => {
  const { GOOGLE_CLIENT_ID: id, GOOGLE_CLIENT_SECRET: secret } = process.env;

  if (!id || !secret) {
    throw new Error('Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to a Google "Desktop app" OAuth client. See README.');
  }

  return { id, secret };
};

const openBrowser = (url) => {
  console.error(`If your browser did not open, go to:\n  ${url}\n`);

  const cmd = { darwin: 'open', win32: 'explorer' }[process.platform] || 'xdg-open';

  spawn(cmd, [url], { stdio: 'ignore', detached: true }).on('error', () => {}).unref();
};

const tokenRequest = async (params) => {
  const res = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', body: new URLSearchParams(params) });
  const body = await res.json();

  if (!res.ok) throw new Error(`Google sign-in failed: ${body.error_description || body.error}`);

  return body;
};

const save = async (token) => {
  const stored = { ...token, expires_at: Date.now() + token.expires_in * 1000 };

  await fs.mkdir(CONFIG_DIR, { recursive: true, mode: 0o700 });
  await fs.writeFile(TOKEN_FILE, JSON.stringify(stored), { mode: 0o600 });

  return stored;
};

// OAuth for installed apps: loopback redirect + PKCE
export const connect = async () => {
  const { id, secret } = client();
  const verifier = crypto.randomBytes(32).toString('base64url');
  const state = crypto.randomBytes(16).toString('hex');
  const server = http.createServer();

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));

  const redirectUri = `http://127.0.0.1:${server.address().port}`;

  try {
    const code = await new Promise((resolve, reject) => {
      server.on('request', (req, res) => {
        const params = new URL(req.url, redirectUri).searchParams;

        if (!params.has('code') && !params.has('error')) return res.writeHead(404).end();

        const ok = params.get('state') === state && params.get('code');

        res.end(ok ? 'You can close this tab and go back to the terminal.' : 'Sign-in failed. Check the terminal.');

        if (ok) resolve(params.get('code'));
        else reject(new Error(`Google sign-in failed: ${params.get('error') || 'state mismatch'}`));
      });

      openBrowser(
        `https://accounts.google.com/o/oauth2/v2/auth?${new URLSearchParams({
          client_id: id,
          redirect_uri: redirectUri,
          response_type: 'code',
          scope: SCOPE,
          code_challenge: crypto.createHash('sha256').update(verifier).digest('base64url'),
          code_challenge_method: 'S256',
          state,
          access_type: 'offline',
          prompt: 'consent'
        })}`
      );
    });

    return await save(
      await tokenRequest({
        grant_type: 'authorization_code',
        code,
        code_verifier: verifier,
        client_id: id,
        client_secret: secret,
        redirect_uri: redirectUri
      })
    );
  } finally {
    server.close();
  }
};

const accessToken = async () => {
  const token = await fs.readFile(TOKEN_FILE, 'utf8').then(JSON.parse, () => null);

  if (!token) return (await connect()).access_token;

  if (Date.now() < token.expires_at - 60_000) return token.access_token;

  const { id, secret } = client();

  try {
    const fresh = await tokenRequest({
      grant_type: 'refresh_token',
      refresh_token: token.refresh_token,
      client_id: id,
      client_secret: secret
    });

    return (await save({ ...token, ...fresh })).access_token;
  } catch {
    // Refresh token revoked or expired (7 days for apps in "Testing"): sign in again
    return (await connect()).access_token;
  }
};

const api = async (token, pathname, init = {}) => {
  const res = await fetch(`${PICKER}${pathname}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
  });
  const text = await res.text();

  if (!res.ok) throw new Error(`Google Photos ${init.method || 'GET'} ${pathname}: ${res.status} ${text}`);

  return text ? JSON.parse(text) : {};
};

const seconds = (duration, fallback) => parseFloat(duration ?? fallback) * 1000;

// Lets the user pick photos (e.g. select all in an album) and downloads them as square tiles into `dir`
export const pickPhotos = async (dir, size = 256) => {
  const token = await accessToken();
  const session = await api(token, '/sessions', { method: 'POST', body: '{}' });

  try {
    openBrowser(session.pickerUri);
    console.error('In Google Photos, open the album you want, select its photos, and press Done.');

    const deadline = Date.now() + seconds(session.pollingConfig?.timeoutIn, '1800s');
    let current = session;

    while (!current.mediaItemsSet) {
      if (Date.now() > deadline) throw new Error('Timed out waiting for you to pick photos.');

      await sleep(seconds(current.pollingConfig?.pollInterval, '5s'));
      current = await api(token, `/sessions/${session.id}`);
    }

    const photos = [];
    let pageToken = '';

    do {
      const page = await api(
        token,
        `/mediaItems?${new URLSearchParams({ sessionId: session.id, pageSize: '100', pageToken })}`
      );

      photos.push(...(page.mediaItems || []).filter((item) => item.type === 'PHOTO'));
      pageToken = page.nextPageToken || '';
    } while (pageToken);

    await fs.mkdir(dir, { recursive: true });

    const queue = [...photos];
    let done = 0;

    // baseUrls expire after 60 minutes, so download right away
    const worker = async () => {
      for (let item = queue.shift(); item; item = queue.shift()) {
        const file = path.join(dir, `${item.id.replace(/[^\w-]/g, '_')}.jpg`);
        const exists = await fs.access(file).then(() => true, () => false);

        if (!exists) {
          const res = await fetch(`${item.mediaFile.baseUrl}=w${size}-h${size}-c`, {
            headers: { Authorization: `Bearer ${token}` }
          });

          if (!res.ok) throw new Error(`Download of ${item.mediaFile.filename} failed: ${res.status}`);

          await fs.writeFile(file, Buffer.from(await res.arrayBuffer()));
        }

        process.stderr.write(`\rDownloaded ${++done}/${photos.length}`);
      }
    };

    await Promise.all(Array.from({ length: 8 }, worker));
    process.stderr.write('\n');

    return photos.length;
  } finally {
    await api(token, `/sessions/${session.id}`, { method: 'DELETE' }).catch(() => {});
  }
};
