---
name: elevenlabs-phone-provider-setup
description: Import Twilio numbers and SIP trunk numbers into ElevenLabs, then configure provider-specific inbound, outbound, and agent assignment settings for Twilio, Telnyx, or Zadarma.
metadata:
  version: "1.0.0"
  author: Saiden.AI
compatibility: Requires Node 20.6+ for global fetch and --env-file. No other dependencies.
---

# ElevenLabs phone provider setup

End-to-end phone setup for ElevenLabs Agents:

```
import phone number -> configure inbound/outbound trunk -> assign agent -> test outbound
```

This skill covers the API-safe part. Provider portal work still has to be done in the provider UI when the provider has no stable API path for the setting.

## Prerequisites

Set these in `.env` and don't open the file:

| Var | What |
| --- | --- |
| `ELEVENLABS_API_KEY` | ElevenLabs API key |
| `TWILIO_ACCOUNT_SID` | Twilio Account SID, only for native Twilio import |
| `TWILIO_AUTH_TOKEN` | Twilio Auth Token, only for native Twilio import |

## Secret handling

- Never read `.env`.
- Always run scripts with `node --env-file=.env`.
- Don't paste SIP passwords into chat. Pass them as CLI args from the terminal, or use your shell history controls.

## Provider choice

| Provider | Use when | Import path | Transfer default |
| --- | --- | --- | --- |
| Twilio native | You have a Twilio number and want the simplest ElevenLabs setup | Native Twilio import | `conference`; `blind` is Twilio-only if caller ID matters |
| Telnyx SIP | You need SIP trunking and Telnyx numbers | SIP trunk import | `conference`, or `sip_refer` with SIP headers when caller ID passthrough is required and tested |
| Zadarma SIP | You need SK/EU numbers and PBX routing | SIP trunk import | `sip_refer` through Zadarma PBX |

Twilio doesn't sell Slovak local or mobile numbers. For Slovak clinic numbers, use Zadarma or Telnyx.

## How to run it

The helper script is `scripts/phone-provider.mjs`.

### 1. Import a native Twilio number

Use this when the number already exists in the Twilio account:

```bash
node --env-file=.env scripts/phone-provider.mjs import-twilio \
  --number +15551234567 \
  --label "Customer support" \
  --agent-id agent_...
```

The script calls `POST /v1/convai/phone-numbers` with `provider: "twilio"`, then patches `agent_id` if supplied.

### 2. Import a SIP trunk number

Import the number first with minimal fields. Then patch outbound and inbound trunk config separately. This avoids the combined-create/patch failures we have seen in production.

```bash
node --env-file=.env scripts/phone-provider.mjs import-sip \
  --number +421555123456 \
  --label "Clinic SIP" \
  --agent-id agent_...
```

The output includes `phone_number_id`. Use that ID in the next step.

### 3. Configure Telnyx SIP

Provider-side checklist:

- Telnyx SIP Connection has the number assigned.
- Inbound destination number format is `+E.164`, not `E.164`.
- Outbound Voice Profile allows the destination country.

Then patch ElevenLabs:

```bash
node --env-file=.env scripts/phone-provider.mjs configure-sip \
  --phone-number-id phnum_... \
  --provider telnyx \
  --sip-user TELNYX_SIP_USERNAME \
  --sip-pass TELNYX_SIP_PASSWORD \
  --agent-id agent_...
```

ElevenLabs values:

```text
outbound_trunk_config.address = sip.telnyx.com
outbound_trunk_config.transport = tls
outbound_trunk_config.media_encryption = allowed
inbound_trunk_config.media_encryption = disabled
```

### 4. Configure Zadarma SIP

Provider-side checklist:

- Virtual number routes to SIP PBX, not directly to External server, if transfers must work.
- PBX incoming scenario routes only this DID to the AI extension.
- AI extension forwards to `+{number}@sip.rtc.elevenlabs.io:5060;transport=tcp`. The leading `+` is mandatory.
- Transfer target extension forwards to the human's phone.

Then patch ElevenLabs:

```bash
node --env-file=.env scripts/phone-provider.mjs configure-sip \
  --phone-number-id phnum_... \
  --provider zadarma \
  --sip-user ZADARMA_PBX_LOGIN \
  --sip-pass ZADARMA_PBX_PASSWORD \
  --agent-id agent_...
```

ElevenLabs values:

```text
outbound_trunk_config.address = pbx.zadarma.com
outbound_trunk_config.transport = tcp
outbound_trunk_config.media_encryption = disabled
inbound_trunk_config.media_encryption = allowed
```

### 5. Verify

```bash
node --env-file=.env scripts/phone-provider.mjs get --phone-number-id phnum_...
```

Check:

- `assigned_agent` or `agent_id` matches the intended agent.
- SIP numbers show inbound and outbound support.
- `has_auth_credentials` is true when outbound digest auth is required.

### 6. Test outbound

Use the real phone number ID from ElevenLabs:

```bash
node --env-file=.env scripts/phone-provider.mjs outbound-call \
  --type sip \
  --agent-id agent_... \
  --phone-number-id phnum_... \
  --to-number +15551234567
```

For native Twilio numbers:

```bash
node --env-file=.env scripts/phone-provider.mjs outbound-call \
  --type twilio \
  --agent-id agent_... \
  --phone-number-id phnum_... \
  --to-number +15551234567
```

## Critical rules

- Use E.164 everywhere: `+15551234567`, not `15551234567`.
- For SIP trunk numbers, create minimal first and patch outbound/inbound separately.
- After any phone-number PATCH, run `get` and verify the value persisted.
- `provider_config.transport`, `provider_config.address`, and credential fields can be ignored by some PATCH paths. Verification is mandatory.
- For real SIP inbound calls, the agent config must include `conversation.client_events` with `audio`.
- SIP URI to ElevenLabs must include an identifier: `sip:+15551234567@sip.rtc.elevenlabs.io:5060;transport=tcp`.
- Don't modify transfer tools or provider routing casually. Phone routing is production state.

## Reference files

- Script: [`scripts/phone-provider.mjs`](./scripts/phone-provider.mjs)
- Provider reference: [`references/provider-checklists.md`](./references/provider-checklists.md)
