'use strict';

// STATUS: NOT WIRED. Intentionally throws until credentials exist.
//
// This standalone server needs its OWN Zoho CRM Self-Client OAuth credential
// set (Client ID, Client Secret, Refresh Token), generated via Zoho's API
// Console (Self Client -> Generate Code -> exchange for a refresh token).
// This is separate from, and cannot reuse, Claude's Zoho CRM MCP connector
// grant -- that grant is scoped to Claude's own session and is not exportable
// to code running elsewhere. This is CRM authentication item #12 in
// meta_asset_inventory.md, and it is currently open.
//
// Once ZOHO_CRM_CLIENT_ID / ZOHO_CRM_CLIENT_SECRET / ZOHO_CRM_REFRESH_TOKEN
// exist as env vars, this function should:
//
//   1. Exchange the refresh token for a short-lived access token:
//        POST {accounts-server}/oauth/v2/token
//          ?grant_type=refresh_token
//          &client_id=...&client_secret=...&refresh_token=...
//      Cache the access token for ~55 minutes (Zoho tokens last 1hr).
//
//   2. Match `message.from` (the sender's WhatsApp number) against Zoho CRM
//      Contacts by phone number -- CAREFULLY. Contacts can carry the same
//      number across up to 11 different phone-type fields (Phone, Mobile,
//      Home_Phone, Other_Phone, Asst_Phone, Fax, ...). A naive OR-search
//      across all of them risks matching the wrong Contact when numbers
//      collide across records. Follow the disambiguation logic specified in
//      the SA5-T15 Execution-Ready Rev 2 package, Section 7.6, rather than
//      re-deriving it here.
//
//   3. Create a Note on the matched Contact via the CRM v8 Notes API
//      (POST /crm/v8/Notes), using the exact payload shape already
//      live-verified working against this org this session:
//
//        {
//          "data": [{
//            "Note_Title": "...",
//            "Note_Content": "...",
//            "Parent_Id": { "id": "<contact_id>", "module": { "api_name": "Contacts" } }
//          }]
//        }
//
//   4. Decide and document what happens on NO MATCH (create a new Contact?
//      route to a human queue? log and drop?) -- this is a decision, not an
//      engineering detail, and it is not yet made.

async function forwardToZohoCRM(_message, _value) {
  throw new Error(
    'forwardToZohoCRM: not implemented -- awaiting this server\'s own Zoho CRM ' +
    'Self-Client OAuth credentials (item #12 in meta_asset_inventory.md).'
  );
}

module.exports = { forwardToZohoCRM };
