# RustDesk account server

This Next.js service supplies the account APIs used by the RustDesk Flutter
client and a Chinese administration page at `/admin`. PostgreSQL stores users,
hashed sessions, bound devices, and personal address books.

## Start

1. Copy `.env.example` to `.env` and replace both secrets.
2. Set `ACCOUNT_HOSTNAME` to a DNS name that resolves to the server, then run
   `docker compose --profile account up -d --build`.
3. Open the public HTTPS URL at `/admin`. On an empty database, use the
   `ACCOUNT_BOOTSTRAP_TOKEN` value to create the first administrator, then log
   in with that account.

Caddy exposes the service over HTTPS on port 21120 and uses port 80 for the
automatic certificate challenge. Set the RustDesk client API server to
`https://<ACCOUNT_HOSTNAME>:21120`. Never send passwords or access tokens over
public plain HTTP.

## Client endpoints

- Login, current user and logout
- Automatic device binding and device/user lists
- Legacy personal address-book synchronization
- Device heartbeat and system-information refresh
- Optional public registration through `POST /api/register`

Public registration defaults to disabled. The first-use bootstrap token stops
working as soon as any account exists. An authenticated administrator can
create, enable or disable accounts and reset passwords through `/admin`.
Disabling an account or resetting its password revokes its active sessions.

## Rendezvous authorization

The custom `hbbs` image performs the RustDesk TCP key exchange before sending
account tokens to the internal authorization endpoint. Set
`RENDEZVOUS_AUTH_SECRET` to a long random value shared only by `hbbs` and the
account service. `RENDEZVOUS_AUTH_POLICY=same-account` allows users to connect
to devices bound to their own account; administrators may connect to every
bound device. `valid-session` accepts any active account session instead.

`RENDEZVOUS_ALLOW_ANONYMOUS=true` preserves connections from signed-out
clients. Set it to `false` only after every required client can log in, because
signed-out connection requests will then be rejected by `hbbs`.
