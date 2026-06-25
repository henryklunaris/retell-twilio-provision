---
name: elevenlabs-transfer-outbound-setup
description: Configure ElevenLabs human transfer rules and outbound call tests for Twilio, Telnyx, and Zadarma phone numbers, including provider-specific transfer_type and SIP header choices.
metadata:
  version: "1.0.0"
  author: Saiden.AI
compatibility: Requires Node 20.6+ if using the JSON rendering helper. No dependencies.
---

# ElevenLabs transfer + outbound setup

Use this after a phone number is imported into ElevenLabs and assigned to an agent.

```
choose provider mode -> render transfer_to_number JSON -> apply in ElevenLabs -> real call test
```

The helper script renders the transfer tool JSON. It does not patch the agent automatically because newer ElevenLabs agents can mirror system tools in multiple config locations. Apply the JSON in the dashboard JSON editor or through your own GET/merge/PATCH flow, then GET the agent and verify the live value.

## Provider transfer modes

| Provider | Mode | Notes |
| --- | --- | --- |
| Twilio native | `conference` | Simplest. Supports `agent_message` warm transfer. |
| Twilio native | `blind` | Twilio-only. Preserves original caller ID, no warm transfer message. Configure in JSON. |
| Telnyx SIP | `conference` | Simple fallback. Caller ID to the human may show the Telnyx number. |
| Telnyx SIP | `sip_refer` + headers | Use when caller ID passthrough matters. Add `P-Asserted-Identity` and `Diversion`, then test on the real trunk. |
| Zadarma SIP | `sip_refer` | PBX must stay in the call path. Conference fails on this route. |

## Render transfer JSON

```bash
node scripts/render-transfer-tool.mjs twilio-conference \
  --to-number +15551234567 \
  --condition "Caller asks to speak with a human"
```

```bash
node scripts/render-transfer-tool.mjs zadarma-refer \
  --to-number +421555123456 \
  --condition "Caller asks for reception"
```

```bash
node scripts/render-transfer-tool.mjs telnyx-refer-caller-id \
  --to-number +421555123456 \
  --telnyx-number +421555000000 \
  --condition "Caller asks for reception"
```

Then add or replace the `transfer_to_number` system tool on the agent.

## Twilio native

Use `conference` when you want a normal transfer:

```json
{
  "transfer_type": "conference",
  "transfer_destination": {
    "type": "phone",
    "phone_number": "+15551234567"
  }
}
```

Add `agent_message` only for native Twilio. SIP transfers don't support warm transfer messages.

Use `blind` when original caller ID matters more than warm transfer:

```json
{
  "transfer_type": "blind",
  "transfer_destination": {
    "type": "phone",
    "phone_number": "+15551234567"
  }
}
```

## Telnyx SIP

Start with `conference` unless caller ID passthrough is a requirement.

For caller ID passthrough, use SIP REFER with custom headers:

```json
{
  "transfer_type": "sip_refer",
  "transfer_destination": {
    "type": "phone",
    "phone_number": "+421555123456"
  },
  "custom_sip_headers": [
    {
      "type": "dynamic",
      "key": "P-Asserted-Identity",
      "value": "system__caller_id"
    },
    {
      "type": "static",
      "key": "Diversion",
      "value": "<sip:+421555000000@sip.telnyx.com>"
    }
  ]
}
```

This has to be tested on the real Telnyx trunk. Telnyx validates that an active inbound call exists and that the Diversion header points at your Telnyx number.

## Zadarma SIP

Use SIP REFER:

```json
{
  "transfer_type": "sip_refer",
  "transfer_destination": {
    "type": "phone",
    "phone_number": "+421555123456"
  }
}
```

Provider-side requirements:

- Virtual number routes through Zadarma PBX.
- DID-specific PBX scenario routes only to the AI extension.
- AI extension forwards to `+{number}@sip.rtc.elevenlabs.io:5060;transport=tcp`.
- Transfer target extension forwards to the human phone.

## Prompt rule

The agent should not read out the transfer phone number. It should say a short handoff line like "I'll transfer you now" and immediately call `transfer_to_number`.

Transfer only during the intended hours. Outside hours, collect the callback info and end the call.

## Verification

Run a real call through the exact imported number:

1. Call the number.
2. Ask for a human.
3. Confirm the destination phone rings.
4. Confirm the caller hears the hold/client message when configured.
5. Check the ElevenLabs conversation termination reason.
6. For Telnyx caller ID passthrough, confirm the human sees the original caller ID, not the trunk number.

Outbound smoke test:

```bash
node --env-file=.env ../elevenlabs-phone-provider-setup/scripts/phone-provider.mjs outbound-call \
  --type sip \
  --agent-id agent_... \
  --phone-number-id phnum_... \
  --to-number +15551234567
```

## Gotchas

- Tool name must be `transfer_to_number`.
- Agent system tools live under `conversation_config.agent.prompt.tools`; some live agents also mirror system tools in `built_in_tools`, so verify with GET after changes.
- PATCHing the wrong tools path can return 200 while changing nothing useful.
- `agent_message` is Twilio-native only.
- SIP REFER requires the trunk/provider to support REFER.
- Phone destinations must be E.164.
- SIP URI destinations must be valid `sip:user@domain` or `sips:user@domain`.

## Reference files

- Script: [`scripts/render-transfer-tool.mjs`](./scripts/render-transfer-tool.mjs)
- Reference: [`references/transfer-modes.md`](./references/transfer-modes.md)
