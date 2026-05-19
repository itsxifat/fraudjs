import { SteadfastClient } from './client.js';

export {
  FraudJSError,
  AuthError,
  AllCredentialsFailedError,
  NoCredentialsError,
  NetworkError,
  SessionExpiredError,
} from './errors.js';

export { addCredential, listCredentials, removeCredential } from './credentials.js';

// Singleton client — keeps session cookies alive between calls in the same process
const _client = new SteadfastClient();

/**
 * Look up delivery and fraud history for a customer phone number.
 *
 * @param {string} phone - e.g. '01791729300'
 * @returns {Promise<{ delivered: number, cancelled: number, frauds: number, consignment: Array }>}
 */
export async function checkPhone(phone) {
  return _client.checkPhone(phone);
}

/**
 * Force-refresh session cookies for all configured credentials.
 * Call this after changing passwords or recovering from a lock-out.
 */
export async function refresh() {
  return _client.refreshAll();
}
