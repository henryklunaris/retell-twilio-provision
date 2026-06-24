/*
 * retell-twilio-provision — zero-dependency Twilio -> Retell number provisioning.
 *
 * Creates a Retell agent, buys a US number, sets up Twilio Elastic SIP Trunking,
 * and BINDS the agent to the number — entirely by API. The number can place
 * outbound calls AND routes inbound calls to the bound agent. No inbound webhook.
 *
 * Requires only Node 20.6+ (global fetch + --env-file). NO npm install. Run with
 * --env-file so secrets are read from .env and never printed:
 *
 *   node --env-file=.env scripts/provision.mjs create-agent
 *   node --env-file=.env scripts/provision.mjs search --area 240
 *   node --env-file=.env scripts/provision.mjs buy --number +1XXXXXXXXXX            (COSTS MONEY)
 *   node --env-file=.env scripts/provision.mjs provision --number +1XXXXXXXXXX --agent-id agent_...
 *
 * Env (in .env):
 *   TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, RETELL_API_KEY
 */
import { randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));

const TRUNKING_BASE = 'https://trunking.twilio.com/v1';
const API_BASE = 'https://api.twilio.com/2010-04-01';
const RETELL_BASE = 'https://api.retellai.com';
const RETELL_ORIGINATION_SIP = 'sip:sip.retellai.com';
const TRUNK_NAME = 'retell-trunk';

const SID = process.env.TWILIO_ACCOUNT_SID || process.env.TWILIO_SID;
const TOKEN = process.env.TWILIO_AUTH_TOKEN;
const RETELL_KEY = process.env.RETELL_API_KEY;

function requireTwilio() {
  if (!SID || !TOKEN) {
    throw new Error('TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN must be set in .env.');
  }
}

function basicAuth() {
  return `Basic ${Buffer.from(`${SID}:${TOKEN}`).toString('base64')}`;
}

async function twilio(url, body) {
  const init = {
    method: body ? 'POST' : 'GET',
    headers: {
      Authorization: basicAuth(),
      ...(body ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
    },
    ...(body ? { body: new URLSearchParams(body).toString() } : {}),
  };
  const res = await fetch(url, init);
  const text = await res.text();
  const json = text ? JSON.parse(text) : {};
  if (!res.ok) throw new Error(`Twilio ${init.method} ${url} failed (${res.status}): ${text}`);
  return json;
}

async function retell(method, path, body) {
  if (!RETELL_KEY) throw new Error('RETELL_API_KEY must be set in .env.');
  const res = await fetch(RETELL_BASE + path, {
    method,
    headers: {
      Authorization: `Bearer ${RETELL_KEY}`,
      'Content-Type': 'application/json',
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  const json = text ? JSON.parse(text) : {};
  if (!res.ok) throw new Error(`Retell ${method} ${path} failed (${res.status}): ${text}`);
  return json;
}

// --- commands ----------------------------------------------------------------

async function search({ areaCode, contains, limit = 20 }) {
  requireTwilio();
  const params = new URLSearchParams({
    SmsEnabled: 'true',
    VoiceEnabled: 'true',
    PageSize: String(limit),
  });
  if (areaCode) params.set('AreaCode', areaCode);
  if (contains) params.set('Contains', contains);
  const result = await twilio(
    `${API_BASE}/Accounts/${SID}/AvailablePhoneNumbers/US/Local.json?${params.toString()}`,
  );
  return (result.available_phone_numbers ?? []).map((n) => ({
    phoneNumber: n.phone_number,
    locality: n.locality,
    region: n.region,
  }));
}

async function buy(number) {
  requireTwilio();
  const bought = await twilio(`${API_BASE}/Accounts/${SID}/IncomingPhoneNumbers.json`, {
    PhoneNumber: number,
  });
  return { sid: bought.sid, phoneNumber: bought.phone_number };
}

async function createAgent({ name, voice } = {}) {
  if (!RETELL_KEY) throw new Error('RETELL_API_KEY must be set in .env.');
  const tplPath = join(SCRIPT_DIR, '..', 'references', 'agent.default.json');
  const tpl = JSON.parse(readFileSync(tplPath, 'utf8'));
  const llmCfg = tpl.llm || {};

  // 1. Create the Retell LLM (prompt + behaviour).
  const llm = await retell('POST', '/create-retell-llm', {
    model: llmCfg.model,
    model_temperature: llmCfg.model_temperature,
    general_prompt: llmCfg.general_prompt,
    begin_message: llmCfg.begin_message,
    general_tools: llmCfg.general_tools,
  });

  // 2. Create the agent that uses it. No webhook_url — webhooks are out of scope.
  const agent = await retell('POST', '/create-agent', {
    response_engine: { type: 'retell-llm', llm_id: llm.llm_id },
    voice_id: voice || tpl.voice_id,
    agent_name: name || tpl.agent_name,
    language: tpl.language || 'en-US',
  });

  return { agent_id: agent.agent_id, llm_id: llm.llm_id };
}

async function provision(number, { sipUsername, sipPassword, agentId } = {}) {
  requireTwilio();
  if (!RETELL_KEY) throw new Error('RETELL_API_KEY must be set in .env.');
  if (!number?.startsWith('+')) throw new Error('--number must be E.164 (e.g. +15555550123).');
  const log = console.log;
  const nickname = `Retell (Twilio · ${number.slice(-4)})`;

  // 1. Find the IncomingPhoneNumber SID (must already be bought).
  const found = await twilio(
    `${API_BASE}/Accounts/${SID}/IncomingPhoneNumbers.json?PhoneNumber=${encodeURIComponent(number)}`,
  );
  const numberRow = found.incoming_phone_numbers[0];
  if (!numberRow) throw new Error(`Number ${number} not found on this Twilio account. Buy it first.`);
  log(`✓ Found number ${number} (${numberRow.sid}).`);

  // 2. Find or create the shared Elastic SIP Trunk.
  const trunks = await twilio(`${TRUNKING_BASE}/Trunks?PageSize=100`);
  let trunk = trunks.trunks.find((t) => t.friendly_name === TRUNK_NAME);
  if (trunk) {
    log(`✓ Trunk exists: ${TRUNK_NAME} (${trunk.sid}) -> ${trunk.domain_name}`);
  } else {
    const slug = `${TRUNK_NAME}-${randomBytes(3).toString('hex')}`;
    trunk = await twilio(`${TRUNKING_BASE}/Trunks`, {
      FriendlyName: TRUNK_NAME,
      DomainName: `${slug}.pstn.twilio.com`,
    });
    log(`✓ Created trunk ${TRUNK_NAME} (${trunk.sid}) -> ${trunk.domain_name}`);
  }
  const terminationUri = trunk.domain_name;

  // 3. Credential list + credential (the SIP auth Retell dials out with).
  let generatedCredentials = false;
  const attached = await twilio(`${TRUNKING_BASE}/Trunks/${trunk.sid}/CredentialLists`);
  const existing = attached.credential_lists.find((c) => c.friendly_name === TRUNK_NAME);
  if (existing) {
    sipUsername = sipUsername ?? TRUNK_NAME;
    sipPassword = sipPassword ?? null;
    log(`✓ Credential list already attached (${existing.sid}). Pass --sip-user/--sip-pass to re-import.`);
  } else {
    sipUsername = sipUsername ?? `rt${randomBytes(4).toString('hex')}`;
    // Twilio requires >=12 chars, mixed case + a digit; the Rt/9 bookends guarantee it.
    sipPassword = sipPassword ?? `Rt${randomBytes(14).toString('hex')}9`;
    generatedCredentials = true;
    const list = await twilio(`${API_BASE}/Accounts/${SID}/SIP/CredentialLists.json`, {
      FriendlyName: TRUNK_NAME,
    });
    await twilio(`${API_BASE}/Accounts/${SID}/SIP/CredentialLists/${list.sid}/Credentials.json`, {
      Username: sipUsername,
      Password: sipPassword,
    });
    await twilio(`${TRUNKING_BASE}/Trunks/${trunk.sid}/CredentialLists`, {
      CredentialListSid: list.sid,
    });
    log(`✓ Created + attached credential list (${list.sid}).`);
  }

  // 4. Origination URL -> Retell (so the trunk is complete; inbound at carrier level).
  const origins = await twilio(`${TRUNKING_BASE}/Trunks/${trunk.sid}/OriginationUrls`);
  if (origins.origination_urls.some((o) => o.sip_url === RETELL_ORIGINATION_SIP)) {
    log('✓ Origination URL -> Retell already set.');
  } else {
    await twilio(`${TRUNKING_BASE}/Trunks/${trunk.sid}/OriginationUrls`, {
      SipUrl: RETELL_ORIGINATION_SIP,
      FriendlyName: 'Retell',
      Priority: '10',
      Weight: '10',
      Enabled: 'true',
    });
    log('✓ Created origination URL -> sip:sip.retellai.com.');
  }

  // 5. Attach the number to the trunk.
  const trunkNumbers = await twilio(`${TRUNKING_BASE}/Trunks/${trunk.sid}/PhoneNumbers`);
  if (trunkNumbers.phone_numbers.some((n) => n.phone_number === number)) {
    log(`✓ Number ${number} already attached to the trunk.`);
  } else {
    await twilio(`${TRUNKING_BASE}/Trunks/${trunk.sid}/PhoneNumbers`, {
      PhoneNumberSid: numberRow.sid,
    });
    log(`✓ Attached ${number} to the trunk.`);
  }

  // 6. Import the number into Retell (termination_uri + SIP auth for outbound).
  //    If an agent id is given, BIND it via inbound_agents so the number routes
  //    inbound calls to that agent — WITHOUT an inbound_webhook_url.
  const inboundAgents = agentId ? [{ agent_id: agentId, weight: 1 }] : undefined;
  try {
    await retell('POST', '/import-phone-number', {
      phone_number: number,
      termination_uri: terminationUri,
      sip_trunk_auth_username: sipUsername,
      ...(sipPassword ? { sip_trunk_auth_password: sipPassword } : {}),
      ...(inboundAgents ? { inbound_agents: inboundAgents } : {}),
      nickname,
    });
    log(`✓ Imported ${number} into Retell${agentId ? ` + bound agent ${agentId}` : ''} (outbound ready).`);
  } catch (error) {
    log(`• Retell import skipped (likely already imported): ${error?.message ?? error}`);
    // Already imported: still (re)bind the agent if one was requested.
    if (inboundAgents) {
      await retell('PATCH', `/update-phone-number/${encodeURIComponent(number)}`, {
        inbound_agents: inboundAgents,
      });
      log(`✓ Bound agent ${agentId} to ${number} (no inbound webhook).`);
    }
  }

  return { e164: number, agentId: agentId ?? null, trunkSid: trunk.sid, terminationUri, sipUsername, sipPassword, generatedCredentials };
}

// --- CLI ---------------------------------------------------------------------

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const val = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : 'true';
      out[key] = val;
    } else out._.push(a);
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));
const cmd = args._[0];

try {
  if (cmd === 'create-agent') {
    const r = await createAgent({ name: args.name, voice: args.voice });
    console.log(JSON.stringify(r, null, 2));
    console.log('\nNext: buy a number, then provision + bind this agent:');
    console.log(`  node --env-file=.env scripts/provision.mjs provision --number +1XXXXXXXXXX --agent-id ${r.agent_id}`);
  } else if (cmd === 'search') {
    const results = await search({ areaCode: args.area, contains: args.contains, limit: Number(args.limit) || 20 });
    if (results.length === 0) console.log('No numbers found for that filter.');
    else console.log(JSON.stringify(results, null, 2));
  } else if (cmd === 'buy') {
    if (!args.number) throw new Error('--number required');
    console.log('⚠️  Buying a number costs ~$1/mo on Twilio.');
    console.log(JSON.stringify(await buy(args.number), null, 2));
  } else if (cmd === 'provision') {
    if (!args.number) throw new Error('--number required');
    const result = await provision(args.number, {
      sipUsername: args['sip-user'],
      sipPassword: args['sip-pass'],
      agentId: args['agent-id'],
    });

    // SECURITY: never print the SIP password to stdout — that would leak it into
    // terminal logs and, if run by an AI agent, into the agent's context. When
    // Twilio generated fresh credentials, write them to a local 0600 file; in all
    // cases redact the password before printing the result.
    const printable = { ...result };
    let savedFile = null;
    if (result.generatedCredentials && result.sipPassword) {
      const last4 = result.e164.replace(/[^0-9]/g, '').slice(-4);
      savedFile = join(process.cwd(), `retell-sip-${last4}.local.json`);
      writeFileSync(
        savedFile,
        JSON.stringify(
          {
            number: result.e164,
            agentId: result.agentId,
            trunkSid: result.trunkSid,
            terminationUri: result.terminationUri,
            sipUsername: result.sipUsername,
            sipPassword: result.sipPassword,
          },
          null,
          2,
        ) + '\n',
        { mode: 0o600 },
      );
      printable.sipUsername = '[written to file]';
      printable.credentialsFile = savedFile;
    }
    // Redact the password no matter where it came from (generated OR passed via --sip-pass).
    if (printable.sipPassword) printable.sipPassword = '[hidden]';

    console.log('\n--- RESULT ---');
    console.log(JSON.stringify(printable, null, 2));
    if (savedFile) {
      console.log(`\n🔒 SIP credentials written to ${savedFile}`);
      console.log('   They were NOT printed above, so they stay out of logs / AI context.');
      console.log('   Keep that file safe and gitignore it. Twilio will not show the password again.');
    }
  } else {
    console.log(
      'Usage:\n' +
        '  node --env-file=.env scripts/provision.mjs create-agent [--name "My Agent"] [--voice retell-Cimo]\n' +
        '  node --env-file=.env scripts/provision.mjs search --area 240 [--contains 555] [--limit 20]\n' +
        '  node --env-file=.env scripts/provision.mjs buy --number +1XXXXXXXXXX        (COSTS MONEY)\n' +
        '  node --env-file=.env scripts/provision.mjs provision --number +1XXXXXXXXXX --agent-id agent_... [--sip-user U --sip-pass P]',
    );
    process.exit(1);
  }
} catch (e) {
  console.error('ERROR:', e?.message ?? e);
  process.exit(1);
}
