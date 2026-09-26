// Difficulty presets and Custom Difficulty parameters (launch notes 07-23 / 08-12, patch 08-18,
// guide "弹尽粮绝难度零重生攻略": hardest preset gives ~6.5h of prep and only $700 base funds).
export const DIFFICULTIES = {
  relaxed: {
    name: { en: 'Relaxed', zh: '轻松' },
    desc: { en: 'A peaceful post-apocalyptic farming sim. Weak hordes, generous supplies.', zh: '悠闲的末日种田。尸潮弱，物资充足。' },
    prepHours: 11,
    funds: 1.3,
    zombieStrength: 0.55,
    supply: 1.4,
    decay: 0.75,
    extremeWeather: 0.5,
    pointsMult: 1.2,
  },
  normal: {
    name: { en: 'Normal', zh: '普通' },
    desc: { en: 'The intended experience.', zh: '标准体验。' },
    prepHours: 10,
    funds: 1,
    zombieStrength: 1,
    supply: 1,
    decay: 1,
    extremeWeather: 1,
    pointsMult: 1,
  },
  hard: {
    name: { en: 'Hard', zh: '困难' },
    desc: { en: 'Less time, less money, hungrier dead.', zh: '时间更少，钱更少，丧尸更凶。' },
    prepHours: 8,
    funds: 0.85,
    zombieStrength: 1.35,
    supply: 0.8,
    decay: 1.2,
    extremeWeather: 1.3,
    pointsMult: 1.15,
  },
  outOfAmmo: {
    name: { en: 'Out of Ammo and Food', zh: '弹尽粮绝' },
    desc: { en: 'The hardcore gauntlet: 6.5 hours, $700, relentless hordes.', zh: '硬核挑战：6.5小时准备，700元资金，尸潮不断。' },
    prepHours: 6.5,
    funds: 0.7,
    zombieStrength: 1.7,
    supply: 0.65,
    decay: 1.35,
    extremeWeather: 1.6,
    pointsMult: 1.3,
  },
};

export const CUSTOM_RANGES = {
  prepHours: { min: 4, max: 14, step: 0.5, label: { en: 'Preparation time (h)', zh: '准备时间（小时）' } },
  funds: { min: 0.5, max: 2, step: 0.1, label: { en: 'Starting funds', zh: '初始资金' } },
  zombieStrength: { min: 0.3, max: 2.5, step: 0.1, label: { en: 'Zombie strength', zh: '丧尸强度' } },
  supply: { min: 0.3, max: 2, step: 0.1, label: { en: 'Supply abundance', zh: '物资丰富度' } },
  decay: { min: 0.3, max: 2, step: 0.1, label: { en: 'Spoilage speed', zh: '腐坏速度' } },
  extremeWeather: { min: 0, max: 2, step: 0.1, label: { en: 'Extreme weather frequency', zh: '极端天气频率' } },
};

export function resolveDifficulty(id, custom) {
  const base = DIFFICULTIES[id] || DIFFICULTIES.normal;
  return { id: DIFFICULTIES[id] ? id : 'custom', ...base, ...(custom || {}) };
}
