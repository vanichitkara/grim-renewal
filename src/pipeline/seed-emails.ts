/**
 * Seed script — inserts fake receipt emails into a Gmail test account.
 * Run: npx tsx src/pipeline/seed-emails.ts
 *
 * PRIVACY / credentials note:
 *   This script reads GMAIL_TEST_TOKEN and GMAIL_TEST_EMAIL from environment
 *   variables. It does NOT read a .env file from disk — the caller must export
 *   these in the shell before running:
 *
 *     export GMAIL_TEST_TOKEN="ya29...."
 *     export GMAIL_TEST_EMAIL="grim-test@gmail.com"
 *     npx tsx src/pipeline/seed-emails.ts
 *
 *   These are credentials for a test/demo account only.
 *   Never set these to a real personal Gmail account.
 *
 * Uses the Gmail API's users.messages.insert endpoint (gmail.readonly is NOT
 * sufficient for insert; this script requires a token with gmail.insert or
 * gmail scope, scoped to the test account only — not the production scout).
 */

const GMAIL_API = 'https://gmail.googleapis.com/gmail/v1/users/me';

const token: string = process.env['GMAIL_TEST_TOKEN'] ?? '';
const testEmail: string = process.env['GMAIL_TEST_EMAIL'] ?? '';

if (!token || !testEmail) {
  console.error(
    'Missing environment variables.\n' +
    'Export GMAIL_TEST_TOKEN and GMAIL_TEST_EMAIL before running this script.',
  );
  process.exit(1);
}

// ── Receipt templates ─────────────────────────────────────────────────────────

interface Receipt {
  from: string;
  subject: string;
  date: string;        // RFC 2822 for the email Date header
  body: string;        // plain-text body parseReceipt() can parse
}

/**
 * Build RFC 2822-encoded base64url message for Gmail insert.
 * We build a minimal MIME message (no multipart, plain text only).
 */
function encodeMessage(receipt: Receipt): string {
  const raw = [
    `From: ${receipt.from}`,
    `To: ${testEmail}`,
    `Subject: ${receipt.subject}`,
    `Date: ${receipt.date}`,
    `MIME-Version: 1.0`,
    `Content-Type: text/plain; charset=UTF-8`,
    ``,
    receipt.body,
  ].join('\r\n');

  // base64url encode (Node Buffer)
  return Buffer.from(raw).toString('base64url');
}

/**
 * Insert one message into the test account's inbox.
 * Throws on non-2xx.
 */
async function insertMessage(raw: string): Promise<void> {
  const url = `${GMAIL_API}/messages?internalDateSource=dateHeader`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ raw, labelIds: ['INBOX'] }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Gmail insert failed ${res.status}: ${body}`);
  }
}

// ── Fake receipt data ─────────────────────────────────────────────────────────

/**
 * Generate n receipts for a subscription, spaced monthly going back from lastDate.
 */
function makeReceipts(opts: {
  fromAddress: string;
  merchant: string;
  amount: string;        // e.g. "$22.99/month"
  lastDate: Date;
  count: number;
  extra?: string;        // extra body lines (e.g. phone-only note)
}): Receipt[] {
  const receipts: Receipt[] = [];
  for (let i = 0; i < opts.count; i++) {
    const d = new Date(opts.lastDate);
    d.setMonth(d.getMonth() - i);

    const isoDate = d.toISOString().slice(0, 10)!;
    // RFC 2822 date string
    const rfc2822 = d.toUTCString().replace('GMT', '+0000');

    const body = [
      `Your subscription receipt`,
      `You were charged ${opts.amount} on ${isoDate}.`,
      `Merchant: ${opts.merchant}`,
      `Thank you for your payment.`,
      opts.extra ?? '',
    ]
      .filter(Boolean)
      .join('\n');

    receipts.push({
      from: opts.fromAddress,
      subject: `Your ${opts.merchant} receipt`,
      date: rfc2822,
      body,
    });
  }
  return receipts;
}

// 1. StreamFlix Premium — $22.99/mo — 12 receipts — last used Feb 2026 (forgotten)
const streamFlixReceipts = makeReceipts({
  fromAddress: 'billing@streamflix.com',
  merchant: 'StreamFlix Premium',
  amount: '$22.99/month',
  lastDate: new Date('2026-02-01'),
  count: 12,
});

// 2. CloudBox Pro — $9.99/mo — 12 receipts — last used Aug 2026 (active)
const cloudBoxReceipts = makeReceipts({
  fromAddress: 'receipts@cloudboxpro.com',
  merchant: 'CloudBox Pro',
  amount: '$9.99/month',
  lastDate: new Date('2026-08-15'),
  count: 12,
});

// 3. MealCrate — $59.99/mo — 7 receipts — last used Jun 2026 (semi-forgotten)
const mealCrateReceipts = makeReceipts({
  fromAddress: 'orders@mealcrate.com',
  merchant: 'MealCrate',
  amount: '$59.99/month',
  lastDate: new Date('2026-06-01'),
  count: 7,
});

// 4. IronCore Gym — $49.99/mo — 12 receipts — phone-only cancel — last used Jan 2026 (most forgotten)
const ironCoreReceipts = makeReceipts({
  fromAddress: 'billing@ironcoregym.com',
  merchant: 'IronCore Gym',
  amount: '$49.99/month',
  lastDate: new Date('2026-01-01'),
  count: 12,
  extra: 'To cancel your membership, call us to cancel: (555) 013-7742',
});

// 5. DesignHub Annual — $119.99/year — 1 receipt — trial ended, now paid — last used Nov 2026 (active)
const designHubReceipts = makeReceipts({
  fromAddress: 'noreply@designhub.com',
  merchant: 'DesignHub',
  amount: '$119.99/year',
  lastDate: new Date('2026-11-01'),
  count: 1,
  extra: 'Your free trial has ended. You have been charged for your annual plan.',
});

const ALL_RECEIPTS: Receipt[] = [
  ...streamFlixReceipts,
  ...cloudBoxReceipts,
  ...mealCrateReceipts,
  ...ironCoreReceipts,
  ...designHubReceipts,
];

// ── Main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log(`Seeding ${ALL_RECEIPTS.length} fake receipt emails into ${testEmail}...`);

  let inserted = 0;
  for (const receipt of ALL_RECEIPTS) {
    const raw = encodeMessage(receipt);
    await insertMessage(raw);
    inserted++;
    // Brief pause to avoid Gmail quota errors (250 quota units/s for insert)
    await new Promise((r) => setTimeout(r, 50));
  }

  console.log(`Done. Inserted ${inserted} messages.`);
  console.log('Run the Scout against this account to verify 5 subscription records are returned.');
}

main().catch((err) => {
  console.error('Seed failed:', err instanceof Error ? err.message : String(err));
  process.exit(1);
});
