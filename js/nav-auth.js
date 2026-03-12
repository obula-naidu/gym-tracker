/**
 * Renders sign-in / sign-out UI in nav based on auth state
 */
function renderAuthNav(user) {
  const container = document.getElementById('navAuth');
  if (!container) return;

  if (user) {
    container.innerHTML = '';
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

document.addEventListener('DOMContentLoaded', () => {
  initAuth();
  if (auth) {
    renderAuthNav(getCurrentUser());
    onAuthStateChanged(renderAuthNav);
  }
});
