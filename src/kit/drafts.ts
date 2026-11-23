/**
 * Drafts for the Cancel kit: email, call script, dispute letter, search link. Pure.
 * Only facts the receipt gave us go in; placeholders in [brackets] are for the user.
 */

const MAILTO_MAX = 1500;
const clip = (s: string, n: number): string => (s.length > n ? s.slice(0, n) : s).replace(/[\r\n]+/g, ' ').trim();

export interface DraftInput {
  merchant: string;
  plan?: string | null;
  memberId?: string | null;
}

export interface EmailDraft { subject: string; body: string }

export function emailDraft(i: DraftInput): EmailDraft {
  const m = clip(i.merchant, 80);
  const plan = i.plan ? ` (${clip(i.plan, 60)} plan)` : '';
  const lines = [
    'Hello,',
    '',
    `Please cancel my ${m} subscription${plan} now, and do not charge me again.`,
    '',
    'Account email: [the email you signed up with]',
  ];
  if (i.memberId) lines.push(`Member ID: ${clip(i.memberId, 40)}`);
  lines.push(
    '',
    'Please reply to confirm in writing that it is cancelled, and tell me the date of my last charge.',
    '',
    'Thank you,',
    '[Your name]',
  );
  return { subject: `Please cancel my ${m} subscription`, body: lines.join('\n') };
}

/** mailto: link with the recipient left empty. Always under about 1500 characters. */
export function mailtoUrl(d: EmailDraft): string {
  const build = (body: string): string =>
    `mailto:?subject=${encodeURIComponent(d.subject)}&body=${encodeURIComponent(body)}`;
  let url = build(d.body);
  if (url.length <= MAILTO_MAX) return url;
  // Too long: keep the first lines of the body that fit.
  const lines = d.body.split('\n');
  while (lines.length > 1 && url.length > MAILTO_MAX) {
    lines.pop();
    url = build(lines.join('\n'));
  }
  return url.length <= MAILTO_MAX ? url : `mailto:?subject=${encodeURIComponent(clip(d.subject, 120))}`;
}

export function callScript(i: DraftInput): string {
  const m = clip(i.merchant, 80);
  const id = i.memberId ? ` My member ID is ${clip(i.memberId, 40)}.` : '';
  return (
    `Hello, I would like to cancel my ${m} membership.${id} ` +
    'Please cancel it today and confirm that I will not be charged again. ' +
    'Can you give me a confirmation number and send the confirmation to me in writing?'
  );
}

export const CALL_TIPS: readonly string[] = [
  'Ask for written confirmation (an email or a letter) before you hang up.',
  'Write down the date, the time, the name of the person and the confirmation number.',
  'Check your next statement. If a charge still appears, use the dispute letter.',
];

export function searchUrl(merchant: string): string {
  return `https://www.google.com/search?q=${encodeURIComponent(`${clip(merchant, 80)} cancel subscription`)}`;
}

export interface DisputeInput extends DraftInput {
  cancelledOn?: string | null;
  newChargeDate?: string | null;
  /** Already formatted, e.g. "$9.99". Omitted when unknown. */
  amountText?: string | null;
}

export function disputeLetter(i: DisputeInput): string {
  const m = clip(i.merchant, 80);
  const cancelled = i.cancelledOn ? ` on ${i.cancelledOn}` : '';
  const charge = i.newChargeDate ? ` on ${i.newChargeDate}` : '';
  const amount = i.amountText ? ` of ${i.amountText}` : '';
  const lines = [
    'To my card issuer,',
    '',
    `I am disputing a charge${amount} from ${m}${charge}.`,
    `I cancelled this subscription${cancelled}, so this charge was not authorised.`,
    'I asked the merchant to stop charging me and they did not.',
    '',
    'Please reverse the charge and tell me what else you need from me.',
    '',
    'Card (last four digits): [xxxx]',
    'Thank you,',
    '[Your name]',
  ];
  return lines.join('\n');
}
