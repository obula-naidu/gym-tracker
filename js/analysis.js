/**
 * Exercise Analysis page - workout history visualization
 */
let db = null;

async function initFirebase() {
  if (!firebaseConfig.apiKey || firebaseConfig.apiKey === 'YOUR_API_KEY') {
    document.getElementById('analysisContainer').innerHTML =
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

function getExerciseFromUrl() {
  const params = new URLSearchParams(window.location.search);
  return decodeURIComponent(params.get('exercise') || '').trim();
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
    console.warn('loadWorkoutHistory fallback:', err.message);
    const fallback = await db.collection('workout_logs').where('user_id', '==', user.uid).get();
    return fallback.docs
      .map(doc => ({ id: doc.id, ...doc.data() }))
      .filter(log => (log.exercise || '').trim() === trimmedName)
      .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
      .slice(0, 50);
  }
}

async function deleteWorkoutLogsForExercise(exerciseName) {
  const user = getCurrentUser();
  if (!user || !db) throw new Error('Not signed in');
  const trimmedName = (exerciseName || '').trim();
  if (!trimmedName) return;
  let snapshot;
  try {
    snapshot = await db.collection('workout_logs')
      .where('user_id', '==', user.uid)
      .where('exercise', '==', trimmedName)
      .get();
  } catch (err) {
    snapshot = await db.collection('workout_logs').where('user_id', '==', user.uid).get();
    snapshot = { docs: snapshot.docs.filter(d => (d.data().exercise || '').trim() === trimmedName) };
  }
  if (!snapshot.docs || snapshot.docs.length === 0) return;
  const BATCH_SIZE = 500;
  for (let i = 0; i < snapshot.docs.length; i += BATCH_SIZE) {
    const batch = db.batch();
    snapshot.docs.slice(i, i + BATCH_SIZE).forEach(doc => batch.delete(doc.ref));
    await batch.commit();
  }
}

function computePR(logs) {
  function getSetVolume(log) {
    const weight = parseFloat(log.weight) || 0;
    const reps = parseInt(log.reps, 10) || 0;
    const multiplier = log.weight_mode === 'per_side' ? 2 : 1;
    return weight * reps * multiplier;
  }

  let bestSet = null;
  let bestVolume = 0;
  let bestOneRm = 0;
  logs.forEach(log => {
    const w = parseFloat(log.weight) || 0;
    const r = parseInt(log.reps, 10) || 0;
    const volume = getSetVolume(log);
    if (volume > 0 && (!bestSet || volume > bestVolume)) {
      bestSet = { weight: w, reps: r };
      bestVolume = volume;
    }
    if (w > 0 && r > 0) {
      const oneRm = w * (1 + r / 30);
      if (oneRm > bestOneRm) bestOneRm = oneRm;
    }
  });
  return { bestSet, bestOneRm };
}

function aggregateByDate(logs) {
  function getSetVolume(log) {
    const weight = parseFloat(log.weight) || 0;
    const reps = parseInt(log.reps, 10) || 0;
    const multiplier = log.weight_mode === 'per_side' ? 2 : 1;
    return weight * reps * multiplier;
  }

  const byDate = {};
  logs.forEach(log => {
    const d = log.date;
    if (!byDate[d]) byDate[d] = { date: d, maxWeight: 0, maxReps: 0, totalVolume: 0, sets: [] };
    const w = parseFloat(log.weight) || 0;
    const r = parseInt(log.reps, 10) || 0;
    const setNum = parseInt(log.set, 10) || 0;
    if (w > byDate[d].maxWeight) byDate[d].maxWeight = w;
    if (r > byDate[d].maxReps) byDate[d].maxReps = r;
    byDate[d].totalVolume += getSetVolume(log);
    if (w > 0 || r > 0) byDate[d].sets.push({ set: setNum, weight: w, reps: r });
  });
  Object.values(byDate).forEach(day => day.sets.sort((a, b) => a.set - b.set));
  return Object.values(byDate).sort((a, b) => a.date.localeCompare(b.date));
}

function formatSetsDisplay(sets) {
  if (!sets || sets.length === 0) return '—';
  return sets
    .sort((a, b) => a.set - b.set)
    .map(s => (s.weight > 0 || s.reps > 0) ? `${s.weight}×${s.reps}` : '')
    .filter(Boolean)
    .join(' · ') || '—';
}

function renderAnalysis(container, aggregated, exerciseName) {
  const unit = getWeightUnit();
  if (!aggregated || aggregated.length === 0) {
    container.innerHTML = '<div class="analysis-empty">No previous workouts for this exercise.</div>';
    return;
  }

  const card = document.createElement('div');
  card.className = 'card analysis-card';

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
      const maxStr = a.maxWeight > 0 ? `${a.maxWeight} ${unit}` : '—';
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

  card.appendChild(table);
  card.appendChild(chartWrap);

  container.innerHTML = '';
  container.appendChild(card);

  new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: `Max Weight (${unit})`,
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
          title: { display: true, text: `Weight (${unit})` }
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

document.addEventListener('DOMContentLoaded', async () => {
  if (!(await initFirebase())) return;

  const exerciseName = getExerciseFromUrl();
  const container = document.getElementById('analysisContainer');
  const titleEl = document.getElementById('exerciseTitle');
  const prEl = document.getElementById('prDisplay');
  const oneRmEl = document.getElementById('oneRmDisplay');

  if (!exerciseName) {
    titleEl.textContent = 'Exercise Analysis';
    container.innerHTML = '<div class="analysis-empty">No exercise selected. <a href="workout.html">Go to Track Workout</a> to view analysis.</div>';
    return;
  }

  titleEl.textContent = exerciseName;

  try {
    const logs = await loadWorkoutHistory(exerciseName);
    const pr = computePR(logs);
    const unit = getWeightUnit();
    const aggregated = aggregateByDate(logs);

    if (pr.bestSet && pr.bestSet.weight > 0 && pr.bestSet.reps > 0) {
      prEl.textContent = `PR: ${pr.bestSet.weight} ${unit} × ${pr.bestSet.reps} reps`;
      prEl.classList.remove('pr-empty');
    } else {
      prEl.textContent = 'PR: —';
      prEl.classList.add('pr-empty');
    }

    oneRmEl.textContent = pr.bestOneRm > 0 ? `1RM: ${Math.round(pr.bestOneRm)} ${unit}` : '1RM: —';

    renderAnalysis(container, aggregated, exerciseName);

    const clearBtn = document.getElementById('clearHistoryBtn');
    if (logs.length > 0 && clearBtn) {
      clearBtn.style.display = 'inline-flex';
      clearBtn.onclick = async () => {
        if (!confirm(`Delete all workout history for "${exerciseName}"? This cannot be undone.`)) return;
        clearBtn.disabled = true;
        clearBtn.textContent = 'Deleting…';
        try {
          await deleteWorkoutLogsForExercise(exerciseName);
          prEl.textContent = 'PR: —';
          oneRmEl.textContent = '1RM: —';
          prEl.classList.add('pr-empty');
          renderAnalysis(container, [], exerciseName);
          clearBtn.style.display = 'none';
        } catch (err) {
          alert('Failed to delete: ' + (err.message || err));
        } finally {
          clearBtn.disabled = false;
          clearBtn.textContent = 'Clear history';
        }
      };
    }
  } catch (err) {
    container.innerHTML = `<div class="analysis-empty">Unable to load history: ${err.message || 'Unknown error'}</div>`;
    console.error(err);
  }
});
