/**
 * Day-based default muscle group selection.
 * Mon: Legs | Tue: Chest+Triceps | Wed: Back+Biceps | Thu: Shoulders+Abs | Fri: Compound
 * User can change the selection. Defaults to first of the pair for multi-group days.
 */
function getDefaultMuscleGroupForDay() {
  const day = new Date().getDay(); // 0=Sun, 1=Mon, ..., 6=Sat
  const defaults = {
    1: 'Legs',        // Monday
    2: 'Chest',       // Tuesday (Chest and Triceps)
    3: 'Back',        // Wednesday (Back and Biceps)
    4: 'Shoulders',   // Thursday (Shoulders and Abs)
    5: 'Compound'     // Friday
  };
  return defaults[day] || '';
}
