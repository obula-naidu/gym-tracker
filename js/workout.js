/**
 * Track Workout page
 * Features: dynamic sets, rest timer, workout notes, kg/lbs unit, routines ?group= param, PR display.
 */
let db = null;

let restTimerSecondsLeft = 0;
let restTimerInterval = null;

async function initFirebase() {
	if (!firebaseConfig.apiKey || firebaseConfig.apiKey === 'YOUR_API_KEY') {
		document.getElementById('workoutContent').innerHTML =
			'<div class="message message-error">Configure Firebase: edit js/firebase-config.js with your project credentials.</div>';
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

function getTodayDate() {
	return new Date().toISOString().slice(0, 10);
}

function getSelectedWorkoutDate() {
	const input = document.getElementById('workoutDate');
	return input && input.value ? input.value : getTodayDate();
}

function getGroupFromQuery() {
	const queryGroup = new URLSearchParams(window.location.search).get('group');
	return decodeURIComponent(queryGroup || '').trim();
}

function getRoutineIdFromQuery() {
	const routineId = new URLSearchParams(window.location.search).get('routine');
	return decodeURIComponent(routineId || '').trim();
}

function getRoutineById(routineId) {
	if (!routineId) return null;
	try {
		const routines = JSON.parse(localStorage.getItem('workoutRoutines') || '[]');
		return routines.find(routine => routine.id === routineId) || null;
	} catch (e) {
		return null;
	}
}

function getAllRoutines() {
	try {
		return JSON.parse(localStorage.getItem('workoutRoutines') || '[]');
	} catch (e) {
		return [];
	}
}

function getSavedWorkoutMode() {
	const mode = localStorage.getItem('workoutMode');
	return mode === 'routine' ? 'routine' : 'group';
}

function saveWorkoutMode(mode) {
	localStorage.setItem('workoutMode', mode === 'routine' ? 'routine' : 'group');
}

function getSavedRoutineId() {
	return localStorage.getItem('selectedRoutineId') || '';
}

function saveSelectedRoutineId(routineId) {
	if (!routineId) {
		localStorage.removeItem('selectedRoutineId');
		return;
	}
	localStorage.setItem('selectedRoutineId', routineId);
}

function getSavedMuscleGroup() {
	return localStorage.getItem('selectedMuscleGroup') || '';
}

function saveSelectedMuscleGroup(muscleGroup) {
	if (!muscleGroup) {
		localStorage.removeItem('selectedMuscleGroup');
		return;
	}
	localStorage.setItem('selectedMuscleGroup', muscleGroup);
}

function getManualSelectionDate() {
	return localStorage.getItem('manualSelectionDate') || '';
}

function saveManualSelectionDate() {
	localStorage.setItem('manualSelectionDate', getTodayDate());
}

function hasManualSelectionToday() {
	return getManualSelectionDate() === getTodayDate();
}

function buildSetRow(setNum, unit, values = null, weightMode = 'total') {
	const type = (values && values.set_type) || 'working';
	const weight = values && values.weight ? values.weight : '';
	const reps = values && values.reps ? values.reps : '';
	const normalizedMode = weightMode === 'per_side' ? 'per_side' : 'total';
	const weightPlaceholder = normalizedMode === 'per_side'
		? `Weight per side (${unit})`
		: `Total weight (${unit})`;
	return `
		<div class="set-row" data-set-row="true">
			<span class="set-label">Set ${setNum}</span>
			<select class="set-type" aria-label="Set type">
				<option value="working" ${type === 'working' ? 'selected' : ''}>Working</option>
				<option value="warmup" ${type === 'warmup' ? 'selected' : ''}>Warm-up</option>
			</select>
			<input type="number" class="set-weight" step="0.5" min="0" inputmode="decimal" placeholder="${weightPlaceholder}" value="${weight}">
			<input type="number" class="set-reps" step="1" min="0" inputmode="numeric" placeholder="Reps" value="${reps}">
		</div>
	`;
}

function normalizeRows(card) {
	card.querySelectorAll('[data-set-row="true"]').forEach((row, idx) => {
		const label = row.querySelector('.set-label');
		if (label) label.textContent = `Set ${idx + 1}`;
	});
}

function collectRows(card) {
	return Array.from(card.querySelectorAll('[data-set-row="true"]')).map((row, i) => ({
		set: i + 1,
		set_type: row.querySelector('.set-type') ? row.querySelector('.set-type').value : 'working',
		weight: parseFloat(row.querySelector('.set-weight') ? row.querySelector('.set-weight').value : '0') || 0,
		reps: parseInt(row.querySelector('.set-reps') ? row.querySelector('.set-reps').value : '0', 10) || 0
	}));
}

function calculatePRAnd1RM(rows, weightMode = 'total') {
	const modeMultiplier = weightMode === 'per_side' ? 2 : 1;
	let best = null;
	let bestVolume = 0;
	let best1RM = 0;
	rows.forEach(r => {
		if (r.weight <= 0 || r.reps <= 0) return;
		const volume = r.weight * r.reps * modeMultiplier;
		if (!best || volume > bestVolume) {
			best = { weight: r.weight, reps: r.reps };
			bestVolume = volume;
		}
		const oneRm = r.weight * (1 + r.reps / 30);
		if (oneRm > best1RM) best1RM = oneRm;
	});
	return { best, oneRm: best1RM };
}

function updateExerciseStats(card) {
	const rows = collectRows(card);
	const weightMode = card.dataset.weightMode === 'per_side' ? 'per_side' : 'total';
	const stats = calculatePRAnd1RM(rows, weightMode);
	const unit = getWeightUnit();
	const prEl = card.querySelector('.pr-badge');
	const oneRmEl = card.querySelector('.one-rm-badge');

	if (prEl) {
		if (stats.best) {
			prEl.textContent = `PR: ${stats.best.weight} ${unit} × ${stats.best.reps}`;
			prEl.classList.remove('pr-empty');
		} else {
			prEl.textContent = 'PR: —';
			prEl.classList.add('pr-empty');
		}
	}

	if (oneRmEl) {
		oneRmEl.textContent = stats.oneRm > 0 ? `1RM: ${Math.round(stats.oneRm)} ${unit}` : '1RM: —';
	}
}

function setExerciseSaveState(card, isSaved) {
	const saveBtn = card.querySelector('.save-exercise-btn');
	if (!saveBtn) return;
	saveBtn.textContent = isSaved ? 'Saved' : 'Save';
	saveBtn.dataset.saved = isSaved ? 'true' : 'false';
}

async function loadExercises(muscleGroup) {
	const user = getCurrentUser();
	if (!user || !db || !muscleGroup) return [];
	try {
		const snapshot = await db
			.collection('exercises')
			.where('user_id', '==', user.uid)
			.where('muscle_group', '==', muscleGroup)
			.get();
		return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
	} catch (e) {
		const fallback = await db.collection('exercises').where('user_id', '==', user.uid).get();
		return fallback.docs
			.map(doc => ({ id: doc.id, ...doc.data() }))
			.filter(d => d.muscle_group === muscleGroup);
	}
}

async function loadAllExercises() {
	const user = getCurrentUser();
	if (!user || !db) return [];
	const snapshot = await db.collection('exercises').where('user_id', '==', user.uid).get();
	return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

function getWeightModeLabel(weightMode) {
	return weightMode === 'per_side' ? 'Per side' : 'Total';
}

function getWeightHeaderLabel(weightMode) {
	return weightMode === 'per_side' ? 'Weight / side' : 'Total weight';
}

async function loadSetsForExerciseDate(exerciseName, date) {
	const user = getCurrentUser();
	if (!user || !db) return [];
	try {
		const snap = await db.collection('workout_logs')
			.where('user_id', '==', user.uid)
			.where('exercise', '==', exerciseName)
			.where('date', '==', date)
			.get();
		return snap.docs
			.map(d => ({ id: d.id, ...d.data() }))
			.sort((a, b) => (parseInt(a.set, 10) || 0) - (parseInt(b.set, 10) || 0));
	} catch (e) {
		const fallback = await db.collection('workout_logs').where('user_id', '==', user.uid).get();
		return fallback.docs
			.map(d => ({ id: d.id, ...d.data() }))
			.filter(d => d.exercise === exerciseName && d.date === date)
			.sort((a, b) => (parseInt(a.set, 10) || 0) - (parseInt(b.set, 10) || 0));
	}
}

async function loadExerciseNote(exerciseName, date) {
	const user = getCurrentUser();
	if (!user || !db) return '';
	try {
		const snap = await db.collection('workout_notes')
			.where('user_id', '==', user.uid)
			.where('exercise', '==', exerciseName)
			.where('date', '==', date)
			.limit(1)
			.get();
		if (snap.empty) return '';
		return snap.docs[0].data().note || '';
	} catch (e) {
		return '';
	}
}

async function upsertExerciseNote(exerciseName, date, note) {
	const user = getCurrentUser();
	if (!user || !db) throw new Error('Not signed in');
	const trimmed = (note || '').trim();
	const snap = await db.collection('workout_notes')
		.where('user_id', '==', user.uid)
		.where('exercise', '==', exerciseName)
		.where('date', '==', date)
		.limit(1)
		.get();

	if (!trimmed) {
		if (!snap.empty) await snap.docs[0].ref.delete();
		return;
	}

	if (!snap.empty) {
		await snap.docs[0].ref.update({ note: trimmed, updated_at: Date.now() });
		return;
	}

	await db.collection('workout_notes').add({
		user_id: user.uid,
		exercise: exerciseName,
		date,
		note: trimmed,
		created_at: Date.now()
	});
}

async function replaceSetsForExerciseDate(muscleGroup, exerciseName, date, rows, weightMode = 'total') {
	const user = getCurrentUser();
	if (!user || !db) throw new Error('Not signed in');

	const existing = await db.collection('workout_logs')
		.where('user_id', '==', user.uid)
		.where('exercise', '==', exerciseName)
		.where('date', '==', date)
		.get();

	if (!existing.empty) {
		for (let i = 0; i < existing.docs.length; i += 500) {
			const batch = db.batch();
			existing.docs.slice(i, i + 500).forEach(doc => batch.delete(doc.ref));
			await batch.commit();
		}
	}

	const validRows = rows.filter(r => r.weight > 0 || r.reps > 0);
	if (!validRows.length) return;

	for (let i = 0; i < validRows.length; i += 500) {
		const batch = db.batch();
		validRows.slice(i, i + 500).forEach(r => {
			const ref = db.collection('workout_logs').doc();
			batch.set(ref, {
				user_id: user.uid,
				date,
				muscle_group: muscleGroup,
				exercise: exerciseName,
				weight_mode: weightMode === 'per_side' ? 'per_side' : 'total',
				set: r.set,
				set_type: r.set_type || 'working',
				weight: r.weight,
				reps: r.reps
			});
		});
		await batch.commit();
	}
}

async function deleteSetsForExerciseDate(exerciseName, date) {
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

	await upsertExerciseNote(exerciseName, date, '');
}

function attachSetRowListeners(card) {
	function mirrorWeightAcrossEmptySets(sourceInput) {
		if (!sourceInput || sourceInput.className.indexOf('set-weight') === -1) return;
		const sourceValue = sourceInput.value.trim();
		if (!sourceValue) return;

		card.querySelectorAll('.set-weight').forEach(weightInput => {
			if (weightInput === sourceInput) return;
			if (weightInput.value.trim()) return;
			weightInput.value = sourceValue;
		});
	}

	card.querySelectorAll('.set-weight, .set-reps, .set-type').forEach(el => {
		el.addEventListener('input', () => {
			updateExerciseStats(card);
			setExerciseSaveState(card, false);
		});
		el.addEventListener('change', () => {
			updateExerciseStats(card);
			setExerciseSaveState(card, false);
		});

		if (el.classList.contains('set-weight')) {
			el.addEventListener('change', () => {
				mirrorWeightAcrossEmptySets(el);
				updateExerciseStats(card);
				setExerciseSaveState(card, false);
			});
			el.addEventListener('blur', () => {
				mirrorWeightAcrossEmptySets(el);
				updateExerciseStats(card);
				setExerciseSaveState(card, false);
			});
		}
	});
}

function renderExerciseCard(exercise, existingSets, note) {
	const unit = getWeightUnit();
	const weightMode = exercise.weight_mode === 'per_side' ? 'per_side' : 'total';
	const card = document.createElement('div');
	card.className = 'card';
	card.dataset.exerciseName = exercise.exercise_name;
	card.dataset.muscleGroup = exercise.muscle_group || '';
	card.dataset.weightMode = weightMode;

	const initialRows = existingSets && existingSets.length
		? existingSets
		: [{}, {}, {}];
	const hasSavedData = (existingSets && existingSets.length > 0) || Boolean((note || '').trim());

	card.innerHTML = `
		<div class="card-header">
			<div class="exercise-header-left">
				<span class="exercise-name">${exercise.exercise_name}</span>
				<span class="exercise-mode-line">Weight Tracking: ${getWeightModeLabel(weightMode)}</span>
				<span class="pr-badge pr-empty">PR: —</span>
				<span class="pr-badge one-rm-badge">1RM: —</span>
			</div>
			<a href="analysis.html?exercise=${encodeURIComponent(exercise.exercise_name)}" class="btn btn-ghost btn-sm">Analysis</a>
		</div>

		<div class="set-row set-row-header" aria-hidden="true">
			<span class="set-label"></span>
			<span class="set-col-header">Type</span>
			<span class="set-col-header">${getWeightHeaderLabel(weightMode)}</span>
			<span class="set-col-header">Reps</span>
		</div>

		<div class="set-rows-wrap">
			${initialRows.map((row, idx) => buildSetRow(idx + 1, unit, row, weightMode)).join('')}
		</div>

		<div class="form-group workout-note-group" style="margin-top:0.75rem;">
			<label>Workout note (optional)</label>
			<textarea class="notes-input exercise-note" rows="2" placeholder="How did this feel today?">${note || ''}</textarea>
		</div>

		<div class="action-row">
			<button type="button" class="btn btn-ghost btn-sm add-set-btn">+ Add set</button>
			<button type="button" class="btn btn-ghost btn-sm remove-set-btn">− Remove set</button>
			<button type="button" class="btn btn-primary btn-sm save-exercise-btn">${hasSavedData ? 'Saved' : 'Save'}</button>
			<button type="button" class="btn btn-ghost btn-sm btn-danger clear-exercise-btn">Clear date</button>
		</div>
	`;

	const wrap = card.querySelector('.set-rows-wrap');

	card.querySelector('.add-set-btn').addEventListener('click', () => {
		const current = wrap.querySelectorAll('[data-set-row="true"]').length;
		wrap.insertAdjacentHTML('beforeend', buildSetRow(current + 1, unit, null, weightMode));
		normalizeRows(card);
		attachSetRowListeners(card);
	});

	card.querySelector('.remove-set-btn').addEventListener('click', () => {
		const rows = wrap.querySelectorAll('[data-set-row="true"]');
		if (rows.length <= 1) return;
		rows[rows.length - 1].remove();
		normalizeRows(card);
		updateExerciseStats(card);
	});

	card.querySelector('.save-exercise-btn').addEventListener('click', async (e) => {
		const btn = e.currentTarget;
		const muscleGroup = card.dataset.muscleGroup || document.getElementById('muscleGroup').value;
		const date = getSelectedWorkoutDate();
		const rows = collectRows(card);
		const noteValue = card.querySelector('.exercise-note').value;

		btn.disabled = true;
		btn.textContent = 'Saving…';
		try {
			await replaceSetsForExerciseDate(muscleGroup, exercise.exercise_name, date, rows, weightMode);
			await upsertExerciseNote(exercise.exercise_name, date, noteValue);
			updateExerciseStats(card);
			setExerciseSaveState(card, true);
			showMessage(`${exercise.exercise_name} saved for ${date}`);
		} catch (err) {
			showMessage('Failed to save: ' + (err.message || err), true);
		} finally {
			btn.disabled = false;
			if (btn.textContent === 'Saving…') setExerciseSaveState(card, false);
		}
	});

	card.querySelector('.clear-exercise-btn').addEventListener('click', async (e) => {
		const btn = e.currentTarget;
		const date = getSelectedWorkoutDate();
		if (!confirm(`Delete all sets for ${exercise.exercise_name} on ${date}?`)) return;

		btn.disabled = true;
		btn.textContent = 'Clearing…';
		try {
			await deleteSetsForExerciseDate(exercise.exercise_name, date);
			const setWrap = card.querySelector('.set-rows-wrap');
			setWrap.innerHTML = [1, 2, 3].map(i => buildSetRow(i, unit, null, weightMode)).join('');
			card.querySelector('.exercise-note').value = '';
			attachSetRowListeners(card);
			updateExerciseStats(card);
			setExerciseSaveState(card, false);
			showMessage(`${exercise.exercise_name} cleared for ${date}`);
		} catch (err) {
			showMessage('Failed to clear: ' + (err.message || err), true);
		} finally {
			btn.disabled = false;
			btn.textContent = 'Clear date';
		}
	});

	card.querySelector('.exercise-note').addEventListener('input', () => {
		setExerciseSaveState(card, false);
	});

	attachSetRowListeners(card);
	updateExerciseStats(card);
	setExerciseSaveState(card, hasSavedData);
	return card;
}

async function renderWorkout(muscleGroup, routine = null) {
	const container = document.getElementById('workoutContent');
	if (!muscleGroup && !routine) {
		container.innerHTML = '<div class="empty-state"><p>Select a muscle group to load exercises and start tracking</p></div>';
		return;
	}

	container.innerHTML = '<div class="loading">Loading exercises…</div>';

	try {
		let exercises = [];
		if (routine) {
			const latestExercises = await loadAllExercises();
			const latestById = new Map(latestExercises.map(ex => [ex.id, ex]));
			exercises = (routine.exercises || []).map(ex => {
				const latest = ex.id ? latestById.get(ex.id) : null;
				return {
					id: ex.id || `${ex.muscle_group}-${ex.exercise_name}`,
					exercise_name: latest?.exercise_name || ex.exercise_name,
					muscle_group: latest?.muscle_group || ex.muscle_group,
					weight_mode: latest?.weight_mode || ex.weight_mode || 'total'
				};
			});
		} else {
			exercises = await loadExercises(muscleGroup);
		}
		if (!exercises.length) {
			container.innerHTML = `<div class="empty-state"><p>${routine ? 'No exercises found for this routine.' : 'No exercises found for this group.'}</p><p><a href="add-exercise.html" style="color:var(--accent);">Add exercises</a> first.</p></div>`;
			return;
		}

		const date = getSelectedWorkoutDate();
		const fragment = document.createDocumentFragment();

		if (routine) {
			const routineInfo = document.createElement('div');
			routineInfo.className = 'card';
			routineInfo.innerHTML = `
				<h2 style="margin-bottom:0.5rem;">Routine: ${routine.name}</h2>
				<p style="color: var(--text-secondary); margin-bottom: ${routine.notes ? '0.5rem' : '0'};">${(routine.exercises || []).length} exercise${(routine.exercises || []).length === 1 ? '' : 's'} loaded from this routine.</p>
				${routine.notes ? `<p style="color: var(--text-secondary);">${routine.notes}</p>` : ''}
			`;
			fragment.appendChild(routineInfo);
		}

		for (const ex of exercises) {
			const [sets, note] = await Promise.all([
				loadSetsForExerciseDate(ex.exercise_name, date),
				loadExerciseNote(ex.exercise_name, date)
			]);
			fragment.appendChild(renderExerciseCard(ex, sets, note));
		}

		container.innerHTML = '';
		container.appendChild(fragment);
	} catch (err) {
		container.innerHTML = `<div class="message message-error">Failed to load exercises: ${err.message || err}</div>`;
	}
}

function setupRestTimer() {
	const display = document.getElementById('restTimerDisplay');
	const startBtn = document.getElementById('restStartBtn');
	const stopBtn = document.getElementById('restStopBtn');

	function playRestCompleteSound() {
		try {
			const Ctx = window.AudioContext || window.webkitAudioContext;
			if (!Ctx) return;
			const ctx = new Ctx();
			const now = ctx.currentTime;

			[0, 0.22, 0.44].forEach((offset, i) => {
				const osc = ctx.createOscillator();
				const gain = ctx.createGain();
				osc.type = 'sine';
				osc.frequency.value = i % 2 === 0 ? 880 : 660;
				gain.gain.setValueAtTime(0.0001, now + offset);
				gain.gain.exponentialRampToValueAtTime(0.2, now + offset + 0.02);
				gain.gain.exponentialRampToValueAtTime(0.0001, now + offset + 0.18);
				osc.connect(gain);
				gain.connect(ctx.destination);
				osc.start(now + offset);
				osc.stop(now + offset + 0.2);
			});
		} catch (e) {
			// silent fallback
		}
	}

	function render() {
		const mins = Math.floor(restTimerSecondsLeft / 60);
		const secs = restTimerSecondsLeft % 60;
		display.textContent = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
	}

	function stopTimer() {
		if (restTimerInterval) {
			clearInterval(restTimerInterval);
			restTimerInterval = null;
		}
		restTimerSecondsLeft = getRestDuration();
		render();
	}

	function startTimer() {
		if (restTimerInterval) return;
		if (restTimerSecondsLeft <= 0) restTimerSecondsLeft = getRestDuration();

		restTimerInterval = setInterval(() => {
			restTimerSecondsLeft -= 1;
			render();
			if (restTimerSecondsLeft <= 0) {
				clearInterval(restTimerInterval);
				restTimerInterval = null;
				playRestCompleteSound();
				if (navigator.vibrate) navigator.vibrate([200, 100, 250]);
				if (document.hidden && 'Notification' in window && Notification.permission === 'granted') {
					new Notification('Fit Pulse', { body: 'Rest complete. Next set!' });
				} else {
					alert('Rest complete. Next set!');
				}
			}
		}, 1000);
	}

	restTimerSecondsLeft = getRestDuration();
	render();
	startBtn.addEventListener('click', startTimer);
	stopBtn.addEventListener('click', stopTimer);
}

function populateMuscleGroups(selectEl) {
	const current = selectEl.value;
	const groups = getAllMuscleGroups();
	selectEl.innerHTML = '<option value="">Select muscle group</option>' +
		groups.map(g => `<option value="${g}">${g}</option>`).join('');

	if (current && groups.includes(current)) {
		selectEl.value = current;
	}
}

function populateRoutineOptions(selectEl, selectedId = '') {
	const routines = getAllRoutines();
	selectEl.innerHTML = '<option value="">Select routine</option>' +
		routines.map(routine => `<option value="${routine.id}">${routine.name}</option>`).join('');
	if (selectedId && routines.some(routine => routine.id === selectedId)) {
		selectEl.value = selectedId;
	}
}

function setWorkoutMode(mode) {
	const groupBtn = document.getElementById('modeGroupBtn');
	const routineBtn = document.getElementById('modeRoutineBtn');
	const muscleGroupControl = document.getElementById('muscleGroupControl');
	const routineControl = document.getElementById('routineControl');
	const createRoutineLink = document.getElementById('createRoutineLink');
	const normalized = mode === 'routine' ? 'routine' : 'group';

	if (groupBtn) groupBtn.classList.toggle('active', normalized === 'group');
	if (routineBtn) routineBtn.classList.toggle('active', normalized === 'routine');
	if (muscleGroupControl) muscleGroupControl.style.display = normalized === 'group' ? '' : 'none';
	if (routineControl) routineControl.style.display = normalized === 'routine' ? '' : 'none';
	if (createRoutineLink) createRoutineLink.style.display = normalized === 'routine' ? 'inline-flex' : 'none';

	return normalized;
}

document.addEventListener('DOMContentLoaded', async () => {
	if (!(await initFirebase())) return;

	const dateInput = document.getElementById('workoutDate');
	const muscleSelect = document.getElementById('muscleGroup');
	const routineSelect = document.getElementById('routineSelect');
	const historyLink = document.getElementById('viewHistoryLink');
	const modeGroupBtn = document.getElementById('modeGroupBtn');
	const modeRoutineBtn = document.getElementById('modeRoutineBtn');
	const today = getTodayDate();
	const routineId = getRoutineIdFromQuery();
	const savedRoutineId = getSavedRoutineId();
	const savedMuscleGroup = getSavedMuscleGroup();
	let routine = getRoutineById(routineId || savedRoutineId);
	let workoutMode = routineId ? 'routine' : getSavedWorkoutMode();

	dateInput.max = today;
	const queryDate = new URLSearchParams(window.location.search).get('date');
	dateInput.value = queryDate || today;

	populateMuscleGroups(muscleSelect);
	populateRoutineOptions(routineSelect, routineId || savedRoutineId);

	const queryGroup = getGroupFromQuery();
	const hasQueryRoutine = Boolean(routineId && routine);
	const hasQueryGroup = Boolean(queryGroup && getAllMuscleGroups().includes(queryGroup));
	
	let dayPlan = null;
	if (!hasQueryRoutine && !hasQueryGroup && !hasManualSelectionToday() && typeof getDefaultWorkoutPlanForDay === 'function') {
		try {
			dayPlan = await getDefaultWorkoutPlanForDay();
		} catch (e) {
			console.warn('Error loading day plan:', e);
			dayPlan = null;
		}
	}

	if (hasQueryRoutine) {
		workoutMode = 'routine';
		routineSelect.value = routine.id;
		saveSelectedRoutineId(routine.id);
		if (routine.groups && routine.groups.length) {
			muscleSelect.value = routine.groups[0];
		}
	} else if (hasQueryGroup) {
		workoutMode = 'group';
		muscleSelect.value = queryGroup;
		saveSelectedMuscleGroup(queryGroup);
	} else if (dayPlan && dayPlan.mode === 'routine' && dayPlan.routineId) {
		const mappedRoutine = getRoutineById(dayPlan.routineId);
		if (mappedRoutine) {
			workoutMode = 'routine';
			routine = mappedRoutine;
			routineSelect.value = mappedRoutine.id;
			saveSelectedRoutineId(mappedRoutine.id);
			if (mappedRoutine.groups && mappedRoutine.groups.length) {
				muscleSelect.value = mappedRoutine.groups[0];
			}
		}
	} else if (dayPlan && dayPlan.mode === 'group' && dayPlan.group && getAllMuscleGroups().includes(dayPlan.group)) {
		workoutMode = 'group';
		muscleSelect.value = dayPlan.group;
		saveSelectedMuscleGroup(dayPlan.group);
	} else if (workoutMode === 'routine' && savedRoutineId) {
		const savedRoutine = getRoutineById(savedRoutineId);
		if (savedRoutine) {
			routine = savedRoutine;
			routineSelect.value = savedRoutine.id;
			if (savedRoutine.groups && savedRoutine.groups.length) {
				muscleSelect.value = savedRoutine.groups[0];
			}
		}
	} else if (savedMuscleGroup && getAllMuscleGroups().includes(savedMuscleGroup)) {
		muscleSelect.value = savedMuscleGroup;
	} else {
		const defaultGroup = getDefaultMuscleGroupForDay();
		if (defaultGroup && getAllMuscleGroups().includes(defaultGroup)) {
			muscleSelect.value = defaultGroup;
		}
	}

	setWorkoutMode(workoutMode);
	saveWorkoutMode(workoutMode);

	setupRestTimer();

	function updateHistoryLink() {
		if (!historyLink) return;
		const params = new URLSearchParams();
		params.set('date', getSelectedWorkoutDate());

		if (workoutMode === 'routine') {
			const routineIdForHistory = routineSelect.value || getSavedRoutineId();
			if (routineIdForHistory) {
				params.set('scope', 'routine');
				params.set('routine', routineIdForHistory);
			}
		} else {
			const groupForHistory = muscleSelect.value;
			if (groupForHistory) {
				params.set('scope', 'group');
				params.set('group', groupForHistory);
			}
		}

		historyLink.href = `history.html?${params.toString()}`;
	}

	async function renderCurrentModeWorkout() {
		if (workoutMode === 'routine') {
			routine = getRoutineById(routineSelect.value);
			saveSelectedRoutineId(routineSelect.value);
			await renderWorkout('', routine);
			updateHistoryLink();
			return;
		}

		routine = null;
		saveSelectedMuscleGroup(muscleSelect.value);
		await renderWorkout(muscleSelect.value, null);
		updateHistoryLink();
	}

	modeGroupBtn.addEventListener('click', async () => {
		workoutMode = setWorkoutMode('group');
		saveWorkoutMode(workoutMode);
		saveManualSelectionDate();
		await renderCurrentModeWorkout();
	});

	modeRoutineBtn.addEventListener('click', async () => {
		workoutMode = setWorkoutMode('routine');
		saveWorkoutMode(workoutMode);
		saveManualSelectionDate();
		populateRoutineOptions(routineSelect, routineSelect.value);
		await renderCurrentModeWorkout();
	});

	muscleSelect.addEventListener('change', () => {
		if (workoutMode !== 'group') return;
		saveManualSelectionDate();
		renderCurrentModeWorkout();
	});

	routineSelect.addEventListener('change', () => {
		if (workoutMode !== 'routine') return;
		saveManualSelectionDate();
		renderCurrentModeWorkout();
	});

	dateInput.addEventListener('change', () => {
		updateHistoryLink();
		renderCurrentModeWorkout();
	});

	if (historyLink) {
		historyLink.addEventListener('click', () => {
			updateHistoryLink();
		});
	}

	updateHistoryLink();
	await renderCurrentModeWorkout();
});
