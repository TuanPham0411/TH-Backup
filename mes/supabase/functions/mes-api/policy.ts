type OwnerUser = { email?: string; email_confirmed_at?: string; identities?: { provider: string }[] };
export function isGoogleOwner(user: OwnerUser, methods: { method: string; timestamp?: number }[] = []) {
  // Primary provider stays "email" after Google is linked. Require an OAuth session,
  // and Google as the only linked OAuth provider, rather than that historical field.
  const oauthIdentities = user.identities?.filter(i => !['email', 'phone'].includes(i.provider)) || [];
  const primaryMethods = methods.filter(m => ['oauth','password','otp','sso/saml'].includes(m.method));
  const latest = primaryMethods.sort((a,b) => (b.timestamp || 0) - (a.timestamp || 0))[0];
  return user.email?.toLowerCase() === 'eric.scorp93@gmail.com' && !!user.email_confirmed_at &&
    oauthIdentities.length === 1 && oauthIdentities[0].provider === 'google' && latest?.method === 'oauth';
}
// Call ONLY after Auth.getUser(token) has validated this exact access token.
export function validatedTokenMethods(token: string): { method: string; timestamp?: number }[] {
  try {
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    return Array.isArray(payload.amr) ? payload.amr.filter((m: {method?: unknown}) => typeof m?.method === 'string') : [];
  } catch { return []; }
}
export function validPath(value: unknown): value is string {
  return typeof value === 'string' && /^issues\/[a-zA-Z0-9_-]{1,128}\/[a-zA-Z0-9_-]{1,128}$/.test(value);
}
export function publicAction(name: string) {
  return ['getDirectory', 'startWindowsChallenge', 'completeWindowsChallenge', 'loginManagedUser'].includes(name);
}
