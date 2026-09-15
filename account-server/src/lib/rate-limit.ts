type Attempt = { count: number; resetAt: number };

const globalAttempts = globalThis as typeof globalThis & {
  rustdeskLoginAttempts?: Map<string, Attempt>;
};

const attempts = globalAttempts.rustdeskLoginAttempts ?? new Map<string, Attempt>();
globalAttempts.rustdeskLoginAttempts = attempts;

const windowMilliseconds = 15 * 60 * 1000;

function keyState(key: string): Attempt {
  const now = Date.now();
  if (attempts.size >= 10_000) {
    for (const [storedKey, attempt] of attempts) {
      if (attempt.resetAt <= now) attempts.delete(storedKey);
    }
    if (attempts.size >= 10_000) attempts.clear();
  }
  const current = attempts.get(key);
  if (!current || current.resetAt <= now) {
    const fresh = { count: 0, resetAt: now + windowMilliseconds };
    attempts.set(key, fresh);
    return fresh;
  }
  return current;
}

export function loginLimit(request: Request, username: string): { allowed: boolean; keys: string[] } {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0].trim();
  const ip = forwarded || request.headers.get("x-real-ip") || "unknown";
  const keys = [`user:${username}`, `ip:${ip}`];
  return {
    allowed: keyState(keys[0]).count < 10 && keyState(keys[1]).count < 30,
    keys,
  };
}

export function recordLoginFailure(keys: string[]): void {
  for (const key of keys) keyState(key).count += 1;
}

export function clearUserLoginFailures(username: string): void {
  attempts.delete(`user:${username}`);
}
