// Same-origin Pi API. Authentication uses a Secure, HttpOnly cookie.
const state = { currentUser: null };
let listener;
async function call(action, data = {}) {
  const response = await fetch('/api/portfolio', { method: 'POST', credentials: 'same-origin', headers: {'Content-Type':'application/json'}, body:JSON.stringify({action,data}) });
  const result = await response.json();
  if (!response.ok) throw Object.assign(new Error(result.error), {code:result.code});
  return result;
}
async function authCall(action,data) { const result=await call(action,data); state.currentUser=result.user; listener?.(result.user); return result; }
export const initializeApp = () => ({});
export const getAuth = () => state;
export const getFirestore = () => ({});
export function onAuthStateChanged(auth,callback,onError) { listener=callback; authCall('session').catch(onError); }
export const signInWithEmailAndPassword = (auth,email,password) => authCall('login',{email,password});
export const createUserWithEmailAndPassword = (auth,email,password) => authCall('register',{email,password});
export const signOut = () => authCall('logout');
export async function updateProfile(user,data) { await call('profile',data); Object.assign(user,data); }
export const sendPasswordResetEmail = (auth,email) => call('reset',{email});
export const sendEmailVerification = () => call('verify');
export async function reload(user) { Object.assign(user,(await call('session')).user); }
export const getIdToken = async () => '';
export class GoogleAuthProvider {}
export const signInWithPopup = async () => { location.href='/api/oauth/start'; };
export const consumeToken = data => call('consumeToken',data);
export const doc = (db,...parts) => ({path:parts.join('/')});
export const collection = doc;
export const where = (field,operator,value) => ({field,operator,value});
export const limit = count => ({count});
export const orderBy = (field,direction) => ({field,direction});
export const query = (ref,...filters) => ({...ref,filters});
export const serverTimestamp = () => ({seconds:Math.floor(Date.now()/1000)});
const snapshot = row => ({id:row.id,data:()=>row.data,exists:()=>!!row.data});
export async function getDoc(ref) { return snapshot(await call('get',ref)); }
export async function getDocs(ref) { const {rows}=await call('list',ref); return {docs:rows.map(snapshot),size:rows.length}; }
export const setDoc = (ref,data) => call('set',{...ref,data});
export const updateDoc = setDoc;
export const deleteDoc = ref => call('delete',ref);
export const addDoc = (ref,data) => call('add',{...ref,data});
