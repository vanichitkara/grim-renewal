/** Trial reminder as an iCalendar file. Pure: nothing is sent anywhere, the browser saves it. */

const pad = (n: number): string => String(n).padStart(2, '0');
const ymd = (d: Date): string => `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}`;

function esc(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

/** Fold to 75 octets per line as RFC 5545 asks (ASCII-safe split on characters, good enough here). */
function fold(line: string): string {
  const out: string[] = [];
  let rest = line;
  while (rest.length > 75) {
    out.push(rest.slice(0, 75));
    rest = ' ' + rest.slice(75);
  }
  out.push(rest);
  return out.join('\r\n');
}

/**
 * @param dateISO    day the trial ends (ISO date or timestamp)
 * @param daysBefore how many days before that day the reminder falls
 */
export function makeIcs(i: { title: string; dateISO: string; daysBefore: number; now?: Date }): string {
  const end = new Date(i.dateISO.slice(0, 10) + 'T00:00:00Z');
  if (Number.isNaN(end.getTime())) throw new Error('Invalid date');
  const start = new Date(end.getTime() - i.daysBefore * 86_400_000);
  const next = new Date(start.getTime() + 86_400_000);
  const stamp = (i.now ?? new Date()).toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  const uid = `${ymd(start)}-${i.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40)}@grim-renewal`;
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Grim Renewal//Trial reminder//EN',
    'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${stamp}`,
    `DTSTART;VALUE=DATE:${ymd(start)}`,
    `DTEND;VALUE=DATE:${ymd(next)}`,
    `SUMMARY:${esc(i.title)}`,
    `DESCRIPTION:${esc(`Your free trial ends in ${i.daysBefore} days (${end.toISOString().slice(0, 10)}). Cancel before it charges you.`)}`,
    'BEGIN:VALARM',
    'ACTION:DISPLAY',
    `DESCRIPTION:${esc(i.title)}`,
    'TRIGGER:PT9H',
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return lines.map(fold).join('\r\n') + '\r\n';
}
