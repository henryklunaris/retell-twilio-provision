# Provider checklists

Primary docs:

- ElevenLabs import phone number: https://elevenlabs.io/docs/api-reference/phone-numbers/create
- ElevenLabs update phone number: https://elevenlabs.io/docs/api-reference/phone-numbers/update
- ElevenLabs SIP trunking: https://elevenlabs.io/docs/eleven-agents/phone-numbers/sip-trunking
- ElevenLabs SIP outbound call: https://elevenlabs.io/docs/eleven-agents/api-reference/sip-trunk/outbound-call

## Twilio native

Use native Twilio import when you want the shortest path:

1. Buy or port the number in Twilio.
2. Import it into ElevenLabs with `provider: "twilio"`, `sid`, and `token`.
3. Assign the ElevenLabs agent to the phone number.
4. Test inbound and outbound.

Gotchas:

- The token is the Twilio Auth Token, not an API Key Secret.
- Czech numbers may require address verification in Twilio.
- Twilio doesn't sell Slovak local or mobile numbers.
- Native Twilio supports conference transfer warm messages. Blind transfer is Twilio-only and preserves caller ID, but has to be configured in JSON.

## Telnyx SIP

Provider portal:

1. Create or select a Telnyx SIP Connection.
2. Assign the number to the connection.
3. Set inbound destination number format to `+E.164`.
4. Set origination number format to `+E.164`.
5. Confirm outbound voice profile allows the destination country.

ElevenLabs:

```json
{
  "outbound_trunk_config": {
    "address": "sip.telnyx.com",
    "transport": "tls",
    "media_encryption": "allowed",
    "credentials": {
      "username": "TELNYX_SIP_USERNAME",
      "password": "TELNYX_SIP_PASSWORD"
    }
  }
}
```

```json
{
  "inbound_trunk_config": {
    "allowed_addresses": ["0.0.0.0/0"],
    "media_encryption": "disabled"
  }
}
```

Transfers:

- Use `conference` for the simplest Telnyx transfer.
- Use `sip_refer` with `P-Asserted-Identity` and `Diversion` only when caller ID passthrough matters and you have tested it on the actual Telnyx trunk.

## Zadarma SIP

Provider portal:

1. Route the virtual number to SIP PBX, not direct External server, if transfers must work.
2. Create a PBX incoming scenario for that DID only.
3. Route the DID to the AI extension.
4. Forward the AI extension to `+{number}@sip.rtc.elevenlabs.io:5060;transport=tcp`.
5. Create a separate transfer target extension that forwards to the human phone.

ElevenLabs:

```json
{
  "outbound_trunk_config": {
    "address": "pbx.zadarma.com",
    "transport": "tcp",
    "media_encryption": "disabled",
    "credentials": {
      "username": "ZADARMA_PBX_LOGIN",
      "password": "ZADARMA_PBX_PASSWORD"
    }
  }
}
```

```json
{
  "inbound_trunk_config": {
    "allowed_addresses": ["0.0.0.0/0"],
    "media_encryption": "allowed"
  }
}
```

Transfers:

- Use `sip_refer`.
- Use a phone-number destination in E.164 format.
- Conference transfer fails on this PBX path.

## Debug symptoms

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| SIP call fails instantly, no transcript | Missing `audio` in agent `client_events` | Clone/diff from a known working phone agent or patch config |
| Transfer fails in 3-5 ms | Provider sent number without `+` | Fix Telnyx `+E.164` or Zadarma forwarding URI |
| Zadarma transfer never reaches human | DID bypasses PBX | Route number through SIP PBX and scenario |
| PATCH returns 200 but value didn't change | Field ignored or wrong path | GET after PATCH and update through dashboard if needed |
| Outbound fails | Bad SIP credentials or provider outbound profile | Verify credentials and country permissions |
