import { Session } from './session.js';
import { getAllCredentials } from './credentials.js';
import { isSessionExpired } from './auth.js';
import {
  AllCredentialsFailedError,
  NoCredentialsError,
  NetworkError,
  SessionExpiredError,
} from './errors.js';

const BASE_URL = 'https://merchant.packzy.com';
const PHONE_ENDPOINT = `${BASE_URL}/user/consignment/getbyphone/`;

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

export class SteadfastClient {
  constructor() {
    this._sessions = new Map(); // email → Session
  }

  async _getSessions() {
    const creds = await getAllCredentials();
    if (creds.length === 0) {
      throw new NoCredentialsError(
        'No credentials configured. Set FRAUDJS_CREDENTIALS in .env or run: fraudjs add-credential'
      );
    }
    for (const { email, password } of creds) {
      if (!this._sessions.has(email)) {
        this._sessions.set(email, new Session(email, password));
      }
    }
    return creds.map(c => this._sessions.get(c.email));
  }

  async checkPhone(phone) {
    const sessions = await this._getSessions();
    const failures = [];

    for (const session of sessions) {
      try {
        return await this._checkWithSession(session, phone);
      } catch (err) {
        failures.push({ email: session.email, error: err.message });
      }
    }

    throw new AllCredentialsFailedError(
      `All ${sessions.length} credential(s) failed for phone ${phone}`,
      failures
    );
  }

  async refreshAll() {
    const sessions = await this._getSessions();
    await Promise.all(sessions.map(s => s.forceRefresh()));
  }

  async _checkWithSession(session, phone, isRetry = false) {
    await session.ensureFresh();

    const url = PHONE_ENDPOINT + encodeURIComponent(phone);
    const authHeaders = await session.getAuthHeaders();

    let response;
    try {
      response = await fetch(url, {
        headers: {
          ...authHeaders,
          'Accept': 'application/json, text/plain, */*',
          'X-Requested-With': 'XMLHttpRequest',
          'Referer': `${BASE_URL}/user/add-parcel/regular`,
          'User-Agent': UA,
        },
      });
    } catch (err) {
      throw new NetworkError(`Network error: ${err.message}`);
    }

    if (isSessionExpired(response)) {
      if (isRetry) throw new SessionExpiredError(`Session expired for ${session.email} after re-login`);
      await session.forceRefresh();
      return this._checkWithSession(session, phone, true);
    }

    if (!response.ok) throw new Error(`HTTP ${response.status} from consignment API`);

    return parseResponse(await response.json());
  }
}

function parseResponse(data) {
  const p = (data?.data != null) ? data.data : data;
  return {
    delivered: p.total_delivered ?? 0,
    cancelled: p.total_cancelled ?? 0,
    frauds: p.frauds ?? 0,
    consignment: p.con ?? p.consignment ?? [],
  };
}
