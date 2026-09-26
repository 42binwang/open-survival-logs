import { pickLang } from '../engine/i18n.js';

export const WEATHER_LABELS = {
  sunny: { en: '☀ Sunny', zh: '☀ 晴' },
  cloudy: { en: '☁ Cloudy', zh: '☁ 阴' },
  rain: { en: '🌧 Rain', zh: '🌧 雨' },
  heavyRain: { en: '🌧 Heavy Rain', zh: '🌧 大雨' },
  storm: { en: '⛈ Thunderstorm', zh: '⛈ 雷暴' },
  snow: { en: '❄ Snow', zh: '❄ 雪' },
  freezingRain: { en: '🌨 Freezing Rain', zh: '🌨 冻雨' },
  coldWave: { en: '🥶 Cold Wave', zh: '🥶 寒潮' },
};

export function weatherLabel(kind) {
  return pickLang(WEATHER_LABELS[kind] || { en: kind, zh: kind });
}
