// Ending routes, the nine endings and the challenge endings (A:1101–1114, A:3001–3008, guides G1/G2,
// config notes in data/gen/achievements.js). Route rules live in sim/story.js, resolution in sim/endings.js.
const T = (en, zh) => ({ en, zh });

export const KIT_ITEM = 9048; // Military Repair Kit: parts for exactly one device
export const RECKONING_DAY = 70;
export const ROUTE_CHECK_DAY = 71; // stranger / greenhouse / supply prerequisites are checked from this day
export const COMMIT_DEADLINE_DAY = 74;
export const DEFAULT_FINAL_WAVE_DAY = 87;
export const LAST_DAY = 101;
export const FINAL_WAVE_KILLS = 40; // Fortress and Supply Station: repel at least 40 in the final horde
export const NEXT_CHARACTER = { wage: 'student', student: 'warehouse' };

// tag: config suffix for TAG_LINE_<tag>_CHOSEN; func: Config_FurnitureFunc id of the commitment;
// device: what the kit is used on; check71: prerequisites are only evaluated from ROUTE_CHECK_DAY.
// finalWaveDay: hordes attack at 22:00 and last into the next morning, so a route that ends on endingDay
// (before LAST_DAY) fights its final wave the night before.
export const ROUTES = {
  evacuate: {
    id: 'evacuate',
    tag: 'RESCUE',
    characters: null,
    func: 2115,
    device: 'beacon',
    finalWaveDay: 87,
    endingDay: 101,
    name: T('Evacuate', '撤离'),
    promise: T('Full Power', '全功率'),
    deviceName: T('Distress Beacon', '求救信标'),
    pitch: T('Put the beacon on full power and wait for the Day 101 extraction flights.', '把信标改到全功率，等待第101天的撤离航班。'),
  },
  girl: {
    id: 'girl',
    tag: 'GIRL',
    characters: ['wage'],
    func: 2116,
    device: 'basket',
    finalWaveDay: 85,
    endingDay: 86,
    name: T('Side By Side', '共同生活'),
    promise: T('Send the Winter Over', '把冬天送过去'),
    deviceName: T('Hanging Basket', '吊篮'),
    pitch: T('Trust the girl next door with the kit and get her through the winter.', '把套件托付给隔壁的女孩，陪她熬过这个冬天。'),
  },
  stranger: {
    id: 'stranger',
    tag: 'STRANGER',
    characters: ['wage'],
    func: 2117,
    device: 'drone',
    finalWaveDay: 86,
    endingDay: 87,
    check71: true,
    name: T('Net', '网'),
    promise: T('A Farther Flight', '更远的航程'),
    deviceName: T('Drone', '无人机'),
    pitch: T('Double the drone’s range and turn the survivors you supported into a network.', '让无人机航程翻倍，把你支援过的幸存者连成一张网。'),
  },
  fortress: {
    id: 'fortress',
    tag: 'SHELTER',
    characters: ['wage', 'student'],
    func: 2118,
    device: 'door',
    finalWaveDay: 85,
    endingDay: 86,
    name: T('Fortress', '堡垒'),
    promise: T('The Sleepless Line', '不眠的防线'),
    deviceName: T('Front Door', '大门'),
    pitch: T('Let the front door keep watch on its own and hold the house against the final horde.', '让这道门自己守夜，把房子守过终局尸潮。'),
  },
  truth: {
    id: 'truth',
    tag: 'TRUTH',
    characters: null,
    func: 2119,
    device: 'recorder',
    finalWaveDay: 83,
    endingDay: 84,
    name: T('The Truth', '真相'),
    promise: T('Read the Answer', '读出答案'),
    deviceName: T('Data Recorder', '记录仪'),
    pitch: T('Repair the hospital recorder and read out what really started the outbreak.', '修好医院的记录仪，读出灾变真正的起因。'),
  },
  greenhouse: {
    id: 'greenhouse',
    tag: 'GREENHOUSE',
    characters: ['student'],
    func: 2120,
    device: 'planter',
    finalWaveDay: 85,
    endingDay: 86,
    check71: true,
    name: T('Greenhouse', '温室'),
    promise: T('The Ever-Burning Lamp', '长明的灯'),
    deviceName: T('Flowerpots', '花盆'),
    pitch: T('Give every pot light and warmth and grow your way through the winter.', '给每个花盆装上光照和恒温，让这片绿意撑过整个冬天。'),
  },
  companion: {
    id: 'companion',
    tag: 'COMPANION',
    characters: ['student'],
    func: 2121,
    device: 'basket',
    finalWaveDay: 85,
    endingDay: 86,
    name: T('Companionship', '陪伴'),
    promise: T('Send the Winter Over', '把冬天送过去'),
    deviceName: T('Hanging Basket', '吊篮'),
    pitch: T('Send the kit across to the man next door so his stove and windows last the winter.', '把套件送给隔壁的男人，让他的门窗和炉子撑过冬天。'),
  },
  supply: {
    id: 'supply',
    tag: 'SUPPLY',
    characters: ['warehouse'],
    func: 2122,
    device: 'door',
    finalWaveDay: 85,
    endingDay: 86,
    check71: true,
    name: T('Supply Station', '补给站'),
    promise: T('Lock the Gate', '落锁'),
    deviceName: T('Front Door', '大门'),
    pitch: T('Weld the warehouse shut like an iron barrel and become the district’s supply station.', '把仓库焊得像铁桶一样严实，成为这片街区的补给站。'),
  },
};

export const ROUTE_ORDER = ['evacuate', 'girl', 'stranger', 'fortress', 'truth', 'greenhouse', 'companion', 'supply'];

export function routeTagChosen(route) {
  return `TAG_LINE_${ROUTES[route].tag}_CHOSEN`;
}

// The nine endings. cfg: Config ending id used by the achievement table (type 16 values).
export const ENDINGS = {
  evacuate: {
    id: 'evacuate',
    route: 'evacuate',
    achievement: 1101,
    cfg: 5,
    day: 101,
    title: T('Evacuate', '撤离'),
    subtitle: T('Rescue', '救援'),
    scene: 'heli',
    art: '🚁',
    text: T(
      'Day 101. You hear it before you see it: rotor blades chopping the morning apart. The beacon on the roof blazes like a second sun, and a rope ladder uncoils onto the terrace. You take one last look at the house — the scarred door, the pots, the Survival Log on the table — and leave the log behind for whoever comes next. From the air the city is small and grey and quiet. Somewhere below, the loop loosens its grip.',
      '第101天。你先听见了声音——旋翼把清晨劈得粉碎。屋顶的信标亮得像第二个太阳，一架绳梯落在了露台上。你最后看了一眼这个家：伤痕累累的大门、一盆盆植物、桌上的生存日志——你把日志留下，留给下一个来到这里的人。从空中看，城市又小又灰又安静。在你脚下的某处，那个循环终于松开了手。'
    ),
  },
  girl: {
    id: 'girl',
    route: 'girl',
    achievement: 1102,
    cfg: 6,
    day: 86,
    title: T('Side By Side', '共同生活'),
    subtitle: T('The Girl Next Door', '女孩'),
    scene: 'rooftop',
    art: '🧺',
    text: T(
      'Winter comes and goes, and her windows hold. The last horde breaks against both buildings and slides off like rain. When it is over she climbs across the rope line for the first time — shaking, laughing, carrying a pot of something that is almost soup. You eat it on the terrace, side by side, watching the empty city steam in the cold. Neither of you says “next loop”. Neither of you needs to.',
      '冬天来了又走，她的窗户撑住了。最后的尸潮撞上两栋楼，像雨水一样滑落。结束后，她第一次顺着绳子爬了过来——手在抖，却笑着，端着一锅勉强算是汤的东西。你们并肩坐在露台上喝完了它，看着空荡荡的城市在寒气里冒着白雾。谁也没提“下一轮”。也不需要提。'
    ),
  },
  stranger: {
    id: 'stranger',
    route: 'stranger',
    achievement: 1103,
    cfg: 7,
    day: 87,
    title: T('Net', '网'),
    subtitle: T('The Stranger', '陌生人'),
    scene: 'drone',
    art: '🛰️',
    text: T(
      'The day after the final wave, the drone makes its last delivery at dusk, threading between columns of smoke to a school gym full of cots. By night the radio is a chorus: Sparrow, Lantern, Old Wang, the twins on Fifth Street — twelve call signs, then more. You are not a survivor alone in an apartment anymore. You are a knot in a net, and the net holds.',
      '终局尸潮过后的黄昏，无人机完成了最后一趟投送，穿过一道道烟柱，落在挤满行军床的学校体育馆里。到了夜里，电台里是一片合唱：麻雀、灯笼、老王、五号街的那对双胞胎——十二个呼号，然后更多。你不再是独自守着出租屋的幸存者。你是网上的一个结，而这张网，兜住了。'
    ),
  },
  fortress: {
    id: 'fortress',
    route: 'fortress',
    achievement: 1104,
    cfg: 8,
    day: 86,
    title: T('Fortress', '堡垒'),
    subtitle: T('Safe House', '安全屋'),
    scene: 'door',
    art: '🛡️',
    text: T(
      'The final horde comes and the house simply refuses. Spikes, nets and saws churn the street into red fog; the door takes blow after blow and does not even creak. When dawn breaks, the pile outside is taller than the fence, and inside the fridge still hums. This is not a hiding place anymore. It is a fortress, and it is yours.',
      '终局尸潮来了，而这栋房子只是拒绝。尖刺、电网和电锯把街道搅成一片红雾；大门挨了一下又一下，连吱呀一声都没有。天亮时，门外的尸堆比围栏还高，屋里的冰箱依旧嗡嗡作响。这里已经不是藏身之处了。这是一座堡垒，属于你。'
    ),
  },
  truth: {
    id: 'truth',
    route: 'truth',
    achievement: 1105,
    cfg: 9,
    day: 84,
    title: T('The Truth', '真相'),
    subtitle: T('Read the Answer', '读出答案'),
    scene: 'recorder',
    art: '📼',
    text: T(
      'When the last wave is over, the recorder plays its final file: a doctor’s hoarse voice listing the batch numbers of a “free immunity booster” given to eleven thousand people eleven days before the outbreak. Then a second voice — yours — dated Day 101 of a loop you do not remember: “If you are hearing this, write it all down. Don’t let it disappear again.” You broadcast every file on every frequency you have. The truth goes out over the dead city like a flare. Whatever happens next, it can no longer be erased.',
      '最后一波尸潮过去后，记录仪播放了最后一个文件：一个医生沙哑的声音，念着“免费免疫增强剂”的批号——灾变前十一天，一万一千人注射了它。然后是第二个声音——你自己的声音——日期是某一轮你不记得的第101天：“如果你听到了这段录音，把一切都写下来。别让它再消失一次。”你把每个文件都发到了你能找到的每一个频段。真相像信号弹一样升上死寂的城市上空。无论接下来发生什么，它都再也抹不掉了。'
    ),
    byChar: {
      student: T('The last file ends with the patient register being read aloud, name by name, in your own voice.', '最后一个文件的结尾，是你自己的声音，一个名字一个名字地念着那份病人名册。'),
      warehouse: T('The last file lists every truck that carried the booster. Every one of them was signed for at your warehouse.', '最后一个文件列出了运送增强剂的每一辆货车——每一车都是在你的仓库签收的。'),
    },
  },
  greenhouse: {
    id: 'greenhouse',
    route: 'greenhouse',
    achievement: 1106,
    cfg: 11,
    day: 86,
    title: T('Greenhouse', '温室'),
    subtitle: T('Doomsday Greenhouse', '末日温室'),
    scene: 'garden',
    art: '🌻',
    text: T(
      'The final horde passes a house that glows. Inside, every pot has light and warmth; flowers crowd the stairs, tomatoes hang heavy on the loft rail, and the basement smells of wet soil instead of fear. You pick a daisy and put it in a jar on the windowsill, facing the street. Let them see that something still grows here.',
      '终局尸潮经过一栋发着光的房子。屋里的每个花盆都有光、有暖；鲜花挤满了楼梯，番茄沉甸甸地挂在阁楼栏杆上，地下室里是湿土的气味，而不是恐惧。你摘下一朵雏菊插进窗台上的玻璃瓶，朝着街道。让它们看看，这里还有东西在生长。'
    ),
  },
  companion: {
    id: 'companion',
    route: 'companion',
    achievement: 1107,
    cfg: 12,
    day: 86,
    title: T('Companionship', '陪伴'),
    subtitle: T('The Man Next Door', '隔壁的人'),
    scene: 'rooftop',
    art: '☕',
    text: T(
      'His stove burns all winter, and on the coldest night the smoke from both chimneys twists together over the street. The morning after the final horde, he crosses the rope line with a thermos and two chipped cups. “Figured you’d want company,” he says, and sits on your balcony as if he has always lived there. Maybe, in some loop, he has.',
      '他的炉子烧了一整个冬天，最冷的那一夜，两根烟囱冒出的烟在街道上空缠在了一起。终局尸潮过后的清晨，他提着保温壶和两只磕了口的杯子顺着绳子爬了过来。“想着你大概想要个伴儿。”他说完，就在你的阳台上坐下，好像一直住在这儿似的。也许，在某一轮里，他真的住过。'
    ),
  },
  supply: {
    id: 'supply',
    route: 'supply',
    achievement: 1108,
    cfg: 13,
    day: 86,
    title: T('Supply Station', '补给站'),
    subtitle: T('Iron Barrel Hub', '铁桶枢纽'),
    scene: 'warehouse',
    art: '🛢️',
    text: T(
      'The final horde breaks on the warehouse gate and the Iron Barrel does not spill a single grain. By evening the first survivors knock — three short, two long, the station code — and you slide a crate of rice through the hatch. Stamped on every box is your name, the same name written on the delivery slips. The district has a supply station now. It will not run out.',
      '终局尸潮撞在仓库大门上，铁桶连一粒米都没洒。当天傍晚，第一批幸存者来敲门——三短两长，补给站的暗号——你从小窗递出一箱大米。每个箱子上都盖着你的名字，和那些配送面单上写的名字一模一样。这片街区如今有了一座补给站。它不会断粮。'
    ),
  },
  lastOne: {
    id: 'lastOne',
    route: null,
    achievement: 1109,
    cfg: 10,
    day: 101,
    title: T('Survival: Last One Standing', '生存：活到最后'),
    subtitle: T('Stay in Place', '留在原地'),
    scene: 'dawn',
    art: '🌅',
    text: T(
      'Day 101 comes without helicopters, without speeches. You wake, eat, check the door, water the plants. The streets are quiet the way places are quiet once they run out of people. You made no great bet and kept no great promise — you simply refused to die, one day at a time, for a hundred days. That, too, is an ending. Perhaps the hardest one.',
      '第101天到了，没有直升机，也没有演讲。你醒来、吃饭、检查大门、给植物浇水。街道安静得像一个已经没人了的地方。你没有下过什么大赌注，也没有守过什么大承诺——你只是拒绝死去，一天一天，撑了一百天。这也是一种结局。也许是最难的那一种。'
    ),
  },
};

export const ENDING_ORDER = ['evacuate', 'girl', 'stranger', 'fortress', 'truth', 'greenhouse', 'companion', 'supply', 'lastOne'];

// Other modules label endings by `name` (e.g. the rebirth memories).
for (const e of Object.values(ENDINGS)) e.name = e.title;

// Challenge endings: a challenge holds when its taboo flag (state.progress.taboo) was never set this run.
export const CHALLENGES = [
  { id: 'justOnce', flag: 'rebirth', achievement: 3001, name: T('Just Once', '一次就好'), desc: T('No rebirth used in this save.', '本存档内一次重生都没用过。') },
  { id: 'closedDoors', flag: 'explore', achievement: 3002, name: T('Stay behind closed doors', '闭门不出'), desc: T('Never left home this loop.', '本轮一次都没出过门。') },
  { id: 'minimalBudget', flag: 'overspend', achievement: 3003, name: T('Minimal Budget', '极简预算'), desc: T('Spent less than half the prep money.', '灾变前只花掉了一半以内的钱。') },
  { id: 'flawless', flag: 'doorWorn', achievement: 3004, name: T('Flawless', '完璧'), desc: T('Doors and windows never fell below 70%.', '门窗全程保持在70%以上。') },
  { id: 'vegetarian', flag: 'meat', achievement: 3005, name: T('Vegetarianism', '素食主义'), desc: T('Not a single bite of meat.', '一口荤都没吃过。') },
  { id: 'goingSolo', flag: 'trade', achievement: 3006, name: T('Going Solo', '独行'), desc: T('Never traded with strangers.', '从没和陌生人做过交易。') },
  { id: 'hundredDaysAlone', flag: 'neighbor', achievement: 3007, name: T('One Person’s Hundred Days', '一个人的一百天'), desc: T('Never progressed the neighbor line.', '从没推进过邻居线。') },
  { id: 'neverFallen', flag: 'lowVitality', achievement: 3008, name: T('Never Fallen', '不曾倒下'), desc: T('Life never dropped below 20%.', '生命值从没掉到20%以下。') },
];

// Mid-game challenge ending (patch 09-04): set by the drone/trading-post system.
export const SHIELD_CHALLENGE = {
  id: 'shieldOfStreet',
  tag: 'TAG_SHIELD_OF_THE_STREET',
  name: T('Shield of the Street', '一街之盾'),
  desc: T('Helped the besieged trading posts hold out against the hordes.', '帮助被围困的交易点扛过了尸潮。'),
};
