/**
 * Validates environment on boot. Required vars missing = the app refuses to
 * start, with a message telling you exactly what's missing, instead of
 * booting successfully and then failing on the first request that needs it.
 * Optional vars missing = a warning naming the feature that runs in mock mode.
 */

const REQUIRED = ['DATABASE_URL', 'JWT_SECRET'];

const OPTIONAL = [
  { keys: ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_PHONE_NUMBER'], feature: 'WhatsApp notifications (Twilio)' },
  { keys: ['RESEND_API_KEY'], feature: 'Email notifications (Resend)' },
];

function validateEnv() {
  const missing = REQUIRED.filter(k => !process.env[k]);
  if (missing.length > 0) {
    console.error('❌ Missing required environment variables:');
    missing.forEach(k => console.error(`   - ${k}`));
    console.error('\nSet these in your environment (Render dashboard, or .env locally) before starting the server.');
    process.exit(1);
  }

  OPTIONAL.forEach(({ keys, feature }) => {
    const missingKeys = keys.filter(k => !process.env[k]);
    if (missingKeys.length > 0) {
      console.warn(`⚠️  ${feature} not configured (missing ${missingKeys.join(', ')}) — will run in mock mode, nothing will actually send.`);
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    console.log('✅ Environment OK (development mode)');
  } else {
    console.log('✅ Environment OK');
  }
}

module.exports = { validateEnv };
