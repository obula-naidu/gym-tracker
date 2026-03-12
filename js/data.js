/**
 * Manage Data page - clear workout logs and exercises
 */
let db = null;

async function initFirebase() {
  if (!firebaseConfig.apiKey || firebaseConfig.apiKey === 'YOUR_API_KEY') {
    document.body.innerHTML = '<div class="message message-error">Configure Firebase in js/firebase-config.js</div>';
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

async function clearAllWorkoutLogs() {
  const user = getCurrentUser();
  if (!user || !db) throw new Error('Not signed in');
  const snapshot = await db.collection('workout_logs').where('user_id', '==', user.uid).get();
  if (snapshot.empty) return;
  const BATCH_SIZE = 500;
  for (let i = 0; i < snapshot.docs.length; i += BATCH_SIZE) {
    const batch = db.batch();
    snapshot.docs.slice(i, i + BATCH_SIZE).forEach(doc => batch.delete(doc.ref));
    await batch.commit();
  }
}

async function clearAllExercises() {
  const user = getCurrentUser();
  if (!user || !db) throw new Error('Not signed in');
  const snapshot = await db.collection('exercises').where('user_id', '==', user.uid).get();
  if (snapshot.empty) return;
  const BATCH_SIZE = 500;
  for (let i = 0; i < snapshot.docs.length; i += BATCH_SIZE) {
    const batch = db.batch();
    snapshot.docs.slice(i, i + BATCH_SIZE).forEach(doc => batch.delete(doc.ref));
    await batch.commit();
  }
}

async function clearCollectionForUser(collectionName) {
  const user = getCurrentUser();
  if (!user || !db) throw new Error('Not signed in');
  const snapshot = await db.collection(collectionName).where('user_id', '==', user.uid).get();
  if (snapshot.empty) return;
  const BATCH_SIZE = 500;
  for (let i = 0; i < snapshot.docs.length; i += BATCH_SIZE) {
    const batch = db.batch();
    snapshot.docs.slice(i, i + BATCH_SIZE).forEach(doc => batch.delete(doc.ref));
    await batch.commit();
  }
}

async function fetchCollectionData(collectionName) {
  const user = getCurrentUser();
  if (!user || !db) return [];
  try {
    const snap = await db.collection(collectionName).where('user_id', '==', user.uid).get();
    return snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  } catch (e) {
    return [];
  }
}

function downloadTextFile(filename, content, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function toCsvRows(records) {
  if (!records.length) return '';
  const headers = Array.from(records.reduce((set, row) => {
    Object.keys(row).forEach(k => set.add(k));
    return set;
  }, new Set()));
  const csvEscape = (v) => {
    const s = v === undefined || v === null ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [headers.join(',')];
  records.forEach(row => {
    lines.push(headers.map(h => csvEscape(row[h])).join(','));
  });
  return lines.join('\n');
}

document.addEventListener('DOMContentLoaded', async () => {
  if (!(await initFirebase())) return;

  document.getElementById('clearWorkoutLogsBtn').addEventListener('click', async function() {
    if (!confirm('Delete ALL workout data? This cannot be undone.')) return;
    this.disabled = true;
    this.textContent = 'Deleting…';
    try {
      await clearAllWorkoutLogs();
      this.textContent = 'Cleared';
    } catch (err) {
      alert('Failed: ' + (err.message || err));
      this.disabled = false;
      this.textContent = 'Clear all workout data';
    }
  });

  document.getElementById('clearExercisesBtn').addEventListener('click', async function() {
    if (!confirm('Delete ALL exercises? This cannot be undone.')) return;
    this.disabled = true;
    this.textContent = 'Deleting…';
    try {
      await clearAllExercises();
      this.textContent = 'Cleared';
    } catch (err) {
      alert('Failed: ' + (err.message || err));
      this.disabled = false;
      this.textContent = 'Clear all exercises';
    }
  });

  const clearBodyweightBtn = document.getElementById('clearBodyweightBtn');
  if (clearBodyweightBtn) {
    clearBodyweightBtn.addEventListener('click', async function() {
      if (!confirm('Delete all bodyweight data?')) return;
      this.disabled = true;
      this.textContent = 'Deleting…';
      try {
        await clearCollectionForUser('bodyweight_logs');
        this.textContent = 'Cleared';
      } catch (err) {
        alert('Failed: ' + (err.message || err));
        this.disabled = false;
        this.textContent = 'Clear bodyweight data';
      }
    });
  }

  const clearNotesBtn = document.getElementById('clearNotesBtn');
  if (clearNotesBtn) {
    clearNotesBtn.addEventListener('click', async function() {
      if (!confirm('Delete all workout notes?')) return;
      this.disabled = true;
      this.textContent = 'Deleting…';
      try {
        await clearCollectionForUser('workout_notes');
        this.textContent = 'Cleared';
      } catch (err) {
        alert('Failed: ' + (err.message || err));
        this.disabled = false;
        this.textContent = 'Clear workout notes';
      }
    });
  }

  const exportJsonBtn = document.getElementById('exportJsonBtn');
  if (exportJsonBtn) {
    exportJsonBtn.addEventListener('click', async function () {
      this.disabled = true;
      try {
        const [exercises, logs, notes, bodyweight] = await Promise.all([
          fetchCollectionData('exercises'),
          fetchCollectionData('workout_logs'),
          fetchCollectionData('workout_notes'),
          fetchCollectionData('bodyweight_logs')
        ]);
        const payload = {
          exported_at: new Date().toISOString(),
          exercises,
          workout_logs: logs,
          workout_notes: notes,
          bodyweight_logs: bodyweight
        };
        downloadTextFile(`fit-pulse-export-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(payload, null, 2), 'application/json');
      } catch (err) {
        alert('Export failed: ' + (err.message || err));
      } finally {
        this.disabled = false;
      }
    });
  }

  const exportCsvBtn = document.getElementById('exportCsvBtn');
  if (exportCsvBtn) {
    exportCsvBtn.addEventListener('click', async function () {
      this.disabled = true;
      try {
        const logs = await fetchCollectionData('workout_logs');
        const csv = toCsvRows(logs);
        downloadTextFile(`fit-pulse-workout-logs-${new Date().toISOString().slice(0, 10)}.csv`, csv, 'text/csv;charset=utf-8');
      } catch (err) {
        alert('Export failed: ' + (err.message || err));
      } finally {
        this.disabled = false;
      }
    });
  }
});
