/**
 * Firebase Authentication - Google & Anonymous sign-in
 * If user is not signed in, automatically sign in anonymously (guest mode)
 */

let auth = null;

function initAuth() {
  if (!firebaseConfig.apiKey || firebaseConfig.apiKey === 'YOUR_API_KEY') return null;
  if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
  auth = firebase.auth();
  return auth;
}

/**
 * Ensure user is signed in. If not, sign in anonymously (guest).
 * Call this before any Firestore operations.
 */
async function ensureSignedIn() {
  if (!auth) initAuth();
  if (!auth) return null;

  let user = auth.currentUser;
  if (user) return user;

  try {
    const result = await auth.signInAnonymously();
    return result.user;
  } catch (err) {
    console.error('Anonymous sign-in failed:', err);
    return null;
  }
}

/**
 * Sign in with Google (popup)
 */
async function signInWithGoogle() {
  if (!auth) initAuth();
  if (!auth) throw new Error('Firebase not configured');

  const provider = new firebase.auth.GoogleAuthProvider();
  const currentUser = auth.currentUser;

  // If current user is anonymous, link with Google to preserve data
  if (currentUser && currentUser.isAnonymous) {
    try {
      const result = await currentUser.linkWithPopup(provider);
      return result.user;
    } catch (err) {
      // If link fails (e.g. credential already used), sign in with Google
      if (err.code === 'auth/credential-already-in-use') {
        await auth.signOut();
        const result = await auth.signInWithPopup(provider);
        return result.user;
      }
      throw err;
    }
  }

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
