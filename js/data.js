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
});
