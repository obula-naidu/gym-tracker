/**
 * Dashboard stats loader for index.html.
 * Loads last-60-days workout logs once and computes:
 *  - Sessions this month
 *  - Days trained this week (Mon-Sun)
 *  - Current consecutive-day streak
 *  - Total volume this week (kg×reps)
 */

async function loadDashboardStats(db) {
  const user = getCurrentUser();
  if (!user || !db) return null;

  function getSetVolume(log) {
    const weight = parseFloat(log.weight) || 0;
    const reps = parseInt(log.reps, 10) || 0;
    const multiplier = log.weight_mode === 'per_side' ? 2 : 1;
    return weight * reps * multiplier;
  }

  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);

  // 60 days ago for streak
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 60);
  const cutoffStr = cutoff.toISOString().slice(0, 10);

  let docs = [];
  try {
    const snap = await db.collection('workout_logs')
      .where('user_id', '==', user.uid)
      .where('date', '>=', cutoffStr)
      .orderBy('date', 'desc')
      .get();
    docs = snap.docs.map(d => d.data());
  } catch (err) {
    // Fallback: no index yet
    try {
      const fallback = await db.collection('workout_logs')
        .where('user_id', '==', user.uid)
        .get();
      docs = fallback.docs.map(d => d.data()).filter(d => (d.date || '') >= cutoffStr);
    } catch (e) {
      return null;
    }
  }

  // Unique dates set
  const allDates = new Set(docs.map(d => d.date).filter(Boolean));

  // This month
  const monthPrefix = todayStr.slice(0, 7); // YYYY-MM
  const sessionsThisMonth = new Set(
    [...allDates].filter(d => d.startsWith(monthPrefix))
  ).size;

  // This week (Mon–Sun of current week)
  const dow = today.getDay(); // 0=Sun
  const monday = new Date(today);
  monday.setDate(today.getDate() - ((dow + 6) % 7));
  const mondayStr = monday.toISOString().slice(0, 10);
  const daysThisWeek = new Set(
    [...allDates].filter(d => d >= mondayStr && d <= todayStr)
  ).size;

  // Volume this week
  const weekDocs = docs.filter(d => (d.date || '') >= mondayStr && (d.date || '') <= todayStr);
  const volumeThisWeek = Math.round(
    weekDocs.reduce((sum, d) => sum + getSetVolume(d), 0)
  );

  // Current streak: consecutive days from today backwards
  let streak = 0;
  const check = new Date(today);
  while (true) {
    const dateStr = check.toISOString().slice(0, 10);
    if (allDates.has(dateStr)) {
      streak++;
      check.setDate(check.getDate() - 1);
    } else {
      // Allow today to be missed (still building streak)
      if (dateStr === todayStr) {
        check.setDate(check.getDate() - 1);
        // Check yesterday
        const yd = check.toISOString().slice(0, 10);
        if (allDates.has(yd)) {
          // streak starts from yesterday
          streak++;
          check.setDate(check.getDate() - 1);
          continue;
        }
      }
      break;
    }
  }

  return { sessionsThisMonth, daysThisWeek, volumeThisWeek, streak };
}

function renderDashboardStats(stats) {
  const el = document.getElementById('dashboardStats');
  if (!el) return;
  if (!stats) {
    el.innerHTML = '<p style="color:var(--text-secondary);font-size:0.85rem;">Stats unavailable.</p>';
    return;
  }
  const unit = getWeightUnit();
  const volStr = stats.volumeThisWeek > 0
    ? stats.volumeThisWeek >= 1000
      ? `${(stats.volumeThisWeek / 1000).toFixed(1)}k`
      : String(stats.volumeThisWeek)
    : '0';
  el.innerHTML = `
    <div class="stats-grid">
      <div class="stat-item">
        <span class="stat-value">${stats.sessionsThisMonth}</span>
        <span class="stat-label">Sessions this month</span>
      </div>
      <div class="stat-item">
        <span class="stat-value">${stats.daysThisWeek}<span style="font-size:1rem;color:var(--text-secondary)">/7</span></span>
        <span class="stat-label">Days this week</span>
      </div>
      <div class="stat-item">
        <span class="stat-value"><span class="streak-fire">${stats.streak > 0 ? '🔥' : ''}</span>${stats.streak}</span>
        <span class="stat-label">Day streak</span>
      </div>
      <div class="stat-item">
        <span class="stat-value">${volStr}</span>
        <span class="stat-label">Volume this week (${unit})</span>
      </div>
    </div>
  `;
}
