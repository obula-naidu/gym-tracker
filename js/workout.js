let db = null;

function initFirebase() {
  if (!firebaseConfig.apiKey || firebaseConfig.apiKey === 'YOUR_API_KEY') {
    document.getElementById('workoutContent').innerHTML =
      '<div class="message message-error">Configure Firebase: Edit js/firebase-config.js with your project credentials.</div>';
    return false;
  }
  firebase.initializeApp(firebaseConfig);
  db = firebase.firestore();
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
  const snapshot = await db
    .collection('exercises')
    .where('muscle_group', '==', muscleGroup)
    .get();
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

function getTodayDate() {
  const d = new Date();
  return d.toISOString().slice(0, 10);
}

async function saveSet(muscleGroup, exerciseName, setNum, weight, reps) {
  const doc = {
    date: getTodayDate(),
    muscle_group: muscleGroup,
    exercise: exerciseName,
    set: setNum,
    weight: weight ? parseFloat(weight) : 0,
    reps: reps ? parseInt(reps, 10) : 0
  };
  await db.collection('workout_logs').add(doc);
}

function createExerciseCard(exercise, muscleGroup) {
  const card = document.createElement('div');
  card.className = 'card';
  card.dataset.exercise = exercise.exercise_name;

  card.innerHTML = `
    <div class="card-header">
      <span class="exercise-name">${exercise.exercise_name}</span>
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
    <button type="button" class="btn btn-primary save-workout-btn" style="margin-top: 0.75rem;">Save Workout</button>
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
      showMessage(`Workout saved for ${exerciseName}!`);
      card.querySelectorAll('input').forEach(i => i.value = '');
    } else {
      showMessage('Enter at least one set (weight or reps)', true);
    }
  });

  return card;
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
  if (!initFirebase()) return;

  const muscleSelect = document.getElementById('muscleGroup');

  muscleSelect.addEventListener('change', async () => {
    const muscleGroup = muscleSelect.value;
    const container = document.getElementById('workoutContent');

    if (!muscleGroup) {
      container.innerHTML = '<div class="empty-state"><p>Select a muscle group to load exercises and start tracking</p></div>';
      return;
    }

    container.innerHTML = '<div class="loading">Loading exercises</div>';

    try {
      const exercises = await loadExercises(muscleGroup);
      renderWorkoutContent(exercises, muscleGroup);
    } catch (err) {
      container.innerHTML = '<div class="message message-error">Failed to load exercises. Check Firebase config.</div>';
      console.error(err);
    }
  });
});
