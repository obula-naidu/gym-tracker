const MUSCLE_GROUPS = ['Back', 'Biceps', 'Legs', 'Shoulders', 'Abs', 'Chest', 'Triceps'];

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
  const doc = {
    user_id: user.uid,
    muscle_group: muscleGroup,
    exercise_name: exerciseName.trim()
  };
  await db.collection('exercises').add(doc);
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
      ${filtered.map(e => `<li><span>${e.exercise_name}</span></li>`).join('')}
    </ul>
  `;
}

let allExercises = [];

function setupListeners() {
  const muscleSelect = document.getElementById('muscleGroup');
  muscleSelect.addEventListener('change', () => renderExerciseList(allExercises));
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

  const defaultGroup = getDefaultMuscleGroupForDay();
  if (defaultGroup) {
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
