// Defense line panel (🛡, D): horde status, door/window durability, the yard defense slots (install,
// repair, locked-by-level previews), Molotovs and counterattacks. Also the thug encounter event and
// the radio broadcast that precedes a horde.
import { h, openWindow, closeWindow, isOpen, refreshWindow, bar } from './dom.js';
import { registerPanel, openPanel } from './panels.js';
import { registerToolbarButton } from './hud.js';
import { game } from '../game.js';
import { on } from '../engine/bus.js';
import { pickLang, loc } from '../engine/i18n.js';
import { itemName, furn } from '../data/db.js';
import { furnLabel, defenseLevel, packageFurniture } from '../sim/home.js';
import { homeSources } from '../sim/furnActions.js';
import { countIn } from '../sim/inventory.js';
import { PROF } from '../sim/proficiency.js';
import { formatDuration } from '../sim/time.js';
import {
  activeZombies,
  nextHorde,
  threatLevel,
  openingsInfo,
  defenseSlotsInfo,
  acceptRadioMission,
  queueMolotov,
  queueCounterattack,
  busiestOpening,
  queueInstallDefense,
  queueRepairDevice,
  underAttack,
  thugOffer,
  queueThugChoice,
  MOLOTOVS,
  DEFENSE_PACKAGES,
  DEVICE_REPAIR,
} from '../sim/horde.js';

const L = (en, zh) => pickLang({ en, zh });

const TARGET_LABEL = {
  door: { en: 'Front door', zh: '大门' },
  win1: { en: 'Window 1', zh: '窗户1' },
  win2: { en: 'Window 2', zh: '窗户2' },
  win3: { en: 'Window 3', zh: '窗户3' },
};

function statusBlock(state) {
  const cr = state.crises;
  const t = state.clock.t;
  const rows = [];
  const hd = cr.horde;
  if (hd) {
    rows.push(
      h(
        'div',
        { class: 'list-item', style: { borderColor: 'var(--bad)', flexWrap: 'wrap' } },
        h('b', { class: 'bad' }, `🧟 ${hd.label}`),
        h('span', {}, `${L('Wave', '波次')} ${hd.wave + 1}/${hd.waves.length}`),
        h('span', {}, `${activeZombies(state).length} ${L('outside', '只在门外')}`),
        h('span', { class: 'good' }, `${hd.killed}/${hd.total} ${L('killed', '击杀')}`),
        h('span', { class: 'dim' }, `${L('Retreats in', '撤退倒计时')} ${formatDuration(hd.endT - t)}`)
      )
    );
  } else {
    const n = nextHorde(state);
    if (n?.warned) rows.push(h('div', { class: 'list-item' }, h('b', { class: n.at - t < 6 * 3600 ? 'bad' : 'warn' }, `⚠ ${n.label}`), h('span', {}, `${L('Day', '第')} ${n.day}${L('', '天')}`), h('span', { class: 'dim' }, `${L('Arrives in', '距离到达')} ${formatDuration(n.at - t)}`)));
    else rows.push(h('div', { class: 'dim' }, L('No horde has been reported. Keep an ear on the radio.', '暂时没有尸潮消息，留意收音机。')));
  }
  if (state.meta.mode !== 'story') rows.push(h('div', { class: 'warn' }, `${L('Threat level', '威胁等级')} ${threatLevel(state)}`));
  if (cr.bait) rows.push(h('div', { class: 'list-item' }, h('b', { class: 'bad' }, L('🥩 Lured horde incoming', '🥩 引来的尸群正在靠近')), h('span', { class: 'dim' }, formatDuration(cr.bait.at - t))));
  const m = cr.radioMission;
  if (m?.status === 'offered') {
    rows.push(
      h(
        'div',
        { class: 'list-item' },
        h('span', {}, L('📻 Survivors on the radio ask you to hold out until their next warning.', '📻 广播里的幸存者请你坚持到他们下一次预警。')),
        h('button', { class: 'primary', onclick: () => (acceptRadioMission(state), refreshWindow('defense')) }, L('Accept', '接受'))
      )
    );
  } else if (m?.status === 'accepted') {
    rows.push(h('div', { class: 'dim' }, L('📻 Mission accepted: survive until the next horde warning for a supply drop.', '📻 已接受任务：坚持到下一次尸潮预警即可获得空投物资。')));
  }
  if (cr.thugs?.status === 'pending') rows.push(h('button', { class: 'primary', onclick: () => openPanel('thugs') }, L('🚪 Thugs at the door — respond', '🚪 暴徒在门外——应对')));
  const prof = state.progress.prof.defense;
  const need = PROF.defense.need[prof.lv] || 0;
  rows.push(
    h(
      'div',
      { class: 'row', style: { alignItems: 'center' } },
      h('span', {}, `${L('Defense Lv', '防御等级')} ${prof.lv}`),
      need ? h('div', { style: { width: '140px' } }, bar(prof.exp, need, 'hp')) : h('span', { class: 'good' }, L('MAX', '已满级')),
      need ? h('span', { class: 'dim' }, `${Math.floor(prof.exp)}/${need}`) : null
    )
  );
  return h('div', { class: 'col' }, ...rows);
}

function openingsBlock(state) {
  return h(
    'div',
    { class: 'list' },
    ...openingsInfo(state).map((o) =>
      h(
        'div',
        { class: 'list-item' },
        h('span', { style: { minWidth: '130px' } }, o.f ? furnLabel(o.f) : L('(missing)', '（缺失）')),
        h('div', { style: { width: '120px' } }, bar(o.hp, o.max, o.ratio < 0.25 ? 'life' : 'hp')),
        h('span', { class: o.ratio < 0.7 ? 'bad' : 'dim' }, `${Math.round(o.hp)}/${o.max}`),
        o.defRed > 0 ? h('span', { class: 'pill', dataset: { tip: L('Damage reduction', '减伤') } }, `-${Math.round(o.defRed * 100)}%`) : null,
        o.breached ? h('span', { class: 'tag bad' }, L('BREACHED', '已失守')) : null,
        o.attackers ? h('span', { class: 'bad' }, `🧟×${o.attackers}`) : null,
        o.exposed ? null : h('span', { class: 'dim' }, L('not facing the street', '不临街'))
      )
    )
  );
}

function stockedPackages(state) {
  const src = homeSources(state);
  return DEFENSE_PACKAGES.map((id) => [id, countIn(state, src, id)]).filter(([, n]) => n > 0);
}

function slotRow(state, s, stock, outside) {
  if (s.locked) {
    return h(
      'div',
      { class: 'list-item card locked', dataset: { tip: L(`Unlocks at Defense Lv ${s.lv}. Kill zombies and repair doors to level up.`, `防御等级${s.lv}解锁。击杀丧尸、修理门窗可提升等级。`) } },
      h('span', {}, `🔒 ${L('Defense Lv', '防御等级')} ${s.lv}`),
      h('span', { class: 'dim' }, L('preview', '预览'))
    );
  }
  if (s.f) {
    const f = s.f;
    const src = homeSources(state);
    const canFix = DEVICE_REPAIR.every(([id, n]) => countIn(state, src, id) >= n);
    return h(
      'div',
      { class: 'list-item' },
      h('span', { style: { minWidth: '120px' } }, furnLabel(f)),
      h('div', { style: { width: '90px' } }, bar(f.hp, f.maxHp, 'hp')),
      h('span', { class: 'dim' }, `${Math.round(f.hp)}/${f.maxHp}`),
      f.broken ? h('span', { class: 'tag bad' }, L('Broken', '已损坏')) : null,
      s.powered === false ? h('span', { class: 'tag bad' }, L('No power', '未通电')) : null,
      f.hp < f.maxHp
        ? h(
            'button',
            {
              disabled: canFix && !outside ? null : true,
              dataset: { tip: outside || L(`Uses ${DEVICE_REPAIR[0][1]}× ${itemName(DEVICE_REPAIR[0][0])}`, `消耗${itemName(DEVICE_REPAIR[0][0])}×${DEVICE_REPAIR[0][1]}`) },
              onclick: () => queueRepairDevice(state, f.uid),
            },
            L('Repair', '修理')
          )
        : null
    );
  }
  return h(
    'div',
    { class: 'list-item' },
    h('span', { class: 'dim', style: { minWidth: '120px' } }, L('Empty slot', '空位')),
    ...(stock.length
      ? stock.map(([pkg, n]) =>
          h(
            'button',
            {
              disabled: outside ? true : null,
              dataset: { tip: outside || loc(furn(packageFurniture(pkg))?.desc) },
              onclick: () => queueInstallDefense(state, s.slot, pkg),
            },
            `+ ${itemName(pkg)} ×${n}`
          )
        )
      : [h('span', { class: 'dim' }, L('No defense packages — craft them at the workbench.', '没有防御包裹——去工作台制造。'))])
  );
}

function defenseLineBlock(state) {
  const slots = defenseSlotsInfo(state);
  const stock = stockedPackages(state);
  const outside = underAttack(state) || state.crises.horde ? L('Too dangerous to go outside during an attack.', '丧尸正在进攻，出去太危险了。') : null;
  const groups = new Map();
  for (const s of slots) {
    if (!groups.has(s.target)) groups.set(s.target, []);
    groups.get(s.target).push(s);
  }
  return h(
    'div',
    { class: 'col' },
    ...[...groups].map(([target, list]) =>
      h('div', { class: 'col' }, h('div', { class: 'dim' }, pickLang(TARGET_LABEL[target] || { en: target, zh: target })), h('div', { class: 'list' }, ...list.map((s) => slotRow(state, s, stock, outside))))
    )
  );
}

function actionsBlock(state) {
  const src = homeSources(state);
  const fighting = underAttack(state);
  const mols = Object.keys(MOLOTOVS)
    .map(Number)
    .map((id) => [id, countIn(state, src, id)])
    .filter(([, n]) => n > 0);
  const slot = busiestOpening(state);
  return h(
    'div',
    { class: 'row', style: { flexWrap: 'wrap', alignItems: 'center' } },
    ...(mols.length
      ? mols.map(([id, n]) =>
          h(
            'button',
            { disabled: fighting ? null : true, dataset: { tip: L('Thrown at the densest group of zombies; the fire keeps burning for a few minutes.', '投向丧尸最密集处，火焰会燃烧几分钟。') }, onclick: () => queueMolotov(state, id) },
            `🔥 ${itemName(id)} ×${n}`
          )
        )
      : [h('span', { class: 'dim' }, L('No Molotovs.', '没有燃烧瓶。'))]),
    h(
      'button',
      {
        disabled: slot ? null : true,
        dataset: { tip: L('Strike through the opening at the zombies gnawing on it. Costs 10 Stamina; you may get hurt.', '隔着门窗攻击正在啃咬的丧尸。消耗10精力，可能受伤。') },
        onclick: () => queueCounterattack(state, slot),
      },
      L('⚔ Counterattack', '⚔ 反击')
    )
  );
}

registerPanel('defense', () => {
  const state = game.state;
  if (!state) return;
  let timer = null;
  openWindow('defense', {
    title: L('🛡 Defense Line', '🛡 防线'),
    width: 600,
    onClose: () => clearInterval(timer),
    build: (body) => {
      const p = state.progress;
      body.appendChild(statusBlock(state));
      body.appendChild(h('div', { class: 'sec-title' }, L('Doors & Windows', '门窗')));
      body.appendChild(openingsBlock(state));
      body.appendChild(h('div', { class: 'sec-title' }, L('Fight back', '反击')));
      body.appendChild(actionsBlock(state));
      body.appendChild(h('div', { class: 'sec-title' }, L('Defense line', '防御工事')));
      body.appendChild(defenseLineBlock(state));
      body.appendChild(
        h(
          'div',
          { class: 'dim', style: { marginTop: '8px' } },
          `${L('Kills', '击杀')} ${p.kills} · ${L('Hordes survived', '挺过尸潮')} ${p.hordesSurvived} · ${L('Crises survived', '度过危机')} ${p.crisesSurvived} · ${L('Defense Lv', '防御等级')} ${defenseLevel(state)}`
        )
      );
    },
  });
  timer = setInterval(() => (isOpen('defense') ? refreshWindow('defense') : clearInterval(timer)), 700);
});

registerPanel('thugs', () => {
  const state = game.state;
  if (!state) return;
  openWindow('thugs', {
    title: L('🚪 Someone at the door', '🚪 门外有人'),
    width: 460,
    className: 'eventbox',
    build: (body) => {
      const th = state.crises.thugs;
      if (!th || th.status !== 'pending') {
        body.appendChild(h('p', {}, th?.outcome || L('Nobody is at the door.', '门外没人。')));
        body.appendChild(h('div', { class: 'choices' }, h('button', { onclick: () => closeWindow('thugs') }, L('Close', '关闭'))));
        return;
      }
      const offer = thugOffer(state);
      body.appendChild(
        h(
          'p',
          {},
          L(
            'Fists and a crowbar hammer on the door. "We know you have food in there. Push some out and we walk away — or we come in and take it."',
            '拳头和撬棍砸在门上。"我们知道你里面有吃的。塞点出来我们就走——不然我们就自己进去拿。"'
          )
        )
      );
      body.appendChild(h('div', { class: 'dim' }, `${L('They want supplies worth', '他们要价值')} ${th.demand}${L('', '的物资')} · ${L('They lose patience in', '失去耐心倒计时')} ${formatDuration(th.deadline - state.clock.t)}`));
      body.appendChild(
        h(
          'div',
          { class: 'dim' },
          offer.ok ? `${L('You would hand over', '你将交出')}: ${offer.items.map((p) => itemName(p.id) + (p.qty > 1 ? ` ×${p.qty}` : '')).join(', ')}` : L('You do not have enough food or medicine to satisfy them.', '你没有足够的食物或药品打发他们。')
        )
      );
      const act = (choice) => {
        queueThugChoice(state, choice);
        if (choice === 'ignore') refreshWindow('thugs');
        else closeWindow('thugs');
      };
      body.appendChild(
        h(
          'div',
          { class: 'choices' },
          h('button', { disabled: offer.ok ? null : true, onclick: () => act('give') }, L('Stuff supplies out through the gap', '从门缝塞出物资')),
          h('button', { class: 'primary', onclick: () => act('fight') }, L('Counterattack (−20 Stamina, you may get hurt)', '反击（精力−20，可能受伤）')),
          h('button', { onclick: () => act('ignore') }, L('Stay quiet and wait them out', '保持安静，等他们离开'))
        )
      );
    },
  });
});

on('radioBroadcast', ({ text, horde, mission }) => {
  const state = game.state;
  if (!state) return;
  openWindow('radio-broadcast', {
    title: L('📻 Radio broadcast', '📻 广播'),
    width: 440,
    className: 'eventbox',
    build: (body) => {
      body.appendChild(h('p', {}, text));
      body.appendChild(h('div', { class: 'warn' }, `${L('Horde expected on Day', '预计尸潮：第')} ${horde.day}${L('', '天')}`));
      const offered = state.crises.radioMission?.status === 'offered' && mission;
      body.appendChild(
        h(
          'div',
          { class: 'choices' },
          offered
            ? h(
                'button',
                {
                  class: 'primary',
                  onclick: () => {
                    acceptRadioMission(state);
                    closeWindow('radio-broadcast');
                  },
                },
                L('Accept: survive until the next warning', '接受：坚持到下一次预警')
              )
            : null,
          h('button', { onclick: () => closeWindow('radio-broadcast') }, L('Close', '关闭'))
        )
      );
    },
  });
});

registerToolbarButton({
  label: () => `🛡 ${L('Defense', '防御')}`,
  key: 'D',
  panel: 'defense',
  visible: (s) => s.phase !== 'pre',
  dot: (s) => !!s.crises?.horde || s.crises?.thugs?.status === 'pending' || s.crises?.radioMission?.status === 'offered',
});

