/**
 * Read the signed-in address from Gmail's profile endpoint (works under gmail.readonly).
 * PRIVACY: the access credential and the address are never logged or stored here.
 * Any failure returns undefined so the email-entry step simply has no suggestion.
 */
export async function fetchProfileEmail(accessToken: string): Promise<string | undefined> {
  try {
    const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/profile', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) return undefined;
    const body = (await res.json()) as { emailAddress?: unknown };
    return typeof body.emailAddress === 'string' ? body.emailAddress : undefined;
  } catch {
    return undefined;
  }
}
