/**
 * Workout History page - browse workouts by date with prev/next navigation.
 */
let db = null;

async function initFirebase() {
  if (!firebaseConfig.apiKey || firebaseConfig.apiKey === 'YOUR_API_KEY') {
    document.getElementById('historyContent').innerHTML =
      '<div class="message message-error">Configure Firebase in js/firebase-config.js</div>';
    return false;
  }
  if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
  db = firebase.firestore();
  const user = await ensureSignedIn();
  if (!user) {
    window.location.href = 'index.html';
    return false;
  }
  return true;
}

function getTodayDate() {
  return new Date().toISOString().slice(0, 10);
}

function offsetDate(isoDate, days) {
  const d = new Date(isoDate + 'T12:00:00');
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function getRoutineById(routineId) {
  if (!routineId) return null;
  try {
    const routines = JSON.parse(localStorage.getItem('workoutRoutines') || '[]');
    return routines.find(r => r.id === routineId) || null;
  } catch (e) {
    return null;
  }
}

function getHistoryScopeFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const scope = (params.get('scope') || '').trim();
  const groupParam = decodeURIComponent(params.get('group') || '').trim();
  const routineIdParam = decodeURIComponent(params.get('routine') || '').trim();

  if (scope === 'group' || (groupParam && scope !== 'routine')) {
    if (groupParam) return { type: 'group', group: groupParam };
  }

  if (scope === 'routine' || (routineIdParam && scope !== 'group')) {
    const routine = getRoutineById(routineIdParam);
    if (routine && Array.isArray(routine.exercises) && routine.exercises.length) {
      return {
        type: 'routine',
        routineId: routineIdParam,
        routineName: routine.name || 'Routine',
        exerciseNames: new Set(routine.exercises.map(ex => ex.exercise_name).filter(Boolean))
      };
    }
  }

  return { type: 'all' };
}

function applyHistoryScope(logs, scope) {
  if (!scope || scope.type === 'all') return logs;
  if (scope.type === 'group') {
    return logs.filter(log => (log.muscle_group || '') === scope.group);
  }
  if (scope.type === 'routine') {
    return logs.filter(log => scope.exerciseNames && scope.exerciseNames.has(log.exercise));
  }
  return logs;
}

function filterNotesByLogs(notes, logs) {
  const allowed = new Set(logs.map(log => log.exercise).filter(Boolean));
  const filtered = {};
  Object.keys(notes || {}).forEach(exerciseName => {
    if (allowed.has(exerciseName)) filtered[exerciseName] = notes[exerciseName];
  });
  return filtered;
}

function renderScopeInfo(scope) {
  if (!scope || scope.type === 'all') return '';
  if (scope.type === 'group') {
    return `<p style="color:var(--text-secondary);font-size:0.85rem;margin-bottom:0.75rem;">Filtered by muscle group: <strong style="color:var(--text-primary);">${scope.group}</strong></p>`;
  }
  if (scope.type === 'routine') {
    return `<p style="color:var(--text-secondary);font-size:0.85rem;margin-bottom:0.75rem;">Filtered by routine: <strong style="color:var(--text-primary);">${scope.routineName}</strong></p>`;
  }
  return '';
}

async function loadScopedDates(scope) {
  const user = getCurrentUser();
  if (!user || !db) return [];

  let allLogs = [];
  try {
    const snap = await db.collection('workout_logs')
      .where('user_id', '==', user.uid)
      .get();
    allLogs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (e) {
    return [];
  }

  const filtered = applyHistoryScope(allLogs, scope);
  return Array.from(new Set(filtered.map(log => log.date).filter(Boolean))).sort((a, b) => a.localeCompare(b));
}

function getAdjacentScopedDate(currentDate, sortedDates, direction) {
  if (!sortedDates || !sortedDates.length) return null;
  const idx = sortedDates.indexOf(currentDate);

  if (idx >= 0) {
    const nextIdx = idx + direction;
    if (nextIdx < 0 || nextIdx >= sortedDates.length) return null;
    return sortedDates[nextIdx];
  }

  if (direction < 0) {
    const prev = sortedDates.filter(d => d < currentDate);
    return prev.length ? prev[prev.length - 1] : null;
  }

  return sortedDates.find(d => d > currentDate) || null;
}

async function loadLogsForDate(date) {
  const user = getCurrentUser();
  if (!user || !db) return [];
  try {
    const snap = await db.collection('workout_logs')
      .where('user_id', '==', user.uid)
      .where('date', '==', date)
      .get();
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (e) {
    const fallback = await db.collection('workout_logs')
      .where('user_id', '==', user.uid).get();
    return fallback.docs.map(d => ({ id: d.id, ...d.data() })).filter(l => l.date === date);
  }
}

async function loadNotesForDate(date) {
  const user = getCurrentUser();
  if (!user || !db) return {};
  try {
    const snap = await db.collection('workout_notes')
      .where('user_id', '==', user.uid)
      .where('date', '==', date)
      .get();
    const notes = {};
    snap.docs.forEach(d => { notes[d.data().exercise] = d.data().note; });
    return notes;
  } catch (e) {
    return {};
  }
}

async function deleteExerciseLogsForDate(exerciseName, date) {
  const user = getCurrentUser();
  if (!user || !db) throw new Error('Not signed in');
  const snap = await db.collection('workout_logs')
    .where('user_id', '==', user.uid)
    .where('exercise', '==', exerciseName)
    .where('date', '==', date)
    .get();

  for (let i = 0; i < snap.docs.length; i += 500) {
    const batch = db.batch();
    snap.docs.slice(i, i + 500).forEach(d => batch.delete(d.ref));
    await batch.commit();
  }

  try {
    const notesSnap = await db.collection('workout_notes')
      .where('user_id', '==', user.uid)
      .where('exercise', '==', exerciseName)
      .where('date', '==', date)
      .get();
    for (let i = 0; i < notesSnap.docs.length; i += 500) {
      const batch = db.batch();
      notesSnap.docs.slice(i, i + 500).forEach(d => batch.delete(d.ref));
      await batch.commit();
    }
  } catch (e) {
    // ignore if collection/rules unavailable
  }
}

function formatSetsStr(sets) {
  if (!sets || sets.length === 0) return '—';
  return sets
    .sort((a, b) => (a.set || 0) - (b.set || 0))
    .map(s => (s.weight > 0 || s.reps > 0) ? `${s.weight}×${s.reps}` : '')
    .filter(Boolean).join(' · ') || '—';
}

function renderHistory(logs, notes, date, scope = { type: 'all' }) {
  const container = document.getElementById('historyContent');
  const unit = getWeightUnit();

  function getSetVolume(log) {
    const weight = parseFloat(log.weight) || 0;
    const reps = parseInt(log.reps, 10) || 0;
    const multiplier = log.weight_mode === 'per_side' ? 2 : 1;
    return weight * reps * multiplier;
  }

  if (logs.length === 0) {
    const dateLabel = new Date(date + 'T12:00:00').toLocaleDateString(undefined, {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
    });
    container.innerHTML = `
      <p style="color:var(--text-secondary);font-size:0.9rem;margin-bottom:1rem;">${dateLabel}</p>
      ${renderScopeInfo(scope)}
      <div class="empty-state">
        <p>${scope && scope.type !== 'all' ? 'No workouts found for this filter on this date.' : 'No workouts logged for this date.'}</p>
        <p><a href="workout.html" style="color:var(--accent);">Log a workout</a></p>
      </div>`;
    return;
  }

  // Group by muscle group → exercise
  const grouped = {};
  logs.forEach(log => {
    const mg = log.muscle_group || 'Other';
    if (!grouped[mg]) grouped[mg] = {};
    const ex = log.exercise || 'Unknown';
    if (!grouped[mg][ex]) grouped[mg][ex] = [];
    grouped[mg][ex].push(log);
  });

  // Totals
  let totalVolume = 0;
  let totalSets = 0;
  const exerciseCount = new Set(logs.map(l => l.exercise)).size;
  logs.forEach(l => {
    const w = parseFloat(l.weight) || 0;
    const r = parseInt(l.reps, 10) || 0;
    totalVolume += getSetVolume(l);
    if (w > 0 || r > 0) totalSets++;
  });

  const dateLabel = new Date(date + 'T12:00:00').toLocaleDateString(undefined, {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  });

  let html = `
    <p style="color:var(--text-secondary);font-size:0.9rem;margin-bottom:1rem;">${dateLabel}</p>
    ${renderScopeInfo(scope)}
    <div class="history-summary">
      <div class="history-summary-item">
        <span class="history-summary-value">${exerciseCount}</span>
        <span class="history-summary-label">Exercises</span>
      </div>
      <div class="history-summary-item">
        <span class="history-summary-value">${totalSets}</span>
        <span class="history-summary-label">Sets</span>
      </div>
      <div class="history-summary-item">
        <span class="history-summary-value">${totalVolume > 0 ? Math.round(totalVolume).toLocaleString() : '—'}</span>
        <span class="history-summary-label">Volume (${unit})</span>
      </div>
    </div>`;

  Object.keys(grouped).forEach(mg => {
    html += `<div class="history-session"><div class="history-session-title">${mg}</div>`;
    Object.keys(grouped[mg]).forEach(exName => {
      const sets = grouped[mg][exName];
      const setsData = sets.map(s => ({
        set: parseInt(s.set, 10) || 0,
        weight: parseFloat(s.weight) || 0,
        reps: parseInt(s.reps, 10) || 0
      }));
      const setsStr = formatSetsStr(setsData);
      const vol = sets.reduce((acc, s) => acc + getSetVolume(s), 0);
      const note = notes[exName] || '';
      html += `
        <div class="history-exercise-item">
          <div>
            <div class="history-exercise-name">
              <a href="analysis.html?exercise=${encodeURIComponent(exName)}"
                 style="color:inherit;text-decoration:none;">${exName}</a>
            </div>
            <div class="history-sets-str">${setsStr}</div>
            ${note ? `<div style="font-size:0.8rem;color:var(--text-secondary);margin-top:0.25rem;font-style:italic;">${note}</div>` : ''}
            <div style="display:flex; gap:0.5rem; margin-top:0.35rem; flex-wrap:wrap;">
              <a href="workout.html?group=${encodeURIComponent(mg)}&date=${encodeURIComponent(date)}" class="btn btn-ghost btn-sm">Edit</a>
              <button type="button" class="btn btn-ghost btn-sm btn-danger" data-delete-exercise="${encodeURIComponent(exName)}">Delete</button>
            </div>
          </div>
          <div class="history-volume">${vol > 0 ? Math.round(vol).toLocaleString() + ' ' + unit : ''}</div>
        </div>`;
    });
    html += `</div>`;
  });

  container.innerHTML = html;

  container.querySelectorAll('[data-delete-exercise]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const exerciseName = decodeURIComponent(btn.getAttribute('data-delete-exercise') || '');
      if (!confirm(`Delete all logs for ${exerciseName} on ${date}?`)) return;
      btn.disabled = true;
      try {
        await deleteExerciseLogsForDate(exerciseName, date);
        const allLogs = await loadLogsForDate(date);
        const allNotes = await loadNotesForDate(date);
        const logs = applyHistoryScope(allLogs, scope);
        const notes = filterNotesByLogs(allNotes, logs);
        renderHistory(logs, notes, date, scope);
      } catch (err) {
        alert('Failed to delete: ' + (err.message || err));
        btn.disabled = false;
      }
    });
  });
}

document.addEventListener('DOMContentLoaded', async () => {
  if (!(await initFirebase())) return;

  const scope = getHistoryScopeFromUrl();
  const dateInput = document.getElementById('historyDate');
  const prevBtn = document.getElementById('prevDayBtn');
  const nextBtn = document.getElementById('nextDayBtn');
  const today = getTodayDate();
  const scopedDates = scope.type === 'all' ? [] : await loadScopedDates(scope);

  function updateNavButtons() {
    if (!prevBtn || !nextBtn) return;

    if (!scopedDates.length || scope.type === 'all') {
      prevBtn.disabled = false;
      nextBtn.disabled = dateInput.value >= today;
      return;
    }

    const idx = scopedDates.indexOf(dateInput.value);
    if (idx < 0) {
      prevBtn.disabled = !getAdjacentScopedDate(dateInput.value, scopedDates, -1);
      nextBtn.disabled = !getAdjacentScopedDate(dateInput.value, scopedDates, 1);
      return;
    }

    prevBtn.disabled = idx === 0;
    nextBtn.disabled = idx === scopedDates.length - 1;
  }

  // Check if navigated here with a specific date
  const urlDate = new URLSearchParams(window.location.search).get('date');
  dateInput.value = urlDate || today;

  dateInput.max = today;

  async function loadForDate(date) {
    document.getElementById('historyContent').innerHTML = '<div class="loading">Loading…</div>';
    try {
      const [allLogs, allNotes] = await Promise.all([
        loadLogsForDate(date),
        loadNotesForDate(date)
      ]);
      const logs = applyHistoryScope(allLogs, scope);
      const notes = filterNotesByLogs(allNotes, logs);
      renderHistory(logs, notes, date, scope);
      updateNavButtons();
    } catch (err) {
      document.getElementById('historyContent').innerHTML =
        '<div class="message message-error">Failed to load history.</div>';
      console.error(err);
      updateNavButtons();
    }
  }

  dateInput.addEventListener('change', () => loadForDate(dateInput.value));

  prevBtn.addEventListener('click', () => {
    let newDate;
    if (scopedDates.length && scope.type !== 'all') {
      newDate = getAdjacentScopedDate(dateInput.value, scopedDates, -1);
      if (!newDate) return;
    } else {
      newDate = offsetDate(dateInput.value, -1);
    }
    dateInput.value = newDate;
    loadForDate(newDate);
  });

  nextBtn.addEventListener('click', () => {
    let newDate;
    if (scopedDates.length && scope.type !== 'all') {
      newDate = getAdjacentScopedDate(dateInput.value, scopedDates, 1);
      if (!newDate) return;
    } else {
      newDate = offsetDate(dateInput.value, 1);
      if (newDate > today) return;
    }
    dateInput.value = newDate;
    loadForDate(newDate);
  });

  updateNavButtons();
  loadForDate(dateInput.value);
});
