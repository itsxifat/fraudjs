# fraudjs

Check a customer's delivery and fraud history on [Steadfast Courier (Packzy)](https://merchant.packzy.com) by phone number. Drop in credentials and just call `checkPhone()` — login, cookies, and session refresh are handled automatically.

```js
import { checkPhone } from 'steadfast-fraud';

const result = await checkPhone('01700000000');
// { delivered: 12, cancelled: 1, frauds: 0, consignment: [...] }
```

---

## Requirements

- **Node.js ≥ 18** (uses built-in fetch and crypto)
- An active Steadfast merchant account

---

## Install

```bash
npm install steadfast-fraud
```

---

## Setup

You need at least one Steadfast merchant credential. Two ways to add them:

### Option A — `.env` (quickest)

```bash
FRAUDJS_CREDENTIALS=you@example.com:yourpassword
```

Multiple accounts for failover (comma-separated, no spaces):
```bash
FRAUDJS_CREDENTIALS=primary@example.com:pass1,backup@example.com:pass2
```

Make sure your app loads `.env` (e.g. with `dotenv`) or export the variable in your shell.

### Option B — `addCredential()` / CLI (persisted)

Credentials are encrypted with AES-256-GCM and stored in your OS config directory:

- **Linux:** `~/.config/fraudjs/credentials.json`
- **macOS:** `~/Library/Preferences/fraudjs/credentials.json`
- **Windows:** `%APPDATA%\fraudjs\credentials.json`

```bash
npx fraudjs add-credential
# prompts for email + password (hidden input)
```

Or from code:
```js
import { addCredential } from 'steadfast-fraud';
await addCredential({ email: 'you@example.com', password: 'yourpassword' });
```

#### Encryption key

By default a random 32-byte key is generated and saved to `~/.config/fraudjs/master.key`. It's machine-specific — credentials can't be decrypted on another machine unless you copy the key file.

For a portable/server setup, set `FRAUDJS_SECRET` to any string and the key will be derived from it instead:

```bash
# generate a good one:
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
FRAUDJS_SECRET=<that value>
```

---

## API

### `checkPhone(phone)`

Returns delivery and fraud stats for a phone number. Tries each configured credential in order; if one fails it moves to the next.

```js
const { delivered, cancelled, frauds, consignment } = await checkPhone('01700000000');
```

**Returns:**
```js
{
  delivered:   number,   // total successfully delivered orders
  cancelled:   number,   // total cancelled orders
  frauds:      number,   // flagged fraud orders
  consignment: object[], // raw consignment objects from the Steadfast API
}
```

**Throws:**
- `NoCredentialsError` — nothing configured
- `AllCredentialsFailedError` — every credential was tried and failed (has `.failures` array)
- `NetworkError` — DNS failure, timeout, etc.

---

### `addCredential({ email, password })`

Encrypts and saves a credential. Replaces any existing entry for that email.

### `listCredentials()`

Returns stored emails only — passwords are never exposed.

### `removeCredential(email)`

Removes a stored credential. Throws if the email isn't found.

### `refresh()`

Forces a cookie refresh for all configured accounts. You normally don't need this — sessions auto-refresh every 24 hours.

---

## Error handling

All errors extend `FraudJSError` and have a `.name` matching the class name (useful for `switch` statements without `instanceof`):

```js
import {
  checkPhone,
  NoCredentialsError,
  AllCredentialsFailedError,
  AuthError,
  NetworkError,
} from 'steadfast-fraud';

try {
  return await checkPhone(phone);
} catch (err) {
  switch (err.name) {
    case 'NoCredentialsError':
      console.error('No credentials configured');
      break;
    case 'AllCredentialsFailedError':
      for (const { email, error } of err.failures) {
        console.error(`[${email}] ${error}`);
      }
      break;
    case 'NetworkError':
      console.error('Cannot reach Steadfast');
      break;
    default:
      throw err;
  }
}
```

---

## CLI

```bash
npx fraudjs check 01700000000
npx fraudjs add-credential
npx fraudjs list-credentials
npx fraudjs remove-credential you@example.com
npx fraudjs refresh
```

`check` prints JSON to stdout. Exit code 1 + stderr message on failure.

---

## How it works

Steadfast uses a standard Laravel session setup. The sequence on first use:

1. `GET /login` — pick up the `XSRF-TOKEN` cookie and the `_token` CSRF value from the HTML
2. `POST /login` with `redirect: 'manual'` — capture the `steadfast_courier_session` cookie from the 302 *before* following it (if fetch auto-follows, those Set-Cookie headers are lost)
3. Follow the redirect to complete the session
4. `GET /user/consignment/getbyphone/{phone}` — send both cookies plus `X-XSRF-TOKEN` set to the URL-decoded value of the XSRF cookie (Laravel writes it encoded but expects it decoded in the header)

Sessions are cached in memory. If a request returns HTML or a 401/419, the session is refreshed and the request is retried once before trying the next credential.

---

## Using with Express / Next.js

The singleton client keeps sessions alive between requests, so only the first call per credential triggers a login:

```js
// Express
app.get('/check/:phone', async (req, res) => {
  try {
    res.json(await checkPhone(req.params.phone));
  } catch (err) {
    res.status(502).json({ error: err.message, failures: err.failures });
  }
});

// Next.js App Router (Node runtime)
export async function GET(req) {
  const phone = new URL(req.url).searchParams.get('phone');
  if (!phone) return Response.json({ error: 'phone required' }, { status: 400 });
  try {
    return Response.json(await checkPhone(phone));
  } catch (err) {
    return Response.json({ error: err.message }, { status: 502 });
  }
}
```

---

## Troubleshooting

**`AllCredentialsFailedError: All N credential(s) failed`**
Check `err.failures` for per-account details. Common causes: wrong password, account locked, or rate limiting. Add more accounts with `fraudjs add-credential`.

**`AuthError: Login failed … — check email/password`**
Credentials were rejected. Verify by logging in to packzy.com manually.

**`Failed to decrypt credentials — wrong FRAUDJS_SECRET or corrupted store`**
The `FRAUDJS_SECRET` doesn't match the one used when the credentials were originally stored. Restore the original secret, or remove and re-add credentials.

**Response always shows zeros**
Phone number likely has no orders in Steadfast. Check `result.consignment` for the raw API payload.

---

## Tests

```bash
npm test
```

Uses Node's built-in `node:test` — no extra dependencies. All tests mock `globalThis.fetch`, no network needed.

---

## License

MIT

> **Note:** This package automates access to the Steadfast merchant portal. You're responsible for complying with their terms. Use only accounts you own and authorise.
