// Recipe unlocks that come from surviving long enough rather than from cards, notes or exploration
// (patch 08-18: the Shredder "unlocks through events after surviving for a certain number of days").
import { registerSystem } from './tick.js';
import { emit } from '../engine/bus.js';
import { pickLang } from '../engine/i18n.js';
import { profLevel } from './proficiency.js';

export const TIMED_UNLOCKS = [
  {
    recipe: 415,
    when: (state, day) => day >= 18,
    text: { en: 'While tidying the workbench you sketch out a hand-cranked shredder. New recipe: Shredder.', zh: '整理工作台时，你画出了一台粉碎机的草图。新配方：粉碎机。' },
  },
  {
    recipe: 313,
    when: (state, day) => day >= 30 && (state.story?.tags?.advancedReinforce || profLevel(state, 'defense') >= 3 || state.loop?.ngPlus),
    text: { en: 'You work out how to double up the reinforcement plates. New recipe: Enhanced Reinforcement.', zh: '你琢磨出了双层加固板的做法。新配方：强化加固件。' },
  },
];

export function unlockRecipe(state, id) {
  const list = (state.run.unlockedRecipes ||= []);
  if (list.includes(id)) return false;
  list.push(id);
  emit('recipeUnlocked', { id });
  return true;
}

registerSystem({
  id: 'unlocks',
  order: 75,
  onDay(state, day) {
    if (state.phase !== 'post') return;
    for (const u of TIMED_UNLOCKS) {
      if (u.when(state, day) && unlockRecipe(state, u.recipe)) emit('toast', { text: pickLang(u.text), kind: 'good' });
    }
  },
});
