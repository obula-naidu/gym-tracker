let db = null;

async function initFirebase() {
  if (!firebaseConfig.apiKey || firebaseConfig.apiKey === 'YOUR_API_KEY') {
    document.getElementById('exerciseList').innerHTML =
      '<div class="message message-error">Configure Firebase: Edit js/firebase-config.js with your project credentials.</div>';
    document.getElementById('addBtn').disabled = true;
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

async function addExercise(muscleGroup, exerciseName) {
  const user = getCurrentUser();
  if (!user) throw new Error('Not signed in');
  const weightMode = document.getElementById('weightMode')?.value === 'per_side' ? 'per_side' : 'total';
  const doc = {
    user_id: user.uid,
    muscle_group: muscleGroup,
    exercise_name: exerciseName.trim(),
    weight_mode: weightMode
  };
  await db.collection('exercises').add(doc);
}

async function updateExercise(docId, updates) {
  await db.collection('exercises').doc(docId).update(updates);
}

async function deleteExercise(docId) {
  await db.collection('exercises').doc(docId).delete();
}

function populateMuscleGroupOptions(selectedValue = '') {
  const select = document.getElementById('muscleGroup');
  const groups = getAllMuscleGroups();
  select.innerHTML = '<option value="">Select muscle group</option>' +
    groups.map(g => `<option value="${g}">${g}</option>`).join('');
  if (selectedValue && groups.includes(selectedValue)) select.value = selectedValue;
}

function renderCustomGroups() {
  const list = document.getElementById('customGroupsList');
  const customGroups = getCustomMuscleGroups();
  if (!customGroups.length) {
    list.innerHTML = '<p style="color:var(--text-secondary); font-size:0.9rem;">No custom groups yet.</p>';
    return;
  }
  list.innerHTML = customGroups.map(group => `
    <span class="routine-group-tag" style="margin-right:0.5rem; margin-bottom:0.5rem; display:inline-flex; align-items:center; gap:0.4rem;">
      <span>${group}</span>
      <button type="button" class="btn btn-ghost btn-sm" data-remove-group="${group}" style="padding:0.15rem 0.45rem; min-height:auto;">×</button>
    </span>
  `).join('');

  list.querySelectorAll('[data-remove-group]').forEach(btn => {
    btn.addEventListener('click', () => {
      const group = btn.getAttribute('data-remove-group');
      removeCustomMuscleGroup(group);
      const current = document.getElementById('muscleGroup').value;
      populateMuscleGroupOptions(current === group ? '' : current);
      renderCustomGroups();
      renderExerciseList(allExercises);
    });
  });
}

function renderExerciseList(exercises) {
  const container = document.getElementById('exerciseList');
  const muscleGroup = document.getElementById('muscleGroup').value;

  if (!muscleGroup) {
    container.innerHTML = '<div class="empty-state"><p>Select a muscle group to view saved exercises</p></div>';
    return;
  }

  const filtered = exercises.filter(e => e.muscle_group === muscleGroup);

  if (filtered.length === 0) {
    container.innerHTML = '<div class="empty-state"><p>No exercises yet for this muscle group.</p><p>Add one above!</p></div>';
    return;
  }

  container.innerHTML = `
    <ul class="exercise-list">
      ${filtered.map(e => `
        <li data-exercise-id="${e.id}">
          <div class="exercise-list-item-main">
            <span>${e.exercise_name}</span>
            <span class="exercise-mode-badge ${e.weight_mode === 'per_side' ? 'is-per-side' : ''}">${e.weight_mode === 'per_side' ? 'Per side' : 'Total'}</span>
          </div>
          <div style="display:flex; gap:0.5rem;">
            <button type="button" class="btn btn-ghost btn-sm" data-edit-id="${e.id}">Edit</button>
            <button type="button" class="btn btn-ghost btn-sm btn-danger" data-delete-id="${e.id}">Delete</button>
          </div>
        </li>
      `).join('')}
    </ul>
  `;

  container.querySelectorAll('[data-edit-id]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.getAttribute('data-edit-id');
      const item = allExercises.find(x => x.id === id);
      if (!item) return;
      const newName = prompt('Rename exercise:', item.exercise_name);
      if (newName === null) return;
      const trimmed = newName.trim();
      if (!trimmed) return;
      const modeInput = prompt('Tracking mode: total or per_side', item.weight_mode === 'per_side' ? 'per_side' : 'total');
      if (modeInput === null) return;
      const normalizedMode = modeInput.trim().toLowerCase() === 'per_side' ? 'per_side' : 'total';
      try {
        await updateExercise(id, { exercise_name: trimmed, weight_mode: normalizedMode });
        allExercises = await loadExercises();
        renderExerciseList(allExercises);
        showMessage('Exercise renamed.');
      } catch (err) {
        showMessage('Failed to rename: ' + err.message, true);
      }
    });
  });

  container.querySelectorAll('[data-delete-id]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.getAttribute('data-delete-id');
      const item = allExercises.find(x => x.id === id);
      if (!item) return;
      if (!confirm(`Delete "${item.exercise_name}"?`)) return;
      try {
        await deleteExercise(id);
        allExercises = await loadExercises();
        renderExerciseList(allExercises);
        showMessage('Exercise deleted.');
      } catch (err) {
        showMessage('Failed to delete: ' + err.message, true);
      }
    });
  });
}

let allExercises = [];

function setupListeners() {
  const muscleSelect = document.getElementById('muscleGroup');
  muscleSelect.addEventListener('change', () => renderExerciseList(allExercises));

  const addGroupBtn = document.getElementById('addCustomGroupBtn');
  const customInput = document.getElementById('customGroupInput');
  if (addGroupBtn && customInput) {
    addGroupBtn.addEventListener('click', () => {
      const name = customInput.value.trim();
      if (!name) return;
      const added = addCustomMuscleGroup(name);
      if (!added) {
        showMessage('Group already exists.', true);
        return;
      }
      customInput.value = '';
      populateMuscleGroupOptions(name);
      renderCustomGroups();
      showMessage(`"${name}" group added.`);
    });
  }
}

async function loadExercises() {
  const user = getCurrentUser();
  if (!user) return [];
  const snapshot = await db.collection('exercises').where('user_id', '==', user.uid).get();
  return snapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data()
  }));
}

document.addEventListener('DOMContentLoaded', async () => {
  if (!(await initFirebase())) return;

  populateMuscleGroupOptions();

  const defaultGroup = getDefaultMuscleGroupForDay();
  if (defaultGroup && getAllMuscleGroups().includes(defaultGroup)) {
    const mg = document.getElementById('muscleGroup');
    if (mg) mg.value = defaultGroup;
  }

  try {
    allExercises = await loadExercises();
  } catch (err) {
    document.getElementById('exerciseList').innerHTML =
      '<div class="message message-error">Failed to load exercises. Check Firebase config and Firestore rules.</div>';
    console.error(err);
    return;
  }

  renderExerciseList(allExercises);
  renderCustomGroups();
  setupListeners();

  document.getElementById('addExerciseForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const muscleGroup = document.getElementById('muscleGroup').value;
    const exerciseName = document.getElementById('exerciseName').value.trim();
    const btn = document.getElementById('addBtn');

    if (!muscleGroup || !exerciseName) return;

    btn.disabled = true;
    try {
      await addExercise(muscleGroup, exerciseName);
      showMessage(`"${exerciseName}" added to ${muscleGroup}!`);
      document.getElementById('exerciseName').value = '';
      document.getElementById('weightMode').value = 'total';
      allExercises = await loadExercises();
      renderExerciseList(allExercises);
    } catch (err) {
      showMessage('Failed to add exercise. ' + err.message, true);
      console.error(err);
    } finally {
      btn.disabled = false;
    }
  });
});
