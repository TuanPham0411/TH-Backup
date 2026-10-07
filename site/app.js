import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signInWithEmailAndPassword, createUserWithEmailAndPassword, sendPasswordResetEmail, sendEmailVerification, updateProfile, reload, getIdToken, signOut } from 'firebase/auth';
import { getFirestore, doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { configured, friendlyError, validName } from './auth-utils.js';
import { firebaseConfig } from './firebase-config.js';

const $ = id => document.getElementById(id);
const override = { apiKey: import.meta.env.VITE_FIREBASE_API_KEY, authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN, projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID, appId: import.meta.env.VITE_FIREBASE_APP_ID };
const hasOverride = Object.values(override).some(value => value !== undefined);
// Use an override only as a complete set, avoiding accidental mixed projects.
const config = hasOverride ? override : firebaseConfig;
let auth, db, mode = 'login', busy = false;
const ready = configured(config);
const unavailable = 'Chưa kết nối được dịch vụ đăng nhập. Vui lòng thử lại hoặc liên hệ TH.';
function status(id, message) { $(id).textContent = message; }
function setMode(next) {
  mode = next;
  $('auth-dialog').dataset.mode = next;
  $('auth-form').reset();
  const registering = next === 'register', resetting = next === 'reset';
  $('auth-title').textContent = registering ? 'Tạo tài khoản TH' : resetting ? 'Lấy lại mật khẩu.' : 'Đăng nhập TH';
  $('auth-description').textContent = resetting ? 'Nhập email để nhận hướng dẫn đặt lại mật khẩu.' : registering ? 'Đăng ký bằng Google hoặc email.' : 'Dùng Google hoặc tài khoản email.';
  $('name-field').hidden = !registering;
  $('auth-name').required = registering;
  $('password-field').hidden = resetting;
  $('auth-password').required = !resetting;
  $('auth-password').minLength = registering ? 6 : 1;
  $('auth-password').placeholder = registering ? 'Ít nhất 6 ký tự' : 'Nhập mật khẩu';
  $('auth-password').autocomplete = registering ? 'new-password' : 'current-password';
  $('signup-note').hidden = !registering;
  $('google-login').hidden = resetting;
  document.querySelector('.auth-divider').hidden = resetting;
  $('forgot-password').hidden = resetting || registering;
  $('auth-submit').textContent = resetting ? 'Gửi hướng dẫn' : registering ? 'Tạo tài khoản' : 'Đăng nhập';
  $('login-tab').setAttribute('aria-pressed', String(next === 'login'));
  $('register-tab').setAttribute('aria-pressed', String(registering));
  status('auth-status', ready && auth ? '' : unavailable);
  $('auth-submit').disabled = !auth;
  $('google-login').disabled = !auth;
}
function open(mode = 'login') {
  if (auth?.currentUser) { $('thanh-vien').scrollIntoView({ behavior: 'smooth' }); return; }
  setMode(mode); $('auth-gate').hidden = false;
}
function renderUser(user) {
  document.body.classList.remove('auth-pending');
  $('auth-gate').hidden = !!user;
  $('main-site').hidden = !user;
  if (!user) { setMode('login'); window.scrollTo(0, 0); }
  $('member-guest').hidden = !!user; $('member-profile').hidden = !user;
  $('account-open').textContent = user ? 'Tài khoản ↗' : 'Đăng nhập ↗';
  if (!user) return;
  $('profile-title').textContent = `Xin chào, ${user.displayName || 'bạn'}!`;
  $('profile-email').textContent = user.email || '';
  $('profile-name').value = user.displayName || '';
  $('verification-state').textContent = user.emailVerified ? '✓ Email đã xác minh' : 'Hãy xác minh email để lưu hồ sơ của bạn.';
  $('verify-send').hidden = user.emailVerified; $('verify-refresh').hidden = user.emailVerified;
  $('profile-form').querySelector('button').disabled = !user.emailVerified;
  status('profile-status', '');
}
async function run(id, action) {
  if (busy) return;
  if (!auth) { status(id, unavailable); return; }
  busy = true;
  const controls = [...document.querySelectorAll('#auth-dialog button, #auth-dialog input, #member-profile button, #member-profile input')].filter(el => el.id !== 'auth-close');
  const states = controls.map(el => el.disabled);
  controls.forEach(el => { el.disabled = true; });
  status(id, 'Đang xử lý…');
  try { await action(); } catch (error) { status(id, friendlyError(error)); }
  finally { controls.forEach((el, i) => { el.disabled = states[i]; }); busy = false; if (auth.currentUser) $('profile-form').querySelector('button').disabled = !auth.currentUser.emailVerified; }
}
async function saveProfile(user, name) {
  await setDoc(doc(db, 'users', user.uid), { displayName: name, updatedAt: serverTimestamp() }, { merge: true });
}
$('account-open').onclick = () => open();
$('member-join').onclick = () => open('register');
$('login-tab').onclick = () => setMode('login'); $('register-tab').onclick = () => setMode('register'); $('forgot-password').onclick = () => setMode('reset');
$('auth-form').onsubmit = event => {
  event.preventDefault();
  run('auth-status', async () => {
    const email = $('auth-email').value.trim(), password = $('auth-password').value;
    if (mode === 'reset') {
      await sendPasswordResetEmail(auth, email);
      status('auth-status', 'Nếu email đủ điều kiện, bạn sẽ nhận được hướng dẫn đặt lại mật khẩu. Hãy kiểm tra cả thư rác.'); return;
    }
    if (mode === 'register') {
      const name = $('auth-name').value.trim();
      if (!validName(name)) { status('auth-status', 'Tên hiển thị cần từ 1 đến 80 ký tự.'); return; }
      const { user } = await createUserWithEmailAndPassword(auth, email, password);
      await updateProfile(user, { displayName: name }); renderUser(user);
      try { await sendEmailVerification(user); status('profile-status', 'Đã gửi email xác minh. Hãy kiểm tra hộp thư và thư rác.'); }
      catch (error) { status('profile-status', `Tài khoản đã tạo. Chưa gửi được email xác minh: ${friendlyError(error)} Bạn có thể gửi lại bên dưới.`); }
    } else { await signInWithEmailAndPassword(auth, email, password); }
    $('auth-form').reset(); renderUser(auth.currentUser); window.scrollTo(0, 0);
  });
};
$('google-login').onclick = () => run('auth-status', async () => {
  await signInWithPopup(auth, new GoogleAuthProvider());
  renderUser(auth.currentUser); window.scrollTo(0, 0);
});
$('sign-out').onclick = () => run('profile-status', async () => { await signOut(auth); status('service-state', 'Bạn đã đăng xuất. Hẹn gặp lại!'); });
$('verify-send').onclick = () => run('profile-status', async () => { await sendEmailVerification(auth.currentUser); status('profile-status', 'Đã gửi email xác minh. Hãy kiểm tra hộp thư và thư rác.'); });
$('verify-refresh').onclick = () => run('profile-status', async () => { const user = auth.currentUser; await reload(user); await getIdToken(user, true); renderUser(user); if (!user.emailVerified) status('profile-status', 'Email chưa được xác minh. Hãy mở liên kết trong email rồi thử lại.'); });
$('profile-form').onsubmit = event => { event.preventDefault(); run('profile-status', async () => {
  const name = $('profile-name').value.trim(), user = auth.currentUser;
  if (!validName(name)) { status('profile-status', 'Tên hiển thị cần từ 1 đến 80 ký tự.'); return; }
  if (!user.emailVerified) { status('profile-status', 'Vui lòng xác minh email trước.'); return; }
  await saveProfile(user, name);
  await updateProfile(user, { displayName: name }); renderUser(user); status('profile-status', 'Đã lưu hồ sơ của bạn.');
}); };
if (ready) {
  try { const app = initializeApp(config); auth = getAuth(app); auth.languageCode = 'vi'; db = getFirestore(app); onAuthStateChanged(auth, renderUser, () => { document.body.classList.remove('auth-pending'); setMode('login'); status('auth-status', 'Không khôi phục được phiên đăng nhập. Hãy thử đăng nhập lại.'); }); status('service-state', 'Đăng nhập với Google hoặc email của bạn.'); }
  catch { auth = null; document.body.classList.remove('auth-pending'); setMode('login'); }
} else { document.body.classList.remove('auth-pending'); setMode('login'); }
