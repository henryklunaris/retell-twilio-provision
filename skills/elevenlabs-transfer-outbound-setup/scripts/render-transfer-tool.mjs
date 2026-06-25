/*
 * Render ElevenLabs transfer_to_number system tool JSON.
 *
 * This intentionally does not PATCH the agent. Apply the JSON through the
 * dashboard JSON editor or a careful GET/merge/PATCH flow, then GET the agent
 * and verify the live value.
 */

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

function baseTransfer(args, transferType) {
  const phoneNumber = requireArg(args, 'to-number');
  assertE164(phoneNumber, 'to-number');
  return {
    transfer_type: transferType,
    transfer_destination: {
      type: 'phone',
      phone_number: phoneNumber,
    },
    phone_number: phoneNumber,
    condition: args.condition || 'Caller explicitly asks to speak with a human',
  };
}

function toolFor(mode, args) {
  let transfer;
  if (mode === 'twilio-conference') {
    transfer = baseTransfer(args, 'conference');
    if (args['client-message']) transfer.client_message = args['client-message'];
    if (args['agent-message']) transfer.agent_message = args['agent-message'];
  } else if (mode === 'twilio-blind') {
    transfer = baseTransfer(args, 'blind');
  } else if (mode === 'telnyx-conference') {
    transfer = baseTransfer(args, 'conference');
    if (args['client-message']) transfer.client_message = args['client-message'];
  } else if (mode === 'telnyx-refer-caller-id') {
    transfer = baseTransfer(args, 'sip_refer');
    const telnyxNumber = requireArg(args, 'telnyx-number');
    assertE164(telnyxNumber, 'telnyx-number');
    transfer.custom_sip_headers = [
      { type: 'dynamic', key: 'P-Asserted-Identity', value: 'system__caller_id' },
      { type: 'static', key: 'Diversion', value: `<sip:${telnyxNumber}@sip.telnyx.com>` },
    ];
  } else if (mode === 'zadarma-refer') {
    transfer = baseTransfer(args, 'sip_refer');
  } else {
    throw new Error('Mode must be twilio-conference, twilio-blind, telnyx-conference, telnyx-refer-caller-id, or zadarma-refer.');
  }

  return {
    type: 'system',
    name: 'transfer_to_number',
    description: args.description || 'Transfer the caller to a human when the transfer condition is met.',
    params: {
      system_tool_type: 'transfer_to_number',
      transfers: [transfer],
      ...(args['client-message'] ? { enable_client_message: true } : {}),
    },
  };
}

const args = parseArgs(process.argv.slice(2));
const mode = args._[0];

try {
  if (!mode) {
    console.log(
      'Usage:\n' +
        '  node scripts/render-transfer-tool.mjs twilio-conference --to-number +15551234567 [--agent-message "..."] [--client-message "..."]\n' +
        '  node scripts/render-transfer-tool.mjs twilio-blind --to-number +15551234567\n' +
        '  node scripts/render-transfer-tool.mjs telnyx-conference --to-number +15551234567\n' +
        '  node scripts/render-transfer-tool.mjs telnyx-refer-caller-id --to-number +15551234567 --telnyx-number +15550000000\n' +
        '  node scripts/render-transfer-tool.mjs zadarma-refer --to-number +15551234567',
    );
    process.exit(1);
  }
  console.log(JSON.stringify(toolFor(mode, args), null, 2));
} catch (error) {
  console.error('ERROR:', error?.message ?? error);
  process.exit(1);
}
