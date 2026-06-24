# Annotated: what `provision` does

`scripts/provision.mjs provision` is idempotent (safe to re-run). Step by step:

1. **Find the IncomingPhoneNumber SID** for the E.164 number (must already be bought
   on the Twilio account). 404 here = you haven't bought it yet → run `buy` first.

2. **Find or create one shared Elastic SIP Trunk** (`FriendlyName = retell-trunk`).
   Its `DomainName` (`<slug>.pstn.twilio.com`) is the `termination_uri` Retell dials
   out through.

3. **Ensure a Credential List + credential** is attached to the trunk — the
   username/password Retell authenticates outbound with. Generated once; Twilio never
   returns the password again, so the script prints it and you save it.

4. **Ensure an Origination URL** points at `sip:sip.retellai.com` so the trunk is fully
   formed (carrier-level inbound path). This skill does not bind a Retell inbound
   webhook/agent — it's outbound-only.

5. **Attach the number to the trunk.**

6. **Import the number into Retell** with `termination_uri` + `sip_trunk_auth_*`. From
   here the number can place outbound calls via any of your Retell agents (pass the
   `override_agent_id` at call time in `create-phone-call`).

## Two Twilio API hosts

- `https://trunking.twilio.com/v1` — the trunk and its sub-resources (JSON bodies).
- `https://api.twilio.com/2010-04-01` — number lookup/purchase + SIP credential lists
  (paths need a `.json` suffix).

Both use HTTP Basic auth (`AccountSid:AuthToken`) and form-encoded bodies. The script
handles the split; this note is just so a stray 404 makes sense.

## Re-running / adding more numbers

Everything is find-or-create, so re-running is safe. To add a second number to the
same trunk, or to re-import after the credential list already exists, pass the saved
credentials back:

```bash
node --env-file=.env scripts/provision.mjs provision --number +1XXXXXXXXXX \
  --sip-user <saved> --sip-pass <saved>
```
