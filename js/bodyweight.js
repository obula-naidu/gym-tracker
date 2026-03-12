/**
 * Body weight tracker - log & chart body weight over time.
 */
let db = null;
let bwChart = null;

async function initFirebase() {
  if (!firebaseConfig.apiKey || firebaseConfig.apiKey === 'YOUR_API_KEY') {
    document.getElementById('bwList').innerHTML =
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

function showBwMessage(text, isError = false) {
  const msg = document.getElementById('bwMessage');
  msg.textContent = text;
  msg.className = `message ${isError ? 'message-error' : 'message-success'}`;
  msg.style.display = 'block';
  setTimeout(() => { msg.style.display = 'none'; }, 3000);
}

async function saveBodyWeight(date, weight) {
  const user = getCurrentUser();
  if (!user) throw new Error('Not signed in');
  const unit = getWeightUnit();
  // Upsert by date
  const snap = await db.collection('bodyweight_logs')
    .where('user_id', '==', user.uid)
    .where('date', '==', date)
    .get();
  if (!snap.empty) {
    await snap.docs[0].ref.update({ weight: parseFloat(weight), unit });
  } else {
    await db.collection('bodyweight_logs').add({
      user_id: user.uid,
      date,
      weight: parseFloat(weight),
      unit
    });
  }
}

async function loadBodyWeightLogs() {
  const user = getCurrentUser();
  if (!user || !db) return [];
  try {
    const snap = await db.collection('bodyweight_logs')
      .where('user_id', '==', user.uid)
      .orderBy('date', 'desc')
      .limit(90)
      .get();
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (e) {
    // Fallback without orderBy
    const snap = await db.collection('bodyweight_logs')
      .where('user_id', '==', user.uid)
      .get();
    return snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
      .slice(0, 90);
  }
}

async function deleteBodyWeightEntry(id) {
  await db.collection('bodyweight_logs').doc(id).delete();
}

function renderStats(entries) {
  const el = document.getElementById('bwStats');
  const unit = getWeightUnit();
  if (!el || entries.length === 0) { if (el) el.innerHTML = ''; return; }

  const sorted = [...entries].sort((a, b) => a.date.localeCompare(b.date));
  const latest = sorted[sorted.length - 1];
  const first = sorted[0];
  const diff = (latest.weight - first.weight).toFixed(1);
  const sign = diff > 0 ? '+' : '';

  el.innerHTML = `
    <div class="history-summary-item">
      <span class="history-summary-value">${latest.weight} ${unit}</span>
      <span class="history-summary-label">Current</span>
    </div>
    <div class="history-summary-item">
      <span class="history-summary-value">${first.weight} ${unit}</span>
      <span class="history-summary-label">Starting</span>
    </div>
    <div class="history-summary-item">
      <span class="history-summary-value" style="color:${diff > 0 ? 'var(--error)' : diff < 0 ? 'var(--accent)' : 'var(--text-primary)'}">${sign}${diff} ${unit}</span>
      <span class="history-summary-label">Change</span>
    </div>
  `;
}

function renderBodyWeightList(entries) {
  const container = document.getElementById('bwList');
  const unit = getWeightUnit();
  if (!entries.length) {
    container.innerHTML = '<div class="empty-state"><p>No entries yet.</p></div>';
    return;
  }
  container.innerHTML = `<ul class="bodyweight-list">
    ${entries.map(e => {
      const dateLabel = new Date(e.date + 'T12:00:00').toLocaleDateString(undefined,
        { month: 'short', day: 'numeric', year: 'numeric' });
      return `<li class="bodyweight-item" data-id="${e.id}">
        <span class="bodyweight-date">${dateLabel}</span>
        <span class="bodyweight-value">${e.weight} ${unit}</span>
        <button type="button" class="bodyweight-delete" title="Delete">×</button>
      </li>`;
    }).join('')}
  </ul>`;

  container.querySelectorAll('.bodyweight-delete').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.closest('[data-id]').dataset.id;
      if (!confirm('Delete this entry?')) return;
      try {
        await deleteBodyWeightEntry(id);
        await reload();
      } catch (e) {
        alert('Failed to delete: ' + e.message);
      }
    });
  });
}

function renderBodyWeightChart(entries) {
  const wrap = document.getElementById('bwChartWrap');
  const unit = getWeightUnit();
  if (!entries.length) {
    if (bwChart) { bwChart.destroy(); bwChart = null; }
    wrap.innerHTML = '<div class="empty-state" style="padding:1rem;"><p>No data yet.</p></div>';
    return;
  }
  const sorted = [...entries].sort((a, b) => a.date.localeCompare(b.date));
  const labels = sorted.map(e =>
    new Date(e.date + 'T12:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' }));
  const data = sorted.map(e => e.weight);

  if (bwChart) { bwChart.destroy(); bwChart = null; }
  wrap.innerHTML = '';
  const canvas = document.createElement('canvas');
  wrap.appendChild(canvas);

  bwChart = new Chart(canvas, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: `Weight (${unit})`,
        data,
        borderColor: 'rgba(0, 210, 106, 0.9)',
        backgroundColor: 'rgba(0, 210, 106, 0.1)',
        borderWidth: 2,
        fill: true,
        tension: 0.3,
        pointRadius: 3
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      aspectRatio: 2.5,
      plugins: { legend: { display: false } },
      scales: {
        y: {
          beginAtZero: false,
          title: { display: true, text: unit }
        }
      }
    }
  });
}

async function reload() {
  try {
    const entries = await loadBodyWeightLogs();
    renderStats(entries);
    renderBodyWeightList(entries);
    renderBodyWeightChart(entries);
  } catch (e) {
    console.error('Failed to reload bodyweight:', e);
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  if (!(await initFirebase())) return;

  const unit = getWeightUnit();
  document.getElementById('bwWeightLabel').textContent = `Weight (${unit})`;

  const today = new Date().toISOString().slice(0, 10);
  document.getElementById('bwDate').value = today;
  document.getElementById('bwDate').max = today;

  await reload();

  document.getElementById('bodyweightForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const date = document.getElementById('bwDate').value;
    const weight = document.getElementById('bwWeight').value.trim();
    if (!date || !weight) return;
    const btn = document.getElementById('bwSaveBtn');
    btn.disabled = true;
    try {
      await saveBodyWeight(date, weight);
      showBwMessage('Weight saved!');
      document.getElementById('bwWeight').value = '';
      await reload();
    } catch (err) {
      showBwMessage('Failed: ' + err.message, true);
    } finally {
      btn.disabled = false;
    }
  });
});
