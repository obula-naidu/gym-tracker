document.addEventListener('DOMContentLoaded', function () {
  initAuth();

  const greetingEl = document.getElementById('menuGreeting');
  const signOutBtn = document.getElementById('signOutBtn');
  const installBtn = document.getElementById('installAppBtn');
  const installHint = document.getElementById('installAppHint');
  let pwaState = null;

  function getGreetingName(user) {
    if (!user) return '';
    if (user.displayName) return user.displayName;
    if (user.email) return user.email.split('@')[0];
    return '';
  }

  function updateGreeting(user) {
    if (!greetingEl) return;
    const name = getGreetingName(user);
    greetingEl.textContent = name ? 'Hi, ' + name : 'Hi';
  }

  updateGreeting(getCurrentUser());
  onAuthStateChanged(updateGreeting);

  if (signOutBtn) {
    signOutBtn.addEventListener('click', async function () {
      signOutBtn.disabled = true;
      try {
        await signOut();
        window.location.href = 'index.html';
      } finally {
        signOutBtn.disabled = false;
      }
    });
  }

  if (installBtn && installHint && window.fitPulsePwa && window.fitPulsePwa.subscribe) {
    window.fitPulsePwa.subscribe(function (state) {
      pwaState = state;
      installBtn.hidden = state.isStandalone;
      installBtn.textContent = state.canInstall ? 'Install App' : 'How to install';
      installBtn.disabled = false;
      installHint.hidden = state.isStandalone;
      installHint.textContent = state.installHelpText;
    });

    installBtn.addEventListener('click', async function () {
      if (!pwaState || pwaState.isStandalone) return;

      if (!pwaState.canInstall) {
        alert(pwaState.installHelpText);
        return;
      }

      installBtn.disabled = true;
      try {
        await window.fitPulsePwa.promptInstall();
      } finally {
        installBtn.disabled = false;
      }
    });
  }
});