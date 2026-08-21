# whatsapp-dualhook-receiver

Inbound webhook receiver for the Dualhook Webhook Override -> Zoho CRM path
(SA5-T15a). This is deliberately minimal: it proves the handshake and the
inbound envelope, and stops cleanly at the one real dependency it cannot
resolve on its own (Zoho CRM credentials for this server).

## Why no HMAC signature check

Meta's standard webhook pattern validates the `X-Hub-Signature-256` header
using the integrator's own Meta App Secret. In Dualhook's Webhook Override
mode, that header is signed with **Dualhook's** App Secret, not the account
owner's -- so a standard HMAC check against your own secret will always fail
here. This was a wrong assumption in an earlier revision of this design and
was corrected before this code was written.

In its place, three compensating controls do the job the signature would
normally do:

1. **Capability URL** -- the webhook path includes a long random secret
   segment (`CAPABILITY_PATH`). Anyone without it gets a generic 404.
2. **Payload assertion** -- inbound POSTs are rejected (400) unless they
   match the expected WhatsApp Cloud API envelope shape.
3. **Rate limiting** -- caps request rate per window so a leaked URL can't be
   abused at volume.

## Endpoints

- `GET /healthz` -- liveness check, always 200.
- `GET /webhook/:token` -- Meta/Dualhook verification handshake. Matches
  `hub.verify_token` against `VERIFY_TOKEN` and echoes `hub.challenge` back
  as `text/plain` on success; 403 on mismatch, 404 on wrong `:token`.
- `POST /webhook/:token` -- inbound message events. Validates envelope shape,
  acknowledges with 200 immediately, then logs each message and attempts to
  forward it to Zoho CRM (currently a stub -- see `lib/crm.js`).

## What is NOT done yet

- `lib/crm.js` -- `forwardToZohoCRM` throws until this server has its own
  Zoho CRM Self-Client OAuth credential set (separate from Claude's MCP
  connector grant, which cannot be exported to a standalone server). See the
  comment block in that file for the exact three-step implementation this
  needs, including the phone-matching disambiguation logic from the SA5-T15
  Execution-Ready Rev 2 package, Section 7.6.
- No-match handling (what happens when an inbound number doesn't match any
  Contact) is a decision that hasn't been made yet, not an engineering gap.

## Local run

```
cp .env.example .env   # fill in real values
npm install
npm start
```

## Deploy

Render, Node runtime. Build command `npm install`, start command `npm start`.
Requires `CAPABILITY_PATH` and `VERIFY_TOKEN` set as environment variables on
the service (never commit `.env`).
