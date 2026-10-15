// Public Web app config for the NEW th-mes-web project. No private keys.
export const firebaseConfig = {
  apiKey:
    import.meta.env.VITE_MES_FIREBASE_API_KEY ||
    "AIzaSyA5LZgWsUigF5ImdQvYHBcbnW3XiBtflnY",
  authDomain:
    import.meta.env.VITE_MES_FIREBASE_AUTH_DOMAIN ||
    "th-mes-web.firebaseapp.com",
  projectId: "th-mes-web",
  appId:
    import.meta.env.VITE_MES_FIREBASE_APP_ID ||
    "1:482539577503:web:59c7ab57b00823194302aa",
  storageBucket:
    import.meta.env.VITE_MES_FIREBASE_STORAGE_BUCKET ||
    "th-mes-web.firebasestorage.app",
};
export const functionsRegion = "asia-southeast1";
export const configured = !!(
  firebaseConfig.apiKey &&
  firebaseConfig.appId &&
  firebaseConfig.storageBucket
);

export const previewMode = import.meta.env.VITE_MES_PREVIEW === "true";
