// Status effects on the survivor. Rates are per game hour. `mult` scales passive decay of a stat.
// Overdue-food debuffs use the config ids 1101-1105 (Config_Item.OverdueDebuff).
export const EFFECTS = {
  cold: {
    name: { en: 'Cold', zh: '寒冷' },
    desc: { en: 'Freezing. Stamina drains faster; drink something hot or warm the room.', zh: '好冷。精力消耗加快，喝点热的或者让房间暖和起来。' },
    rate: { sta: -1.5, mor: -0.8 },
    bad: true,
  },
  fever: {
    name: { en: 'Fever', zh: '发烧' },
    desc: { en: 'A cold turned into a fever. Life slowly drops until treated with fever medicine or rest.', zh: '感冒发烧了。需要退烧药或者休息，否则生命会缓慢下降。' },
    rate: { life: -1.2, sta: -1, mor: -1 },
    bad: true,
  },
  bleeding: {
    name: { en: 'Wound Bleeding', zh: '受伤流血' },
    desc: { en: 'An open wound. Life drops until bandaged.', zh: '伤口在流血，需要包扎，否则生命持续下降。' },
    rate: { life: -2 },
    bad: true,
  },
  shock: {
    name: { en: 'Shock Bleeding', zh: '震伤流血' },
    desc: { en: 'Heavy internal bleeding. Only a Military Med Kit stops it.', zh: '严重的震伤流血，只有军用医疗包能止住。' },
    rate: { life: -4, sta: -1 },
    bad: true,
  },
  anemia: {
    name: { en: 'Anemia', zh: '贫血' },
    desc: { en: 'You sold blood before the disaster. Max Stamina is lower for a few days.', zh: '灾前卖过血，最初几天精力上限降低。' },
    maxMod: { sta: -25 },
    bad: true,
  },
  mentalBlock: {
    name: { en: 'Mental Block', zh: '心理阻滞' },
    desc: { en: 'Everything feels pointless. Morale recovers at half speed.', zh: '一切都没有意义。心态恢复减半。' },
    gainMult: { mor: 0.5 },
    bad: true,
  },
  tense: {
    name: { en: 'Tense', zh: '紧张' },
    desc: { en: 'The door is about to give. No automatic eating, sleeping or leisure.', zh: '门窗快守不住了！不会自动吃饭、睡觉或娱乐。' },
    rate: { mor: -2 },
    bad: true,
  },
  caffeine: {
    name: { en: 'Caffeine', zh: '咖啡因' },
    desc: { en: 'Moving faster for a while.', zh: '一段时间内移动速度提升。' },
    moveMult: 1.25,
  },
  encumbered: {
    name: { en: 'Encumbered', zh: '超重' },
    desc: { en: 'Carrying too much. Moving drains stamina and slows you down.', zh: '背得太多了，移动变慢且消耗精力。' },
    rate: { sta: -3 },
    moveMult: 0.7,
    bad: true,
    auto: true,
  },
  insomnia: {
    name: { en: 'Insomnia', zh: '失眠' },
    desc: { en: 'Anxious thoughts. Sleep restores less stamina.', zh: '焦虑难眠，睡眠恢复的精力减少。' },
    sleepMult: 0.5,
    bad: true,
  },
  wellFed: {
    name: { en: 'Well Fed', zh: '吃饱喝足' },
    desc: { en: 'A proper meal. Morale drops slower.', zh: '好好吃了一顿，心态下降变慢。' },
    mult: { mor: 0.6 },
  },
  warm: {
    name: { en: 'Warm', zh: '温暖' },
    desc: { en: 'Toasty. Cold cannot set in.', zh: '身上暖暖的，不会着凉。' },
  },
  calm: {
    name: { en: 'Calm', zh: '冷静' },
    desc: { en: 'A good read keeps your head clear. Morale drops slower.', zh: '读了本好书，心态下降变慢。' },
    mult: { mor: 0.5 },
  },
  gourmet: {
    name: { en: 'Appetite', zh: '好胃口' },
    desc: { en: 'The cooking magazine made you hungry: food gives 30% more Satiety.', zh: '美食杂志看饿了：进食效果+30%。' },
  },
  handy: {
    name: { en: 'Handy', zh: '手巧' },
    desc: { en: 'Fresh from the repair manual: actions cost 30% less Stamina.', zh: '刚看完机械修理：精力消耗-30%。' },
  },
  sleepy: {
    name: { en: 'Drowsy', zh: '困意' },
    desc: { en: 'Bedtime stories work: sleep is 50% more efficient.', zh: '睡前故事很管用：睡眠效率+50%。' },
    sleepMult: 1.5,
  },
  elegant: {
    name: { en: 'Surviving in Style', zh: '优雅生存' },
    desc: { en: 'Morale drops 30% slower. Standards must be kept, even now.', zh: '心态下降减慢30%。越是末日，越要体面。' },
    mult: { mor: 0.7 },
  },
  // the neighbour girl's keepsakes (items 24111 and 24113, their config text)
  soothed: {
    name: { en: 'Soothed', zh: '安心' },
    desc: { en: 'Holding the girl’s hand-knitted charm: morale recovers faster.', zh: '握着女孩织的护身符：心态恢复加快。' },
    rate: { mor: 2 },
  },
  blessed: {
    name: { en: 'A Wish Made', zh: '许过愿' },
    desc: { en: 'You made a wish on the paper crane: Life slowly recovers.', zh: '对着千纸鹤许了愿：健康缓缓恢复。' },
    rate: { life: 1.5 },
  },
  firstAid: {
    name: { en: 'First-Aid Know-How', zh: '急救常识' },
    desc: { en: 'Life drains 30% slower.', zh: '生命流失减少30%。' },
    mult: { life: 0.7 },
  },
  ration: {
    name: { en: 'Wartime Rationing', zh: '战时节食' },
    desc: { en: 'Satiety drains 30% slower.', zh: '饱腹消耗减少30%。' },
    mult: { sat: 0.7 },
  },
  gameCook: {
    name: { en: 'Game Butcher', zh: '野味处理' },
    desc: { en: 'Meat and fish give 50% more Satiety.', zh: '肉类与鱼类的饱腹效果+50%。' },
  },
  hungry: {
    name: { en: 'Hungry', zh: '饥饿' },
    desc: { en: 'Satiety is low. Morale drops faster.', zh: '饱腹过低，心态下降加快。' },
    rate: { mor: -0.5 },
    bad: true,
    auto: true,
  },
  starving: {
    name: { en: 'Starving', zh: '饿坏了' },
    desc: { en: 'No food left in you. Life is draining.', zh: '饿得不行了，生命正在流失。' },
    rate: { life: -2.5 },
    bad: true,
    auto: true,
  },
  tired: {
    name: { en: 'Tired', zh: '疲惫' },
    desc: { en: 'Stamina is low. Actions take longer.', zh: '精力过低，行动变慢。' },
    actMult: 1.25,
    bad: true,
    auto: true,
  },
  exhausted: {
    name: { en: 'Exhausted', zh: '精疲力竭' },
    desc: { en: 'Completely drained. Life is dropping; sleep now.', zh: '精疲力竭，生命在下降，快去睡觉。' },
    rate: { life: -1.5 },
    actMult: 1.6,
    bad: true,
    auto: true,
  },
  depressed: {
    name: { en: 'Depressed', zh: '消沉' },
    desc: { en: 'Morale is low. Stamina drains faster.', zh: '心态低落，精力消耗加快。' },
    rate: { sta: -0.6 },
    bad: true,
    auto: true,
  },
  breakdown: {
    name: { en: 'Breakdown', zh: '崩溃' },
    desc: { en: 'You cannot take it anymore. Life is dropping.', zh: '快崩溃了，生命在下降。' },
    rate: { life: -1.5 },
    bad: true,
    auto: true,
  },
  1101: {
    name: { en: 'Upset Stomach', zh: '肠胃不适' },
    desc: { en: 'Something you ate was past its date.', zh: '吃了过期的东西，肚子不舒服。' },
    rate: { mor: -1, sta: -0.5 },
    bad: true,
  },
  1102: {
    name: { en: 'Diarrhea', zh: '腹泻' },
    desc: { en: 'Satiety drains fast. Antidiarrheals help.', zh: '拉肚子，饱腹流失很快。止泻药有效。' },
    rate: { sat: -3, mor: -1 },
    bad: true,
  },
  1103: {
    name: { en: 'Nausea', zh: '恶心' },
    desc: { en: 'Morale and stamina drop.', zh: '心态和精力下降。' },
    rate: { mor: -2, sta: -1 },
    bad: true,
  },
  1104: {
    name: { en: 'Food Poisoning', zh: '食物中毒' },
    desc: { en: 'Life drops until the poison passes or an antidote is taken.', zh: '食物中毒，生命持续下降，解毒剂有效。' },
    rate: { life: -1.5, sat: -1 },
    bad: true,
  },
  1105: {
    name: { en: 'Severe Food Poisoning', zh: '严重食物中毒' },
    desc: { en: 'Dangerous. Take an antidote.', zh: '很危险，快吃解毒剂。' },
    rate: { life: -3, sat: -2, sta: -1 },
    bad: true,
  },
};

// Durations (hours) of the overdue debuffs.
export const OVERDUE_HOURS = { 1101: 6, 1102: 10, 1103: 8, 1104: 12, 1105: 16 };
