(function () {
  if (!('serviceWorker' in navigator)) return;

  const listeners = new Set();
  let deferredPrompt = null;

  function isIos() {
    return /iphone|ipad|ipod/i.test(navigator.userAgent || '');
  }

  function isSafari() {
    const ua = navigator.userAgent || '';
    return /safari/i.test(ua) && !/crios|fxios|edgios|chrome|android/i.test(ua);
  }

  function isAndroid() {
    return /android/i.test(navigator.userAgent || '');
  }

  function isChrome() {
    const ua = navigator.userAgent || '';
    return /chrome|chromium/i.test(ua) && !/edg|opr|samsungbrowser|brave/i.test(ua);
  }

  function isStandalone() {
    return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  }

  function getInstallHelpText(state) {
    if (state.isStandalone) return 'App is already installed.';
    if (state.canInstall) return 'Install is available for this browser.';
    if (state.isIos && state.isSafari) return 'On iPhone/iPad: tap Share, then “Add to Home Screen”.';
    if (state.isIos && !state.isSafari) return 'For install on iPhone/iPad, open this app in Safari.';
    if (state.isAndroid && state.isChrome) return 'In Chrome: tap menu (⋮), then “Install app”.';
    if (state.isAndroid) return 'On Android: open browser menu and choose “Add to Home screen” or “Install app”.';
    return 'Install is available when your browser supports it.';
  }

  function getState() {
    return {
      canInstall: Boolean(deferredPrompt),
      isIos: isIos(),
      isSafari: isSafari(),
      isAndroid: isAndroid(),
      isChrome: isChrome(),
      isStandalone: isStandalone(),
      installHelpText: ''
    };
  }

  function notifyInstallAvailability() {
    const state = getState();
    state.installHelpText = getInstallHelpText(state);
    window.fitPulsePwa.canInstall = state.canInstall;
    window.fitPulsePwa.isIos = state.isIos;
    window.fitPulsePwa.isSafari = state.isSafari;
    window.fitPulsePwa.isAndroid = state.isAndroid;
    window.fitPulsePwa.isChrome = state.isChrome;
    window.fitPulsePwa.isStandalone = state.isStandalone;
    window.fitPulsePwa.installHelpText = state.installHelpText;
    listeners.forEach(function (listener) {
      listener(state);
    });
  }

  window.fitPulsePwa = {
    canInstall: false,
    isIos: false,
    isSafari: false,
    isAndroid: false,
    isChrome: false,
    isStandalone: false,
    installHelpText: 'Install is available when your browser supports it.',
    subscribe: function (listener) {
      listeners.add(listener);
      listener({
        canInstall: this.canInstall,
        isIos: this.isIos,
        isSafari: this.isSafari,
        isAndroid: this.isAndroid,
        isChrome: this.isChrome,
        isStandalone: this.isStandalone,
        installHelpText: this.installHelpText
      });
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

  window.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible') notifyInstallAvailability();
  });

  notifyInstallAvailability();
})();