export function isGoogleOwner(user: { email?: string; email_confirmed_at?: string; app_metadata?: { provider?: string }; identities?: { provider: string }[] }) {
  return user.email?.toLowerCase() === 'eric.scorp93@gmail.com' && !!user.email_confirmed_at && user.app_metadata?.provider === 'google' && !!user.identities?.some(i => i.provider === 'google');
}
export function validPath(value: unknown): value is string {
  return typeof value === 'string' && /^issues\/[a-zA-Z0-9_-]{1,128}\/[a-zA-Z0-9_-]{1,128}$/.test(value);
}
export function publicAction(name: string) {
  return ['getDirectory', 'startWindowsChallenge', 'completeWindowsChallenge', 'loginManagedUser'].includes(name);
}
