---
name: retell-twilio-provision
description: Buy a US phone number on Twilio and wire it to a Retell AI agent for OUTBOUND calling over Elastic SIP Trunking — entirely by API, no console clicks, no npm install. Use when the user wants to provision/purchase a phone number for Retell, attach a Twilio number to Retell, or set up a Twilio SIP trunk for Retell outbound dialing.
metadata:
  version: "2.0.0"
  author: Henryk
  homepage: https://skills.sh
license: MIT
compatibility: Requires Node 18+ (for global fetch and --env-file). No other dependencies.
---

# Retell + Twilio Number Provisioning (outbound)

End-to-end, idempotent setup of a Twilio number for **outbound** calling through a
Retell AI agent. Everything is done by API (Twilio REST + Retell REST) so it is
repeatable and scriptable — no Twilio console clicking, no SDKs, no `npm install`.

```
search a US number  ->  buy it  ->  Elastic SIP Trunk + credentials  ->
attach number to trunk  ->  import into Retell (termination_uri + SIP auth)
```

After it runs, the number can place **outbound** calls through any of your Retell
agents (you pass the agent id at call time). Inbound webhook routing is intentionally
out of scope for this skill.

## Prerequisites

Set these in a `.env` file in the project (the user owns this file — never open it):

| Var | What |
| --- | --- |
| `TWILIO_ACCOUNT_SID` | Twilio Account SID (starts `AC...`) |
| `TWILIO_AUTH_TOKEN` | Twilio Auth Token |
| `RETELL_API_KEY` | Retell API key (starts `key_...`) |

## 🔒 Secret handling (do this, always)

- **Never read `.env`** (or `.env.*`). Do not `cat`, `grep`, open, or print it. You
  only need the variable *names*, never the values.
- Always run the script with **`node --env-file=.env`** so Node injects the secrets
  directly into the process — they never enter your context or the chat.
- This skill ships `templates/settings.json` with deny rules that block reading
  `.env`. Offer to merge it into the project's `.claude/settings.json` so the user is
  protected by default (see "Protect the user's .env" below).

## How to run it

The whole flow is one zero-dependency script: `scripts/provision.mjs`. Drive it in
three steps.

1. **Search** for a number (free, read-only). Optionally filter by area code:
   ```bash
   node --env-file=.env scripts/provision.mjs search --area 240
   ```

2. **Confirm cost, then buy.** Buying spends money (~$1/mo). ALWAYS confirm the
   chosen number with the user before running `buy`:
   ```bash
   node --env-file=.env scripts/provision.mjs buy --number +1XXXXXXXXXX
   ```

3. **Provision** the bought number into the trunk + Retell:
   ```bash
   node --env-file=.env scripts/provision.mjs provision --number +1XXXXXXXXXX
   ```

The `provision` step prints a result JSON. If `generatedCredentials` is `true`,
**save `sipUsername` + `sipPassword`** — Twilio never returns the password again. To
re-run later (or add another number to the same trunk), pass them back with
`--sip-user` / `--sip-pass`.

## Critical gotchas

- **Idempotent, but the SIP password is write-once.** Re-running is safe — the trunk,
  credential list, origination URL, and number attachment are all find-or-create. The
  one thing Twilio won't return again is the SIP password (see step 3).
- **`buy` spends money.** Never call it without explicit user confirmation.
- **Two Twilio hosts.** Trunk + sub-resources live on `trunking.twilio.com/v1`; number
  lookup + SIP credential lists live on `api.twilio.com/2010-04-01` (needs `.json`).
  Handled inside the script — just know it if you debug a 404.

## Protect the user's .env

Offer to copy this skill's `templates/settings.json` deny rules into the project's
`.claude/settings.json` (merging, not overwriting). They stop Claude Code from reading
`.env` / `.env.*` via the file tools AND via shell (`cat`/`grep`/etc.). Note: a
`Read(...)` deny alone does not block a shell `cat`, which is why the template includes
both Read and Bash deny rules.

## Reference files

- [Annotated provisioning walkthrough](./references/twilio-provision.md)
- Script: [`scripts/provision.mjs`](./scripts/provision.mjs)
- Env template: [`.env.example`](./.env.example)
- `.env` protection: [`templates/settings.json`](./templates/settings.json)
