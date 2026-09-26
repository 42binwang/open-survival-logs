// Game clock. state.clock.t counts game seconds since the loop started (the pre-disaster morning).
// The outbreak always hits at 18:00 on the first calendar day; prep time shifts the start hour.

export const HOUR = 3600;
export const DAY = 86400;
export const OUTBREAK_HOUR = 18;

// Real seconds -> game seconds per speed step. Index 0 is paused.
export const SPEED_SCALE = [0, 60, 180, 480];
export const RELAXED_SCALE = 20;

export function createClock(prepHours = 10) {
  const startHour = OUTBREAK_HOUR - prepHours;
  return {
    t: 0,
    startHour,
    outbreakAt: prepHours * HOUR,
    speed: 1,
    relaxed: false,
    autoRelax: true,
  };
}

export function absSeconds(clock) {
  return clock.startHour * HOUR + clock.t;
}

export function calendarDay(clock) {
  return Math.floor(absSeconds(clock) / DAY);
}

// Post-disaster day number: the outbreak evening is Day 1.
export function dayNumber(clock) {
  return calendarDay(clock) + 1;
}

export function hourOfDay(clock) {
  return (absSeconds(clock) % DAY) / HOUR;
}

export function isNight(clock) {
  const h = hourOfDay(clock);
  return h >= 20 || h < 6;
}

// 0 at midnight, 1 at noon: used for lighting and solar output.
export function daylight(clock) {
  const h = hourOfDay(clock);
  if (h < 5.5 || h > 19.5) return 0;
  if (h < 7) return (h - 5.5) / 1.5;
  if (h > 18) return (19.5 - h) / 1.5;
  return 1;
}

export function isPreDisaster(state) {
  return state.phase === 'pre';
}

export function secondsUntilOutbreak(state) {
  return Math.max(0, state.clock.outbreakAt - state.clock.t);
}

// Next time (absolute clock.t) that the given hour of day occurs.
export function nextHourT(clock, hour) {
  const abs = absSeconds(clock);
  const dayStart = Math.floor(abs / DAY) * DAY;
  let target = dayStart + hour * HOUR;
  if (target <= abs) target += DAY;
  return target - clock.startHour * HOUR;
}

// t at the start (00:00) of post-disaster day n.
export function dayStartT(clock, n) {
  return (n - 1) * DAY - clock.startHour * HOUR;
}

export function formatClock(clock) {
  const h = Math.floor(hourOfDay(clock));
  const m = Math.floor((absSeconds(clock) % HOUR) / 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function formatDuration(sec) {
  sec = Math.max(0, Math.round(sec));
  const h = Math.floor(sec / HOUR);
  const m = Math.floor((sec % HOUR) / 60);
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`;
  return `${m}m`;
}
