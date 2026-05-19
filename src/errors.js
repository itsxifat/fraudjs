export class FraudJSError extends Error {
  constructor(message) {
    super(message);
    this.name = this.constructor.name;
  }
}

export class AuthError extends FraudJSError {}
export class SessionExpiredError extends FraudJSError {}

// .failures: [{ email, error }] — per-account breakdown when everything fails
export class AllCredentialsFailedError extends FraudJSError {
  constructor(message, failures = []) {
    super(message);
    this.failures = failures;
  }
}

export class NetworkError extends FraudJSError {}
export class NoCredentialsError extends FraudJSError {}
