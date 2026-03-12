(function () {
  if (!('serviceWorker' in navigator)) return;

  const listeners = new Set();
  let deferredPrompt = null;

  function notifyInstallAvailability() {
    window.fitPulsePwa.canInstall = Boolean(deferredPrompt);
    listeners.forEach(function (listener) {
      listener(window.fitPulsePwa.canInstall);
    });
  }

  window.fitPulsePwa = {
    canInstall: false,
    subscribe: function (listener) {
      listeners.add(listener);
      listener(this.canInstall);
      return function () {
        listeners.delete(listener);
      };
    },
    promptInstall: async function () {
      if (!deferredPrompt) return false;
      deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      deferredPrompt = null;
      notifyInstallAvailability();
      return choice.outcome === 'accepted';
    }
  };

  window.addEventListener('load', function () {
    navigator.serviceWorker.register('./service-worker.js').catch(function (err) {
      console.warn('Service worker registration failed:', err);
    });
  });

  window.addEventListener('beforeinstallprompt', function (event) {
    event.preventDefault();
    deferredPrompt = event;
    notifyInstallAvailability();
  });

  window.addEventListener('appinstalled', function () {
    deferredPrompt = null;
    notifyInstallAvailability();
  });
})();