import { AuthError } from './errors.js';

const BASE_URL = 'https://merchant.packzy.com';
const LOGIN_URL = `${BASE_URL}/login`;

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

function getSetCookies(response) {
  // getSetCookie() was added in Node 18.14; fall back for older 18.x
  if (typeof response.headers.getSetCookie === 'function') {
    return response.headers.getSetCookie();
  }
  const raw = response.headers.get('set-cookie');
  return raw ? [raw] : [];
}

export async function storeCookies(jar, url, response) {
  for (const cookie of getSetCookies(response)) {
    await jar.setCookie(cookie, url).catch(() => {});
  }
}

export async function fetchWithJar(jar, url, options = {}) {
  const cookieStr = await jar.getCookieString(url);
  const headers = { ...(options.headers || {}) };
  if (cookieStr) headers['Cookie'] = cookieStr;
  const response = await fetch(url, { ...options, headers });
  await storeCookies(jar, url, response);
  return response;
}

export async function fetchLoginPage(jar) {
  const response = await fetchWithJar(jar, LOGIN_URL, {
    headers: { 'User-Agent': UA, 'Accept': 'text/html,application/xhtml+xml,*/*' },
  });

  const html = await response.text();

  const metaMatch = html.match(/<meta[^>]+name=["']csrf-token["'][^>]+content=["']([^"']+)["']/i);
  if (metaMatch) return metaMatch[1];

  const inputMatch = html.match(/<input[^>]+name=["']_token["'][^>]+value=["']([^"']+)["']/i);
  if (inputMatch) return inputMatch[1];

  const inputMatch2 = html.match(/<input[^>]+value=["']([^"']+)["'][^>]+name=["']_token["']/i);
  if (inputMatch2) return inputMatch2[1];

  throw new AuthError('Could not extract CSRF token from login page');
}

export async function getXsrfValue(jar, url = BASE_URL) {
  const cookies = await jar.getCookies(url);
  const xsrf = cookies.find(c => c.key === 'XSRF-TOKEN');
  // Laravel URL-encodes the cookie value but expects the raw decoded value in the header
  return xsrf ? decodeURIComponent(xsrf.value) : '';
}

export async function login(jar, email, password) {
  const csrfToken = await fetchLoginPage(jar);

  const body = new URLSearchParams({ email, password, _token: csrfToken });
  const cookieStr = await jar.getCookieString(LOGIN_URL);
  const xsrfValue = await getXsrfValue(jar, LOGIN_URL);

  // redirect:'manual' so we can capture Set-Cookie from the 302 itself;
  // if fetch follows the redirect automatically those headers are lost
  const loginRes = await fetch(LOGIN_URL, {
    method: 'POST',
    redirect: 'manual',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Cookie': cookieStr,
      'X-XSRF-TOKEN': xsrfValue,
      'User-Agent': UA,
      'Accept': 'text/html,application/xhtml+xml,*/*',
      'Referer': LOGIN_URL,
      'Origin': BASE_URL,
    },
    body: body.toString(),
  });

  await storeCookies(jar, LOGIN_URL, loginRes);

  const { status } = loginRes;
  const location = loginRes.headers.get('location') || '';

  if (status === 200 || (status >= 300 && status < 400 && location.includes('/login'))) {
    throw new AuthError(`Login failed for ${email} — check email/password`);
  }
  if (status === 422) throw new AuthError(`Login validation error for ${email}`);

  if (status >= 300 && status < 400 && location) {
    await followRedirects(jar, new URL(location, BASE_URL).href, 6);
  }
}

async function followRedirects(jar, url, maxHops) {
  for (let i = 0; i < maxHops; i++) {
    const res = await fetchWithJar(jar, url, {
      redirect: 'manual',
      headers: { 'User-Agent': UA, 'Accept': 'text/html,application/xhtml+xml,*/*' },
    });

    if (res.status < 300 || res.status >= 400) break;
    const next = res.headers.get('location');
    if (!next) break;

    url = new URL(next, BASE_URL).href;
    if (url.includes('/login')) throw new AuthError('Redirected back to /login after POST');
  }
}

export function isSessionExpired(response) {
  const ct = response.headers.get('content-type') || '';
  if (ct.includes('text/html')) return true;
  if (response.status === 401 || response.status === 419) return true;
  return false;
}
