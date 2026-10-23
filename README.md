# Settlers

Settlers of Catan for small groups: a config-driven rules engine, bots, a mobile-first UI, and a free-tier
Cloudflare host for playing with friends in a phone browser.

```
games/settlers/   engine (pure, seeded, JSON state), bots, mobile UI        <- the game
client-sdk/       Transport interface: LocalTransport (in-tab) and WsTransport (online)
host/             Cloudflare Worker + Durable Objects (rooms, profiles, usage meter)
tests/            unit (engine, bots, UI in jsdom), host (room logic, security), e2e (real workerd)
scripts/          build (single-file artifact), build-host (hosted client files)
```

## Commands

| | |
|---|---|
| `npm test` | engine, bots, UI, room/security tests (58) |
| `npm run typecheck` | strict TypeScript, client and Worker configs |
| `npm run build` | `dist/settlers-artifact.html`, single file, local play only |
| `npm run host:dev` | build the hosted client and run the Worker locally |
| `npm run e2e` | with `host:dev` running: real sockets, a full game, fail-closed checks |
| `npm run host:deploy` | build and deploy to Cloudflare |

Node 22+. Source runs directly on Node (type stripping); there is no emit step except the bundles.

## Deploying (needs your Cloudflare account)

1. `npm ci`
2. `npx wrangler login`
3. Make a host key (32+ characters, keep it private) and store it as a secret:
   `node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"` then
   `cd host && npx wrangler secret put HOST_KEY`
4. `npm run host:deploy`. Wrangler prints your `https://settlers-host.<you>.workers.dev` address.
5. Check, before inviting anyone:
   - `curl -i -X POST https://<address>/api/rooms` returns 403.
   - `curl -i https://<address>/api/usage` returns 403.
   - The preview-URL setting in `host/wrangler.toml` is `false`.
6. Open the address, expand "Host a game", paste the host key, tap Create room, and share the invite link.

Do not attach a payment method or upgrade the plan. The free plan stops working at its limits instead of billing.

## How access works

There is no login. Access is by capability:

- **Creating rooms** needs the host key (checked in constant time). Without it the Worker answers 403 with no body.
- **Room addresses** are `<id>.<signature>`; the signature is an HMAC of the id under the host key, so a forged
  address is refused by the Worker before any Durable Object is touched.
- **Joining**: the invite link carries a secret in the URL fragment (never sent to the server in a request line,
  never logged). A visitor submits a request; the host sees the name (duplicates are flagged) and approves or
  declines. Requests expire (5 min), at most 8 wait at once, and the invite expires (24 h), can be rotated
  and can be locked. A full or started room locks itself.
- **Seats**: the browser generates a 128-bit seat token and sends it; the room stores only its SHA-256.
  Reconnecting presents the same token. The seat id on every action comes from the token, never from the message.
- **Hidden information**: every outgoing state is built by `viewFor` for that seat only (allow-list). Other
  players' hands and dev cards, the deck order and the RNG never leave the server. Tests cover this at the
  engine level and on the wire.
- **Inbound messages**: strict parser, 4 KB cap, 25 msgs/s with disconnect on sustained excess, unknown fields dropped.
  System actions (such as trade expiry) cannot be authored by a client.
- **Browser safety**: names are plain text (markup, control and bidi characters stripped); the page ships a
  same-origin-only content policy, no third-party scripts, fonts or analytics.
- **Profiles (optional)**: random id plus a secret kept on the device and in a recovery code. A name never grants
  access. Stats are computed by the server from the finished game.

Risks that remain by design: anyone holding a live invite link can *ask* to join (you decide), and a host who
approves an impostor with a friend's name has approved an impostor. Probing the API from the internet costs
free-plan requests; the room meter refuses new rooms above 95% of the daily budget.

## Free plan notes

Quota numbers in `host/src/config.ts` follow the plan document and should be re-checked against Cloudflare's
current limits. Static files are served by the platform and do not run Worker code. The game is turn based, so
rooms hibernate between moves; only bot pacing, trade timers and the turn timer use alarms.
