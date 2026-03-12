/**
 * Shared user preferences: weight unit (kg/lbs), theme (dark/light), rest timer duration, custom muscle groups.
 * weight unit/theme/rest stored in localStorage (quick access)
 * Custom muscle groups stored in Firebase (synced across devices)
 */

const BASE_MUSCLE_GROUPS = ['Back', 'Biceps', 'Legs', 'Shoulders', 'Abs', 'Chest', 'Triceps', 'Compound'];

function getWeightUnit() {
  return localStorage.getItem('weightUnit') || 'kg';
}

function setWeightUnit(unit) {
  localStorage.setItem('weightUnit', unit === 'lbs' ? 'lbs' : 'kg');
}

function getTheme() {
  return localStorage.getItem('theme') || 'dark';
}

function setTheme(theme) {
  const normalized = theme === 'light' ? 'light' : 'dark';
  localStorage.setItem('theme', normalized);
  document.documentElement.setAttribute('data-theme', normalized);
}

function applyTheme() {
  document.documentElement.setAttribute('data-theme', getTheme());
}

function getRestDuration() {
  return parseInt(localStorage.getItem('restDuration') || '90', 10);
}

function setRestDuration(seconds) {
  const value = Number.isFinite(seconds) ? Math.max(15, Math.min(600, parseInt(seconds, 10))) : 90;
  localStorage.setItem('restDuration', String(value));
}

async function getCustomMuscleGroups() {
  // Try Firebase first
  try {
    const user = typeof getCurrentUser === 'function' ? getCurrentUser() : null;
    if (user && typeof firebase !== 'undefined' && firebase.firestore) {
      const db = firebase.firestore();
      const doc = await db.collection('userMuscleGroups').doc(user.uid).get();
      if (doc.exists) {
        const groups = doc.data().groups || [];
        // Cache in localStorage
        localStorage.setItem('customMuscleGroups', JSON.stringify(groups));
        return groups;
      }
    }
  } catch (e) {
    console.warn('Could not load custom groups from Firebase:', e);
  }
  
  // Fallback to localStorage
  try {
    const parsed = JSON.parse(localStorage.getItem('customMuscleGroups') || '[]');
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map(v => String(v || '').trim())
      .filter(Boolean)
      .filter(v => !BASE_MUSCLE_GROUPS.includes(v));
  } catch (e) {
    return [];
  }
}

async function setCustomMuscleGroups(groups) {
  const cleaned = Array.from(new Set(
    (groups || [])
      .map(v => String(v || '').trim())
      .filter(Boolean)
      .filter(v => !BASE_MUSCLE_GROUPS.includes(v))
  ));
  
  // Cache in localStorage
  localStorage.setItem('customMuscleGroups', JSON.stringify(cleaned));
  
  // Save to Firebase
  try {
    const user = typeof getCurrentUser === 'function' ? getCurrentUser() : null;
    if (user && typeof firebase !== 'undefined' && firebase.firestore) {
      const db = firebase.firestore();
      await db.collection('userMuscleGroups').doc(user.uid).set({ 
        groups: cleaned,
        updated: new Date().toISOString()
      });
    }
  } catch (e) {
    console.warn('Could not save custom groups to Firebase:', e);
  }
}

async function addCustomMuscleGroup(name) {
  const trimmed = String(name || '').trim();
  if (!trimmed) return false;
  const existing = new Set([...BASE_MUSCLE_GROUPS, ...await getCustomMuscleGroups()].map(v => v.toLowerCase()));
  if (existing.has(trimmed.toLowerCase())) return false;
  const next = [...await getCustomMuscleGroups(), trimmed];
  await setCustomMuscleGroups(next);
  return true;
}

function removeCustomMuscleGroup(name) {
  const trimmed = String(name || '').trim();
  if (!trimmed) return;
  // Use cached localStorage since this is synchronous
  try {
    const parsed = JSON.parse(localStorage.getItem('customMuscleGroups') || '[]');
    const next = (Array.isArray(parsed) ? parsed : []).filter(v => v.toLowerCase() !== trimmed.toLowerCase());
    localStorage.setItem('customMuscleGroups', JSON.stringify(next));
    // Also sync to Firebase if available
    const user = typeof getCurrentUser === 'function' ? getCurrentUser() : null;
    if (user && typeof firebase !== 'undefined' && firebase.firestore) {
      const db = firebase.firestore();
      db.collection('userMuscleGroups').doc(user.uid).set({ 
        groups: next,
        updated: new Date().toISOString()
      }).catch(e => console.warn('Could not sync to Firebase:', e));
    }
  } catch (e) {
    console.warn('Error removing custom muscle group:', e);
  }
}

function getAllMuscleGroups() {
  // Returns base groups + cached custom groups from localStorage
  // For async loading of custom groups, use getCustomMuscleGroups() directly
  const cached = (() => {
    try {
      const parsed = JSON.parse(localStorage.getItem('customMuscleGroups') || '[]');
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      return [];
    }
  })();
  return [...BASE_MUSCLE_GROUPS, ...cached];
}

// Apply theme immediately on every page load
applyTheme();
