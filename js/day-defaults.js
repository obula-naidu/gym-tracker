/**
 * Day-based default workout mapping (muscle group or routine).
 * Stored in Firebase, cached in localStorage for quick access
 */
const DAY_WORKOUT_MAPPING_KEY = 'dayWorkoutMappings';

function getWeekdayOptions() {
  return [
    { index: 0, label: 'Sunday' },
    { index: 1, label: 'Monday' },
    { index: 2, label: 'Tuesday' },
    { index: 3, label: 'Wednesday' },
    { index: 4, label: 'Thursday' },
    { index: 5, label: 'Friday' },
    { index: 6, label: 'Saturday' }
  ];
}

function getBuiltInDayWorkoutDefaults() {
  return {
    1: { mode: 'group', group: 'Legs' },
    2: { mode: 'group', group: 'Chest' },
    3: { mode: 'group', group: 'Back' },
    4: { mode: 'group', group: 'Shoulders' },
    5: { mode: 'group', group: 'Compound' }
  };
}

async function getSavedDayWorkoutMappings() {
  // Try Firebase first
  try {
    const user = typeof getCurrentUser === 'function' ? getCurrentUser() : null;
    if (user && typeof firebase !== 'undefined' && firebase.firestore) {
      const db = firebase.firestore();
      const doc = await db.collection('userDayMappings').doc(user.uid).get();
      if (doc.exists) {
        const mappings = doc.data().mappings || {};
        // Cache in localStorage
        localStorage.setItem(DAY_WORKOUT_MAPPING_KEY, JSON.stringify(mappings));
        return mappings;
      }
    }
  } catch (e) {
    console.warn('Could not load day mappings from Firebase:', e);
  }
  
  // Fallback to localStorage
  try {
    const raw = JSON.parse(localStorage.getItem(DAY_WORKOUT_MAPPING_KEY) || '{}');
    return raw && typeof raw === 'object' ? raw : {};
  } catch (e) {
    return {};
  }
}

async function setSavedDayWorkoutMappings(mappings) {
  // Cache in localStorage
  localStorage.setItem(DAY_WORKOUT_MAPPING_KEY, JSON.stringify(mappings || {}));
  
  // Save to Firebase
  try {
    const user = typeof getCurrentUser === 'function' ? getCurrentUser() : null;
    if (user && typeof firebase !== 'undefined' && firebase.firestore) {
      const db = firebase.firestore();
      await db.collection('userDayMappings').doc(user.uid).set({
        mappings: mappings || {},
        updated: new Date().toISOString()
      });
    }
  } catch (e) {
    console.warn('Could not save day mappings to Firebase:', e);
  }
}

async function getDefaultWorkoutPlanForDay(dayIndex = new Date().getDay()) {
  const key = String(dayIndex);
  const saved = await getSavedDayWorkoutMappings();
  const mapped = saved[key];

  if (mapped && mapped.mode === 'routine' && mapped.routineId) {
    return { mode: 'routine', routineId: mapped.routineId };
  }

  if (mapped && mapped.mode === 'group' && mapped.group) {
    return { mode: 'group', group: mapped.group };
  }

  const builtin = getBuiltInDayWorkoutDefaults()[dayIndex];
  if (builtin && builtin.mode === 'group' && builtin.group) {
    return { mode: 'group', group: builtin.group };
  }

  return { mode: 'group', group: '' };
}

function getDefaultMuscleGroupForDay(dayIndex = new Date().getDay()) {
  const plan = getDefaultWorkoutPlanForDay(dayIndex);
  return plan && plan.mode === 'group' ? (plan.group || '') : '';
}
