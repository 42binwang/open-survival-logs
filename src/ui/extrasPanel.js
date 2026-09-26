// Small HUD panels: the daily wish pick and the Mental Toughness button.
import { h, openWindow, closeWindow } from './dom.js';
import { registerPanel, openPanel } from './panels.js';
import { registerToolbarButton } from './hud.js';
import { game } from '../game.js';
import { pickLang } from '../engine/i18n.js';
import { itemName, item } from '../data/db.js';
import { chooseWish, useMentalToughness, canUseMentalToughness } from '../sim/wishes.js';
import { getMods } from '../sim/modifiers.js';
import { on } from '../engine/bus.js';
import { itemIcon } from './invgrid.js';

registerPanel('wish', () => {
  const state = game.state;
  const offer = state?.run.wishOffers;
  if (!offer) return;
  openWindow('wish', {
    title: pickLang({ en: "Today's wish", zh: '今日心愿' }),
    width: 440,
    build: (body) => {
      body.appendChild(h('div', { class: 'dim' }, pickLang({ en: 'Pick something you are craving today. Eating it grants Morale and Planning Points.', zh: '选一样今天最想吃的东西。吃到它能获得心态和生存点。' })));
      body.appendChild(
        h(
          'div',
          { class: 'cards', style: { marginTop: '8px' } },
          ...offer.ids.map((id) =>
            h(
              'div',
              { class: 'card' },
              h('div', { style: { fontSize: '26px' } }, itemIcon(item(id))),
              h('h5', {}, itemName(id)),
              h(
                'button',
                {
                  class: 'primary',
                  onclick: () => {
                    chooseWish(state, id);
                    closeWindow('wish');
                  },
                },
                pickLang({ en: 'This one', zh: '就它了' })
              )
            )
          )
        )
      );
    },
  });
});

on('wishOffer', () => setTimeout(() => game.state && openPanel('wish'), 0));

registerPanel('mentalToughness', () => {
  if (game.state) useMentalToughness(game.state);
});

registerToolbarButton({
  label: () => `🧠 ${pickLang({ en: 'Mental Toughness', zh: '心理韧性' })}`,
  key: '',
  panel: 'mentalToughness',
  visible: (s) => !!getMods(s).mentalToughness,
  dot: (s) => canUseMentalToughness(s),
});

registerToolbarButton({
  label: () => {
    const w = game.state?.run.wish;
    return w && !w.done && w.day === game.state.run.day ? `💭 ${itemName(w.items[0])}` : `💭 ${pickLang({ en: 'Wish', zh: '心愿' })}`;
  },
  key: '',
  panel: 'wish',
  visible: (s) => s.phase === 'post' && (!!s.run.wishOffers || (s.run.wish && !s.run.wish.done && s.run.wish.day === s.run.day)),
  dot: (s) => !!s.run.wishOffers,
});
