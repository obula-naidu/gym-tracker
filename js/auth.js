/**
 * Firebase Authentication - Google sign-in
 */

let auth = null;

function initAuth() {
  if (!firebaseConfig.apiKey || firebaseConfig.apiKey === 'YOUR_API_KEY') return null;
  if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
  auth = firebase.auth();
  return auth;
}

/**
 * Returns the current user if signed in, otherwise null.
 * Waits for auth state to settle (e.g. persisted session restore).
 */
async function ensureSignedIn() {
  if (!auth) initAuth();
  if (!auth) return null;
  if (auth.currentUser) return auth.currentUser;
  return new Promise((resolve) => {
    const unsub = auth.onAuthStateChanged((user) => {
      unsub();
      resolve(user);
    });
  });
}

/**
 * Sign in with Google (popup)
 */
async function signInWithGoogle() {
  if (!auth) initAuth();
  if (!auth) throw new Error('Firebase not configured');

  const provider = new firebase.auth.GoogleAuthProvider();
  const result = await auth.signInWithPopup(provider);
  return result.user;
}

/**
 * Sign out
 */
async function signOut() {
  if (!auth) return;
  await auth.signOut();
}

/**
 * Subscribe to auth state changes (e.g. to update nav UI)
 * @param {function(user|null): void} callback
 */
function onAuthStateChanged(callback) {
  if (!auth) initAuth();
  if (!auth) return () => {};
  return auth.onAuthStateChanged(callback);
}

/**
 * Get current user (may be null if not signed in)
 */
function getCurrentUser() {
  return auth ? auth.currentUser : null;
}
