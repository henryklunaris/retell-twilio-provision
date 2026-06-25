# Transfer modes

Primary docs:

- ElevenLabs transfer tool: https://elevenlabs.io/docs/eleven-agents/customization/tools/system-tools/transfer-to-number
- Telnyx caller ID policy: https://developers.telnyx.com/docs/voice/sip-trunking/configuration/caller-id-policy
- Telnyx external transfers: https://developers.telnyx.com/docs/voice/sip-trunking/features/external-transfers

## Conference

ElevenLabs calls the destination and bridges caller + human, then removes the AI agent. Use it when reliability matters more than caller ID passthrough.

Works for:

- Twilio native
- Telnyx SIP

Twilio native supports `agent_message`. SIP does not.

## Blind

Twilio-native only. Preserves original caller ID and transfers directly. No warm transfer message.

Use when:

- The number is imported through native Twilio.
- Caller ID preservation matters.
- A cold handoff is acceptable.

## SIP REFER

ElevenLabs sends a SIP REFER to the provider/PBX. The provider must support REFER.

Works for:

- Zadarma PBX route, with transfer target extension.
- Telnyx SIP when configured and tested with `P-Asserted-Identity` and `Diversion` headers for caller ID passthrough.

Does not support warm transfer messages.

## Telnyx caller ID passthrough

Use this transfer rule shape:

```json
{
  "transfer_type": "sip_refer",
  "transfer_destination": {
    "type": "phone",
    "phone_number": "+421555123456"
  },
  "phone_number": "+421555123456",
  "condition": "Caller asks for reception",
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

Test this on the actual Telnyx trunk before calling it done.
