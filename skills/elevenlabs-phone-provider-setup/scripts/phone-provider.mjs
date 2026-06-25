/*
 * ElevenLabs phone provider setup.
 *
 * Zero dependency helper for importing Twilio/SIP numbers into ElevenLabs,
 * patching SIP trunk config, assigning an agent, and testing outbound calls.
 *
 * Run with:
 *   node --env-file=.env scripts/phone-provider.mjs import-sip ...
 *
 * Env:
 *   ELEVENLABS_API_KEY
 *   TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN for native Twilio import
 */

const ELEVENLABS_BASE = process.env.ELEVENLABS_BASE_URL || 'https://api.elevenlabs.io';
const ELEVENLABS_KEY = process.env.ELEVENLABS_API_KEY;

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const value = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : 'true';
      out[key] = value;
    } else {
      out._.push(arg);
    }
  }
  return out;
}

function requireKey() {
  if (!ELEVENLABS_KEY) throw new Error('ELEVENLABS_API_KEY must be set in .env.');
}

function requireArg(args, name) {
  const value = args[name];
  if (!value) throw new Error(`--${name} is required.`);
  return value;
}

function assertE164(value, flagName) {
  if (!/^\+\d{8,15}$/.test(value)) {
    throw new Error(`--${flagName} must be E.164, for example +15551234567.`);
  }
}

async function eleven(method, path, body) {
  requireKey();
  const res = await fetch(`${ELEVENLABS_BASE}${path}`, {
    method,
    headers: {
      'xi-api-key': ELEVENLABS_KEY,
      'Content-Type': 'application/json',
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  const json = text ? JSON.parse(text) : {};
  if (!res.ok) throw new Error(`ElevenLabs ${method} ${path} failed (${res.status}): ${text}`);
  return json;
}

function providerConfig(provider, args) {
  const credentials =
    args['sip-user'] || args['sip-pass']
      ? {
          username: requireArg(args, 'sip-user'),
          ...(args['sip-pass'] ? { password: args['sip-pass'] } : {}),
        }
      : undefined;

  if (provider === 'telnyx') {
    return {
      outbound_trunk_config: {
        address: 'sip.telnyx.com',
        transport: 'tls',
        media_encryption: 'allowed',
        ...(credentials ? { credentials } : {}),
      },
      inbound_trunk_config: {
        allowed_addresses: ['0.0.0.0/0'],
        media_encryption: 'disabled',
      },
    };
  }

  if (provider === 'zadarma') {
    return {
      outbound_trunk_config: {
        address: 'pbx.zadarma.com',
        transport: 'tcp',
        media_encryption: 'disabled',
        ...(credentials ? { credentials } : {}),
      },
      inbound_trunk_config: {
        allowed_addresses: ['0.0.0.0/0'],
        media_encryption: 'allowed',
      },
    };
  }

  throw new Error('--provider must be telnyx or zadarma.');
}

async function assignAgent(phoneNumberId, agentId) {
  if (!agentId) return null;
  return eleven('PATCH', `/v1/convai/phone-numbers/${encodeURIComponent(phoneNumberId)}`, {
    agent_id: agentId,
  });
}

async function importTwilio(args) {
  const phoneNumber = requireArg(args, 'number');
  assertE164(phoneNumber, 'number');
  const label = requireArg(args, 'label');
  const sid = args.sid || process.env.TWILIO_ACCOUNT_SID || process.env.TWILIO_SID;
  const token = args.token || process.env.TWILIO_AUTH_TOKEN;
  if (!sid || !token) {
    throw new Error('TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN must be set in .env or passed as --sid/--token.');
  }
  const created = await eleven('POST', '/v1/convai/phone-numbers', {
    phone_number: phoneNumber,
    label,
    provider: 'twilio',
    sid,
    token,
  });
  if (args['agent-id']) await assignAgent(created.phone_number_id, args['agent-id']);
  return { ...created, phone_number: phoneNumber, label, provider: 'twilio', assigned_agent_id: args['agent-id'] || null };
}

async function importSip(args) {
  const phoneNumber = requireArg(args, 'number');
  assertE164(phoneNumber, 'number');
  const label = requireArg(args, 'label');
  const created = await eleven('POST', '/v1/convai/phone-numbers', {
    phone_number: phoneNumber,
    label,
    provider: 'sip_trunk',
  });
  if (args['agent-id']) await assignAgent(created.phone_number_id, args['agent-id']);
  return { ...created, phone_number: phoneNumber, label, provider: 'sip_trunk', assigned_agent_id: args['agent-id'] || null };
}

async function configureSip(args) {
  const phoneNumberId = requireArg(args, 'phone-number-id');
  const provider = requireArg(args, 'provider');
  const config = providerConfig(provider, args);

  const outbound = await eleven('PATCH', `/v1/convai/phone-numbers/${encodeURIComponent(phoneNumberId)}`, {
    outbound_trunk_config: config.outbound_trunk_config,
  });
  const inbound = await eleven('PATCH', `/v1/convai/phone-numbers/${encodeURIComponent(phoneNumberId)}`, {
    inbound_trunk_config: config.inbound_trunk_config,
  });
  if (args['agent-id']) await assignAgent(phoneNumberId, args['agent-id']);
  const current = await eleven('GET', `/v1/convai/phone-numbers/${encodeURIComponent(phoneNumberId)}`);
  return { provider, phone_number_id: phoneNumberId, outbound, inbound, current };
}

async function outboundCall(args) {
  const type = requireArg(args, 'type');
  if (!['sip', 'twilio'].includes(type)) throw new Error('--type must be sip or twilio.');
  const toNumber = requireArg(args, 'to-number');
  assertE164(toNumber, 'to-number');
  const endpoint = type === 'sip' ? '/v1/convai/sip-trunk/outbound-call' : '/v1/convai/twilio/outbound-call';
  const body = {
    agent_id: requireArg(args, 'agent-id'),
    agent_phone_number_id: requireArg(args, 'phone-number-id'),
    to_number: toNumber,
  };
  if (args['dynamic-vars']) {
    body.conversation_initiation_client_data = {
      dynamic_variables: JSON.parse(args['dynamic-vars']),
    };
  }
  return eleven('POST', endpoint, body);
}

function redact(value) {
  return JSON.stringify(
    value,
    (key, val) => {
      if (/token|password|pass|secret|key/i.test(key)) return '[hidden]';
      return val;
    },
    2,
  );
}

const args = parseArgs(process.argv.slice(2));
const cmd = args._[0];

try {
  let result;
  if (cmd === 'import-twilio') {
    result = await importTwilio(args);
  } else if (cmd === 'import-sip') {
    result = await importSip(args);
  } else if (cmd === 'configure-sip') {
    result = await configureSip(args);
  } else if (cmd === 'get') {
    result = await eleven('GET', `/v1/convai/phone-numbers/${encodeURIComponent(requireArg(args, 'phone-number-id'))}`);
  } else if (cmd === 'outbound-call') {
    result = await outboundCall(args);
  } else {
    console.log(
      'Usage:\n' +
        '  node --env-file=.env scripts/phone-provider.mjs import-twilio --number +15551234567 --label "Support" [--agent-id agent_...]\n' +
        '  node --env-file=.env scripts/phone-provider.mjs import-sip --number +15551234567 --label "SIP" [--agent-id agent_...]\n' +
        '  node --env-file=.env scripts/phone-provider.mjs configure-sip --phone-number-id phnum_... --provider telnyx|zadarma [--sip-user U --sip-pass P] [--agent-id agent_...]\n' +
        '  node --env-file=.env scripts/phone-provider.mjs get --phone-number-id phnum_...\n' +
        '  node --env-file=.env scripts/phone-provider.mjs outbound-call --type sip|twilio --agent-id agent_... --phone-number-id phnum_... --to-number +15551234567',
    );
    process.exit(1);
  }
  console.log(redact(result));
} catch (error) {
  console.error('ERROR:', error?.message ?? error);
  process.exit(1);
}
