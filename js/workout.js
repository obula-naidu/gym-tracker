let db = null;

async function initFirebase() {
  if (!firebaseConfig.apiKey || firebaseConfig.apiKey === 'YOUR_API_KEY') {
    document.getElementById('workoutContent').innerHTML =
      '<div class="message message-error">Configure Firebase: Edit js/firebase-config.js with your project credentials.</div>';
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

function showMessage(text, isError = false) {
  const msg = document.getElementById('message');
  msg.textContent = text;
  msg.className = `message ${isError ? 'message-error' : 'message-success'}`;
  msg.style.display = 'block';
  setTimeout(() => {
    msg.style.display = 'none';
  }, 3000);
}

async function loadExercises(muscleGroup) {
  const user = getCurrentUser();
  if (!user) return [];
  const snapshot = await db
    .collection('exercises')
    .where('user_id', '==', user.uid)
    .where('muscle_group', '==', muscleGroup)
    .get();
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

function getTodayDate() {
  const d = new Date();
  return d.toISOString().slice(0, 10);
}

function getSelectedWorkoutDate() {
  const input = document.getElementById('workoutDate');
  return (input && input.value) ? input.value : getTodayDate();
}

async function saveSet(muscleGroup, exerciseName, setNum, weight, reps) {
  const user = getCurrentUser();
  if (!user) throw new Error('Not signed in');
  const doc = {
    user_id: user.uid,
    date: getSelectedWorkoutDate(),
    muscle_group: muscleGroup,
    exercise: exerciseName,
    set: setNum,
    weight: weight ? parseFloat(weight) : 0,
    reps: reps ? parseInt(reps, 10) : 0
  };
  await db.collection('workout_logs').add(doc);
}

async function loadWorkoutHistory(exerciseName) {
  const user = getCurrentUser();
  if (!user || !db) return [];
  const trimmedName = (exerciseName || '').trim();
  if (!trimmedName) return [];

  try {
    const snapshot = await db
      .collection('workout_logs')
      .where('user_id', '==', user.uid)
      .where('exercise', '==', trimmedName)
      .orderBy('date', 'desc')
      .limit(50)
      .get();
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  } catch (err) {
    console.warn('loadWorkoutHistory compound query failed, trying fallback:', err.message);
    const fallback = await db
      .collection('workout_logs')
      .where('user_id', '==', user.uid)
      .get();
    const filtered = fallback.docs
      .map(doc => ({ id: doc.id, ...doc.data() }))
      .filter(log => (log.exercise || '').trim() === trimmedName)
      .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
      .slice(0, 50);
    return filtered;
  }
}

function computePR(logs) {
  let bestSet = null;
  logs.forEach(log => {
    const w = parseFloat(log.weight) || 0;
    const r = parseInt(log.reps, 10) || 0;
    const volume = w * r;
    if (volume > 0 && (!bestSet || volume > bestSet.weight * bestSet.reps)) {
      bestSet = { weight: w, reps: r };
    }
  });
  return bestSet;
}

function aggregateByDate(logs) {
  const byDate = {};
  logs.forEach(log => {
    const d = log.date;
    if (!byDate[d]) byDate[d] = { date: d, maxWeight: 0, maxReps: 0, totalVolume: 0, sets: [] };
    const w = parseFloat(log.weight) || 0;
    const r = parseInt(log.reps, 10) || 0;
    const setNum = parseInt(log.set, 10) || 0;
    if (w > byDate[d].maxWeight) byDate[d].maxWeight = w;
    if (r > byDate[d].maxReps) byDate[d].maxReps = r;
    byDate[d].totalVolume += w * r;
    if (w > 0 || r > 0) byDate[d].sets.push({ set: setNum, weight: w, reps: r });
  });
  Object.values(byDate).forEach(day => {
    day.sets.sort((a, b) => a.set - b.set);
  });
  return Object.values(byDate).sort((a, b) => a.date.localeCompare(b.date));
}

function createExerciseCard(exercise, muscleGroup) {
  const card = document.createElement('div');
  card.className = 'card';
  card.dataset.exercise = exercise.exercise_name;

  card.innerHTML = `
    <div class="card-header">
      <div class="exercise-header-left">
        <span class="exercise-name">${exercise.exercise_name}</span>
        <span class="pr-badge" data-pr-placeholder title="Personal Record">PR: —</span>
      </div>
    </div>
    <div class="set-row">
      <span class="set-label">Set 1</span>
      <input type="number" step="0.5" min="0" placeholder="Weight" data-set="1" data-field="weight">
      <input type="number" step="1" min="0" placeholder="Reps" data-set="1" data-field="reps">
    </div>
    <div class="set-row">
      <span class="set-label">Set 2</span>
      <input type="number" step="0.5" min="0" placeholder="Weight" data-set="2" data-field="weight">
      <input type="number" step="1" min="0" placeholder="Reps" data-set="2" data-field="reps">
    </div>
    <div class="set-row">
      <span class="set-label">Set 3</span>
      <input type="number" step="0.5" min="0" placeholder="Weight" data-set="3" data-field="weight">
      <input type="number" step="1" min="0" placeholder="Reps" data-set="3" data-field="reps">
    </div>
    <div class="action-row">
      <button type="button" class="btn btn-primary save-workout-btn">Save Workout</button>
      <a href="analysis.html?exercise=${encodeURIComponent(exercise.exercise_name)}" class="btn btn-ghost analysis-btn">Analysis</a>
    </div>
    <div class="logged-for-date" data-logged-placeholder></div>
  `;

  const saveBtn = card.querySelector('.save-workout-btn');
  saveBtn.addEventListener('click', async () => {
    const exerciseName = exercise.exercise_name;
    let hasData = false;

    for (let setNum = 1; setNum <= 3; setNum++) {
      const weightInput = card.querySelector(`input[data-set="${setNum}"][data-field="weight"]`);
      const repsInput = card.querySelector(`input[data-set="${setNum}"][data-field="reps"]`);
      const weight = weightInput.value.trim();
      const reps = repsInput.value.trim();

      if (weight || reps) {
        hasData = true;
        try {
          await saveSet(muscleGroup, exerciseName, setNum, weight, reps);
        } catch (err) {
          showMessage('Failed to save set: ' + err.message, true);
          return;
        }
      }
    }

    if (hasData) {
      const savedDate = getSelectedWorkoutDate();
      showMessage(`Workout saved for ${exerciseName} (${savedDate})!`);
      updateLoggedForDate(card, savedDate);
      populatePRAndChart(card, exerciseName);
    } else {
      showMessage('Enter at least one set (weight or reps)', true);
    }
  });

  populatePRAndChart(card, exercise.exercise_name);
  return card;
}

function formatSetsDisplay(sets) {
  if (!sets || sets.length === 0) return '—';
  return sets
    .sort((a, b) => a.set - b.set)
    .map(s => (s.weight > 0 || s.reps > 0) ? `${s.weight}×${s.reps}` : '')
    .filter(Boolean)
    .join(' · ') || '—';
}

function renderAnalysisChart(container, aggregated) {
  if (!aggregated || aggregated.length === 0) {
    container.innerHTML = '<div class="analysis-empty">No previous workouts to display</div>';
    return;
  }

  const wrapper = document.createElement('div');
  wrapper.className = 'analysis-wrapper';

  const table = document.createElement('div');
  table.className = 'analysis-table';
  table.innerHTML = `
    <div class="analysis-table-header">
      <span>Date</span>
      <span>Sets (kg×reps)</span>
      <span>Max</span>
      <span>Volume</span>
    </div>
    ${aggregated.map(a => {
      const dateLabel = new Date(a.date + 'T12:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
      const setsStr = formatSetsDisplay(a.sets);
      const maxStr = a.maxWeight > 0 ? `${a.maxWeight} kg` : '—';
      const volStr = a.totalVolume > 0 ? Math.round(a.totalVolume).toLocaleString() : '—';
      return `<div class="analysis-table-row">
        <span>${dateLabel}</span>
        <span class="sets-data">${setsStr}</span>
        <span>${maxStr}</span>
        <span>${volStr}</span>
      </div>`;
    }).join('')}
  `;

  const chartWrap = document.createElement('div');
  chartWrap.className = 'analysis-chart-wrap';
  const ctx = document.createElement('canvas');
  ctx.setAttribute('role', 'img');
  ctx.setAttribute('aria-label', 'Workout history chart');
  chartWrap.appendChild(ctx);

  const labels = aggregated.map(a => {
    const d = new Date(a.date + 'T12:00:00');
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  });
  const weights = aggregated.map(a => a.maxWeight);
  const volumes = aggregated.map(a => Math.round(a.totalVolume));

  container.innerHTML = '';
  wrapper.appendChild(table);
  wrapper.appendChild(chartWrap);
  container.appendChild(wrapper);

  new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'Max Weight (kg)',
          data: weights,
          borderColor: 'rgba(0, 210, 106, 0.9)',
          backgroundColor: 'rgba(0, 210, 106, 0.15)',
          borderWidth: 2,
          fill: true,
          tension: 0.2,
          pointRadius: 4,
          yAxisID: 'y'
        },
        {
          label: 'Volume (kg×reps)',
          data: volumes,
          borderColor: 'rgba(100, 160, 255, 0.9)',
          backgroundColor: 'rgba(100, 160, 255, 0.1)',
          borderWidth: 2,
          fill: true,
          tension: 0.2,
          pointRadius: 4,
          yAxisID: 'y1'
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      aspectRatio: 2.2,
      interaction: { intersect: false, mode: 'index' },
      plugins: {
        legend: { display: true },
        tooltip: {
          callbacks: {
            label: (ctx) => {
              const i = ctx.dataIndex;
              const a = aggregated[i];
              const setsStr = formatSetsDisplay(a && a.sets);
              if (ctx.dataset.yAxisID === 'y1') return [`${ctx.dataset.label}: ${ctx.parsed.y}`, `Sets: ${setsStr}`];
              return `${ctx.dataset.label}: ${ctx.parsed.y}`;
            }
          }
        }
      },
      scales: {
        y: {
          type: 'linear',
          position: 'left',
          beginAtZero: true,
          title: { display: true, text: 'Weight (kg)' }
        },
        y1: {
          type: 'linear',
          position: 'right',
          beginAtZero: true,
          grid: { drawOnChartArea: false },
          title: { display: true, text: 'Volume' }
        }
      }
    }
  });
}

function formatDisplayDate(isoDate) {
  if (!isoDate) return '';
  const d = new Date(isoDate + 'T12:00:00');
  const today = getTodayDate();
  if (isoDate === today) return 'today';
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  if (isoDate === yesterday.toISOString().slice(0, 10)) return 'yesterday';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function fillSetInputs(card, logsForDate) {
  for (let setNum = 1; setNum <= 3; setNum++) {
    const log = logsForDate.find(l => parseInt(l.set, 10) === setNum);
    const weightInput = card.querySelector(`input[data-set="${setNum}"][data-field="weight"]`);
    const repsInput = card.querySelector(`input[data-set="${setNum}"][data-field="reps"]`);
    if (weightInput) weightInput.value = log && log.weight ? String(log.weight) : '';
    if (repsInput) repsInput.value = log && log.reps ? String(log.reps) : '';
  }
}

function updateLoggedForDate(card, date) {
  const el = card.querySelector('[data-logged-placeholder]');
  if (!el) return;
  if (!date) {
    el.textContent = '';
    el.className = 'logged-for-date';
    return;
  }
  const formatted = formatDisplayDate(date);
  el.textContent = `✓ Logged for ${formatted}`;
  el.className = 'logged-for-date logged-for-date-visible';
}

async function populatePRAndChart(card, exerciseName) {
  const prEl = card.querySelector('[data-pr-placeholder]');
  const loggedEl = card.querySelector('[data-logged-placeholder]');
  if (!prEl) return;

  try {
    const logs = await loadWorkoutHistory(exerciseName);
    const pr = computePR(logs);

    const selectedDate = getSelectedWorkoutDate();
    const logsForDate = logs.filter(log => (log.date || '') === selectedDate);
    const hasLogForDate = logsForDate.length > 0;
    if (loggedEl) {
      if (hasLogForDate) {
        updateLoggedForDate(card, selectedDate);
      } else {
        updateLoggedForDate(card, null);
      }
    }

    fillSetInputs(card, logsForDate);

    if (pr && pr.weight > 0 && pr.reps > 0) {
      prEl.textContent = `PR: ${pr.weight} kg × ${pr.reps} reps`;
      prEl.classList.remove('pr-empty');
    } else {
      prEl.textContent = 'PR: —';
      prEl.classList.add('pr-empty');
    }
  } catch (err) {
    prEl.textContent = 'PR: —';
    console.error('populatePRAndChart failed:', err);
  }
}

function renderWorkoutContent(exercises, muscleGroup) {
  const container = document.getElementById('workoutContent');

  if (!exercises || exercises.length === 0) {
    container.innerHTML = '<div class="empty-state"><p>No exercises for this muscle group yet.</p><p><a href="add-exercise.html" style="color: var(--accent);">Add exercises</a> first.</p></div>';
    return;
  }

  container.innerHTML = '';
  exercises.forEach(exercise => {
    container.appendChild(createExerciseCard(exercise, muscleGroup));
  });
}

document.addEventListener('DOMContentLoaded', async () => {
  if (!(await initFirebase())) return;

  const dateInput = document.getElementById('workoutDate');
  if (dateInput) {
    dateInput.value = getTodayDate();
    dateInput.max = getTodayDate();
  }

  const muscleSelect = document.getElementById('muscleGroup');
  
  // Load saved muscle group from localStorage, but only if it was selected today
  const today = getTodayDate();
  const savedGroup = localStorage.getItem('selectedMuscleGroup');
  const savedDate = localStorage.getItem('selectedMuscleGroupDate');
  const defaultGroup = getDefaultMuscleGroupForDay();
  
  // Use saved selection only if it's from today, otherwise use day default
  const initialGroup = (savedDate === today) ? savedGroup : defaultGroup;
  
  if (initialGroup) muscleSelect.value = initialGroup;

  const loadByMuscleGroup = async () => {
    const muscleGroup = muscleSelect.value;
    const container = document.getElementById('workoutContent');

    if (!muscleGroup) {
      container.innerHTML = '<div class="empty-state"><p>Select a muscle group to load exercises and start tracking</p></div>';
      return;
    }

    // Save the selected muscle group and today's date to localStorage
    localStorage.setItem('selectedMuscleGroup', muscleGroup);
    localStorage.setItem('selectedMuscleGroupDate', today);

    container.innerHTML = '<div class="loading">Loading exercises</div>';

    try {
      const exercises = await loadExercises(muscleGroup);
      renderWorkoutContent(exercises, muscleGroup);
    } catch (err) {
      container.innerHTML = '<div class="message message-error">Failed to load exercises. Check Firebase config.</div>';
      console.error(err);
    }
  };

  muscleSelect.addEventListener('change', loadByMuscleGroup);
  if (initialGroup) loadByMuscleGroup();

  if (dateInput) {
    dateInput.addEventListener('change', () => {
      document.querySelectorAll('#workoutContent .card[data-exercise]').forEach(card => {
        const exerciseName = card.dataset.exercise;
        if (exerciseName) populatePRAndChart(card, exerciseName);
      });
    });
  }
});
