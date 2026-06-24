# retell-twilio-provision

A Claude Code **skill** that buys a US phone number on Twilio and wires it to a
**Retell** AI agent for outbound calling — over Elastic SIP Trunking, entirely by API.
No Twilio console clicking, no SDKs, **no `npm install`** (just Node 18+).

Setting this up by hand across the Twilio + Retell dashboards is fiddly. This makes it
three commands the agent runs for you.

## 3 steps

**1. Install the skill**

Via [skills.sh](https://skills.sh):

```bash
npx skills add <your-github-user>/retell-twilio-provision
```

> ⚠️ Known issue: `npx skills add` may install into `~/.agents/skills/` while Claude
> Code reads `~/.claude/skills/`. If Claude doesn't see the skill, install manually:
>
> ```bash
> git clone https://github.com/<your-github-user>/retell-twilio-provision \
>   ~/.claude/skills/retell-twilio-provision
> ```
>
> (or copy the folder there). Restart Claude Code afterward.

**2. Add your API keys**

Copy `.env.example` to `.env` and fill in:

```
TWILIO_ACCOUNT_SID=AC...
TWILIO_AUTH_TOKEN=...
RETELL_API_KEY=key_...
```

**3. Ask Claude**

> "Use retell-twilio-provision to get me a 240 area-code number."

The skill will search → confirm cost → buy → build the SIP trunk → import the number
into Retell. Done — the number is ready for outbound Retell calls.

## 🔒 Your `.env` stays private

The skill **never reads your `.env`**. It runs the script with `node --env-file=.env`,
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

## Run it directly (without Claude)

```bash
node --env-file=.env scripts/provision.mjs search --area 240
node --env-file=.env scripts/provision.mjs buy --number +1XXXXXXXXXX        # costs ~$1/mo
node --env-file=.env scripts/provision.mjs provision --number +1XXXXXXXXXX
```

Save the printed `sipUsername` / `sipPassword` the first time — Twilio never returns
the password again.

## Scope

- ✅ Buy a US number, build the Twilio SIP trunk, import into Retell for **outbound**.
- ❌ No inbound webhook routing / agent binding (kept deliberately simple).

## License

MIT
