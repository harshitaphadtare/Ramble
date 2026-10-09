import { betterAuth } from 'better-auth';

/**
 * Accounts (docs/SECURITY.md §6). The "password" Better Auth receives is NOT the user's password:
 * the device derives it with Argon2id + HKDF and keeps the matching encryption key to itself, so
 * this server can authenticate the user without being able to read their data. Better Auth hashes
 * that auth key again before storing it.
 */
export interface AuthOptions {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Better Auth's adapter type is generic over its schema
  database: any;
  baseURL: string;
  secret: string;
  /** Sends account emails (verification). When absent, email verification is skipped. */
  sendEmail?: (to: string, subject: string, text: string) => Promise<void>;
}

export function createAuth({ database, baseURL, secret, sendEmail }: AuthOptions) {
  const secure = baseURL.startsWith('https://');
  return betterAuth({
    database,
    baseURL,
    basePath: '/api/auth',
    secret,
    trustedOrigins: [new URL(baseURL).origin],
    emailAndPassword: {
      enabled: true,
      // Derived auth keys are 43 base64url characters; anything shorter isn't one of ours.
      minPasswordLength: 43,
      maxPasswordLength: 64,
      requireEmailVerification: !!sendEmail,
      autoSignIn: !sendEmail,
    },
    emailVerification: sendEmail
      ? {
          sendOnSignUp: true,
          autoSignInAfterVerification: true,
          sendVerificationEmail: async ({ user, url }) => {
            await sendEmail(user.email, 'Confirm your Ramble account', `Welcome to Ramble!\n\nConfirm your email to turn on encrypted sync:\n${url}\n\nIf you didn't sign up, ignore this email.`);
          },
        }
      : undefined,
    session: { expiresIn: 60 * 60 * 24 * 30, updateAge: 60 * 60 * 24 },
    rateLimit: { enabled: true, window: 60, max: 30, customRules: { '/sign-in/email': { window: 60, max: 5 }, '/sign-up/email': { window: 60, max: 5 } } },
    advanced: {
      useSecureCookies: secure,
      cookiePrefix: 'ramble',
      defaultCookieAttributes: { httpOnly: true, secure, sameSite: 'lax', path: '/' },
    },
  });
}

export type RambleAuth = ReturnType<typeof createAuth>;

/** Resend (https://resend.com) for verification emails, when RESEND_API_KEY is set. */
export function resendSender(): AuthOptions['sendEmail'] {
  const key = process.env.RESEND_API_KEY?.trim();
  if (!key || key === 'unset') return undefined;
  const from = process.env.RESEND_FROM?.trim() || 'Ramble <onboarding@resend.dev>';
  return async (to, subject, text) => {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
      body: JSON.stringify({ from, to, subject, text }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`Resend responded ${res.status}`);
  };
}
