/**
 * Renders sign-in / sign-out UI in nav based on auth state
 */
function renderAuthNav(user) {
  const container = document.getElementById('navAuth');
  if (!container) return;

  if (user) {
    const label = user.displayName || user.email || 'Signed in';
    container.innerHTML = `
      <span class="nav-user">${escapeHtml(label)}</span>
      <button type="button" class="btn btn-ghost nav-btn" id="navSignOut">Sign out</button>
    `;

    const signOutBtn = document.getElementById('navSignOut');
    if (signOutBtn) signOutBtn.addEventListener('click', () => signOut().then(() => {}));
  } else {
    container.innerHTML = `
      <button type="button" class="btn btn-ghost nav-btn" id="navSignInGoogle">Sign in</button>
    `;
    const btn = document.getElementById('navSignInGoogle');
    if (btn) {
      btn.addEventListener('click', async () => {
        btn.disabled = true;
        try {
          await signInWithGoogle();
        } catch (err) {
          alert('Sign in failed: ' + (err.message || err));
        } finally {
          btn.disabled = false;
        }
      });
    }
  }
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

document.addEventListener('DOMContentLoaded', () => {
  initAuth();
  if (auth) {
    renderAuthNav(getCurrentUser());
    onAuthStateChanged(renderAuthNav);
  }
});
