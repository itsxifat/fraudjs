import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { SteadfastClient } from '../src/client.js';

// ---------- Mock helpers ----------

function makeMockResponse({ status = 200, contentType = 'application/json', body = {} } = {}) {
  const bodyStr = typeof body === 'string' ? body : JSON.stringify(body);
  const headerMap = new Map([
    ['content-type', contentType],
  ]);
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: {
      get: (name) => headerMap.get(name.toLowerCase()) ?? null,
      getSetCookie: () => [],
    },
    text: async () => bodyStr,
    json: async () => JSON.parse(bodyStr),
  };
}

const LOGIN_HTML = `<html><head><meta name="csrf-token" content="testtoken"></head></html>`;

function makeLoginResponse() {
  return makeMockResponse({
    status: 302,
    contentType: 'text/html',
    body: '',
  });
}

const CONSIGNMENT_BODY = {
  status: 200,
  data: {
    total_delivered: 5,
    total_cancelled: 1,
    frauds: 2,
    con: [{ id: 1, tracking: 'ABC123' }],
  },
};

// A fetch mock that simulates:
//   1. GET /login → HTML with csrf-token
//   2. POST /login → 302 redirect
//   3. GET /dashboard (redirect) → 200 HTML
//   4. GET /consignment/getbyphone/... → JSON data
function makeSuccessFetch(calls = []) {
  return async (url, options) => {
    calls.push({ url, method: options?.method || 'GET' });

    if (url.includes('/login') && (!options?.method || options.method === 'GET')) {
      return makeMockResponse({ contentType: 'text/html', body: LOGIN_HTML });
    }
    if (url.includes('/login') && options?.method === 'POST') {
      return {
        status: 302,
        ok: false,
        headers: {
          get: (name) => name.toLowerCase() === 'location' ? 'https://merchant.packzy.com/dashboard' : null,
          getSetCookie: () => ['steadfast_courier_session=sess123; Path=/'],
        },
        text: async () => '',
        json: async () => ({}),
      };
    }
    if (url.includes('/dashboard')) {
      return makeMockResponse({ contentType: 'text/html', body: '<html>Dashboard</html>' });
    }
    if (url.includes('/getbyphone/')) {
      return makeMockResponse({ body: CONSIGNMENT_BODY });
    }
    return makeMockResponse({ status: 404, body: { error: 'not found' } });
  };
}

// ---------- Tests ----------

describe('SteadfastClient.checkPhone', () => {
  beforeEach(() => {
    // Reset env credentials before each test
    process.env.FRAUDJS_CREDENTIALS = 'test@example.com:password123';
  });

  it('returns parsed result on successful call', async () => {
    const calls = [];
    globalThis.fetch = makeSuccessFetch(calls);

    const client = new SteadfastClient();
    const result = await client.checkPhone('01791729300');

    assert.equal(result.delivered, 5);
    assert.equal(result.cancelled, 1);
    assert.equal(result.frauds, 2);
    assert.deepEqual(result.consignment, [{ id: 1, tracking: 'ABC123' }]);
  });

  it('retries once when session expires (HTML response on JSON endpoint)', async () => {
    let callCount = 0;
    globalThis.fetch = async (url, options) => {
      callCount++;
      // Login page GET
      if (url.includes('/login') && (!options?.method || options.method === 'GET')) {
        return makeMockResponse({ contentType: 'text/html', body: LOGIN_HTML });
      }
      // Login POST
      if (url.includes('/login') && options?.method === 'POST') {
        return {
          status: 302,
          ok: false,
          headers: {
            get: (name) => name.toLowerCase() === 'location' ? 'https://merchant.packzy.com/dashboard' : null,
            getSetCookie: () => [],
          },
          text: async () => '',
          json: async () => ({}),
        };
      }
      // Dashboard redirect target
      if (url.includes('/dashboard')) {
        return makeMockResponse({ contentType: 'text/html', body: '<html>ok</html>' });
      }
      // First consignment call → expired session (HTML)
      if (url.includes('/getbyphone/') && callCount < 8) {
        return makeMockResponse({ contentType: 'text/html', body: LOGIN_HTML });
      }
      // Second consignment call → success
      return makeMockResponse({ body: CONSIGNMENT_BODY });
    };

    const client = new SteadfastClient();
    const result = await client.checkPhone('01791729300');
    assert.equal(result.delivered, 5);
  });

  it('fails over to second credential when first throws', async () => {
    process.env.FRAUDJS_CREDENTIALS = 'bad@example.com:wrong,good@example.com:right';
    let attempt = 0;

    globalThis.fetch = async (url, options) => {
      attempt++;
      if (url.includes('/login') && (!options?.method || options.method === 'GET')) {
        return makeMockResponse({ contentType: 'text/html', body: LOGIN_HTML });
      }
      if (url.includes('/login') && options?.method === 'POST') {
        // First account fails, second succeeds
        const cookieHeader = options?.headers?.Cookie || '';
        // If this is the first credential attempt, return redirect back to login (failure)
        if (options?.body?.includes('bad%40example.com') || options?.body?.includes('bad@example.com')) {
          return {
            status: 302,
            ok: false,
            headers: {
              get: (name) => name.toLowerCase() === 'location' ? 'https://merchant.packzy.com/login' : null,
              getSetCookie: () => [],
            },
            text: async () => '',
            json: async () => ({}),
          };
        }
        // Second credential succeeds
        return {
          status: 302,
          ok: false,
          headers: {
            get: (name) => name.toLowerCase() === 'location' ? 'https://merchant.packzy.com/dashboard' : null,
            getSetCookie: () => [],
          },
          text: async () => '',
          json: async () => ({}),
        };
      }
      if (url.includes('/dashboard')) {
        return makeMockResponse({ contentType: 'text/html', body: '<html>ok</html>' });
      }
      if (url.includes('/getbyphone/')) {
        return makeMockResponse({ body: CONSIGNMENT_BODY });
      }
      return makeMockResponse({ status: 404 });
    };

    const client = new SteadfastClient();
    const result = await client.checkPhone('01791729300');
    assert.equal(result.delivered, 5);
  });

  it('throws AllCredentialsFailedError when all credentials fail', async () => {
    process.env.FRAUDJS_CREDENTIALS = 'bad@example.com:wrong';

    globalThis.fetch = async (url, options) => {
      if (url.includes('/login') && (!options?.method || options.method === 'GET')) {
        return makeMockResponse({ contentType: 'text/html', body: LOGIN_HTML });
      }
      if (url.includes('/login') && options?.method === 'POST') {
        // Always redirect back to login (bad credentials)
        return {
          status: 302,
          ok: false,
          headers: {
            get: (name) => name.toLowerCase() === 'location' ? 'https://merchant.packzy.com/login' : null,
            getSetCookie: () => [],
          },
          text: async () => '',
          json: async () => ({}),
        };
      }
      return makeMockResponse({ status: 200 });
    };

    const client = new SteadfastClient();
    await assert.rejects(
      () => client.checkPhone('01791729300'),
      (err) => {
        assert.equal(err.name, 'AllCredentialsFailedError');
        assert.ok(Array.isArray(err.failures));
        return true;
      }
    );
  });
});

describe('parseResponse shape handling', () => {
  it('handles nested data object', async () => {
    process.env.FRAUDJS_CREDENTIALS = 'test@example.com:pass';

    globalThis.fetch = async (url, options) => {
      if (url.includes('/login') && (!options?.method || options.method === 'GET')) {
        return makeMockResponse({ contentType: 'text/html', body: LOGIN_HTML });
      }
      if (url.includes('/login') && options?.method === 'POST') {
        return {
          status: 302,
          ok: false,
          headers: {
            get: (name) => name.toLowerCase() === 'location' ? 'https://merchant.packzy.com/dashboard' : null,
            getSetCookie: () => [],
          },
          text: async () => '',
          json: async () => ({}),
        };
      }
      if (url.includes('/dashboard')) {
        return makeMockResponse({ contentType: 'text/html', body: '<html>ok</html>' });
      }
      // Flat response (no data wrapper)
      if (url.includes('/getbyphone/')) {
        return makeMockResponse({
          body: { total_delivered: 10, total_cancelled: 2, frauds: 1, con: [] },
        });
      }
      return makeMockResponse({ status: 404 });
    };

    const client = new SteadfastClient();
    const result = await client.checkPhone('017');
    assert.equal(result.delivered, 10);
    assert.equal(result.cancelled, 2);
    assert.equal(result.frauds, 1);
  });
});
