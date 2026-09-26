// People after the disaster (dev logs 06-03 / #6, patches 08-12 … 09-17, guides G2 and 3782585359):
// the neighbor across the rooftops, survivors met before the disaster, unknown numbers, the eight
// trading posts, the homeowners' group chat, the Warehouse Manager rescue line, the trapped veteran
// and the doorstep cat. Text uses {placeholders} filled in by sim/phone.js formatText().
import { CAT, SUB } from '../data/db.js';

// ------------------------------------------------------------------------------------ neighbor
export const HEART_THRESHOLDS = [30, 90, 180, 320, 500]; // affinity needed for hearts 1..5
export const BASKET_MAX_KG = 10; // patch 08-28 (was 5 kg)
export const ROPE_MAX = 25; // basket trips before the rope must be changed
export const NEIGHBOR_DAILY_SAT = 40; // satiety she needs per day
export const NEIGHBOR_START_FOOD = 8; // days of food she has when the disaster starts
export const NEIGHBOR_MAX_FOOD = 20;
export const NEIGHBOR_STARVE_DAYS = 3; // days without food before she dies

// Rescue tasks from guide G2: two 500-progress tasks, then (after committing to the route) a 300-progress
// task during which she sends three text requests. Progress = satiety / value delivered by basket.
export const RESCUE_TASKS = [
  { id: 'rescue1', need: 500, label: { en: 'Get the neighbor through the first weeks', zh: '帮邻居撑过最初的日子' } },
  { id: 'rescue2', need: 500, label: { en: 'Keep the neighbor going', zh: '让邻居继续撑下去' } },
  { id: 'rescue3', need: 300, requests: 3, label: { en: 'Get the neighbor through the winter', zh: '陪邻居熬过这个冬天' } },
];

const she = (en, zh) => ({ en, zh });

export const NEIGHBORS = {
  // The College Student next door, rescued by the Wage Slave.
  student: {
    id: 'student',
    name: { en: 'Girl Next Door', zh: '隔壁的女孩' },
    deadTag: 'TAG_NEIGHBOR_DEAD',
    rescueTags: ['TAG_NEIGHBOR_RESCUE1_COMPLETE', 'TAG_NEIGHBOR_RESCUE2_COMPLETE', 'TAG_NEIGHBOR_RESCUE3_COMPLETE'],
    route: 'girl',
    routeTag: 'TAG_LINE_GIRL_CHOSEN',
    dislikes: [SUB.LIQUOR],
    // Her return dishes are her own cooking: Config_Item 48501–53628, "她做的<dish>" ("邻家女孩亲手做的料理。"), one per
    // dish, id = the dish's Perfect output + 40000 (48501 ↔ 8501 roast pigeon, 52005 ↔ 12005).
    ownDishOffset: 40000,
    // after her second rescue task she sends her College Acceptance Letter (41004, story 1582: the rescue tokens run
    // 1581 the veteran's dog tag, 1582, 1583 the Warehouse Manager's access card, 1584 a neighbour's home-cooked bento)
    rescueGifts: { 2: [[41004, 1]] },
    firstNote: 24116,
    keepsakes: { 1: [24115, 24118], 2: [24112, 24119, 24120], 3: [24113, 24121, 24124], 4: [24111, 24114, 24125, 24126], 5: [24117] },
    lines: {
      intro: she(
        'Hey… it\'s me, from next door. The one you met at the supermarket. Are you okay over there? The screaming outside won\'t stop.',
        '喂……是我，隔壁的。超市里见过的那个。你那边还好吗？外面的尖叫声一直没停。'
      ),
      introOptions: [
        { text: she("I'm here. Lock your door and stay away from the windows.", '我在。把门锁好，离窗户远一点。'), affinity: 4 },
        { text: she('Do you have enough food?', '你吃的够吗？'), affinity: 3 },
      ],
      introReply: she('Okay. It helps knowing someone is awake next door.', '嗯。知道隔壁还有人醒着，好多了。'),
      help: she(
        "I didn't stock up at all… I have a few packs of noodles left. There's an old rope-and-basket line between our terraces from the landlord's days — if you fix the pulley on your side, could you pass something across?",
        '我什么都没囤……只剩几包泡面了。我们两家露台之间有根房东以前拉的吊篮绳，如果你能把你那边的滑轮修好，能不能……递点东西过来？'
      ),
      repaired: she('I see the basket moving! It works! Thank you, thank you.', '我看到篮子动了！能用了！谢谢你，真的谢谢。'),
      thanks: [
        she('Got it. I ate half right away, sorry. It was so good.', '收到了。我当场就吃了一半，不好意思，太好吃了。'),
        she("You didn't have to send this much. …I'm keeping the note you didn't write.", '不用送这么多的。……我假装里面有你写的纸条。'),
        she('The basket squeaks every time. It\'s my favorite sound now.', '篮子每次都吱呀吱呀的。现在这是我最喜欢的声音。'),
        she('Thank you. I\'ll pay you back one day, I promise.', '谢谢你。总有一天我会还你的，说好了。'),
        she('I split it into three meals. I\'m getting good at this.', '我分成了三顿吃。我越来越会过日子了。'),
        she("Received! I waved at your terrace, did you see?", '收到啦！我朝你家露台挥手了，你看见没？'),
      ],
      dislike: she("Um… I don't drink. But thank you for thinking of me.", '呃……我不喝酒的。不过谢谢你想着我。'),
      lowFood: she("I've got maybe two days of food left. I'm trying not to think about it.", '我大概只剩两天的吃的了。我尽量不去想它。'),
      starving: she("I haven't eaten since yesterday. Sorry to ask again.", '我从昨天起就没吃东西了。对不起，又要麻烦你。'),
      gift: she("I put something in the basket for you. Don't laugh.", '我在篮子里放了点东西给你。不许笑。'),
      giftDish: she('I cooked with what you sent — it\'s in the basket, still warm!', '我用你送来的东西做了点吃的，放在篮子里了，还热着！'),
      hearts: [
        she('Can I call you by your name instead of "neighbor"?', '以后我能叫你名字吗？别总叫"邻居"了。'),
        she('I sleep better knowing your light is on.', '看到你家灯亮着，我就睡得踏实些。'),
        she('Let\'s both make it to the end of this, okay? Promise me.', '我们都要撑到最后，好吗？你答应我。'),
        she("When this is over, I'm buying you the biggest meal in the city.", '等这一切结束了，我请你吃全城最大的一顿饭。'),
        she('I wrote you a letter. I\'ll tell you the rest in person.', '我给你写了封信。剩下的话，我要当面跟你说。'),
      ],
      rescueStart: [
        she('I think I can hold on if we keep this up.', '如果能一直这样，我觉得我能撑下去。'),
        she('The street got quieter. That scares me more than the noise.', '街上安静下来了。这比吵闹更让我害怕。'),
        she("It's getting so cold. I don't know how to get through the winter alone.", '越来越冷了。我不知道一个人怎么熬过这个冬天。'),
      ],
      rescueDone: [
        she('I\'m not scared of every noise anymore. That\'s because of you.', '我已经不会被每一点声响吓到了。这是因为你。'),
        she("We've made it this far. Together.", '我们一起走到了这里。'),
        she("I made it through the winter. We did.", '我熬过了这个冬天。是我们一起熬过来的。'),
      ],
      requestDone: she('That\'s exactly what I needed. How did you know?', '这正是我需要的。你怎么知道的？'),
      requestFailed: she("It's okay. I'll manage somehow.", '没关系的，我会想办法的。'),
      dead: she('(Her window has been dark for two nights. Nobody answers anymore.)', '（她家的窗户已经黑了两个晚上。再也没有人回信了。）'),
    },
  },
  // The Wage Slave across the alley, rescued by the College Student.
  wage: {
    id: 'wage',
    name: { en: 'Guy Across the Alley', zh: '小路对面的他' },
    deadTag: 'TAG_COMPANION_MAN_DEAD',
    rescueTags: ['TAG_COMPANION_RESCUE1_COMPLETE', 'TAG_COMPANION_RESCUE2_COMPLETE', 'TAG_COMPANION_RESCUE3_COMPLETE'],
    route: 'companion',
    routeTag: 'TAG_LINE_COMPANION_CHOSEN',
    dislikes: [],
    molotov: true, // patch 08-27: alcohol comes back as Molotov cocktails
    firstNote: 24123,
    keepsakes: { 1: [24118], 2: [24119, 24120], 3: [24121, 24127], 4: [24128, 24129], 5: [24122] },
    lines: {
      intro: she(
        'Hey, you still alive over there? It\'s the guy from the rental across the alley. Saw your light.',
        '喂，你那边还活着吗？我是小路对面出租屋那个。看到你家灯亮着。'
      ),
      introOptions: [
        { text: she("I'm fine. Are you hurt?", '我没事。你受伤了吗？'), affinity: 4 },
        { text: she('Keep your voice down, they hear everything.', '小点声，它们什么都听得见。'), affinity: 3 },
      ],
      introReply: she('Copy that. Good to know I\'m not the last one on this street.', '收到。知道这条街上不止我一个，挺好。'),
      help: she(
        "Confession: I spent my savings on a TV the day before all this. Genius. There's an old basket line strung between our places — fix your end and maybe we can keep each other alive.",
        '坦白说，出事前一天我刚把积蓄拿去买了台电视。天才吧。我们两家之间有根老吊篮绳，你把你那头修好，也许我们能互相撑一撑。'
      ),
      repaired: she('Basket\'s moving! Ha! Engineering!', '篮子动了！哈！这就是工程学！'),
      thanks: [
        she("Got it. I owe you. Adding it to the tab.", '收到。欠你的，记账上了。'),
        she('Food never tasted this good at my old job.', '以前上班的时候，饭从来没这么香过。'),
        she('You\'re a lifesaver. Literally.', '你是我的救命恩人。字面意义上的。'),
        she('I rationed it like a spreadsheet. Old habits.', '我按表格给自己分配口粮。老毛病了。'),
        she("Received. Waved at you, did you see? No? I'll wave harder.", '收到。朝你挥手了，看见没？没有？那我挥得更用力点。'),
      ],
      dislike: she('Heh. This won\'t go to waste, trust me.', '嘿，这个不会浪费的，相信我。'),
      lowFood: she("Down to the last two days of food. Just saying.", '只剩两天的吃的了。随口一说。'),
      starving: she("Haven't eaten since yesterday. Not complaining, just reporting.", '从昨天起就没吃东西了。不是抱怨，只是汇报。'),
      gift: she('Left something in the basket. Don\'t get used to it.', '篮子里给你留了点东西。别习惯了啊。'),
      giftDish: she("Cooked with your stuff. I'm better at this than you'd think.", '用你送的东西做了点吃的。我的手艺比你想的好。'),
      giftMolotov: she("Turned your bottles into something more useful. Handle with care.", '把你送来的酒改成了更有用的东西。小心拿。'),
      hearts: [
        she("You know, you're the only person I talk to now. Weird, huh.", '你知道吗，现在我只跟你一个人说话。挺奇怪的吧。'),
        she('I check the basket before I check the street. Priorities.', '我现在先看篮子，再看街上。轻重缓急嘛。'),
        she("Let's both get out of this. Deal?", '我们都要活着出去。说定了？'),
        she("When this is over, first round's on me. And the second.", '等这一切结束，第一轮我请。第二轮也我请。'),
        she("Started a letter. I'll finish it when there's no alley between us.", '写了封信，开了个头。等我们之间不再隔着这条小路，我再写完。'),
      ],
      rescueStart: [
        she('If we keep this rhythm, I think I can make it.', '照这个节奏，我觉得我能撑住。'),
        she('It got quiet out there. I hate quiet.', '外面安静下来了。我讨厌安静。'),
        she("Winter's coming and my window frame is rotten. Great timing.", '冬天要来了，我家窗框还烂了。时机真好。'),
      ],
      rescueDone: [
        she('I stopped flinching at every sound. Thanks to you.', '我不会再被每一点声音吓一跳了。多亏了你。'),
        she("Made it this far. Both of us.", '我们俩都走到了这里。'),
        she('Winter\'s done. We\'re still here.', '冬天过去了。我们还在。'),
      ],
      requestDone: she('Exactly what I needed. You\'re scary good at this.', '正是我要的。你神了。'),
      requestFailed: she("No worries. I'll improvise.", '没事，我随机应变。'),
      dead: she('(The rental across the alley has gone silent. Nobody answers anymore.)', '（小路对面的出租屋安静了下来。再也没有人回信了。）'),
    },
  },
};

// Daily text requests: "she needs fever medicine by tomorrow". Match by explicit items or category/sub.
export const NEIGHBOR_REQUESTS = [
  { id: 'fever', items: [2406, 2405, 8, 2147, 6], text: { en: "I think I'm running a fever. Any medicine?", zh: '我好像发烧了。有药吗？' } },
  { id: 'bandage', items: [2400, 2509, 2401], text: { en: 'Cut my hand on a can lid. Do you have a bandage?', zh: '开罐头划到手了。有绷带吗？' } },
  { id: 'sweet', cat: CAT.FOOD, subs: [SUB.SNACK], text: { en: "I'd kill for something sweet right now.", zh: '现在好想吃点甜的。' } },
  { id: 'veg', cat: CAT.FOOD, subs: [SUB.VEGETABLE, SUB.FRUIT, SUB.MUSHROOM], text: { en: 'I miss vegetables. Anything green, or fruit?', zh: '好想吃蔬菜。绿色的，或者水果也行？' } },
  { id: 'protein', cat: CAT.FOOD, subs: [SUB.MEAT, SUB.FISH, SUB.CUSTARD], text: { en: "I'm so weak. Something with protein?", zh: '浑身没劲。有没有肉蛋之类的？' } },
  { id: 'drink', cat: CAT.FOOD, subs: [SUB.SOFT_DRINK], items: [2913, 2003], text: { en: 'The water tastes of rust. Anything to drink?', zh: '自来水一股铁锈味。有什么喝的吗？' } },
  { id: 'book', cat: CAT.BOOK, text: { en: "Nights are long. Could you spare a book?", zh: '夜太长了。能借我一本书吗？' } },
  { id: 'hygiene', items: [11009, 11010, 11011, 11012, 20001], text: { en: 'Soap, a towel, even tissues — I feel so grimy.', zh: '肥皂、毛巾，哪怕纸巾也行——我觉得自己脏兮兮的。' } },
  { id: 'staple', cat: CAT.FOOD, subs: [SUB.STAPLE], text: { en: 'Something filling? Bread, noodles, rice…', zh: '有顶饱的吗？面包、面条、米饭……' } },
];

// Return-gift pools (patch 08-13: books, sundries and tools; 08-12: seeds after a certain stage).
export const GIFT_POOLS = {
  seeds: [15007, 15009, 15016, 15018, 15021, 15024, 15026, 15027, 15028, 15031, 15032, 15034, 15036],
  sundries: [3001, 3002, 3003, 3006, 3022, 3023, 2508, 11009, 11011, 11012, 20213, 20217, 20320],
  companionTools: [20350, 20320, 20340],
};

// Alcohol -> Molotov cocktail for the Wage Slave neighbor (patch 08-27).
export const MOLOTOV_FROM = { 15505: 26006, 15504: 26005, 15506: 26007, 2137: 26005, 2156: 26006, 2157: 26006, 2158: 26006, 2159: 26005 };

// ------------------------------------------------------------------------------------ trading posts
// main: the post's specialty; bought back at half value (patch 08-18). They never buy what they sell.
// stock: [itemId, maxQty, price?] (price defaults to the item's trade value).
export const TRADING_POSTS = [
  {
    id: 'city',
    name: { en: 'City Center Base Camp', zh: '城中心的大本营' },
    blurb: { en: 'The biggest camp in town. Salvaged materials by the crate.', zh: '城里最大的营地，回收的材料成箱成箱地有。' },
    main: { cats: [CAT.MATERIAL] },
    unlockDay: 3,
    stock: [[20002, 20], [20001, 12], [20003, 12], [20004, 10], [20005, 10], [20101, 4], [20102, 4], [20103, 4], [20104, 4], [20106, 4], [20210, 2], [20214, 2], [20312, 3], [20360, 2], [13001, 2], [9002, 1, 60]],
  },
  {
    id: 'pharmacy',
    name: { en: 'Old Pharmacy', zh: '老药房' },
    blurb: { en: 'A pharmacist who refused to leave her counter.', zh: '一位不肯离开柜台的药剂师。' },
    main: { cats: [CAT.MEDICINE] },
    unlockDay: 6,
    stock: [[2400, 3], [2509, 5], [2402, 3], [2405, 2], [2406, 3], [2407, 2], [2408, 2], [2411, 2], [2412, 1], [2147, 2], [6, 2], [8, 2], [2164, 2], [2165, 1], [2410, 1], [2401, 1]],
  },
  {
    id: 'farm',
    name: { en: 'Riverside Farm', zh: '河畔农场' },
    blurb: { en: 'Greenhouses behind a flood wall. Fresh produce and seeds.', zh: '防洪墙后面的温室，有新鲜蔬果和种子。' },
    main: { cat: CAT.FOOD, subs: [SUB.VEGETABLE, SUB.FRUIT] },
    unlockDay: 9,
    stock: [[2504, 4], [2522, 4], [2527, 5], [2528, 3], [2530, 4], [2531, 3], [2533, 6], [2536, 3], [2538, 3], [2537, 3], [2127, 3], [2162, 4], [2539, 1], [15021, 2], [15024, 2], [15026, 2], [15027, 2], [15501, 4]],
  },
  {
    id: 'hardware',
    name: { en: 'Hardware Guys', zh: '五金铺兄弟' },
    blurb: { en: 'Two brothers holed up in their tool shop.', zh: '守着工具店的两兄弟。' },
    main: { cats: [CAT.TOOL, CAT.TRAP] },
    unlockDay: 12,
    stock: [[20320, 2], [20330, 1], [20340, 2], [20350, 1], [25001, 2], [25000, 1], [25003, 1], [25004, 1], [20361, 2], [20362, 1], [20104, 4], [20300, 2], [20301, 2], [14094, 1]],
  },
  {
    id: 'market',
    name: { en: 'Night Market', zh: '夜市' },
    blurb: { en: 'Snacks, drinks and small luxuries, if you know who to ask.', zh: '零食、饮料和小小的奢侈品，只要你知道找谁。' },
    main: { cat: CAT.FOOD, subs: [SUB.SNACK, SUB.SOFT_DRINK, SUB.LIQUOR] },
    unlockDay: 16,
    stock: [[2132, 3], [2133, 3], [2135, 3], [2138, 3], [2130, 4], [2131, 3], [2136, 3], [2137, 1], [2158, 2], [2156, 1], [2146, 1], [2141, 2], [2508, 2], [11006, 1], [11014, 1], [11019, 1], [41001, 2, 40]],
  },
  {
    id: 'school',
    name: { en: 'School Shelter', zh: '学校避难所' },
    blurb: { en: 'Teachers and families in the gym. Books for anything edible.', zh: '体育馆里的老师和家长们。吃的都能换书。' },
    main: { cats: [CAT.BOOK] },
    unlockDay: 20,
    stock: [[3001, 1], [3002, 1], [3003, 1], [3004, 1], [3006, 1], [3022, 1], [3023, 1], [3025, 1], [3027, 1], [3028, 1], [3029, 1], [2505, 2], [2506, 3], [2102, 3], [2108, 1], [20213, 2], [11009, 3], [11011, 2]],
  },
  {
    id: 'fire',
    name: { en: 'Fire Station', zh: '消防站' },
    blurb: { en: 'Firefighters with fuel, generators and heavy repair kits.', zh: '消防员们有燃料、发电机和重型维修件。' },
    main: { cats: [CAT.FUEL] },
    unlockDay: 24,
    stock: [[40000, 3], [8001, 4], [15504, 2], [15505, 3], [20310, 2], [20311, 1], [20300, 2], [2400, 2], [20312, 2], [20214, 2], [2131, 2], [2107, 2], [14064, 1], [14012, 1]],
  },
  {
    id: 'rail',
    name: { en: 'Rail Yard', zh: '铁路货场' },
    blurb: { en: 'Stranded freight cars full of bulk food and diesel.', zh: '滞留的货运车厢，装满了大宗食品和柴油。' },
    main: { cat: CAT.FOOD, subs: [SUB.STAPLE, SUB.MEAT, SUB.FISH] },
    unlockDay: 28,
    stock: [[2101, 2], [2103, 2], [2105, 4], [2106, 4], [2115, 4], [2149, 4], [2114, 6], [2120, 3], [2123, 3], [2129, 2], [2150, 2], [2153, 2], [2145, 2], [11003, 1], [2107, 2], [40000, 2], [14041, 1]],
  },
];
export const POST_BY_ID = Object.fromEntries(TRADING_POSTS.map((p) => [p.id, p]));
export const POST_RESTOCK_DAYS = 3;
export const POST_DAMAGE_DAYS = 15; // Shield of the Street: ignored posts are damaged for 15 days

export const POST_LINES = {
  online: { en: '{post} is on the air. Send a drone if you want to trade.', zh: '{post}上线了。想交易就派无人机过来。' },
  thanks: [
    { en: 'Pleasure doing business. Drone is on its way back.', zh: '合作愉快。无人机已经往回飞了。' },
    { en: 'Got your goods. Fair trade — see you next time.', zh: '货收到了，公平交易，下次再来。' },
    { en: 'Deal done. Stay safe out there.', zh: '成交。你那边注意安全。' },
  ],
  distress: {
    en: "We're surrounded — a whole horde at the gate. If your drone can lead them away from us, we'll pay you back. Please.",
    zh: '我们被围了——一整群尸潮堵在门口。要是你的无人机能把它们引走，我们一定报答你。求你了。',
  },
  saved: { en: "They're gone! Whatever you did, it worked. Sending you what we can spare.", zh: '它们走了！不管你做了什么，都成功了。能匀出来的都给你送过去。' },
  damaged: { en: "They broke through the east fence. We lost most of our stock. Give us a couple of weeks.", zh: '它们冲破了东边的围栏，货丢了大半。给我们几个星期缓一缓。' },
};

// ------------------------------------------------------------------------------------ survivors
// Survivors met in the pre-disaster shops (patch 08-21 chat history). The first seven share their ids
// with the shop NPCs in content/shops.js (state.pre.metNpcs); the last three only appear when there was
// no pre-disaster phase to meet anyone in (default roster).
export const SURVIVOR_DAILY_SAT = 40;
export const SURVIVOR_MAX_FOOD = 14;
export const MIN_AID_SAT = 30; // a delivery must carry at least this much satiety
export const GIFT_AID_SAT = 120; // enough food for a return gift (patch 09-12)
export const NOT_A_CONTACT = ['neighbor']; // the neighbor is on the rooftop line, not in the trade network

export const SURVIVORS = [
  {
    id: 'youngCustomer',
    name: { en: 'Young Customer (Tingting)', zh: '年轻顾客（婷婷）' },
    where: { en: 'Community Convenience Store', zh: '社区便利店' },
    pre: [
      { en: "Young customer: You again! Do you always buy snacks when you're stressed? Same.", zh: '年轻顾客：又是你！你是不是一紧张就买零食？我也是。' },
      { me: true, en: 'Guilty.', zh: '被你发现了。' },
    ],
    hello: { en: "Hi! It's Tingting, from the convenience store — the snack buddy. I'm okay. I have books and sweets to trade.", zh: '嗨！我是婷婷，便利店那个零食搭子。我还好。我有书和糖可以换。' },
    stock: [[2132, 1], [3006, 1], [20213, 1], [2141, 1]],
    gifts: [24120, 41001],
  },
  {
    id: 'hardwareOwner',
    name: { en: 'Old Zhang (Hardware)', zh: '五金店老张' },
    where: { en: 'Hardware Store', zh: '五金店' },
    pre: [
      { en: 'Old Zhang: Nails, wire, sheet metal… you boarding up for a typhoon?', zh: '老张：钉子、铁丝、铁皮……你这是要防台风？' },
      { me: true, en: 'Something like that.', zh: '差不多吧。' },
    ],
    hello: { en: 'Old Zhang, from the hardware store. Still got scrap in the back. Trade?', zh: '五金店的老张。后面还有些废料。换吗？' },
    stock: [[20004, 3], [20104, 2], [20002, 3], [20340, 1]],
    gifts: [20350, 20362],
  },
  {
    id: 'seedVendor',
    name: { en: 'Seed Vendor Auntie', zh: '卖种子的阿姨' },
    where: { en: "Farmers' Market", zh: '农贸市场' },
    pre: [
      { en: 'Seed vendor: Potatoes keep for weeks, dear. And seeds keep for years, if you ask me.', zh: '卖种子的阿姨：土豆能放好几个星期，孩子。要我说，种子能放好几年。' },
      { me: true, en: "Thanks, I'll take a bag of each.", zh: '谢谢，每样来一袋。' },
    ],
    hello: { en: 'The seed auntie from the market here. My stall is gone but I saved a sack of seeds. Want some?', zh: '我是菜市场卖种子的阿姨。摊子没了，我抢出来一袋种子。要不要？' },
    stock: [[2527, 3], [2522, 2], [15021, 2], [15018, 2]],
    gifts: [15026, 15027, 31002],
  },
  {
    id: 'salesRep',
    name: { en: 'Sales Rep (renovation)', zh: '装修公司销售顾问' },
    where: { en: 'Renovation Company', zh: '装修公司' },
    pre: [
      { en: 'Sales rep: The security door ships today if you pay now. Smart choice, honestly.', zh: '销售顾问：现在付款，防盗门今天就能送到。说实话，很明智。' },
      { me: true, en: 'Deal.', zh: '成交。' },
    ],
    hello: { en: 'The sales rep from the renovation company. The showroom is a fortress now. I have parts to spare.', zh: '我是装修公司的销售顾问。展厅现在成了堡垒，我有些零件可以匀出来。' },
    stock: [[20210, 1], [20103, 2], [20106, 2], [20312, 1]],
    gifts: [20310, 31003],
  },
  {
    id: 'furnitureBuyer',
    name: { en: 'Used-Furniture Buyer', zh: '收旧家具的阿姨' },
    where: { en: 'Renovation Company', zh: '装修公司' },
    pre: [
      { en: 'Furniture buyer: Sofa, wardrobe, all of it? You moving out in a hurry, dear?', zh: '收旧家具的阿姨：沙发、衣柜，全都卖？孩子，你这是急着搬家？' },
      { me: true, en: 'Something like that, Auntie.', zh: '差不多吧，阿姨。' },
    ],
    hello: { en: 'Dear, it\'s the auntie who bought your furniture. I kept a few household things. Need any?', zh: '孩子，是我，收你旧家具的阿姨。我留了些日用品，你要不要？' },
    stock: [[11011, 2], [11012, 1], [2508, 1], [11010, 1]],
    gifts: [2146, 24112],
  },
  {
    id: 'carDealer',
    name: { en: 'Car Dealer', zh: '二手车商' },
    where: { en: 'Used Car Lot', zh: '二手车行' },
    pre: [
      { en: "Car dealer: She drinks a bit of oil but she'll run. Want the trunk loaded?", zh: '二手车商：这车有点吃机油，但能跑。后备箱帮你装满？' },
      { me: true, en: 'Fill it up.', zh: '装满。' },
    ],
    hello: { en: 'The car dealer here. Siphoned every tank on the lot. Fuel for food?', zh: '我是车行那个卖车的。车场里每辆车的油都被我抽出来了。拿油换吃的？' },
    stock: [[40000, 2], [8001, 2], [20361, 1]],
    gifts: [40000, 20362],
  },
  {
    id: 'bloodBroker',
    name: { en: 'Blood Broker', zh: '血头' },
    where: { en: 'Black market', zh: '黑市' },
    pre: [
      { en: "Blood broker: Blood's worth more than you think. So is medicine, soon.", zh: '血头：血比你想的值钱。药很快也会的。' },
      { me: true, en: "I'll remember that.", zh: '我记住了。' },
    ],
    hello: { en: 'Remember me? Business is booming. Medicine, if you can pay.', zh: '还记得我吗？生意兴隆。要药的话，拿东西来换。' },
    stock: [[2405, 1], [2408, 1], [2403, 1], [2404, 1]],
    // 11008 Survivor's Emergency Medicine: "用食物从另一名幸存者那交换来的珍贵药品" (precious medicine from another
    // survivor, exchanged for food): the medicine dealer's thanks for food
    gifts: [31003, 31002, 11008],
  },
  {
    id: 'cashier',
    name: { en: 'Xiao Lin (cashier)', zh: '小林（收银员）' },
    where: { en: 'Discount Supermarket', zh: '特价超市' },
    pre: [
      { en: "Cashier: Card or cash? …Buying all that rice, huh. You know something we don't?", zh: '收银员：刷卡还是现金？……买这么多米啊，你是不是知道什么？' },
      { me: true, en: 'Just stocking up. You should too.', zh: '囤点货而已。你也该囤点。' },
    ],
    hello: { en: "It's Lin from the supermarket till. You bought all the rice, remember? I have some spare stock if you want to trade.", zh: '我是超市收银台的小林。你把米都买光了，记得吗？我这儿还有点存货，想换的话可以。' },
    stock: [[2102, 3], [2114, 3], [2105, 2], [2130, 2]],
    gifts: [31001, 41001],
  },
  {
    id: 'clerk',
    name: { en: 'A-Kai (night clerk)', zh: '阿凯（夜班店员）' },
    where: { en: 'Community Convenience Store', zh: '社区便利店' },
    pre: [
      { en: "Night clerk: Energy drinks are two for one today. Not that anyone's buying.", zh: '夜班店员：功能饮料今天买一送一。反正也没人买。' },
      { me: true, en: "I'll take all of them.", zh: '我全要了。' },
    ],
    hello: { en: 'Yo, the energy drink guy! A-Kai from the corner store. I locked myself in with the snacks, lol. Trade?', zh: '哟，买功能饮料的那位！我是街角便利店的阿凯。我把自己和零食一起锁在店里了，哈哈。换点东西？' },
    stock: [[2133, 2], [2131, 2], [2135, 2], [2143, 2]],
    gifts: [41001, 2132],
  },
  {
    id: 'courier',
    name: { en: 'Brother Zhang (courier)', zh: '张哥（快递员）' },
    where: { en: 'Community Convenience Store', zh: '社区便利店' },
    pre: [
      { en: "Courier: Last delivery of the day and the roads are jammed. Something's off out there.", zh: '快递员：今天最后一单，路上堵死了。外面不太对劲。' },
      { me: true, en: 'Get home early today.', zh: '今天早点回家吧。' },
    ],
    hello: { en: "Zhang the courier here. My van's full of undelivered parcels. Guess they're mine now. Trade?", zh: '我是快递员老张。车里全是没送出去的包裹，现在大概归我了。换点东西？' },
    stock: [[2104, 1], [2107, 1], [2115, 2], [11007, 1]],
    gifts: [31001, 2107],
  },
];

// Strangers who text from unknown numbers asking for help (never met before the disaster).
export const UNKNOWN_SURVIVORS = [
  { id: 'u_mother', name: { en: 'Mother with a baby', zh: '带着婴儿的母亲' }, label: { en: 'Unknown number', zh: '陌生号码' }, day: 11, gifts: [41006, 24121] },
  { id: 'u_student', name: { en: 'Stranded dorm student', zh: '困在宿舍的学生' }, label: { en: 'Unknown number', zh: '陌生号码' }, day: 17, gifts: [41008, 3002] },
  { id: 'u_oldman', name: { en: 'Old man living alone', zh: '独居老人' }, label: { en: 'Unknown number', zh: '陌生号码' }, day: 25, gifts: [41007, 31001] },
  { id: 'u_guard', name: { en: 'Mall security guard', zh: '商场保安' }, label: { en: 'Unknown number', zh: '陌生号码' }, day: 36, gifts: [20340, 41003] },
];

export const SURVIVOR_LINES = {
  help: [
    { en: "Sorry to bother you… we're out of food. Could you spare anything at all? Even a little.", zh: '不好意思打扰你……我们没吃的了。能不能匀一点？一点点也行。' },
    { en: "I hate asking. The shelves are empty and I haven't eaten in two days. Could your drone bring something?", zh: '我真不想开口。架子空了，我两天没吃东西了。你的无人机能送点吃的吗？' },
    { en: 'If you have any food to spare, I would be grateful forever. I can tell you where the zombies gather.', zh: '如果你有多余的吃的，我会一辈子感激你。我可以告诉你丧尸都聚在哪儿。' },
  ],
  helpUnknown: [
    { en: 'Hello? I got this number from a flyer on the lamp post. Please, is anyone there? We have nothing left to eat.', zh: '你好？我从电线杆的传单上看到这个号码。求求你，有人吗？我们什么吃的都没有了。' },
    { en: 'You don\'t know me. I found your number in the group chat. My baby is hungry. Anything, please.', zh: '你不认识我。我在群里看到你的号码。我的孩子饿了。求你，什么都行。' },
  ],
  low: [
    { en: 'The food you sent is almost gone. I\'m sorry to ask again.', zh: '你送的吃的快吃完了。对不起，又要麻烦你。' },
    { en: 'Two days of food left. I\'m stretching it as far as I can.', zh: '只剩两天的吃的了。我在尽量省着吃。' },
  ],
  letters: [
    { en: 'Letter: I ate slowly so it would last. My hands stopped shaking today. Thank you.', zh: '信：我吃得很慢，想让它撑久一点。今天我的手终于不抖了。谢谢你。' },
    { en: 'Letter: I heard the drone before I saw it. I cried a little. Don\'t tell anyone.', zh: '信：我先听见了无人机的声音，才看见它。我哭了一小会儿。别告诉别人。' },
    { en: 'Letter: I drew a little sun on the box for you. It\'s all I have to give back, for now.', zh: '信：我在箱子上给你画了个小太阳。现在我只能回报这些。' },
    { en: 'Letter: We are three now — I took in the family from downstairs. Your food fed all of us.', zh: '信：我们现在有三个人了——我收留了楼下的一家。你的吃的养活了我们所有人。' },
    { en: 'Letter: Every time the drone comes, I feel like the city is still alive.', zh: '信：每次无人机飞来，我都觉得这座城市还活着。' },
  ],
  gift: { en: 'I put something in your drone. It\'s worth nothing now, but it was worth a lot to me.', zh: '我在你的无人机里放了点东西。现在它不值钱了，但它对我很重要。' },
  dead: { en: '(No reply. The last message stays unread.)', zh: '（没有回复。最后一条消息一直显示未读。）' },
};

// ------------------------------------------------------------------------------------ group chat
// Homeowners' group chat. The 15 dated prompts and topics follow guide G2 (7 stance replies, 8 food tasks).
export const GROUP_MEMBERS = {
  prop: { en: 'Property Office', zh: '物业' },
  1: { en: 'No. 1 · Old Electrician', zh: '1号老电工' },
  4: { en: 'No. 4 · Grandma Li', zh: '4号李奶奶' },
  7: { en: 'No. 7 · Bookkeeper', zh: '7号记账的' },
  8: { en: 'No. 8 · Repairman', zh: '8号修东西的' },
  9: { en: 'No. 9 · Insurance Sales', zh: '9号保险销售' },
  11: { en: 'No. 11 · Office Worker', zh: '11号上班的' },
  14: { en: 'No. 14 · Kindergarten Teacher', zh: '14号幼师' },
  18: { en: 'No. 18', zh: '18号' },
  22: { en: 'No. 22 · Nurse', zh: '22号护士' },
  23: { en: 'No. 23 · Young Couple', zh: '23号小两口' },
};
export const GROUP_NAME = { en: 'Homeowners\' Group', zh: '业主群' };

const opt = (en, zh, extra = {}) => ({ text: { en, zh }, ...extra });
const FEVER_MEDS = [2406, 2405, 8];

export const GROUP_PROMPTS = [
  {
    id: 'd2', day: 2, hour: 9, author: 1, type: 'stance',
    text: { en: 'Roll call. If you\'re still here, say something. I\'m writing it down.', zh: '点个名。还在的说一声，我记一下。' },
    options: [opt('No. 12 here.', '12号在。'), opt('(Send a thumbs-up)', '（发了个大拇指）')],
    follow: { author: 1, text: { en: 'Got you, No. 12. Seventeen of us so far.', zh: '收到，12号。目前十七户。' } },
  },
  {
    id: 'd7', day: 7, hour: 10, author: 23, type: 'stance',
    text: { en: 'We\'re thinking of going out to look for food. The two of us can\'t last much longer.', zh: '我们想冒险出门找吃的。我们俩撑不了多久了。' },
    options: [opt('I have extra here — say if you need it.', '我这边有多的，需要的说。'), opt("Don't go out. It's too dangerous.", '别出门，太危险了。')],
    follow: { author: 23, text: { en: 'Thank you… we\'ll stay in for now.', zh: '谢谢……那我们先不出去了。' } },
  },
  {
    id: 'd12', day: 12, hour: 11, author: 14, type: 'food',
    text: { en: 'The kids asked me when they\'ll get to eat something hot. I said soon.', zh: '小孩问我什么时候能吃到热的，我说快了。' },
    follow: { author: 14, text: { en: 'They cheered when they saw it. Thank you, No. 12.', zh: '孩子们看到都欢呼了。谢谢你，12号。' } },
  },
  {
    id: 'd17', day: 17, hour: 9, author: 8, type: 'food',
    text: { en: 'Anyone remember the taste of the breakfast place at the corner?', zh: '有人记得街口那家早餐店的味道吗？' },
    follow: { author: 8, text: { en: 'That\'s the one. Now I\'m hungry and happy at the same time.', zh: '就是这个味。我现在又饿又开心。' } },
  },
  {
    id: 'd20', day: 20, hour: 8, author: 11, type: 'food',
    text: { en: 'Dreamt I was eating last night.', zh: '昨天梦见在吃东西。' },
    follow: { author: 11, text: { en: 'Okay, this is better than the dream.', zh: '好吧，这比梦里的还好。' } },
  },
  {
    id: 'd22', day: 22, hour: 10, author: 1, type: 'stance',
    text: { en: 'There were noises on the street last night. Something big.', zh: '昨晚街上有动静，不小。' },
    options: [opt('I heard it too last night.', '昨天晚上我这边也听到了。'), opt('Everyone keep your doors barred.', '大家把门顶好。')],
    follow: { author: 1, text: { en: 'Stay sharp, everyone.', zh: '大家都警醒点。' } },
  },
  {
    id: 'd26', day: 26, hour: 9, author: 'prop', type: 'stance',
    text: { en: 'Cold wave incoming. Let\'s help each other out with charcoal and blankets.', zh: '寒潮来袭，社区互相帮助送炭、送被子。' },
    options: [opt('Who needs charcoal? I have some.', '谁需要炭，我这边有。'), opt('Stay warm, everyone.', '大家注意保暖。')],
    follow: { author: 4, text: { en: 'Bless you, child.', zh: '好孩子，谢谢你。' } },
  },
  {
    id: 'd32', day: 32, hour: 10, author: 7, type: 'food',
    text: { en: 'I redid the sheet. Who still has food, who doesn\'t.', zh: '这张表我重做了。谁家还有吃的，谁家没有。' },
    follow: { author: 7, text: { en: 'Updated. No. 12: generous.', zh: '已更新。12号：大方。' } },
  },
  {
    id: 'd45', day: 45, hour: 11, author: 9, type: 'food',
    text: { en: 'Whose place can still cook something?', zh: '谁家还能做熟的？' },
    follow: { author: 9, text: { en: 'Real food. I forgot what it looked like.', zh: '真正的饭。我都忘了长什么样了。' } },
  },
  {
    id: 'd51', day: 51, hour: 9, author: 14, type: 'stance',
    text: { en: 'Does anyone have fever medicine? One of the kids is burning up.', zh: '有人有退烧药吗？有个孩子烧得厉害。' },
    options: [opt('I have some, I\'ll leave it at your door.', '我这边有，放你门口。', { need: FEVER_MEDS }), opt("I'm out too, sorry.", '我这边也没有了，抱歉。')],
    follow: { author: 14, text: { en: 'Her fever broke this morning. I don\'t know how to thank you.', zh: '她今早退烧了。我都不知道该怎么谢你。' } },
  },
  {
    id: 'd64', day: 64, hour: 10, author: 7, type: 'food',
    text: { en: 'I did the math: the last time anyone on this street cooked was nine days ago.', zh: '我算了一下，这条街上次有人做饭是九天前。' },
    follow: { author: 7, text: { en: 'Correction: zero days ago.', zh: '更正：零天前。' } },
  },
  {
    id: 'd67', day: 67, hour: 9, author: 22, type: 'stance',
    text: { en: 'No. 4 and No. 14 both have fevers. I only have one dose of fever medicine.', zh: '4号和14号都发烧了，我的退烧药只有一份。' },
    options: [opt('I still have some.', '我这边还有一些。', { need: FEVER_MEDS }), opt('Give it to the kid first.', '先给孩子用吧。')],
    follow: { author: 22, text: { en: 'Okay. I\'ll manage the rest. Thank you.', zh: '好。剩下的我来想办法。谢谢。' } },
  },
  {
    id: 'd78', day: 78, hour: 10, author: 1, type: 'stance',
    text: { en: 'No. 18 hasn\'t answered in days.', zh: '18号好几天没回消息了。' },
    options: [opt('He talked to me last month.', '他上个月还跟我说过话。'), opt('Maybe he got out.', '说不定他逃出去了。')],
    follow: { author: 7, text: { en: 'I\'ll keep his row on the sheet.', zh: '表上他那一行我先留着。' } },
  },
  {
    id: 'd83', day: 83, hour: 9, author: 8, type: 'food',
    text: { en: 'I still have half a pack of sugar. Saving it for the kid at No. 14.', zh: '我那半包糖还在，给14号那个小孩留着。' },
    follow: { author: 14, text: { en: 'You all… thank you.', zh: '你们……谢谢。' } },
  },
  {
    id: 'd96', day: 96, hour: 10, author: 22, type: 'food',
    text: { en: 'If you have wounds that won\'t heal, eat something hot. It helps.', zh: '身上有伤口没好的，吃点热的会好得快一点。' },
    follow: { author: 22, text: { en: 'Almost there, everyone. Hold on.', zh: '大家快了，再坚持一下。' } },
  },
];
export const GROUP_PROMPT_BY_ID = Object.fromEntries(GROUP_PROMPTS.map((p) => [p.id, p]));

// Food-sharing choices (patch 08-28): share a photo, or deliver a portion (improves neighbor relations).
export const FOOD_SHARE = {
  photo: { text: { en: '📷 Share a photo of today\'s meal', zh: '📷 在群里晒一张今天的饭' }, sent: { en: '[Photo] Today\'s dinner. Hang in there, everyone.', zh: '【图片】今天的晚饭。大家加油。' }, mor: 5 },
  deliver: { text: { en: '🍱 Deliver a portion', zh: '🍱 送一份过去' }, sent: { en: 'Left a portion of {item} at the door. Take it while it\'s warm.', zh: '在门口放了一份{item}，趁热拿。' }, mor: 3, affinity: 10 },
};

// Messages before the disaster (patch 09-12: correct dates and order). daysAgo 0 = the disaster day.
export const GROUP_HISTORY = [
  { daysAgo: 3, hour: 10, author: 'prop', text: { en: 'Notice: elevator maintenance on Thursday, 9:00–12:00.', zh: '通知：周四9:00-12:00电梯检修。' } },
  { daysAgo: 2, hour: 20, author: 9, text: { en: 'Neighbors! Family accident insurance, special price this week 😄', zh: '各位邻居！家庭意外险本周特价 😄' } },
  { daysAgo: 1, hour: 18, author: 14, text: { en: 'Lost: a small blue kid\'s jacket at the playground.', zh: '寻物：游乐场丢了一件蓝色的小孩外套。' } },
  { daysAgo: 0, hour: 12, author: 11, text: { en: 'Anyone else\'s office sending people home early? Something about the hospital.', zh: '还有谁公司提前放人回家的？说是医院那边出了什么事。' } },
  { daysAgo: 0, hour: 15, author: 'prop', text: { en: 'Residents, please don\'t panic. Keep windows closed and stay tuned.', zh: '各位业主请不要恐慌。关好窗户，留意通知。' } },
  { daysAgo: 0, hour: 17, author: 22, text: { en: 'I just got off shift. Do NOT go near the hospital. I mean it.', zh: '我刚下班。千万别去医院附近。我是认真的。' } },
];

// Informative opening messages on the first night (patch 08-15).
export const GROUP_OPENING = [
  { hour: 18, author: 1, text: { en: 'Did everyone see? People are attacking each other on Main Street!', zh: '大家看到没有？主街上有人互相撕咬！' } },
  { hour: 19, author: 'prop', text: { en: 'Lock your doors. Don\'t open for anyone. Power and water may be unstable.', zh: '锁好门，谁敲都别开。水电可能不稳定。' } },
  { hour: 20, author: 22, text: { en: 'If you get bitten, don\'t hide it. Tell someone.', zh: '被咬了不要瞒着，告诉别人。' } },
  { hour: 21, author: 7, text: { en: 'Let\'s keep this group for real information only. I\'ll make a list of who has what.', zh: '这个群以后只发有用的信息。我来统计谁家有什么。' } },
];

// Ambient daily chatter (thinned out in the late game, patch 09-08).
export const GROUP_CHATTER = [
  { author: 1, text: { en: 'Morning. Still here.', zh: '早。还在。' } },
  { author: 4, text: { en: 'Did anyone else hear a helicopter last night?', zh: '昨晚还有谁听到直升机了？' } },
  { author: 8, text: { en: 'Water pressure\'s getting weak on the upper floors.', zh: '高层的水压越来越小了。' } },
  { author: 9, text: { en: 'Selling: one umbrella, barely used. Accepting food.', zh: '出：雨伞一把，几乎全新。只收吃的。' } },
  { author: 11, text: { en: 'Day whatever. Working from home has never been so literal.', zh: '第不知道几天。居家办公从来没这么名副其实过。' } },
  { author: 14, text: { en: 'The kids drew a picture of everyone in the building. You\'re the one with the drone, No. 12.', zh: '孩子们画了整栋楼的人。12号，你是拿无人机的那个。' } },
  { author: 22, text: { en: 'Boil your water. Please.', zh: '水一定要烧开再喝。拜托了。' } },
  { author: 7, text: { en: 'Reminder: the sheet is pinned. Update it if something changes.', zh: '提醒：表格置顶了，有变化记得更新。' } },
  { author: 23, text: { en: 'We played cards by candlelight. Almost romantic.', zh: '我们点着蜡烛打牌。还挺浪漫的。' } },
  { author: 1, text: { en: 'Cleared the drain on the roof. Rainwater barrel is filling up.', zh: '把楼顶的排水口清了，雨水桶在接水。' } },
  { author: 4, text: { en: 'My grandson called! He\'s safe in the countryside.', zh: '我孙子打电话来了！他在乡下，平安。' } },
  { author: 18, text: { en: 'Quiet on my side of the street today.', zh: '今天我这边街上挺安静。' } },
];

// ------------------------------------------------------------------------------------ Warehouse Manager
// College Student run: crowbar -> truck note (item 9014) -> feed him 10 times by drone -> character unlocked.
export const WM_DELIVERIES = 10;
export const WAREHOUSE_MANAGER = {
  name: { en: 'Warehouse Manager', zh: '仓库管理员' },
  note: { en: '(The note has a phone number scrawled on it: "Supply warehouse by the ring road. Trapped. Please.")', zh: '（字条上潦草地写着一个电话号码："环路边的物资仓库，我被困住了。求求你。"）' },
  first: { en: "…Hello? Someone actually found my note? I'm stuck in the supply warehouse by the ring road. The loading bay caved in and my leg's bad. Food ran out yesterday. Anything your drone can carry.", zh: '……喂？真有人找到我的字条了？我被困在环路边的物资仓库。装卸区塌了，腿也伤了。昨天吃的就没了。你的无人机能带什么都行。' },
  thanks: [
    { en: 'It landed right on the pallet. You\'re a good pilot. Take the pliers, I have spares.', zh: '正好落在托盘上。你开得真稳。钳子你拿着，我这儿有多的。' },
    { en: 'Second meal in three days. My hands are steadier. Sending some wire back.', zh: '三天里的第二顿饭。手不抖了。给你捎点铁丝回去。' },
    { en: 'I found the canned goods aisle — it was under the rubble. Here, have some.', zh: '我找到罐头区了——在碎砖底下。给你一些。' },
    { en: 'Leg\'s splinted. I can crawl to the electronics shelf now. Take these parts.', zh: '腿用夹板固定好了。我现在能爬到电器货架那边了。这些零件你拿着。' },
    { en: 'Halfway there, huh? I\'m counting your drops on the wall like a prisoner. A happy prisoner.', zh: '一半了吧？我像犯人一样在墙上数你送了几次。一个开心的犯人。' },
    { en: 'Found a crate of reinforcement kits. Your door will thank me.', zh: '找到一箱加固件。你家的门会感谢我的。' },
    { en: 'Compressed biscuits — the warehouse was full of them. I never want to see one again. You take them.', zh: '压缩饼干——仓库里全是。我这辈子都不想再看见了，给你吧。' },
    { en: 'The forklift still has diesel. Siphoned you some.', zh: '叉车里还有柴油，给你抽了点。' },
    { en: 'I can stand. One more and I\'ll walk out of here.', zh: '我能站起来了。再来一次，我就能走出去了。' },
    { en: 'I walked to the gate today. Take my access card — if you ever need a warehouse, it\'s yours too.', zh: '我今天走到大门口了。门禁卡你拿着——要是你需要仓库，它也是你的。' },
  ],
  gifts: [[[20350, 1]], [[20104, 2]], [[2115, 2]], [[20210, 1]], [[8001, 1]], [[20310, 1]], [[2101, 1]], [[40000, 1]], [[20362, 1]], [[41005, 1], [2107, 2]]],
  done: { en: 'The Warehouse Manager is safe. (New character unlocked: Warehouse Manager)', zh: '仓库管理员安全了。（解锁新角色：仓库管理员）' },
};

// ------------------------------------------------------------------------------------ veteran
// Warehouse Manager run: a trapped military veteran near the yard (furniture 42013, func 1791).
export const VETERAN = {
  appearDay: 6,
  startFood: 5,
  tile: { floor: '1F', x: 13, y: 14 },
  appear: { en: 'Someone is calling from across the yard — an old man pinned in the collapsed guard booth. "Don\'t come close, son. Just… anything to eat."', zh: '院子那头有人在喊——一个老人被压在塌掉的门卫亭里。"别靠太近，孩子。就……给口吃的。"' },
  stages: [
    { need: 120, give: [[41000, 2]], text: { en: 'Veteran: "Army biscuits. Kept them for thirty years. Eat."', zh: '老兵："部队的压缩饼干，留了三十年。吃吧。"' } },
    { need: 350, give: [[2401, 1], [20310, 1]], text: { en: 'Veteran: "Field medkit. You patch yourself up before you patch that door."', zh: '老兵："野战医疗包。先把自己补好，再去补门。"' } },
    { need: 700, give: [[2107, 2], [41003, 1]], text: { en: 'Veteran: "My dog tag. Somebody should remember my name."', zh: '老兵："我的军牌。总得有人记得我的名字。"' } },
    { need: 1100, give: [[9047, 1]], final: true, text: { en: 'The veteran climbed out and left before dawn. He left a letter — and a string of coordinates.', zh: '老兵在天亮前爬出来走了。他留下一封信——还有一串坐标。' } },
  ],
  gone: { en: 'The guard booth is silent. The veteran is gone.', zh: '门卫亭里没有声音了。老兵不在了。' },
  cache: { id: 'veteranCache', label: { en: "Veteran's supply cache", zh: '老兵的物资点' }, loot: [[41000, 3], [2401, 1], [2107, 2], [20311, 1]] },
};

// Coordinates heard on an unknown number (drone op 'coords', func 1773).
export const COORD_TIPS = [
  { id: 'airdrop', day: 40, label: { en: 'Military airdrop coordinates', zh: '军方空投坐标' }, loot: [[41000, 2], [2107, 2], [2400, 2], [40000, 1]], text: { en: 'Unknown number: A military crate came down off course. Coordinates attached. I can\'t get there — maybe your drone can.', zh: '陌生号码：一个军用物资箱偏离航线掉下来了，坐标附上。我去不了——也许你的无人机可以。' } },
];

// ------------------------------------------------------------------------------------ drone
export const DRONE_FURN = 9054;
export const DRONE_PACKAGE = 14023;
export const SCRAPPED_DRONE = 9044;
export const DRONE_CRAFT = 323;
export const DRONE_BASE_KG = 10;
export const DRONE_HOURS = { trade: 2, scavenge: 3, loot: 0.5, coords: 6, help: 2, deliver: 2, rescue: 3, lure: 24 };

export const SCAVENGE_POOL = [
  [20001, 10], [20002, 8], [20003, 8], [20004, 8], [20005, 8], [20101, 3], [20102, 3], [20103, 3], [20104, 3], [20106, 3],
  [2102, 3], [2114, 3], [2130, 2], [2133, 2], [2902, 2], [2509, 2], [2400, 1], [20210, 1], [41006, 0.5], [41007, 0.5], [41008, 0.5],
];

export const DRONE_PACKAGE_NOTE = {
  en: 'Unknown number: Found a delivery drone in a crashed van — no use to me. Left it at your door. City Center Base Camp trades by drone, look them up.',
  zh: '陌生号码：在一辆撞毁的货车里捡到一架送货无人机，我用不上，放你家门口了。城中心的大本营用无人机做交易，可以找他们。',
};

// ------------------------------------------------------------------------------------ doorstep cat
// Patches 08-25 / 08-26 / 09-08: a stray at the door; more interactions unlock new events;
// choice dialogs auto-pick the default after a countdown; no visits during hordes.
export const CAT_COUNTDOWN_S = 2 * 3600;
export const CAT_EVENTS = [
  {
    id: 'stray', minTrust: 0, final: false,
    text: { en: 'A skinny stray cat is scratching at the front door, meowing.', zh: '一只瘦巴巴的流浪猫在挠门，一直喵喵叫。' },
    choices: [
      { id: 'feed', label: { en: 'Feed it', zh: '喂它' }, food: 1, trust: 2, mor: 5 },
      { id: 'pet', label: { en: 'Pet it through the gap', zh: '从门缝摸摸它' }, trust: 1, mor: 3 },
      { id: 'ignore', label: { en: 'Ignore it', zh: '不理它' } },
    ],
    default: 'ignore',
  },
  {
    id: 'return', minTrust: 3,
    text: { en: 'The stray is back. It rubs against the door frame as if it lives here.', zh: '那只流浪猫又来了。它蹭着门框，好像这里就是它家。' },
    choices: [
      { id: 'feed', label: { en: 'Feed it', zh: '喂它' }, food: 1, trust: 2, mor: 6 },
      { id: 'pet', label: { en: 'Pet it', zh: '摸摸它' }, trust: 1, mor: 4 },
      { id: 'ignore', label: { en: 'Ignore it', zh: '不理它' } },
    ],
    default: 'pet',
  },
  {
    id: 'gift', minTrust: 6,
    text: { en: 'Something is on the doorstep: the cat has left you a present, very proud of itself.', zh: '门口多了点东西：猫给你送来了礼物，一脸骄傲。' },
    choices: [
      { id: 'take', label: { en: 'Accept the gift', zh: '收下礼物' }, give: [[30000, 1]], trust: 1, mor: 4 },
      { id: 'pet', label: { en: 'Praise the hunter', zh: '夸夸这个小猎手' }, trust: 2, mor: 5 },
    ],
    default: 'take',
  },
  {
    id: 'kittens', minTrust: 9,
    text: { en: 'The cat brought two kittens. They huddle against your door in the cold.', zh: '猫带来了两只小猫。它们在寒风里挤在你家门口。' },
    choices: [
      { id: 'feed', label: { en: 'Feed all three', zh: '三只都喂' }, food: 2, trust: 3, mor: 10 },
      { id: 'pet', label: { en: 'Give them an old towel', zh: '给它们一条旧毛巾' }, trust: 2, mor: 6 },
      { id: 'ignore', label: { en: 'Leave them be', zh: '随它们去' } },
    ],
    default: 'pet',
  },
  {
    id: 'guardian', minTrust: 12, final: true,
    text: { en: 'The cat sleeps on your doormat now. At night it hisses at the street before you hear anything.', zh: '猫现在就睡在你家门垫上。夜里你还没听见动静，它就先冲着街上哈气了。' },
    choices: [
      { id: 'pet', label: { en: 'Scratch behind its ears', zh: '挠挠它的耳朵后面' }, trust: 1, mor: 8 },
      { id: 'feed', label: { en: 'Share your dinner', zh: '分它一口晚饭' }, food: 1, trust: 2, mor: 8 },
    ],
    default: 'pet',
  },
];
export const CAT_PREY_GIFTS = [30000, 30011, 30009];
