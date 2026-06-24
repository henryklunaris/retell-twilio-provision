---
name: retell-twilio-provision
description: Create a Retell AI agent, buy a US Twilio number, wire it up over Elastic SIP Trunking, and BIND the agent to the number — entirely by API. Use when the user wants to provision/purchase a phone number for Retell, create a Retell agent and attach a number to it, or set up a Twilio SIP trunk for Retell.
metadata:
  version: "4.0.0"
  author: Henryk Brzozowski
compatibility: Requires Node 20.6+ (for global fetch and --env-file). No other dependencies.
---

# Retell + Twilio Provisioning (agent + number)

End-to-end, idempotent setup: create a Retell agent, buy a Twilio number, build the
SIP trunk, and bind the agent to the number. All by API (Twilio REST + Retell REST) —
no console clicking, no SDKs, no `npm install`.

```
create Retell agent  ->  search a US number  ->  buy it  ->  Elastic SIP Trunk + creds
->  attach number to trunk  ->  import into Retell (SIP auth) + BIND the agent
```

After it runs, the number can place **outbound** calls through the agent AND routes
**inbound** calls to the bound agent. The binding is static (`inbound_agents`)

## Prerequisites

Set these in a `.env` file in the project (the user owns this file — never open it):

| Var | What |
| --- | --- |
| `TWILIO_ACCOUNT_SID` | Twilio Account SID (starts `AC...`) |
| `TWILIO_AUTH_TOKEN` | Twilio Auth Token |
| `RETELL_API_KEY` | Retell API key (starts `key_...`) |

## 🔒 Secret handling (do this, always)

- **Never read `.env`** 
- Always run the script with **`node --env-file=.env`** so Node injects the secrets directly into the process
- This skill ships `templates/settings.json` with deny rules that block reading `.env` AND `retell-sip-*.local.json`. Offer to merge it into the project's
  `.claude/settings.json` so the user is protected by default (see below).

## How to run it

The whole flow is one zero-dependency script: `scripts/provision.mjs`. Drive it in
four steps.

1. **Create the agent** (free). Uses the bundled `references/agent.default.json`
   template (override the spoken name / voice if asked). Note the printed `agent_id`:
   ```bash
   node --env-file=.env scripts/provision.mjs create-agent --name "My Assistant"
   ```
   If the user already has a Retell agent, skip this and use their `agent_id`.

2. **Search** for a number (free, read-only). Optionally filter by area code:
   ```bash
   node --env-file=.env scripts/provision.mjs search --area 240
   ```

3. **Confirm cost, then buy.** Buying spends money (~$1/mo). ALWAYS confirm the
   chosen number with the user before running `buy`:
   ```bash
   node --env-file=.env scripts/provision.mjs buy --number +1XXXXXXXXXX
   ```

4. **Provision + bind.** Build the trunk, import into Retell, and bind the agent to
   the number (pass the `agent_id` from step 1):
   ```bash
   node --env-file=.env scripts/provision.mjs provision --number +1XXXXXXXXXX --agent-id agent_...
   ```

The `provision` step prints a redacted result JSON. When Twilio generates fresh SIP
credentials, the script **writes them to a local `retell-sip-<last4>.local.json` file. Point the user to that file and tell them to keep it safe + gitignore it (Twilio never returns the password again). To re-run later (or add another number to the same trunk), pass the saved values back with `--sip-user` / `--sip-pass`. Omitting
`--agent-id` provisions the number outbound-only (no agent bound).

## Critical gotchas/rules

- **Idempotent, but the SIP password is write-once.** Re-running is safe — the trunk, credential list, origination URL, and number attachment are all find-or-create. The one thing Twilio won't return again is the SIP password (see step 3).
- **`buy` spends money.** Never call it without explicit user confirmation.
- **Two Twilio hosts.** Trunk + sub-resources live on `trunking.twilio.com/v1`; number lookup + SIP credential lists live on `api.twilio.com/2010-04-01` (needs `.json`). Handled inside the script — just know it if you debug a 404.

### Other gotchas
The user might want to buy a EU or other type of number, for now, we can only do US. If there are any failed attempts with anything, the user should have credits in their twilio account for buying a number.

## Protect the user's .env
Offer to copy this skill's `templates/settings.json` deny rules into the project's `.claude/settings.json` (merging, not overwriting).

## Reference files

- [Annotated provisioning walkthrough](./references/twilio-provision.md)
- Agent template (edit to customize): [`references/agent.default.json`](./references/agent.default.json)
- Script: [`scripts/provision.mjs`](./scripts/provision.mjs)
- Env template: [`.env.example`](./.env.example)
- `.env` protection: [`templates/settings.json`](./templates/settings.json)
