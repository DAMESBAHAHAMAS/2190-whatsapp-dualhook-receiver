'use strict';

const express = require('express');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const { forwardToZohoCRM } = require('./lib/crm');

const PORT = process.env.PORT || 3000;
const CAPABILITY_PATH = process.env.CAPABILITY_PATH;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN;

if (!CAPABILITY_PATH || !VERIFY_TOKEN) {
  console.error(JSON.stringify({
    evt: 'fatal_missing_env',
    ts: new Date().toISOString(),
    message: 'CAPABILITY_PATH and VERIFY_TOKEN must both be set as environment variables before this service can start.'
  }));
  process.exit(1);
}

const app = express();
app.disable('x-powered-by');

// Capture the raw body for logging/evidence purposes. We do NOT validate
// X-Hub-Signature-256 here -- in Dualhook's Webhook Override mode that header
// is signed with DUALHOOK'S OWN App Secret, not the account owner's, so a
// standard Meta HMAC check would always fail. See README "Why no HMAC check".
app.use(express.json({
  limit: '1mb',
  verify: (req, _res, buf) => { req.rawBody = buf.toString('utf8'); }
}));

function timingSafeEqual(a, b) {
  const bufA = Buffer.from(String(a == null ? '' : a));
  const bufB = Buffer.from(String(b == null ? '' : b));
  if (bufA.length !== bufB.length) {
    // Still run a compare so a length mismatch doesn't short-circuit faster
    // than a content mismatch (crude timing-attack mitigation).
    crypto.timingSafeEqual(bufA, bufA);
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

// Capability-URL control (compensates for the missing HMAC check): the path
// segment itself acts as a shared secret. Wrong segment -> generic 404, never
// reveal that the path structure is meaningful.
function requireCapabilityPath(req, res, next) {
  if (!timingSafeEqual(req.params.token, CAPABILITY_PATH)) {
    return res.status(404).send('Not found');
  }
  next();
}

// Rate-limiting control: blunts abuse if the capability URL ever leaks.
const inboundLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120, // generous ceiling for legitimate burst traffic; revisit after real volume is observed
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Too many requests'
});

app.get('/healthz', (_req, res) => res.status(200).send('ok'));

// --- Meta / Dualhook webhook verification handshake ---
app.get('/webhook/:token', requireCapabilityPath, (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && timingSafeEqual(token, VERIFY_TOKEN)) {
    console.log(JSON.stringify({ evt: 'handshake_ok', ts: new Date().toISOString() }));
    return res.status(200).type('text/plain').send(challenge);
  }

  console.warn(JSON.stringify({ evt: 'handshake_rejected', ts: new Date().toISOString(), mode: mode || null }));
  return res.sendStatus(403);
});

// --- Inbound WhatsApp events ---
app.post('/webhook/:token', requireCapabilityPath, inboundLimiter, (req, res) => {
  const body = req.body;

  // Payload-assertion control (the second HMAC replacement): reject anything
  // that doesn't match the expected WhatsApp Cloud API envelope shape.
  if (!body || body.object !== 'whatsapp_business_account' || !Array.isArray(body.entry)) {
    console.warn(JSON.stringify({ evt: 'payload_rejected', ts: new Date().toISOString(), reason: 'shape_mismatch' }));
    return res.sendStatus(400);
  }

  // Acknowledge immediately -- Meta/Dualhook expect a fast 200. Do the slower
  // work (CRM forwarding) after responding.
  res.sendStatus(200);

  try {
    for (const entry of body.entry) {
      const changes = entry.changes || [];
      for (const change of changes) {
        const value = change.value || {};
        const messages = value.messages || [];
        for (const message of messages) {
          console.log(JSON.stringify({
            evt: 'inbound_message_received',
            ts: new Date().toISOString(),
            from: message.from || null,
            type: message.type || null,
            wamid: message.id || null
          }));

          forwardToZohoCRM(message, value).catch((err) => {
            console.error(JSON.stringify({
              evt: 'crm_forward_error',
              ts: new Date().toISOString(),
              wamid: message.id || null,
              error: String(err && err.message ? err.message : err)
            }));
          });
        }
      }
    }
  } catch (err) {
    console.error(JSON.stringify({ evt: 'inbound_processing_error', ts: new Date().toISOString(), error: String(err) }));
  }
});

app.listen(PORT, () => {
  console.log(JSON.stringify({ evt: 'server_started', ts: new Date().toISOString(), port: PORT }));
});
