document.addEventListener('DOMContentLoaded', function () {
  initAuth();

  const greetingEl = document.getElementById('menuGreeting');
  const signOutBtn = document.getElementById('signOutBtn');
  const installBtn = document.getElementById('installAppBtn');
  const installHint = document.getElementById('installAppHint');
  const weightUnitSelect = document.getElementById('weightUnitSelect');
  const themeSelect = document.getElementById('themeSelect');
  const restSecondsInput = document.getElementById('restSecondsInput');
  const dayMappingList = document.getElementById('dayMappingList');
  const savePrefsBtn = document.getElementById('savePrefsBtn');
  let pwaState = null;

  function getRoutinesForMapping() {
    try {
      return JSON.parse(localStorage.getItem('workoutRoutines') || '[]');
    } catch (e) {
      return [];
    }
  }

  function buildTargetSelectOptions(mode, selectedValue) {
    if (mode === 'routine') {
      const routines = getRoutinesForMapping();
      const options = ['<option value="">Select routine</option>']
        .concat(routines.map(r => `<option value="${r.id}">${r.name}</option>`));
      return { optionsHtml: options.join(''), selected: selectedValue || '' };
    }

    const groups = getAllMuscleGroups();
    const options = ['<option value="">Select muscle group</option>']
      .concat(groups.map(g => `<option value="${g}">${g}</option>`));
    return { optionsHtml: options.join(''), selected: selectedValue || '' };
  }

  async function renderDayMappingRows() {
    if (!dayMappingList || typeof getWeekdayOptions !== 'function') return;

    const weekdays = getWeekdayOptions();
    const savedMappings = typeof getSavedDayWorkoutMappings === 'function'
      ? await getSavedDayWorkoutMappings()
      : {};

    dayMappingList.innerHTML = weekdays.map(day => {
      const saved = savedMappings[String(day.index)] || {};
      const fallback = typeof getDefaultWorkoutPlanForDay === 'function'
        ? (() => {
            // Call async function synchronously via localStorage cache
            try {
              const cached = JSON.parse(localStorage.getItem('dayWorkoutMappings') || '{}');
              return cached[String(day.index)] || { mode: 'group', group: '' };
            } catch (e) {
              return { mode: 'group', group: '' };
            }
          })()
        : { mode: 'group', group: '' };
      const mode = saved.mode || fallback.mode || 'group';
      const selectedTarget = mode === 'routine'
        ? (saved.routineId || fallback.routineId || '')
        : (saved.group || fallback.group || '');
      const target = buildTargetSelectOptions(mode, selectedTarget);

      return `
        <div class="set-row" style="grid-template-columns: minmax(6.5rem, 1fr) minmax(6.5rem, 0.9fr) minmax(10rem, 1.2fr); margin-bottom: 0.5rem;">
          <span class="set-label" style="font-size:0.85rem; color: var(--text-primary);">${day.label}</span>
          <select class="day-map-mode" data-day="${day.index}" aria-label="${day.label} mode">
            <option value="group" ${mode === 'group' ? 'selected' : ''}>Muscle</option>
            <option value="routine" ${mode === 'routine' ? 'selected' : ''}>Routine</option>
          </select>
          <select class="day-map-target" data-day="${day.index}" aria-label="${day.label} target">${target.optionsHtml}</select>
        </div>
      `;
    }).join('');

    dayMappingList.querySelectorAll('.day-map-target').forEach(select => {
      const day = select.getAttribute('data-day');
      const modeEl = dayMappingList.querySelector(`.day-map-mode[data-day="${day}"]`);
      const mode = modeEl ? modeEl.value : 'group';
      const saved = savedMappings[String(day)] || {};
      const fallback = typeof getDefaultWorkoutPlanForDay === 'function'
        ? getDefaultWorkoutPlanForDay(parseInt(day, 10))
        : { mode: 'group', group: '' };
      const selectedTarget = mode === 'routine'
        ? (saved.routineId || fallback.routineId || '')
        : (saved.group || fallback.group || '');
      select.value = selectedTarget;
    });

    dayMappingList.querySelectorAll('.day-map-mode').forEach(modeEl => {
      modeEl.addEventListener('change', () => {
        const day = modeEl.getAttribute('data-day');
        const targetEl = dayMappingList.querySelector(`.day-map-target[data-day="${day}"]`);
        if (!targetEl) return;
        const target = buildTargetSelectOptions(modeEl.value, '');
        targetEl.innerHTML = target.optionsHtml;
      });
    });
  }

  function collectDayMappingsFromUI() {
    const output = {};
    if (!dayMappingList) return output;

    dayMappingList.querySelectorAll('.day-map-mode').forEach(modeEl => {
      const day = modeEl.getAttribute('data-day');
      const targetEl = dayMappingList.querySelector(`.day-map-target[data-day="${day}"]`);
      const mode = modeEl.value === 'routine' ? 'routine' : 'group';
      const target = targetEl ? targetEl.value : '';
      if (mode === 'routine') {
        output[day] = { mode: 'routine', routineId: target || '' };
      } else {
        output[day] = { mode: 'group', group: target || '' };
      }
    });

    return output;
  }

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

  if (weightUnitSelect) weightUnitSelect.value = getWeightUnit();
  if (themeSelect) themeSelect.value = getTheme();
  if (restSecondsInput) restSecondsInput.value = String(getRestDuration());
  renderDayMappingRows();

  if (savePrefsBtn) {
    savePrefsBtn.addEventListener('click', async function () {
      setWeightUnit(weightUnitSelect ? weightUnitSelect.value : 'kg');
      setTheme(themeSelect ? themeSelect.value : 'dark');
      setRestDuration(restSecondsInput ? parseInt(restSecondsInput.value || '90', 10) : 90);
      if (typeof setSavedDayWorkoutMappings === 'function') {
        await setSavedDayWorkoutMappings(collectDayMappingsFromUI());
      }
      savePrefsBtn.textContent = 'Saved';
      setTimeout(() => {
        savePrefsBtn.textContent = 'Save Preferences';
      }, 1200);
    });
  }
});