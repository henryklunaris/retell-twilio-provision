# Voice AI phone provisioning skills

Claude Code **skills** for voice AI phone provisioning and transfer setup. The original
skill creates a **Retell** AI agent, buys a US **Twilio** number, wires it over Elastic
SIP Trunking, and **binds the agent to the number** — entirely by API. No
Twilio/Retell console clicking, no SDKs, **no `npm install`** (just Node 20.6+).

This repo also includes ElevenLabs skills for importing Twilio/SIP trunk numbers,
configuring Telnyx or Zadarma trunk settings, testing outbound calls, and rendering
provider-specific `transfer_to_number` JSON.

Setting this up by hand across the Twilio + Retell dashboards is fiddly and for beginners can take hours! This makes it a few commands the agent runs for you.

## Included skills

- `retell-twilio-provision` — Retell agent + US Twilio number + Elastic SIP trunk.
- `elevenlabs-phone-provider-setup` — ElevenLabs Twilio/SIP import, Telnyx/Zadarma trunk config, agent assignment, outbound smoke test.
- `elevenlabs-transfer-outbound-setup` — ElevenLabs transfer mode selection and JSON rendering for Twilio, Telnyx, and Zadarma.

## Retell in 3 steps

**1. Install the skill**

Via [skills.sh](https://skills.sh):

```bash
npx skills add henryklunaris/retell-twilio-provision
```

If the above doesn't install a .claude/skills file into your project then just remove the installed files and try again with:  

```bash
npx skills add henryklunaris/retell-twilio-provision -a claude-code -s '*' -y --copy
```

This will follow Claude Codes structure it requires

**2. Add your API keys**

Copy `.env.example` to `.env` and fill in:

```
TWILIO_ACCOUNT_SID=AC...
TWILIO_AUTH_TOKEN=...
RETELL_API_KEY=key_...
ELEVENLABS_API_KEY=sk_...
```

**3. Ask Claude**

> "Use retell-twilio-provision to create an agent and get me a 240 area-code number."

The skill will create a Retell agent → search → confirm cost → buy → build the SIP
trunk → import the number and bind the agent. Done — the number does outbound calls
through the agent and routes inbound calls to it (no webhook).

## 🔒 Your `.env` stays private

The skills **never read your `.env`**. They run scripts with `node --env-file=.env`,
so Node injects the secrets straight into the process — they never enter the chat.

It also ships `templates/settings.json` with deny rules. Merge them into your
`.claude/settings.json` to block Claude Code from reading `.env` (via both file tools
and shell) by default:

```json
{
  "permissions": {
    "deny": [
      "Read(./.env)", "Read(./.env.*)", "Read(**/.env)", "Read(**/.env.*)",
      "Bash(cat .env*)", "Bash(grep .env*)", "Bash(head .env*)",
      "Bash(tail .env*)", "Bash(printenv)", "Bash(env)"
    ]
  }
}
```

## License

MIT
