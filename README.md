# retell-twilio-provision

A Claude Code **skill** that creates a **Retell** AI agent, buys a US **Twilio** number,
wires it over Elastic SIP Trunking, and **binds the agent to the number** — entirely by
API. No Twilio/Retell console clicking, no SDKs, **no `npm install`** (just Node 20.6+).

Setting this up by hand across the Twilio + Retell dashboards is fiddly. This makes it a
few commands the agent runs for you.

## 3 steps

**1. Install the skill**

Via [skills.sh](https://skills.sh):

```bash
npx skills add henryklunaris/retell-twilio-provision
```

> ⚠️ **You MUST select "Claude Code" in the agent picker.** `npx skills` is a
> cross-agent tool — it lists ~72 agents and defaults to a neutral `~/.agents/skills/`
> path that **Claude Code does not read**. When it asks *"Which agents do you want to
> install to?"*, scroll to **Claude Code** and toggle it (spacebar) before confirming.
>
> If Claude still doesn't see it, install manually (always works):
>
> ```bash
> git clone https://github.com/henryklunaris/retell-twilio-provision /tmp/rtp \
>   && cp -R /tmp/rtp/skills/retell-twilio-provision ~/.claude/skills/
> ```
>
> Restart Claude Code afterward — skills load at session start.

**2. Add your API keys**

Copy `.env.example` to `.env` and fill in:

```
TWILIO_ACCOUNT_SID=AC...
TWILIO_AUTH_TOKEN=...
RETELL_API_KEY=key_...
```

**3. Ask Claude**

> "Use retell-twilio-provision to create an agent and get me a 240 area-code number."

The skill will create a Retell agent → search → confirm cost → buy → build the SIP
trunk → import the number and bind the agent. Done — the number does outbound calls
through the agent and routes inbound calls to it (no webhook).

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
node --env-file=.env scripts/provision.mjs create-agent --name "My Assistant"
node --env-file=.env scripts/provision.mjs search --area 240
node --env-file=.env scripts/provision.mjs buy --number +1XXXXXXXXXX                 # costs ~$1/mo
node --env-file=.env scripts/provision.mjs provision --number +1XXXXXXXXXX --agent-id agent_...
```

Save the printed `sipUsername` / `sipPassword` the first time — Twilio never returns
the password again. (Already have a Retell agent? Skip `create-agent` and pass its id.)

## Scope

- ✅ Create a Retell agent, buy a US number, build the Twilio SIP trunk, import into
  Retell, and **bind the agent** to the number (static `inbound_agents`).
- ✅ Number does **outbound** through the agent and **inbound** to the bound agent.
- ❌ No inbound *webhook* (dynamic per-call routing) — kept deliberately simple.

## License

MIT
