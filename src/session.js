import { CookieJar } from 'tough-cookie';
import { login, getXsrfValue } from './auth.js';

const REFRESH_INTERVAL = 24 * 60 * 60 * 1000;
const BASE_URL = 'https://merchant.packzy.com';

export class Session {
  constructor(email, password) {
    this.email = email;
    this.password = password;
    this.jar = new CookieJar();
    this.lastLogin = null;
    this._loginPromise = null; // dedup: concurrent callers share one in-flight login
  }

  isStale() {
    if (!this.lastLogin) return true;
    return Date.now() - this.lastLogin > REFRESH_INTERVAL;
  }

  async refresh() {
    if (this._loginPromise) return this._loginPromise;

    this._loginPromise = login(this.jar, this.email, this.password)
      .then(() => { this.lastLogin = Date.now(); })
      .finally(() => { this._loginPromise = null; });

    return this._loginPromise;
  }

  async ensureFresh() {
    if (this.isStale()) await this.refresh();
  }

  async forceRefresh() {
    this.jar = new CookieJar();
    this.lastLogin = null;
    await this.refresh();
  }

  async getAuthHeaders() {
    const cookieStr = await this.jar.getCookieString(BASE_URL);
    const xsrfValue = await getXsrfValue(this.jar, BASE_URL);
    return { Cookie: cookieStr, 'X-XSRF-TOKEN': xsrfValue };
  }
}
