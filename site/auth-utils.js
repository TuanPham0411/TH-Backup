export function configured(config) { return ['apiKey','authDomain','projectId','appId'].every(key => typeof config[key] === 'string' && config[key].trim().length > 0); }
export function validName(value) { return typeof value === 'string' && value.trim().length > 0 && value.trim().length <= 80; }
export function friendlyError(error) {
 const messages={
 'auth/invalid-credential':'Email or password is incorrect.','auth/user-not-found':'Email or password is incorrect.','auth/wrong-password':'Email or password is incorrect.',
 'auth/email-already-in-use':'This email already has an account. Sign in or reset your password.','auth/weak-password':'Choose a stronger password with at least 6 characters.','auth/invalid-email':'Enter a valid email address.',
 'auth/popup-closed-by-user':'The sign-in window was closed. You can try again.','auth/popup-blocked':'Allow popups in your browser, then try Google sign-in again.',
 'auth/unauthorized-domain':'This domain is not authorized for sign-in. Please contact TH.','auth/operation-not-allowed':'This sign-in method is not enabled yet. Please contact TH.',
 'auth/network-request-failed':'Unable to reach authentication. Check your connection and try again.','auth/too-many-requests':'Too many requests. Please try again later.',
 'auth/account-exists-with-different-credential':'Use the sign-in method originally associated with this account.',
 'permission-denied':'Access was denied. Verify your email. If it is already verified, TH needs to publish the updated database rules.',
 'unavailable':'The data service is temporarily unavailable. Please try again later.'};
 return messages[error?.code]||'This action could not be completed. Please try again or contact TH.';
}
