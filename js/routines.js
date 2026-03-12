/**
 * Workout Routines - saved in Firebase
 * Start a routine → navigates to workout.html?routine=<id>
 */

let db = null;
let allExercises = [];

async function getRoutines() {
  const user = getCurrentUser();
  if (!user || !db) {
    // Fallback to localStorage if Firebase not ready
    try {
      return JSON.parse(localStorage.getItem('workoutRoutines') || '[]');
    } catch (e) {
      return [];
    }
  }
  
  try {
    const snapshot = await db.collection('userRoutines')
      .where('user_id', '==', user.uid)
      .orderBy('created', 'desc')
      .get();
    const routines = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    // Cache in localStorage for quick access
    localStorage.setItem('workoutRoutines', JSON.stringify(routines));
    return routines;
  } catch (e) {
    console.error('Failed to load routines from Firebase:', e);
    // Fallback to localStorage
    try {
      return JSON.parse(localStorage.getItem('workoutRoutines') || '[]');
    } catch (e2) {
      return [];
    }
  }
}

async function saveRoutines(routines) {
  const user = getCurrentUser();
  if (!user || !db) {
    // Fallback to localStorage only
    localStorage.setItem('workoutRoutines', JSON.stringify(routines));
    return;
  }

  try {
    // Clear old routines for this user
    const oldSnapshot = await db.collection('userRoutines')
      .where('user_id', '==', user.uid)
      .get();
    const batch = db.batch();
    oldSnapshot.docs.forEach(doc => batch.delete(doc.ref));
    
    // Save new routines
    routines.forEach(routine => {
      const ref = db.collection('userRoutines').doc(routine.id);
      batch.set(ref, { ...routine, user_id: user.uid });
    });
    
    await batch.commit();
    // Cache in localStorage
    localStorage.setItem('workoutRoutines', JSON.stringify(routines));
  } catch (e) {
    console.error('Failed to save routines to Firebase:', e);
    // Fallback: save to localStorage only
    localStorage.setItem('workoutRoutines', JSON.stringify(routines));
  }
}

function showMessage(text, isError = false) {
  const msg = document.getElementById('routineMessage');
  msg.textContent = text;
  msg.className = `message ${isError ? 'message-error' : 'message-success'}`;
  msg.style.display = 'block';
  setTimeout(() => { msg.style.display = 'none'; }, 3000);
}

async function initFirebase() {
  if (!firebaseConfig.apiKey || firebaseConfig.apiKey === 'YOUR_API_KEY') {
    throw new Error('Configure Firebase in js/firebase-config.js');
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

async function loadExercises() {
  const user = getCurrentUser();
  if (!user || !db) return [];
  const snapshot = await db.collection('exercises').where('user_id', '==', user.uid).get();
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

function buildGroupPicker() {
  const container = document.getElementById('routineGroupPicker');
  container.innerHTML = getAllMuscleGroups().map(mg => `
    <label class="group-check-label">
      <input type="checkbox" name="muscleGroup" value="${mg}">
      <span>${mg}</span>
    </label>
  `).join('');
}

function getSelectedGroups() {
  return Array.from(
    document.querySelectorAll('#routineGroupPicker input:checked')
  ).map(cb => cb.value);
}

function getSelectedExerciseIds() {
  return Array.from(document.querySelectorAll('#routineExercisePicker input:checked')).map(cb => cb.value);
}

function renderExercisePicker() {
  const container = document.getElementById('routineExercisePicker');
  const groups = getSelectedGroups();

  if (!groups.length) {
    container.innerHTML = '<p style="color: var(--text-secondary); font-size: 0.9rem;">Select muscle groups to load exercises.</p>';
    return;
  }

  const filtered = allExercises.filter(ex => groups.includes(ex.muscle_group));
  if (!filtered.length) {
    container.innerHTML = '<p style="color: var(--text-secondary); font-size: 0.9rem;">No saved exercises found for the selected groups.</p>';
    return;
  }

  container.innerHTML = groups.map(group => {
    const groupExercises = filtered.filter(ex => ex.muscle_group === group);
    if (!groupExercises.length) return '';
    return `
      <div class="routine-exercise-group">
        <div class="history-session-title">${group}</div>
        <div class="routine-exercise-list">
          ${groupExercises.map(ex => `
            <label class="group-check-label routine-exercise-label">
              <input type="checkbox" value="${ex.id}">
              <span>${ex.exercise_name}</span>
            </label>
          `).join('')}
        </div>
      </div>
    `;
  }).join('');
}

function renderRoutines() {
  const container = document.getElementById('routinesList');
  const routines = JSON.parse(localStorage.getItem('workoutRoutines') || '[]');

  if (!routines.length) {
    container.innerHTML = '<div class="empty-state"><p>No routines yet. Create one above!</p></div>';
    return;
  }

  container.innerHTML = routines.map((r, i) => `
    <div class="routine-card">
      <div class="routine-header">
        <span class="routine-name">${r.name}</span>
        <button type="button" class="btn btn-ghost btn-sm btn-danger" onclick="deleteRoutine('${r.id}')">Delete</button>
      </div>
      <div class="routine-groups">
        ${r.groups.map(g => `<span class="routine-group-tag">${g}</span>`).join('')}
      </div>
      <p class="routine-notes" style="margin-top:0.45rem;">${(r.exercises || []).length} selected exercise${(r.exercises || []).length === 1 ? '' : 's'}</p>
      ${r.notes ? `<p class="routine-notes">${r.notes}</p>` : ''}
      <div class="routine-actions">
        <a href="workout.html?routine=${encodeURIComponent(r.id)}" class="btn btn-primary btn-sm">▶ Start Routine</a>
      </div>
    </div>
  `).join('');
}

async function deleteRoutine(routineId) {
  const routines = JSON.parse(localStorage.getItem('workoutRoutines') || '[]');
  const routine = routines.find(r => r.id === routineId);
  if (!routine || !confirm(`Delete "${routine.name}"?`)) return;
  
  const filtered = routines.filter(r => r.id !== routineId);
  await saveRoutines(filtered);
  renderRoutines();
}

document.addEventListener('DOMContentLoaded', async () => {
  if (typeof initAuth === 'function') {
    initAuth();
    try {
		await initFirebase();
		allExercises = await loadExercises();
	} catch (err) {
		showMessage(err.message || 'Failed to load exercises.', true);
	}
  }

  buildGroupPicker();
  renderExercisePicker();
  
  // Load routines from Firebase on page load
  getRoutines().then(() => renderRoutines());

  document.querySelectorAll('#routineGroupPicker input').forEach(cb => {
	cb.addEventListener('change', renderExercisePicker);
  });

  document.getElementById('routineForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const name = document.getElementById('routineName').value.trim();
    const groups = getSelectedGroups();
    const selectedExerciseIds = getSelectedExerciseIds();
    const notes = document.getElementById('routineNotes').value.trim();

    if (!name) { showMessage('Enter a routine name.', true); return; }
    if (!groups.length) { showMessage('Select at least one muscle group.', true); return; }
    if (!selectedExerciseIds.length) { showMessage('Select at least one exercise.', true); return; }

    const exercises = allExercises
	  .filter(ex => selectedExerciseIds.includes(ex.id))
    .map(ex => ({
    id: ex.id,
    exercise_name: ex.exercise_name,
    muscle_group: ex.muscle_group,
    weight_mode: ex.weight_mode === 'per_side' ? 'per_side' : 'total'
    }));

    const routines = JSON.parse(localStorage.getItem('workoutRoutines') || '[]');
    routines.push({
		id: `routine_${Date.now()}`,
		name,
		groups,
		exercises,
		notes,
		created: new Date().toISOString()
	});
    await saveRoutines(routines);
    showMessage(`"${name}" saved!`);

    document.getElementById('routineName').value = '';
    document.getElementById('routineNotes').value = '';
    document.querySelectorAll('#routineGroupPicker input').forEach(cb => cb.checked = false);
    renderExercisePicker();
    renderRoutines();
  });
});
