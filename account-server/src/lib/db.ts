import { Pool } from "pg";

const globalDatabase = globalThis as typeof globalThis & {
  rustdeskPool?: Pool;
  rustdeskSchema?: Promise<void>;
};

export const pool =
  globalDatabase.rustdeskPool ??
  new Pool({
    host: process.env.PGHOST ?? "postgres",
    port: Number(process.env.PGPORT ?? "5432"),
    database: process.env.PGDATABASE ?? "rustdesk",
    user: process.env.PGUSER ?? "rustdesk",
    password: process.env.PGPASSWORD ?? "",
    max: 10,
  });

globalDatabase.rustdeskPool = pool;

const schema = `
CREATE TABLE IF NOT EXISTS users (
  id BIGSERIAL PRIMARY KEY,
  username VARCHAR(64) NOT NULL,
  username_normalized VARCHAR(64) NOT NULL UNIQUE,
  display_name VARCHAR(128) NOT NULL DEFAULT '',
  email VARCHAR(254),
  password_salt VARCHAR(128) NOT NULL,
  password_hash VARCHAR(128) NOT NULL,
  status SMALLINT NOT NULL DEFAULT 1 CHECK (status IN (-1, 0, 1)),
  is_admin BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash CHAR(64) PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  rustdesk_id VARCHAR(64),
  device_uuid VARCHAR(256),
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS sessions_user_id_idx ON sessions(user_id);
CREATE INDEX IF NOT EXISTS sessions_expires_at_idx ON sessions(expires_at);
CREATE TABLE IF NOT EXISTS devices (
  rustdesk_id VARCHAR(64) PRIMARY KEY,
  device_uuid VARCHAR(256) NOT NULL,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  info TEXT NOT NULL DEFAULT '{}',
  note TEXT NOT NULL DEFAULT '',
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS devices_user_id_idx ON devices(user_id);
CREATE TABLE IF NOT EXISTS address_books (
  user_id BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  data TEXT NOT NULL DEFAULT '{"tags":[],"peers":[]}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
`;

export async function ensureSchema(): Promise<void> {
  globalDatabase.rustdeskSchema ??= pool.query(schema).then(() => undefined);
  return globalDatabase.rustdeskSchema;
}
