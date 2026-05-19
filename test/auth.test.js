import { describe, it, before, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { CookieJar } from 'tough-cookie';
import { fetchLoginPage, isSessionExpired } from '../src/auth.js';

// ---------- Fetch mock helpers ----------

let _mockFetch;

function setMockFetch(fn) {
  _mockFetch = fn;
  globalThis.fetch = fn;
}

function makeMockResponse({ status = 200, headers = {}, body = '' } = {}) {
  const headerMap = new Map(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: {
      get: (name) => headerMap.get(name.toLowerCase()) ?? null,
      getSetCookie: () => {
        const sc = headerMap.get('set-cookie');
        return sc ? (Array.isArray(sc) ? sc : [sc]) : [];
      },
    },
    text: async () => body,
    json: async () => JSON.parse(body),
  };
}

// ---------- Tests ----------

describe('auth.fetchLoginPage', () => {
  it('extracts csrf-token from <meta name="csrf-token">', async () => {
    setMockFetch(async () => makeMockResponse({
      headers: { 'content-type': 'text/html' },
      body: `<html><head><meta name="csrf-token" content="abc123"></head></html>`,
    }));

    const jar = new CookieJar();
    const token = await fetchLoginPage(jar);
    assert.equal(token, 'abc123');
  });

  it('extracts _token from hidden input', async () => {
    setMockFetch(async () => makeMockResponse({
      headers: { 'content-type': 'text/html' },
      body: `<form><input type="hidden" name="_token" value="xyz789"></form>`,
    }));

    const jar = new CookieJar();
    const token = await fetchLoginPage(jar);
    assert.equal(token, 'xyz789');
  });

  it('throws AuthError if no token found', async () => {
    setMockFetch(async () => makeMockResponse({
      headers: { 'content-type': 'text/html' },
      body: '<html><body>No token here</body></html>',
    }));

    const jar = new CookieJar();
    await assert.rejects(
      () => fetchLoginPage(jar),
      (err) => {
        assert.equal(err.name, 'AuthError');
        return true;
      }
    );
  });
});

describe('auth.isSessionExpired', () => {
  it('returns true for HTML content-type (login page redirect)', () => {
    const res = makeMockResponse({ headers: { 'content-type': 'text/html; charset=utf-8' } });
    assert.equal(isSessionExpired(res), true);
  });

  it('returns true for HTTP 419 (Laravel CSRF mismatch)', () => {
    const res = makeMockResponse({ status: 419, headers: { 'content-type': 'application/json' } });
    assert.equal(isSessionExpired(res), true);
  });

  it('returns true for HTTP 401', () => {
    const res = makeMockResponse({ status: 401, headers: { 'content-type': 'application/json' } });
    assert.equal(isSessionExpired(res), true);
  });

  it('returns false for valid JSON response', () => {
    const res = makeMockResponse({
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
    assert.equal(isSessionExpired(res), false);
  });
});
