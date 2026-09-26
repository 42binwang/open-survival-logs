// Planning Mode panel: see every slot, install packages, move and pack up furniture.
import { h, openWindow, refreshWindows, toast } from './dom.js';
import { registerPanel } from './panels.js';
import { registerToolbarButton } from './hud.js';
import { game } from '../game.js';
import { pickLang, tr, loc } from '../engine/i18n.js';
import { furn, SLOT } from '../data/db.js';
import { allSlots, furnitureAt, furnLabel, slotUsable } from '../sim/home.js';
import { installablePackages, slotsFor, queueInstall, queueMove, queuePackUp, canPack, installTimeSec, replaceTargets, queueReplaceOpening } from '../sim/planning.js';
import { formatDuration } from '../sim/time.js';

const SLOT_NAMES = {
  [SLOT.SMALL]: { en: 'Small', zh: '小型' },
  [SLOT.MEDIUM]: { en: 'Medium', zh: '中型' },
  [SLOT.LARGE]: { en: 'Large', zh: '大型' },
  [SLOT.WALL]: { en: 'Wall', zh: '挂壁' },
  [SLOT.TABLETOP]: { en: 'Tabletop', zh: '桌上' },
  [SLOT.BED]: { en: 'Bed', zh: '床位' },
  [SLOT.DOOR]: { en: 'Door', zh: '门' },
  [SLOT.WINDOW]: { en: 'Window', zh: '窗' },
  [SLOT.DEFENSE]: { en: 'Defense Line', zh: '防线' },
};

export function slotTypeName(t) {
  return pickLang(SLOT_NAMES[t] || { en: '?', zh: '?' });
}

registerToolbarButton({ label: () => `🏠 ${tr('ui.planning')}`, key: 'N', panel: 'planning', visible: (s) => s.player.scene === 'home' });

registerPanel('planning', (ctx = {}) => {
  const state = game.state;
  if (!state || state.player.scene !== 'home') return toast(pickLang({ en: 'Planning Mode only works at home.', zh: '规划模式只能在家中使用。' }), 'bad');
  let selPkg = ctx.installUid ? installablePackages(state).find((p) => p.uid === ctx.installUid) || null : null;
  let moving = ctx.moveFurn || null;
  state.ui.planning = true;
  openWindow('planning', {
    title: tr('ui.planning'),
    width: 620,
    onClose: () => {
      state.ui.planning = false;
      game.ui.renderer.highlight.clear();
      state.ui.planSlots = null;
    },
    build: (body) => {
      const floor = state.ui.viewFloor || state.player.floor;
      const pkgs = installablePackages(state);
      const r = game.ui.renderer;
      r.highlight.clear();
      const cfg = selPkg ? selPkg.furnCfg : moving ? state.furniture[moving]?.cfg : null;
      const targets = cfg != null ? new Set(slotsFor(state, cfg).map((s) => s.id)) : null;
      const replace = selPkg ? new Set(replaceTargets(state, selPkg.furnCfg).map((s) => s.id)) : new Set();
      for (const id of replace) targets.add(id);
      state.ui.planSlots = targets;
      body.appendChild(
        h('div', { class: 'dim' }, pickLang({ en: 'Pick a package, then an empty slot on this floor. Switch floors with the tabs on the left. Small items also fit medium and large slots.', zh: '选择一个包裹，再选择本层的空位。用左侧标签切换楼层。小型家具也可以放进中型和大型位置。' }))
      );
      body.appendChild(h('div', { class: 'sec-title' }, pickLang({ en: 'Packages at home', zh: '家中的包裹' })));
      body.appendChild(
        pkgs.length
          ? h(
              'div',
              { class: 'list' },
              ...pkgs.map((p) =>
                h(
                  'div',
                  {
                    class: `list-item ${selPkg?.uid === p.uid ? 'sel' : ''}`,
                    onclick: () => {
                      selPkg = selPkg?.uid === p.uid ? null : p;
                      moving = null;
                      refreshWindows();
                    },
                  },
                  h('span', {}, loc(furn(p.furnCfg).zh)),
                  h('span', { class: 'pill' }, slotTypeName(furn(p.furnCfg).slot)),
                  h('span', { class: 'dim' }, `⏱ ${formatDuration(installTimeSec(state, p.furnCfg))}`),
                  h('span', { class: 'spacer' }),
                  h('span', { class: 'dim' }, loc(furn(p.furnCfg).desc || '').slice(0, 40))
                )
              )
            )
          : h('div', { class: 'dim' }, pickLang({ en: 'No furniture packages. Buy them at the Renovation Company or craft them at the workbench.', zh: '没有家具包裹。可以在装修公司购买，或在工作台制作。' }))
      );
      body.appendChild(h('div', { class: 'sec-title' }, `${pickLang({ en: 'Slots on', zh: '楼层' })} ${floor}`));
      const slots = allSlots(state).filter((s) => s.floor === floor);
      body.appendChild(
        h(
          'div',
          { class: 'list' },
          ...slots.map((s) => {
            const f = furnitureAt(state, s.id);
            const usable = slotUsable(state, s);
            const valid = targets?.has(s.id);
            if (valid) r.highlight.add(`slot:${s.id}`);
            if (f && moving === f.uid) r.highlight.add(f.uid);
            return h(
              'div',
              { class: `list-item ${valid ? 'sel' : ''}` },
              h('span', { class: 'pill' }, slotTypeName(s.type) + (s.trap ? ' 🪤' : '') + (s.outdoor ? ' ☀' : '')),
              f ? h('span', {}, furnLabel(f)) : h('span', { class: 'dim' }, usable ? pickLang({ en: 'empty', zh: '空' }) : s.type === SLOT.DEFENSE ? pickLang({ en: `Needs defense Lv${s.lv}`, zh: `需要防御等级${s.lv}` }) : pickLang({ en: 'locked', zh: '未解锁' })),
              h('span', { class: 'spacer' }),
              valid && selPkg
                ? h(
                    'button',
                    {
                      class: 'primary',
                      onclick: () => {
                        if (replace.has(s.id)) queueReplaceOpening(state, selPkg.invId, selPkg.uid, s.id);
                        else queueInstall(state, selPkg.invId, selPkg.uid, s.id);
                        toast(pickLang({ en: 'Queued installation', zh: '已加入安装队列' }));
                        selPkg = null;
                        refreshWindows();
                      },
                    },
                    replace.has(s.id) ? pickLang({ en: 'Replace', zh: '更换' }) : tr('ui.install')
                  )
                : null,
              valid && moving
                ? h(
                    'button',
                    {
                      class: 'primary',
                      onclick: () => {
                        queueMove(state, moving, s.id);
                        moving = null;
                        refreshWindows();
                      },
                    },
                    pickLang({ en: 'Move here', zh: '移到这里' })
                  )
                : null,
              f && !f.fixed && typeof f.cfg === 'number' && s.type !== SLOT.DOOR && s.type !== SLOT.WINDOW
                ? h(
                    'button',
                    {
                      onclick: () => {
                        moving = moving === f.uid ? null : f.uid;
                        selPkg = null;
                        refreshWindows();
                      },
                    },
                    moving === f.uid ? pickLang({ en: 'Cancel move', zh: '取消移动' }) : tr('ui.move')
                  )
                : null,
              f && canPack(f) ? h('button', { onclick: () => (queuePackUp(state, f.uid), refreshWindows()) }, pickLang({ en: 'Pack up', zh: '打包' })) : null
            );
          })
        )
      );
    },
  });
});
