// Story events, random events, quests and clue documents (P01–P03, P16, F02, F06, Q06, Q07).
//
// Event: { id, characters?, day | dayRange [a, b], dayNg?, hour?, hourNg?, hours? [from, to] (random events),
//   until?, when(state, q)?, skipIf(state, q)? (dropped from the queue once moot), once (default true),
//   cooldown (days), weight (> 0: random pool), endless (a random event that also fires in Pure Endless and,
//   in both endless modes, past the end of its dayRange),
//   manual (only queued by code), urgent (may interrupt a horde), title, text, image (scene key or emoji),
//   choices: [{ label, effects, result, default?, when(state, q)? }], countdown (real seconds) }
// Text fields may be { en, zh } or (state, q) => { en, zh }. `q` is the query helper from sim/story.js.
// Effects: stats, max, items (give), take, food (satiety worth), medicine, fuel, tags, flags, points,
//   quest, effect, cure, memory, recipes, counters, promise, door, kills, taboo, prof, chance, events.
const T = (en, zh) => ({ en, zh });
const byChar = (map) => (s) => map[s.meta.character] || map.wage;
const line = (ok, en, zh) => T(`${ok ? '✔' : '✘'} ${en}`, `${ok ? '✔' : '✘'} ${zh}`);
const join = (...parts) => T(parts.map((p) => p.en).join('\n'), parts.map((p) => p.zh).join('\n'));
const statusText = (q, route, intro) => {
  const st = q.status(route);
  const lines = st.lines.map((l) => line(l.ok, l.text.en, l.text.zh));
  return join(intro, ...lines);
};
const CONTINUE = T('Continue', '继续');

// Illustrations: CSS backdrop + emoji art.
export const SCENES = {
  night: { bg: 'linear-gradient(180deg,#0b1026 0%,#1b2240 60%,#2b2a3a 100%)', art: '🌃' },
  dawn: { bg: 'linear-gradient(180deg,#f3b562 0%,#b86b4b 45%,#3a2a3a 100%)', art: '🌅' },
  radio: { bg: 'radial-gradient(circle at 50% 60%,#3b4b3a,#141a14)', art: '📻' },
  door: { bg: 'linear-gradient(180deg,#4a3826,#1a1410)', art: '🚪' },
  rooftop: { bg: 'linear-gradient(180deg,#6d7fa3,#2c3140)', art: '🏙️' },
  hospital: { bg: 'linear-gradient(180deg,#9fb4c2,#3b4750)', art: '🏥' },
  cold: { bg: 'linear-gradient(180deg,#cfe3f2,#6f8fa8)', art: '❄️' },
  garden: { bg: 'linear-gradient(180deg,#9ccf8a,#2f4f2a)', art: '🪴' },
  warehouse: { bg: 'linear-gradient(180deg,#7ea0b8,#2a3440)', art: '📦' },
  drone: { bg: 'linear-gradient(180deg,#87a8c9,#233447)', art: '🛰️' },
  military: { bg: 'linear-gradient(180deg,#5d6b3a,#1f2414)', art: '🪖' },
  horde: { bg: 'linear-gradient(180deg,#5f2a2a,#1a0c0c)', art: '🧟' },
  document: { bg: 'linear-gradient(180deg,#e8dcc0,#8a7a5a)', art: '📄' },
  rats: { bg: 'linear-gradient(180deg,#5a4c3c,#1d1812)', art: '🐀' },
  fire: { bg: 'linear-gradient(180deg,#e0843a,#3a1a10)', art: '🔥' },
  heli: { bg: 'linear-gradient(180deg,#a9c6e0,#48607a)', art: '🚁' },
  kit: { bg: 'linear-gradient(180deg,#6b7a4a,#23281a)', art: '🧰' },
  package: { bg: 'linear-gradient(180deg,#b08a58,#3a2c1c)', art: '📦' },
  stranger: { bg: 'linear-gradient(180deg,#56606a,#1c2024)', art: '🧍' },
  sick: { bg: 'linear-gradient(180deg,#8fa39a,#27302c)', art: '🤒' },
  dog: { bg: 'linear-gradient(180deg,#9a8a6a,#2e281e)', art: '🐕' },
  phone: { bg: 'linear-gradient(180deg,#3a4660,#141820)', art: '📱' },
  blackout: { bg: 'linear-gradient(180deg,#050608,#15171c)', art: '🌑' },
  recorder: { bg: 'linear-gradient(180deg,#4a4f58,#16181c)', art: '📼' },
  house: { bg: 'linear-gradient(180deg,#8a6e4f,#2a2118)', art: '🏠' },
  choice: { bg: 'radial-gradient(circle at 50% 40%,#5a4a2a,#15120c)', art: '⚖️' },
  birds: { bg: 'linear-gradient(180deg,#b9d3e6,#5a7288)', art: '🐦' },
  rain: { bg: 'linear-gradient(180deg,#56687a,#1f2830)', art: '🌧️' },
  workbench: { bg: 'linear-gradient(180deg,#8a6a44,#2a2016)', art: '🛠️' },
  book: { bg: 'linear-gradient(180deg,#c8b48a,#4a3c26)', art: '📓' },
  candle: { bg: 'radial-gradient(circle at 50% 55%,#e8b45a,#1a120a 70%)', art: '🕯️' },
};

// ------------------------------------------------------------------------------------ story events
const STORY = [
  {
    id: 's_firstNight',
    day: 1,
    hour: 20,
    until: 2,
    image: 'night',
    countdown: 45,
    title: T('The First Night', '灾变第一夜'),
    text: byChar({
      wage: T(
        'The sirens stopped an hour ago. Now there is only something dragging itself up the stairwell, and a TV next door playing to an empty room. You remember this night. Last time you spent it crying behind the sofa.',
        '警报一小时前就停了。现在只剩楼道里有什么东西被拖着往上爬，还有隔壁那台对着空屋子播放的电视。你记得这一夜——上一次，你是缩在沙发后面哭着熬过去的。'
      ),
      student: T(
        'The duplex has never felt so big. Every window is a black mirror, and across the rooftops a man keeps shouting a name nobody answers to. You draw the curtains and open the notebook: the Survival Log. This time you will write everything down.',
        '复式公寓从没显得这么空。每扇窗都是一面黑镜子，屋顶那头有个男人一直在喊一个没人应的名字。你拉上窗帘，翻开那本本子——《生存日志》。这一次，你要把一切都记下来。'
      ),
      warehouse: T(
        'The roller shutter rattles each time the wind — or something else — leans on it. Rows of shelves stand in the dark like sleeping cattle. Twelve years you have counted stock in this place. Tonight you count breaths.',
        '每当风——或者别的什么——靠上来，卷帘门就哗啦作响。一排排货架在黑暗里像睡着的牲口。你在这里清点了十二年库存，今晚你数的是自己的呼吸。'
      ),
    }),
    choices: [
      { label: T('Drag furniture against the door', '把家具推过去顶住门'), effects: { stats: { sta: -10, mor: 4 } }, result: T('It won’t stop them. But it lets you breathe.', '挡不住它们，但至少能让你喘口气。') },
      { label: T('Turn the radio on, low', '把收音机开到最小声'), effects: { stats: { mor: 6 } }, result: T('“…remain indoors… do not open your door to anyone…”', '“……请留在室内……不要为任何人开门……”') },
      { label: T('Write in the Survival Log', '在生存日志上写下一笔'), default: true, effects: { points: 5, max: { mor: 1 } }, result: T('Day 1. Still alive. That is already better than last time.', '第1天。还活着。这已经比上一次强了。') },
    ],
  },
  {
    id: 's_remember',
    day: 1,
    hour: 19,
    until: 2,
    when: (s, q) => q.ngPlus && q.memories().length > 0,
    image: 'book',
    title: T('You Remember', '你记得'),
    text: (s, q) => {
      const mem = q.memories(3);
      return T(
        `Loop ${s.loop.cycle || 1}. The Survival Log falls open on pages you do not remember writing:\n${mem.map((m) => `— ${m.en}`).join('\n')}`,
        `第${s.loop.cycle || 1}轮。生存日志自己翻开了，停在几页你不记得写过的地方：\n${mem.map((m) => `——${m.zh}`).join('\n')}`
      );
    },
    choices: [{ label: T('This time will be different', '这一次会不一样'), default: true, effects: { stats: { mor: 5 } } }],
  },
  {
    id: 's_morning',
    day: 2,
    hour: 7,
    until: 4,
    image: 'dawn',
    title: T('The Morning After', '灾后清晨'),
    text: byChar({
      wage: T(
        'Grey light. The street below is full of people who move as if they forgot something. The apartment needs work: the stairs to the second floor wobble like loose teeth, rubble chokes the basement door, and the old workbench is seized solid.',
        '天色灰白。楼下的街上挤满了像是忘了什么东西的人，慢吞吞地晃着。这屋子得好好收拾：通往二楼的楼梯松得像要掉的牙，地下室门口被碎石堵死，那张旧工作台也锈得转不动了。'
      ),
      student: T(
        'Grey light. From the balcony door you can see the whole street — and everything in it. The house needs work: the loft ladder is snapped, boxes jam the storage level, and the workbench’s vise will not turn.',
        '天色灰白。从阳台门望出去，整条街——连同街上的一切——尽收眼底。这屋子得好好收拾：阁楼的梯子断了，储物层被杂物堵住，工作台的台钳也拧不动了。'
      ),
      warehouse: T(
        'Grey light through the skylights. The warehouse needs work: the cold storage is padlocked, the lower level is a black mess of pallets, and the workbench in the office has not worked since the last audit.',
        '天窗透进灰白的光。仓库得好好收拾：冷库锁着，下层堆满了乱七八糟的托盘，办公室的工作台自上次盘点后就没再转过。'
      ),
    }),
    choices: [{ label: T('Make a plan', '列个计划'), default: true, effects: { points: 3, quest: ['repairStairs', 'repairBasement', 'workbench', 'frontDoor'] } }],
  },
  {
    id: 's_radio1',
    day: 2,
    hour: 19,
    image: 'radio',
    title: T('Emergency Broadcast', '紧急广播'),
    text: T(
      '“This is the municipal emergency service. Water treatment is offline. Boil all water. Do not attempt to reach hospitals. Help is being organized.” The voice repeats itself like a recording that does not know it is alone.',
      '“这里是市应急服务中心。水厂已停止运行，所有饮用水请煮沸。请勿前往医院。救援正在组织中。”那个声音一遍遍重复着，像一段不知道自己已经孤零零的录音。'
    ),
    choices: [{ label: T('Keep listening', '继续听'), default: true, effects: { stats: { mor: 3 }, memory: { id: 'radio1', text: T('The emergency broadcast on Day 2 says: do not go to the hospitals.', '第2天的紧急广播说：不要去医院。') } } }],
  },
  {
    id: 'w_rooftop',
    characters: ['wage'],
    day: 3,
    hour: 17,
    image: 'rooftop',
    title: T('A Voice Across the Roof', '屋顶那头的声音'),
    text: T(
      'From the next building, a girl’s voice: “Hey — neighbor! Are you… alive?” You remember her from the supermarket. Last time she stopped calling on Day 9.',
      '隔壁楼传来一个女孩的声音：“喂——邻居！你……还活着吗？”你记得她，超市里见过。上一次，她在第9天之后就再也没喊过了。'
    ),
    choices: [
      { label: T('Wave back', '朝她挥手'), default: true, effects: { stats: { mor: 6 }, tags: ['TAG_NEIGHBOR_MET'] }, result: T('She waves with both arms, like someone flagging down a ship.', '她用两只胳膊拼命挥着，像在拦一艘船。') },
      { label: T('Stay out of sight', '躲着别出声'), effects: { stats: { mor: -2 } }, result: T('After a while she stops calling.', '过了一会儿，她不喊了。') },
    ],
  },
  {
    id: 'st_rooftop',
    characters: ['student'],
    day: 3,
    hour: 17,
    image: 'rooftop',
    title: T('The Man Across the Roof', '屋顶那头的男人'),
    text: T(
      'A man in a wrinkled office shirt waves a broom from the next rooftop. “You okay over there?” He looks like he has not slept in a year. Somehow that is comforting.',
      '隔壁楼顶，一个穿着皱巴巴衬衫的男人挥着扫帚：“你那边还好吗？”他看起来像一年没睡过觉。不知怎的，这反而让人安心。'
    ),
    choices: [
      { label: T('Shout back that you’re fine', '大声回他说还好'), default: true, effects: { stats: { mor: 6 }, tags: ['TAG_NEIGHBOR_MET'] }, result: T('He gives you a thumbs-up and nearly drops the broom.', '他比了个大拇指，差点把扫帚掉下去。') },
      { label: T('Pretend you didn’t see him', '假装没看见'), effects: { stats: { mor: -2 } } },
    ],
  },
  {
    id: 'wm_coldRoom',
    characters: ['warehouse'],
    day: 2,
    hour: 11,
    image: 'warehouse',
    title: T('The Cold Room', '冷库'),
    text: T(
      'The cold storage sits behind a steel cage door, and its key went home with the night guard who never came back. The lock is simple. With some sheet metal and plastic you could file a new key at the workbench.',
      '冷库在一道铁笼门后面，钥匙被那个再也没回来的夜班保安带走了。锁不复杂——用几块铁皮和塑料，在工作台上就能锉出一把新钥匙。'
    ),
    choices: [{ label: T('Note it down', '记下来'), default: true, effects: { quest: 'wmColdKey', recipes: [326] } }],
  },
  {
    id: 's_traps',
    day: 4,
    hour: 9,
    dayNg: 1,
    hourNg: 22,
    image: 'rats',
    title: T('Something in the Walls', '墙里的声音'),
    text: T(
      'Gnawing. Tiny claws. A bag of rice has a hole the size of a coin. If rats can get in, rats can be caught — and the old hunting notes say they are edible.',
      '啃咬声，细碎的爪子声。一袋米上被咬出了硬币大小的洞。老鼠进得来，就抓得住——旧的狩猎笔记上说，它们还能吃。'
    ),
    choices: [{ label: T('Set up a trap', '准备布置陷阱'), default: true, effects: { items: [[25001, 1]], tags: ['trapsUnlocked'], quest: 'traps', memory: { id: 'traps', text: T('Rats get into the pantry early. A simple mousetrap in a trap slot catches them.', '老鼠很早就会钻进储物间。在陷阱位放一个简易捕鼠夹就能抓住它们。') } } }],
  },
  {
    id: 'st_seedlings',
    characters: ['student'],
    day: 5,
    hour: 10,
    image: 'garden',
    title: T('Seedlings', '幼苗'),
    text: T(
      'The potted plant on the windowsill has survived everything so far. If it can, so can a tomato. Or twenty. You find two seed packets in the kitchen drawer.',
      '窗台上那盆植物到现在还活着。它能活，番茄也能——二十盆也能。你在厨房抽屉里翻出两包种子。'
    ),
    choices: [{ label: T('Start a little garden', '开辟一个小菜园'), default: true, effects: { items: [[15026, 2], [15034, 2]], quest: 'stGarden1', prof: { plant: 40 } } }],
  },
  {
    id: 's_hordeSoon',
    day: 3,
    when: (s, q) => q.hordeSoon(),
    urgent: true,
    image: 'horde',
    title: T('They’re Gathering', '它们在聚集'),
    text: T(
      'From the window you watch them turn, one by one, toward your street — like a crowd hearing the same song. By tomorrow they will be at the door.',
      '你从窗口看着它们一个接一个转向你这条街——像一群人听见了同一首歌。明天，它们就会到门口。'
    ),
    choices: [{ label: T('Check the door', '去检查大门'), default: true, effects: { quest: 'frontDoor' } }],
  },
  {
    id: 'w_payday',
    characters: ['wage'],
    day: 9,
    hour: 9,
    image: 'phone',
    title: T('Payday', '发薪日'),
    text: T('Your phone buzzes: an automated message from your company. SALARY DEPOSITED. You laugh until you cry, then eat a cracker.', '手机震了一下，是公司的自动短信：工资已到账。你笑到流眼泪，然后吃了一块饼干。'),
    choices: [{ label: CONTINUE, default: true, effects: { stats: { mor: 4 } } }],
  },
  {
    id: 's_doorAdvice',
    day: 10,
    hour: 18,
    when: (s, q) => !q.tag('advancedReinforce'),
    image: 'phone',
    title: T('The Electrician’s Advice', '老电工的法子'),
    text: T(
      'The community chat crackles to life: the old electrician from No. 1. “Sheet metal alone won’t hold. Layer it, brace the frame, bolt through the studs — like this…” He talks you through it for an hour. When he is done, you understand doors better than you understand people.',
      '社区群里亮了：1号的老电工。“光钉铁皮顶不住。要一层层叠，把门框撑住，螺栓打穿龙骨——像这样……”他手把手讲了一个小时。讲完之后，你对门的了解比对人的了解还多。'
    ),
    choices: [
      {
        label: T('Take notes', '认真记笔记'),
        default: true,
        effects: {
          tags: ['advancedReinforce'],
          items: [[20310, 1]],
          prof: { defense: 60 },
          memory: { id: 'advancedReinforce', text: T('On Day 10 the old electrician teaches advanced door reinforcement.', '第10天，老电工会教你门窗的高级加固。') },
        },
        result: T('Advanced Reinforcement learned. He even left you a reinforcement kit at the door.', '学会了高级加固。他还在你门口留了一套加固件。'),
      },
    ],
  },
  {
    id: 'wm_driver',
    characters: ['warehouse'],
    day: 12,
    hour: 19,
    image: 'radio',
    title: T('The Driver’s Last Run', '司机的最后一趟'),
    text: T(
      'The delivery channel crackles: a driver named Lao Zhou, counting off stops that no longer exist. “…Unit 7, cold chain… Unit 9, relief camp…” Then: “If anyone’s at the depot — keep the stubs. Somebody should remember where it all went.”',
      '配送频道沙沙作响：一个叫老周的司机在报站，报的全是已经不存在的站点。“……七号点，冷链……九号点，安置点……”然后是：“要是仓库还有人——把存根留好。总得有人记得那些东西都去了哪。”'
    ),
    choices: [{ label: T('Keep the stubs', '把存根收好'), default: true, effects: { stats: { mor: 2 }, memory: { id: 'stubs', text: T('The driver asks the depot to keep the delivery stubs. They matter later.', '司机让仓库留好配送存根，以后会用得上。') } } }],
  },
  {
    id: 's_hospital',
    day: 14,
    hour: 20,
    image: 'hospital',
    title: T('Quarantine at Central', '中心医院隔离'),
    text: T(
      'The radio switches to a different voice, faster, frightened: “…Central Hospital is under quarantine. The first patients came in with fevers eleven days before the outbreak. Eleven days. Someone knew—” Static. Then music, as if nothing happened.',
      '电台里换了一个声音，语速很快，带着恐惧：“……中心医院已被隔离。第一批发烧的病人是在灾变前十一天送来的。十一天。有人早就知道——”一阵杂音。然后是音乐，好像什么都没发生过。'
    ),
    choices: [{ label: T('Remember the hospital', '记住那家医院'), default: true, effects: { quest: 'truthClues', memory: { id: 'hospital', text: T('The Central Hospital saw fevers eleven days before the outbreak. Three record fragments and a recorder are hidden there.', '中心医院在灾变前十一天就出现了发烧病人。那里藏着三份病历碎片和一台记录仪。') } } }],
  },
  {
    id: 'w_network',
    characters: ['wage'],
    day: 16,
    hour: 20,
    image: 'drone',
    title: T('Call Signs', '呼号'),
    text: T(
      'Late at night the radio catches chatter: people you met before the disaster, alive in basements and offices, trading by drone. They call themselves the Net. Every one of them you keep alive is another knot.',
      '深夜，收音机里传来一阵交谈：灾变前你见过的那些人，躲在地下室和写字楼里，用无人机互通有无。他们管自己叫“网”。你每多救活一个人，网上就多一个结。'
    ),
    choices: [{ label: CONTINUE, default: true, effects: { memory: { id: 'net', text: T('Keep at least 6 supported survivors alive by Day 71 to open the Net.', '在第71天前保持至少6名被支援的幸存者存活，就能走“网”这条路。') } } }],
  },
  {
    id: 'wm_binder',
    characters: ['warehouse'],
    day: 18,
    hour: 10,
    image: 'book',
    title: T('The Manager’s Binder', '主管的文件夹'),
    text: T(
      'In the office cabinet: the previous manager’s binder, full of equipment manuals. Solar panels for the roof. A battery bank for the night shift. He planned for everything except this.',
      '办公室柜子里有上一任主管的文件夹，塞满了设备说明书：屋顶的太阳能板、夜班用的蓄电池组。他什么都计划到了，唯独没算到这一天。'
    ),
    choices: [{ label: T('Study the manuals', '研读说明书'), default: true, effects: { recipes: [308, 311], prof: { craft: 60 } }, result: T('New recipes: solar panel and lead-acid battery.', '解锁配方：太阳能板、铅酸蓄电池。') }],
  },
  {
    id: 's_coldFront',
    day: 20,
    hour: 9,
    image: 'cold',
    title: T('Cold Front', '寒潮预警'),
    text: T(
      'The morning frost does not melt. The radio says a cold wave is coming down from the north, and that this winter will be long. You look at your thin walls and do the math.',
      '早上的霜一直没化。电台说北方的寒潮正在南下，今年冬天会很长。你看着单薄的墙壁，算了一笔账。'
    ),
    choices: [{ label: T('Prepare some heating', '准备取暖设备'), default: true, effects: { quest: 'heating' } }],
  },
  {
    id: 'st_vase',
    characters: ['student'],
    day: 20,
    hour: 11,
    image: 'garden',
    title: T('A Vase for Winter', '为冬天准备的花瓶'),
    text: T(
      'Your garden has outgrown the windowsill. The loft gets the morning sun; the basement could get grow lights. And flowers would make the whole place feel less like a bunker.',
      '菜园已经挤满了窗台。阁楼有上午的阳光，地下室可以装补光灯。再插几支花，这里就不那么像地堡了。'
    ),
    choices: [{ label: T('Expand the garden', '扩建菜园'), default: true, effects: { quest: 'stGarden2', items: [[15035, 2]] } }],
  },
  {
    id: 'wm_winter',
    characters: ['warehouse'],
    day: 28,
    hour: 10,
    image: 'cold',
    title: T('Winter Procedures', '冬季作业规程'),
    text: T('A laminated sheet on the office wall: WINTER PROCEDURES — heater placement, fuel rotation, how to keep the cold room from freezing solid. Someone underlined “do not wait for the first frost”.', '办公室墙上贴着一张塑封的纸：冬季作业规程——暖炉摆放、燃料轮换、如何防止冷库冻成冰坨。有人在“不要等到第一场霜”下面划了线。'),
    choices: [{ label: T('Follow the procedures', '照规程办'), default: true, effects: { recipes: [314, 417], quest: 'heating' }, result: T('New recipes: electric heater and heater.', '解锁配方：电暖器、暖炉。') }],
  },
  {
    id: 's_blueprint',
    day: 30,
    hour: 15,
    image: 'heli',
    title: T('A Message from the Sky', '来自天空的讯息'),
    text: T(
      'A military drone drifts over the rooftops, dropping leaflets like snow. One lands on your windowsill with a folded sheet taped to it: a blueprint for a reflective rescue marker. “Mark your roof. Rescue flights will resume. Hold on.”',
      '一架军用无人机从屋顶上空飘过，传单像雪一样落下。一张落在你的窗台上，上面用胶带贴着一张折好的图纸：一种反光救援标记的做法。“标记你的屋顶。救援航班将会恢复。坚持住。”'
    ),
    choices: [
      {
        label: T('Keep the blueprint', '收好图纸'),
        default: true,
        effects: { items: [[9003, 1]], recipes: [23], quest: 'rescueBeacon', memory: { id: 'beacon', text: T('Day 30: a military drone drops the rescue marker blueprint. Build it at the workbench and set it up on the second floor.', '第30天，军用无人机会投下救援标记图纸。在工作台做好后装在二楼。') } },
      },
    ],
  },
  {
    id: 's_fragments',
    day: 38,
    hour: 7,
    image: 'hospital',
    title: T('Fragments', '碎片'),
    text: (s, q) =>
      q.clues('hospital') > 0
        ? T(
            'You dream of a waiting room full of people with bandaged arms, all holding the same pamphlet: FREE IMMUNITY BOOSTER. When you wake, the record fragment on your table says the same thing.',
            '你梦见一间候诊室，里面坐满了胳膊缠着纱布的人，每个人手里都拿着同一张传单：免费免疫增强剂。醒来后，桌上的病历碎片写着同样的字。'
          )
        : T(
            'You dream of a waiting room full of people with bandaged arms, all holding the same pamphlet: FREE IMMUNITY BOOSTER — CENTRAL HOSPITAL TRIAL. When you wake, you are not sure it was a dream.',
            '你梦见一间候诊室，里面坐满了胳膊缠着纱布的人，每个人手里都拿着同一张传单：免费免疫增强剂——中心医院临床试验。醒来后，你不确定那只是个梦。'
          ),
    choices: [{ label: CONTINUE, default: true, effects: { points: 5, stats: { mor: -2 } } }],
  },
  {
    id: 'st_garden3',
    characters: ['student'],
    day: 45,
    hour: 10,
    image: 'garden',
    title: T('A House That Grows', '会生长的房子'),
    text: T('Pots on the stairs, pots on the shelves, pots on the fridge. The radio says winter will last past Day 80. If the whole house grew, you might never go hungry again.', '楼梯上是花盆，架子上是花盆，冰箱顶上也是花盆。电台说冬天会持续到第80天以后。如果整栋房子都能长出东西，你也许再也不会挨饿。'),
    choices: [{ label: T('Fill the house with planters', '让花盆占满整栋房子'), default: true, effects: { quest: 'stGarden3' } }],
  },
  {
    id: 's_halfway',
    day: 50,
    hour: 9,
    image: 'book',
    title: T('Fifty Days', '第五十天'),
    text: T('Fifty days. You flip back through the Survival Log: the handwriting gets steadier page by page. Whatever happens next, this loop already went further than the last.', '五十天了。你翻看着生存日志：字迹一页比一页稳。不管接下来发生什么，这一轮已经比上一轮走得更远了。'),
    choices: [{ label: CONTINUE, default: true, effects: { points: 15, max: { mor: 2 } } }],
  },
  {
    id: 's_kitSafety',
    day: 69,
    hour: 10,
    when: (s, q) => !q.flag('kitSeen') && !q.route,
    skipIf: (s, q) => !!q.flag('kitSeen') || !!q.route,
    image: 'kit',
    title: T('A Crate in the Street', '街上的补给箱'),
    text: T('A parachute crate crashes onto the street and splits open. Among the ration packs, a dented olive case lies intact, stenciled with a unit number.', '一个带降落伞的补给箱砸在街上摔开了。一堆口粮包中间，有一个磕瘪了的军绿色箱子完好无损，上面喷着部队番号。'),
    choices: [{ label: T('Grab the case', '把箱子拿回来'), default: true, effects: { stats: { sta: -10 }, items: [[9048, 1]] } }],
  },
  {
    id: 's_reckoning',
    day: 70,
    hour: 9,
    image: 'choice',
    title: T('Day of Reckoning', '摊牌之日'),
    text: T(
      'Day 70. The radio, the phone, the rope line across the roof — everything lights up at once, as if the whole city decided to answer you on the same morning. Everyone wants to know the same thing: what will you do with the time you have left?',
      '第70天。收音机、手机、屋顶的绳索——一切在同一时刻亮了起来，仿佛整座城市约好了在同一个早晨回应你。所有人都想知道同一件事：剩下的日子，你打算怎么过？'
    ),
    choices: [
      {
        label: T('Listen to them all', '一个一个听'),
        default: true,
        effects: {
          tags: ['TAG_RECKONING'],
          events: ['r_military', 'r_door', 'r_neighbor', 'r_network', 'r_recorder', 'r_garden', 'r_hub', 'r_choice'],
          memory: { id: 'reckoning', text: T('Day 70 is the Day of Reckoning. The ending commitment closes after Day 74.', '第70天是摊牌之日。结局承诺在第74天后关闭。') },
        },
      },
    ],
  },
  {
    id: 'r_military',
    manual: true,
    image: 'military',
    title: T('Military Frequency', '军用频段'),
    text: (s, q) =>
      statusText(q, 'evacuate', T('“…to survivors who can hear this: extraction flights resume on Day 101. We can only find rooftops that are marked. Keep your beacon at full power.”', '“……致所有能听到的幸存者：撤离航班将于第101天恢复。我们只能找到有标记的屋顶。请保持信标全功率运行。”')),
    choices: [{ label: CONTINUE, default: true }],
  },
  {
    id: 'r_door',
    manual: true,
    characters: ['wage', 'student'],
    image: 'door',
    title: T('The Door', '那扇门'),
    text: (s, q) =>
      statusText(q, 'fortress', T('You rest your forehead against the front door. It is scarred by seventy days of hands and teeth. It could be more than a door — if you gave it everything.', '你把额头抵在大门上。七十天来的抓挠和啃咬在它身上留下了一道道疤。如果你把一切都押上，它可以不只是一扇门。')),
    choices: [{ label: CONTINUE, default: true }],
  },
  {
    id: 'r_neighbor',
    manual: true,
    characters: ['wage', 'student'],
    image: 'rooftop',
    title: T('Across the Rope', '绳子那头'),
    text: (s, q) =>
      q.character === 'wage'
        ? statusText(q, 'girl', T('The basket comes back with a note in her round handwriting: “Winter’s coming and my windows are paper. If I have to trust one person with it… it’s you.”', '篮子送回来时里面夹着一张纸条，是她圆滚滚的字：“冬天要来了，我的窗户跟纸糊的一样。如果只能把它托付给一个人……那就是你。”'))
        : statusText(q, 'companion', T('The basket comes back with a note in his cramped handwriting: “My stove is dying. I keep thinking — if we get through this winter, it will be because of you.”', '篮子送回来时里面夹着一张纸条，是他挤成一团的字：“我的炉子快不行了。我一直在想——要是我们熬过这个冬天，那一定是因为你。”')),
    choices: [{ label: CONTINUE, default: true }],
  },
  {
    id: 'r_network',
    manual: true,
    characters: ['wage'],
    image: 'drone',
    title: T('Twelve Call Signs', '十二个呼号'),
    text: (s, q) =>
      statusText(q, 'stranger', T('Your drone radio fills with voices — the survivors you fed. Twelve call signs, they say, ready to become a network if someone can fly farther.', '无人机的电台里挤满了声音——那些你喂饱过的幸存者。他们说，有十二个呼号，只要有人能飞得更远，就能连成一张网。')),
    choices: [{ label: CONTINUE, default: true }],
  },
  {
    id: 'r_recorder',
    manual: true,
    image: 'recorder',
    when: (s, q) => q.started('truthClues'),
    title: T('The Recorder', '记录仪'),
    text: (s, q) =>
      statusText(q, 'truth', T('The recorder’s rusted data port blinks once, as if it heard its name. Whatever is inside needs one more precise repair.', '记录仪锈死的数据口闪了一下，好像听见了自己的名字。里面的东西，只差一次精密的修复。')),
    choices: [{ label: CONTINUE, default: true }],
  },
  {
    id: 'r_garden',
    manual: true,
    characters: ['student'],
    image: 'garden',
    title: T('Seeds in Winter', '冬天的种子'),
    text: (s, q) =>
      statusText(q, 'greenhouse', T('Pots crowd every windowsill, every step, the basement shelves. If every pot had light and warmth, this house could grow through the whole winter.', '花盆挤满了每个窗台、每级台阶和地下室的架子。如果每个花盆都有光、有暖，这栋房子就能在整个冬天里生长。')),
    choices: [{ label: CONTINUE, default: true }],
  },
  {
    id: 'r_hub',
    manual: true,
    characters: ['warehouse'],
    image: 'warehouse',
    title: T('The Iron Barrel', '铁桶'),
    text: (s, q) =>
      statusText(q, 'supply', T('Notes have started appearing on the shutter: Are you open? Can we trade? The warehouse could become a supply station — sealed like an iron barrel, the one place in the district that does not run out.', '卷帘门上开始出现纸条：营业吗？能交易吗？这座仓库可以成为一座补给站——像铁桶一样严实，成为这片街区唯一不会断粮的地方。')),
    choices: [{ label: CONTINUE, default: true }],
  },
  {
    id: 'r_choice',
    manual: true,
    image: 'kit',
    title: T('My Choice', '我的选择'),
    text: T(
      'The kit sits on the table. Until the end of Day 74 you can bet the rest of your days on one road: use the Military Repair Kit on the device of the path you choose. Or keep it, and simply hold on until Day 101.',
      '套件就放在桌上。在第74天结束之前，你可以把余下的日子押在一条路上：对你选择的那条路上的设备使用军用维修套件。或者留着它，只是撑到第101天。'
    ),
    choices: [{ label: T('Think it over', '好好想想'), default: true, effects: { quest: 'myChoice' } }],
  },
  {
    id: 's_route71',
    day: 71,
    hour: 9,
    when: (s, q) => !q.route,
    image: 'choice',
    title: T('The Answers Are In', '答复到了'),
    text: (s, q) => {
      const route = { wage: 'stranger', student: 'greenhouse', warehouse: 'supply' }[q.character];
      return statusText(q, route, T('Day 71. The last checks come back. Some roads are open now; others are not.', '第71天。最后的核查结果出来了。有些路开了，有些没有。'));
    },
    choices: [{ label: CONTINUE, default: true }],
  },
  {
    id: 's_lastCall',
    day: 74,
    hour: 18,
    until: 74,
    when: (s, q) => !q.route && q.kit(),
    skipIf: (s, q) => !!q.route || q.day > 74,
    image: 'kit',
    title: T('Last Call', '最后的机会'),
    text: T('Tomorrow the parts in the kit will be just parts. If you are going to choose, choose tonight.', '到了明天，套件里的零件就只是零件了。要选，就今晚选。'),
    choices: [{ label: CONTINUE, default: true }],
  },
  {
    id: 's_windowClosed',
    day: 75,
    hour: 8,
    when: (s, q) => !q.route,
    image: 'dawn',
    title: T('The Road Not Taken', '没有选的路'),
    text: T('The deadline passes quietly. No one calls. You will do what you have always done: hold the door, ration the rice and count the days to 101.', '期限悄无声息地过去了，没有人打来电话。你会继续做你一直在做的事：守住大门，省着吃米，数着日子等第101天。'),
    choices: [{ label: CONTINUE, default: true, effects: { quest: 'holdOut' } }],
  },
  {
    id: 's_finalWarning',
    day: 70,
    when: (s, q) => q.day >= q.finalWaveDay - 1 && q.hour >= 12 && !q.tag('TAG_FINAL_WAVE_SURVIVED'),
    skipIf: (s, q) => q.tag('TAG_FINAL_WAVE_SURVIVED'),
    urgent: true,
    image: 'horde',
    title: T('The Last Horde', '最后的尸潮'),
    text: (s, q) =>
      T(
        `Every walker for miles is moving toward the district. The radio calls it the final wave — expected on Day ${q.finalWaveDay}. Everything you have built gets tested at once.`,
        `方圆几里内的丧尸都在朝这片街区涌来。电台称之为终局尸潮——预计在第${q.finalWaveDay}天抵达。你建起来的一切，都将在同一时刻接受考验。`
      ),
    choices: [{ label: T('Get ready', '做好准备'), default: true, effects: { quest: 'finalHorde', memory: { id: 'finalHorde', text: T('The final horde comes on Day 87 (earlier on some committed paths). Stock repair kits the day before.', '终局尸潮在第87天到来（部分承诺路线更早）。前一天备好维修材料。') } } }],
  },
  {
    id: 's_afterFinal',
    day: 80,
    when: (s, q) => q.tag('TAG_FINAL_WAVE_SURVIVED'),
    image: 'dawn',
    title: T('Silence', '寂静'),
    text: (s, q) =>
      q.route && q.route !== 'evacuate'
        ? T('When it is over, the silence is so complete you can hear the fridge hum. You survived the final horde.', '一切结束后，四周静得能听见冰箱的嗡嗡声。你撑过了终局尸潮。')
        : T('When it is over, the silence is so complete you can hear the fridge hum. You survived the final horde — but Day 101 is still a long way off, and stragglers will keep coming.', '一切结束后，四周静得能听见冰箱的嗡嗡声。你撑过了终局尸潮——可离第101天还很远，零星的丧尸还会不断涌来。'),
    choices: [{ label: CONTINUE, default: true, effects: { points: 20 } }],
  },
  {
    id: 's_day100',
    day: 100,
    hour: 20,
    image: 'night',
    title: T('One Hundred Days', '一百天'),
    text: T('One hundred days. Tomorrow is Day 101 — the day on the radio, the day on the last page of the Survival Log.', '一百天了。明天就是第101天——电台里说的那一天，生存日志最后一页上的那一天。'),
    choices: [{ label: CONTINUE, default: true, effects: { max: { mor: 2 } } }],
  },
  {
    id: 's_promiseBroken',
    manual: true,
    image: 'dawn',
    title: T('A Promise Unkept', '未兑现的承诺'),
    text: T('Some promises cannot be kept by holding a door. The road you chose closes behind you. All that is left is to hold on until Day 101.', '有些承诺，光守住一扇门是兑现不了的。你选的那条路在身后关上了。剩下的，只有撑到第101天。'),
    choices: [{ label: CONTINUE, default: true, effects: { quest: 'holdOut' } }],
  },
  // -------------------------------------------------------------------- polled triggers (manual)
  {
    id: 's_blackout',
    manual: true,
    image: 'blackout',
    title: T('The City Goes Dark', '全城停电'),
    text: T('Every light in the city goes out at once. The fridge shudders and falls silent. Somewhere a car alarm wails until its battery dies. From now on, every watt is yours to make.', '全城的灯在同一瞬间熄灭。冰箱抖了一下，没了声音。远处一辆车的警报一直响到电瓶耗尽。从现在起，每一度电都得靠你自己。'),
    choices: [{ label: T('Check the fridge', '去看看冰箱'), default: true }],
  },
  {
    id: 's_kit',
    manual: true,
    skipIf: (s, q) => !!q.route,
    image: 'kit',
    title: T('Military Repair Kit', '军用维修套件'),
    text: T(
      'A dented olive case, stenciled with a unit number. Inside, precision parts are packed tight enough to hold a breath — enough to rebuild exactly one device. A beacon, a door, a drone, a recorder, a line to someone you care about. Whatever you choose, there is no second set.',
      '一个磕瘪了的军绿色箱子，上面喷着部队番号。里面的精密零件码得严严实实——只够完整改装一台设备。信标、大门、无人机、记录仪，或是通往某个你在乎的人的那根绳子。无论选哪个，都没有第二套。'
    ),
    choices: [{ label: T('Keep it safe', '好好收着'), default: true, effects: { quest: 'myChoice' } }],
  },
  {
    id: 's_truthExplored',
    manual: true,
    image: 'recorder',
    title: T('The Pieces Fit', '拼上了'),
    text: T('Outpatient log, lab report, pharmacy sheet, and a recorder with a rusted port. Laid side by side on the table they tell half a story. The other half is locked inside the recorder.', '门诊记录、化验报告、药房单据，还有一台数据口锈死的记录仪。并排摆在桌上，它们讲出了半个故事。另一半锁在记录仪里。'),
    choices: [{ label: CONTINUE, default: true, effects: { points: 10 } }],
  },
  {
    id: 's_antenna',
    manual: true,
    image: 'radio',
    title: T('A Clearer Signal', '信号清晰了'),
    text: T('With the dish realigned, the static clears. Under the music there is a second channel: military call signs, reading rooftop coordinates one by one.', '锅面重新对准后，杂音消失了。音乐底下还藏着第二个频道：军方的呼号，一个一个地念着屋顶坐标。'),
    choices: [{ label: CONTINUE, default: true, effects: { stats: { mor: 5 }, memory: { id: 'antenna', text: T('Calibrating the rooftop antenna reveals the military channel.', '校准屋顶天线可以收到军用频道。') } } }],
  },
  {
    id: 'wm_garageKey',
    characters: ['warehouse'],
    day: 2,
    when: (s, q) => q.unlocked('coldStorage') && !q.unlocked('garage'),
    image: 'warehouse',
    title: T('Frozen Behind the Crates', '冻在货箱后面'),
    text: T('Behind a crate of frozen dumplings you find an old copper key with a faded red ring. Someone wrote on it in marker: SHUTTER.', '在一箱速冻饺子后面，你找到一把旧铜钥匙，柄上套着褪了色的红塑料圈，上面用记号笔写着：卷帘。'),
    choices: [{ label: T('Pocket the key', '把钥匙揣好'), default: true, effects: { items: [[9069, 1]], quest: 'wmGarage' } }],
  },
  {
    id: 'wm_cabin',
    characters: ['warehouse'],
    day: 2,
    when: (s, q) => q.unlocked('garage') && !q.unlocked('cabin'),
    image: 'warehouse',
    title: T('The Left Cabin', '左侧小屋'),
    text: T('The garage connects to a small cabin, its iron door locked tight. The lock’s teeth are coarse — you could hammer a key out of sheet metal and wire.', '车库连着一间小屋，铁门锁得死死的。锁芯的齿很粗——用铁皮和铁丝就能敲出一把钥匙。'),
    choices: [{ label: T('Note it down', '记下来'), default: true, effects: { quest: 'wmCabinKey', recipes: [324] } }],
  },
];

// Commitment narratives (queued by sim/story.js commitRoute).
const COMMITS = {
  evacuate: T('The beacon hums, then sings. Its antenna swings toward the sky and stays there. Somewhere, a map gets one more dot. Now you just have to still be here on Day 101.', '信标先是嗡嗡作响，然后开始鸣叫。天线转向天空，再也没有移开。某张地图上又多了一个点。现在，你只需要在第101天还活着。'),
  girl: T('You tie the kit into the basket and send it across. An hour later comes the sound of hammering from her side, then a small cheer. “My windows are real now,” she texts. “I owe you a winter.”', '你把套件绑进篮子送了过去。一小时后，那边传来敲敲打打的声音，然后是一声小小的欢呼。“我的窗户现在是真窗户了，”她发来短信，“我欠你一个冬天。”'),
  stranger: T('With the kit’s motors and cells the drone climbs higher than ever. From up there the city is a map of small lights — twelve of them, blinking back. The network needs supplies to become a camp.', '装上套件的电机和电池后，无人机飞得前所未有地高。从高处看，城市是一张点缀着微光的地图——十二个光点在一闪一闪地回应。这张网还需要物资，才能变成一个据点。'),
  fortress: T('You bolt the kit’s actuators into the frame. The door locks itself, braces itself, watches the street on its own. For the first time since Day 1 you sleep through a night of scratching.', '你把套件的驱动器拧进门框。这扇门会自己上锁、自己加撑，自己盯着街道。从第1天以来，你第一次在抓挠声中一觉睡到了天亮。'),
  truth: T('The data port gives with a click. The recorder whirs and a voice fills the room — a doctor, tired, speaking to whoever finds this. It is only the beginning; the last file points to a sealed room in the hospital.', '数据口咔哒一声松开了。记录仪呼呼转动，一个声音填满了房间——一个疲惫的医生，在对发现这台机器的人说话。这只是开始；最后一个文件指向医院里一间封死的房间。'),
  greenhouse: T('You spread the kit’s heaters and light strips through every pot in the house. That night the whole house glows green and gold, like a lantern floating in a dead city.', '你把套件里的加热片和灯带分到了家里的每一个花盆。那一夜，整栋房子泛着金绿色的光，像一盏漂浮在死城里的灯笼。'),
  companion: T('You send the kit across in the basket. By evening, smoke rises properly from his chimney. “Stove’s alive,” he texts. “So am I. Thanks to you.”', '你把套件放进篮子送了过去。傍晚时分，他家的烟囱终于正常冒烟了。“炉子活了，”他发来短信，“我也活着。多亏了你。”'),
  supply: T('You weld the kit’s locks into the warehouse door. It will open only from inside, only for trade. The Iron Barrel is sealed. Now it has to earn the name.', '你把套件里的锁焊进了仓库大门。从今往后，它只从里面开，只为交易开。铁桶已经封好了。现在，它得配得上这个名字。'),
};

const COMMIT_EVENTS = Object.entries(COMMITS).map(([route, text]) => ({
  id: `c_${route}`,
  manual: true,
  image: { evacuate: 'heli', girl: 'rooftop', stranger: 'drone', fortress: 'door', truth: 'recorder', greenhouse: 'garden', companion: 'rooftop', supply: 'warehouse' }[route],
  title: T('My Choice', '我的选择'),
  text,
  choices: [{ label: CONTINUE, default: true }],
}));

// Promise tasks after the commitment (patch 08-31 "promise tasks").
const neighborLine = (q) => (q.route === 'girl' ? 'her' : 'him');
const REQUESTS = [
  {
    ask: {
      her: T('“I’m down to crackers,” she writes. “Is there anything… hot? Or just anything?”', '“我只剩饼干了，”她写道，“有没有……热的东西？什么都行。”'),
      him: T('“Ate the last can yesterday,” he writes. “Don’t suppose you’ve got anything that isn’t beans?”', '“昨天把最后一罐吃了，”他写道，“你那儿该不会有不是豆子的东西吧？”'),
    },
    label: T('Send food (−30 Satiety worth)', '送去食物（约30饱腹）'),
    effects: { food: 30 },
  },
  {
    ask: {
      her: T('“Fever. Don’t worry. …Do you have anything for it?”', '“发烧了。别担心。……你那儿有药吗？”'),
      him: T('“Cut my hand on the stove door. It’s getting red. Got anything?”', '“手被炉门划了一下，现在红肿了。你有药吗？”'),
    },
    label: T('Send medicine (1 medicine)', '送去药品（1份药）'),
    effects: { medicine: 1 },
  },
  {
    ask: {
      her: T('“The nights are the worst. Is there anything that burns?”', '“晚上最难熬。有没有能烧的东西？”'),
      him: T('“The stove eats everything I give it. Fuel, wood, anything.”', '“炉子什么都吃。燃料、木头，什么都行。”'),
    },
    label: T('Send fuel (1 fuel)', '送去燃料（1份燃料）'),
    alt: { label: T('Send wood chips (4× Wood Chips)', '送去木屑（木屑×4）'), effects: { take: [[20005, 4]] } },
    effects: { fuel: 1 },
  },
];

const PROMISE = [
  ...REQUESTS.map((r, i) => ({
    id: `p_request${i + 1}`,
    day: 71,
    hour: 10,
    once: false,
    cooldown: 2,
    when: (s, q) => (q.route === 'girl' || q.route === 'companion') && !q.neighbor().socialRescue && q.promise().requests === i && q.day > q.committedDay + i * 2,
    image: 'phone',
    title: T('A Message Across the Roof', '屋顶那头的短信'),
    text: (s, q) => r.ask[neighborLine(q)],
    choices: [
      { label: r.label, effects: { ...r.effects, promise: { requests: 1, rescue: 100 }, stats: { mor: 5 } }, result: T('The basket goes over. A minute later the rope tugs twice: thank you.', '篮子送了过去。一分钟后，绳子被拉了两下：谢谢。') },
      ...(r.alt ? [{ label: r.alt.label, effects: { ...r.alt.effects, promise: { requests: 1, rescue: 100 }, stats: { mor: 5 } } }] : []),
      { label: T('Not right now', '现在不行'), default: true, effects: { stats: { mor: -3 } }, result: T('You will have to answer again soon.', '过不了多久，你还得再回复一次。') },
    ],
  })),
  {
    id: 'p_campRun',
    day: 71,
    hour: 11,
    once: false,
    cooldown: 2,
    when: (s, q) => q.route === 'stranger' && q.since('camp.prep.supply') < 4 && q.day > q.committedDay,
    image: 'drone',
    title: T('The Camp Needs Supplies', '据点需要物资'),
    text: (s, q) => T(`Call sign Sparrow: “We’ve got a school gym and forty cots. What we don’t have is food.” (Supply runs: ${q.since('camp.prep.supply')}/4)`, `呼号“麻雀”：“我们有一座学校体育馆和四十张行军床，就是没有吃的。”（投送：${q.since('camp.prep.supply')}/4）`),
    choices: [
      { label: T('Fly a crate over (−40 Satiety worth)', '飞一箱过去（约40饱腹）'), effects: { food: 40, counters: { 'camp.prep.supply': 1 }, points: 5 }, result: T('The drone comes back empty and the radio comes back full of thanks.', '无人机空着回来了，电台里全是感谢。') },
      { label: T('Not today', '今天不行'), default: true },
    ],
  },
  {
    id: 'p_truthFinal',
    day: 75,
    hour: 9,
    once: false,
    cooldown: 2,
    when: (s, q) => q.route === 'truth' && !q.tag('TAG_LINE_TRUTH_FINAL'),
    image: 'hospital',
    title: T('The Last Exploration', '最后的探索'),
    text: T('The recorder has decoded a location: the hospital’s sealed records room, two floors underground. The final piece of the truth is down there.', '记录仪解出了一个位置：医院地下二层那间封死的档案室。真相的最后一块，就在那下面。'),
    choices: [
      {
        label: T('Go to the records room', '去档案室'),
        effects: { stats: { sta: -35, sat: -20 }, items: [[9047, 1]], tags: ['TAG_LINE_TRUTH_FINAL'], chance: { p: 0.3, effects: { effect: ['bleeding', 4] }, text: T('Something in the dark caught your arm on the way out.', '出来的路上，黑暗里有什么东西抓伤了你的胳膊。') } },
        result: T('On top of the files lies a soldier’s letter, addressed to whoever repairs the recorder.', '档案最上面放着一封士兵的信，写给修好记录仪的人。'),
      },
      { label: T('Not yet', '还不是时候'), default: true },
    ],
  },
  {
    id: 'p_supplyPoint',
    day: 71,
    hour: 10,
    once: false,
    cooldown: 2,
    when: (s, q) => q.route === 'supply' && !q.tag('TAG_SUPPLY_SPECIAL_TRADE') && q.day > q.committedDay,
    image: 'drone',
    title: T('Rendezvous', '特殊交易点'),
    text: T('A courier flashes a mirror signal from the overpass: a trading point that deals only with supply stations. They want proof you can deliver.', '一个信使在立交桥上用镜子打着信号：那是一个只和补给站打交道的交易点。他们要你证明自己供得上货。'),
    choices: [
      { label: T('Send the drone with goods (−40 Satiety worth)', '让无人机送货过去（约40饱腹）'), effects: { food: 40, tags: ['TAG_SUPPLY_SPECIAL_TRADE'], items: [[9065, 1]], points: 5, taboo: 'trade' }, result: T('The drone returns with a carbon-copy delivery stub. Your name is on it.', '无人机带回了一张复写纸的配送存根。上面写着你的名字。') },
      { label: T('Not yet', '还不行'), default: true },
    ],
  },
  {
    id: 'p_supplyStub2',
    day: 71,
    hour: 16,
    when: (s, q) => q.route === 'supply' && q.tag('TAG_SUPPLY_SPECIAL_TRADE') && q.clues('slip') === 1 && q.day > q.committedDay + 2,
    image: 'document',
    title: T('A Name on the Slip', '面单上的名字'),
    text: T('Traders start sending back paperwork with their payments: old delivery stubs found in abandoned trucks. They all went through your depot.', '交易的人开始随货款送回一些单据：在废弃货车里找到的旧配送存根。它们全都经过了你的仓库。'),
    choices: [{ label: T('File it', '归档'), default: true, effects: { items: [[9066, 1]] } }],
  },
  {
    id: 'p_supplyStub3',
    day: 71,
    hour: 16,
    when: (s, q) => q.route === 'supply' && q.clues('slip') === 2 && q.day > q.committedDay + 4,
    image: 'document',
    title: T('Where It All Went', '它们都去了哪'),
    text: T('Another stub, another route you planned yourself. You start to see the shape of it — every clinic in the district, supplied from your dock.', '又一张存根，又一条你亲手规划的路线。你开始看清全貌——这片街区的每一家诊所，货都是从你的月台发出去的。'),
    choices: [{ label: T('File it', '归档'), default: true, effects: { items: [[9067, 1]] } }],
  },
  {
    id: 'p_supplyStub4',
    day: 71,
    hour: 16,
    when: (s, q) => q.route === 'supply' && q.clues('slip') === 3 && q.day > q.committedDay + 6,
    image: 'document',
    title: T('Removal — Do Not Log', '清运——不入账'),
    text: T('The last stub comes back folded small inside a payment, as if someone wanted to be rid of it. No receipt, no destination: a truck that left your dock the night before the outbreak, loaded with whatever was left, and never came back.', '最后一张存根被折得小小的，夹在一笔货款里送了回来，像是有人急着脱手。没有回执，没有目的地：一辆车在灾变前一晚装走了剩下的货，从你的月台驶出去，再也没有回来。'),
    choices: [{ label: T('File it', '归档'), default: true, effects: { items: [[9068, 1]] } }],
  },
  {
    id: 'p_fortressNight',
    day: 80,
    hour: 23,
    when: (s, q) => q.route === 'fortress',
    image: 'door',
    title: T('The Sleepless Line', '不眠的防线'),
    text: T('The door ticks through the night like a clock, bracing and unbracing as walkers test it. Hold on. Repel at least 40 of them when the last wave comes.', '整夜里，大门像钟一样滴答作响，丧尸一试探，它就撑紧又放松。坚持住。最后一波来时，至少击退四十只。'),
    choices: [{ label: CONTINUE, default: true, effects: { stats: { mor: 4 } } }],
  },
  {
    id: 'p_greenhouseBloom',
    day: 78,
    hour: 9,
    when: (s, q) => q.route === 'greenhouse',
    image: 'garden',
    title: T('First Winter Bloom', '冬天里的第一朵花'),
    text: T('Snow on the balcony rail, and inside, under the kit’s lamps, a pansy opens. Twenty-four flowers and thirty-six harvests, and a warm house on every floor — then the winter is yours.', '阳台栏杆上积着雪，屋里套件的灯下，一朵三色堇开了。二十四朵花、三十六份收成，再让每一层楼都暖和起来——这个冬天就是你的了。'),
    choices: [{ label: CONTINUE, default: true, effects: { stats: { mor: 6 } } }],
  },
  {
    id: 'p_beaconNight',
    day: 90,
    hour: 22,
    when: (s, q) => q.route === 'evacuate',
    image: 'heli',
    title: T('The Beacon Sings', '信标在歌唱'),
    text: T('Every night the beacon’s light sweeps the clouds. Once, far away, a second light answers. Eleven more days.', '每天夜里，信标的光都扫过云层。有一次，远处有另一道光回应了它。还有十一天。'),
    choices: [{ label: CONTINUE, default: true, effects: { stats: { mor: 5 } } }],
  },
];

// ------------------------------------------------------------------------------------ random events
const RANDOM = [
  {
    id: 'r_canUnderSink',
    weight: 3,
    endless: true,
    dayRange: [2, 100],
    image: 'house',
    title: T('A Can Under the Sink', '水槽下的罐头'),
    text: T('Behind the pipes, forgotten since the day you moved in: a can of luncheon meat, dented but sealed.', '水管后面，搬进来那天就被忘了的：一罐午餐肉，瘪了一块，但还密封着。'),
    choices: [{ label: T('Lucky', '运气不错'), default: true, effects: { items: [[2115, 1]], stats: { mor: 2 } } }],
  },
  {
    id: 'r_scratching',
    weight: 3,
    endless: true,
    once: false,
    cooldown: 12,
    dayRange: [2, 100],
    hours: [21, 3],
    image: 'night',
    title: T('Scratching at Night', '夜里的抓挠声'),
    text: T('Something scratches at the wall, slow and patient. It stops when you hold your breath.', '有什么东西在挠墙，慢条斯理，很有耐心。你一屏住呼吸，它就停了。'),
    choices: [
      { label: T('Check with a flashlight', '拿手电去看看'), effects: { stats: { sta: -5 }, chance: { p: 0.5, effects: { stats: { mor: 3 } }, text: T('Just a rat. You almost laugh.', '只是一只老鼠。你差点笑出声。') } } },
      { label: T('Pull the blanket over your head', '蒙上被子'), default: true, effects: { stats: { mor: -3 } } },
    ],
  },
  {
    id: 'r_package',
    weight: 2,
    endless: true,
    once: false,
    cooldown: 10,
    dayRange: [3, 100],
    countdown: 25,
    image: 'package',
    title: T('A Package on the Doorstep', '门口的包裹'),
    text: T('A taped-up box sits on the step. No name, no note. The street looks empty — which means nothing.', '台阶上放着一个缠满胶带的箱子。没有名字，没有字条。街上看起来空无一人——但这说明不了什么。'),
    choices: [
      {
        label: T('Bring it in', '拿进来'),
        effects: { stats: { sta: -4 }, chance: { p: 0.2, effects: { door: -80, stats: { sta: -8 } }, text: T('Something was waiting beside it. You slam the door just in time.', '箱子旁边有东西在等着。你及时把门摔上了。'), else: { items: [[13001, 1]] } } },
      },
      { label: T('Leave it', '别碰它'), default: true },
    ],
  },
  {
    id: 'r_knock',
    weight: 3,
    endless: true,
    once: false,
    cooldown: 8,
    dayRange: [3, 100],
    countdown: 20,
    image: 'door',
    title: T('A Knock at the Door', '敲门声'),
    text: T('Three knocks. A woman’s voice, hoarse: “Please. Just something to eat. I have a kid.”', '三下敲门声。一个女人沙哑的声音：“求求你，给点吃的吧。我还有个孩子。”'),
    choices: [
      { label: T('Pass food through the gap (−20 Satiety worth)', '从门缝递出食物（约20饱腹）'), effects: { food: 20, stats: { mor: 8 }, points: 5 }, result: T('“Thank you… thank you.” Footsteps, fading.', '“谢谢……谢谢你。”脚步声渐渐远了。') },
      { label: T('Stay silent', '不出声'), default: true, effects: { stats: { mor: -6 } } },
    ],
  },
  {
    id: 'r_song',
    weight: 2,
    endless: true,
    once: false,
    cooldown: 15,
    dayRange: [2, 100],
    image: 'radio',
    title: T('A Song on the Radio', '电台里的歌'),
    text: T('Between bursts of static, someone is playing an old love song, badly, on a guitar. You find yourself humming along.', '在一阵阵杂音之间，有人用吉他弹着一首老情歌，弹得很烂。你不知不觉跟着哼了起来。'),
    choices: [{ label: CONTINUE, default: true, effects: { stats: { mor: 6 } } }],
  },
  {
    id: 'r_headache',
    weight: 2,
    endless: true,
    once: false,
    cooldown: 12,
    dayRange: [3, 100],
    image: 'sick',
    title: T('Pounding Headache', '头痛欲裂'),
    text: T('Your head throbs like a drum. Stress, dehydration, or something worse.', '脑袋像鼓一样咚咚作响。压力、缺水，或者更糟的东西。'),
    choices: [
      { label: T('Take something for it (1 medicine)', '吃点药（1份药）'), effects: { medicine: 1, stats: { life: 5, mor: 2 } } },
      { label: T('Sleep it off', '睡一觉扛过去'), default: true, effects: { stats: { sta: -12 } } },
    ],
  },
  {
    id: 'r_draft',
    weight: 2,
    endless: true,
    once: false,
    cooldown: 10,
    dayRange: [15, 100],
    image: 'cold',
    title: T('A Cold Draft', '门缝漏风'),
    text: T('An icy draft creeps under the door and settles in your bones.', '一股冷风从门缝底下钻进来，一直凉到骨头里。'),
    choices: [
      { label: T('Stuff the gap (2× Scrap Paper)', '把缝塞上（废纸×2）'), effects: { take: [[20001, 2]], stats: { mor: 2 } } },
      { label: T('Ignore it', '不管它'), default: true, effects: { effect: ['cold', 6] } },
    ],
  },
  {
    id: 'r_photo',
    weight: 1,
    endless: true,
    dayRange: [4, 100],
    image: 'book',
    title: T('An Old Photograph', '一张旧照片'),
    text: T('Tucked in a book: a photo of a birthday party, everyone squinting into the sun. You don’t remember who took it.', '夹在书里的一张照片：一场生日聚会，每个人都眯着眼看太阳。你不记得是谁拍的了。'),
    choices: [{ label: T('Keep it by the bed', '放在床头'), default: true, effects: { stats: { mor: 4 }, max: { mor: 1 } } }],
  },
  {
    id: 'r_birds',
    weight: 2,
    dayRange: [3, 60],
    image: 'birds',
    title: T('Birds on the Windowsill', '窗台上的鸟'),
    text: T('Two sparrows argue on the sill, as if nothing ended.', '两只麻雀在窗台上吵架，好像什么都没有结束。'),
    choices: [
      { label: T('Scatter some crumbs (1× Soda Crackers)', '撒点饼干屑（苏打饼干×1）'), effects: { take: [[2102, 1]], stats: { mor: 7 }, max: { mor: 1 } } },
      { label: T('Just watch', '只是看着'), default: true, effects: { stats: { mor: 3 } } },
    ],
  },
  {
    id: 'r_stretch',
    weight: 2,
    endless: true,
    once: false,
    cooldown: 6,
    dayRange: [2, 100],
    hours: [6, 12],
    image: 'dawn',
    title: T('Morning Stretch', '晨练'),
    text: T('Your back cracks like a knuckle. Twenty push-ups, then twenty more.', '后背像指关节一样咔咔作响。二十个俯卧撑，再来二十个。'),
    choices: [{ label: T('Keep going', '继续'), default: true, effects: { stats: { sta: -6 }, max: { sta: 1 } } }],
  },
  {
    id: 'r_tissues',
    weight: 1,
    endless: true,
    dayRange: [2, 100],
    image: 'house',
    title: T('A Box of Tissues', '一盒纸巾'),
    text: T('Soft and unopened, at the back of the wardrobe. A small luxury.', '衣柜深处一盒没拆封的纸巾，软软的。一点小小的奢侈。'),
    choices: [{ label: CONTINUE, default: true, effects: { items: [[20001, 3]], stats: { mor: 2 } } }],
  },
  {
    id: 'r_rainwater',
    weight: 1,
    endless: true,
    once: false,
    cooldown: 12,
    dayRange: [3, 100],
    image: 'rain',
    title: T('Gutter Water', '屋檐水'),
    text: T('Rain drums on the gutters. You rig a bucket and a cloth filter, and boil what you catch.', '雨点敲着屋檐。你架起一个桶，绑上一块布当滤网，把接到的水烧开。'),
    choices: [{ label: CONTINUE, default: true, effects: { items: [[2913, 2]], stats: { mor: 2 } } }],
  },
  {
    id: 'r_drop',
    weight: 2,
    endless: true,
    once: false,
    cooldown: 12,
    dayRange: [10, 100],
    countdown: 20,
    image: 'military',
    title: T('Supply Drop', '空投物资'),
    text: T('A pallet on a parachute snags on the lamppost across the street. Walkers are already turning their heads.', '一个挂着降落伞的货盘卡在了街对面的路灯杆上。丧尸们已经扭过头来了。'),
    choices: [
      { label: T('Make a run for it', '冲过去抢'), effects: { stats: { sta: -15 }, items: [[2107, 2], [2400, 1]], taboo: 'explore', chance: { p: 0.3, effects: { effect: ['bleeding', 3] }, text: T('A hand catches your ankle on the way back.', '回来的路上，一只手抓住了你的脚踝。') } } },
      { label: T('Watch it get swarmed', '看着它被围住'), default: true, effects: { stats: { mor: -2 } } },
    ],
  },
  {
    id: 'r_thugs',
    weight: 2,
    endless: true,
    once: false,
    cooldown: 15,
    dayRange: [10, 100],
    countdown: 15,
    image: 'stranger',
    title: T('Thugs at the Door', '门外的暴徒'),
    text: T('“We know you’ve got food in there.” Three of them, with pipes. One kicks the door for emphasis.', '“我们知道你里面有吃的。”三个人，拿着铁管。其中一个踹了一脚门，以示强调。'),
    choices: [
      { label: T('Pay them off (−30 Satiety worth)', '破财消灾（约30饱腹）'), effects: { food: 30, stats: { mor: -4 } } },
      { label: T('Fight back', '反击'), effects: { stats: { sta: -20 }, kills: 2, points: 5, chance: { p: 0.4, effects: { effect: ['bleeding', 4] }, text: T('One of the pipes found your arm.', '有一根铁管砸中了你的胳膊。') } }, result: T('They run. One of them doesn’t get far.', '他们跑了。其中一个没跑多远。') },
      { label: T('Hide and wait', '躲起来等'), default: true, effects: { door: -150, stats: { mor: -6 } } },
    ],
  },
  {
    id: 'r_coughingChild',
    weight: 2,
    endless: true,
    dayRange: [10, 100],
    image: 'sick',
    title: T('A Child Coughing', '孩子的咳嗽声'),
    text: T('Through the wall: a child coughing all night, and a mother whispering promises.', '墙那边，一个孩子咳了一整夜，一个母亲在低声许着承诺。'),
    choices: [
      { label: T('Leave medicine at their door (1 medicine)', '把药放在他们门口（1份药）'), effects: { medicine: 1, stats: { mor: 10 }, points: 10 } },
      { label: T('Put in earplugs', '戴上耳塞'), default: true, effects: { stats: { mor: -8 } } },
    ],
  },
  {
    id: 'r_letter',
    weight: 1,
    endless: true,
    dayRange: [10, 100],
    image: 'document',
    title: T('A Letter Under the Door', '门缝里的信'),
    text: T('“To whoever lives here — the rooftop route to Fifth Street is clear at noon. The walkers sleep in the heat. Good luck.”', '“致住在这里的人——中午去五号街的屋顶那条路是安全的。天热的时候丧尸在睡觉。祝好运。”'),
    choices: [{ label: CONTINUE, default: true, effects: { stats: { mor: 3 }, memory: { id: 'noonRoute', text: T('Walkers are sluggish at noon — the best time to go out.', '丧尸中午最迟钝——那是出门的好时候。') } } }],
  },
  {
    id: 'r_rats',
    weight: 2,
    endless: true,
    once: false,
    cooldown: 14,
    dayRange: [10, 100],
    image: 'rats',
    title: T('Rats in the Pantry', '储物间的老鼠'),
    text: T('Droppings. Gnawed cardboard. Something has been dining on your supplies.', '老鼠屎，被啃烂的纸箱。有什么东西一直在偷吃你的存粮。'),
    choices: [
      { label: T('Clean up and seal everything', '收拾干净，全部封好'), effects: { stats: { sta: -8 } } },
      { label: T('Let them have the crumbs', '随它们去吧'), default: true, effects: { chance: { p: 0.5, effects: { food: 10, stats: { mor: -3 } }, text: T('They had more than crumbs.', '它们吃掉的可不止是碎屑。') } } },
    ],
  },
  {
    id: 'r_generator',
    weight: 1,
    endless: true,
    dayRange: [10, 100],
    hours: [20, 2],
    image: 'night',
    title: T('A Distant Generator', '远处的发电机'),
    text: T('At night you hear it: a generator coughing to life three streets away. Someone else is still fighting.', '夜里你听见了：三条街外，一台发电机咳嗽着启动了。还有别人在坚持。'),
    choices: [{ label: CONTINUE, default: true, effects: { stats: { mor: 4 } } }],
  },
  {
    id: 'r_fever',
    weight: 2,
    endless: true,
    once: false,
    cooldown: 20,
    dayRange: [10, 100],
    image: 'sick',
    title: T('Fever Dream', '发烧'),
    text: T('You wake soaked in sweat, and the ceiling is breathing.', '你浑身湿透地醒来，天花板在呼吸。'),
    choices: [
      { label: T('Take a fever reducer (1× Fever Reducer)', '吃退烧药（退烧药×1）'), effects: { take: [[2406, 1]], stats: { life: 5 } } },
      { label: T('Tough it out', '硬扛'), default: true, effects: { effect: ['fever', 8] } },
    ],
  },
  {
    id: 'r_dog',
    weight: 2,
    endless: true,
    dayRange: [10, 100],
    countdown: 25,
    image: 'dog',
    title: T('A Stray Dog', '流浪狗'),
    text: T('A skinny dog sits outside the door. Not barking. Just waiting.', '一条瘦狗坐在门外。不叫，只是等着。'),
    choices: [
      { label: T('Share some food (−10 Satiety worth)', '分它一点吃的（约10饱腹）'), effects: { food: 10, stats: { mor: 10 }, max: { mor: 2 } }, result: T('It eats, licks your fingers through the gap, and trots off like it has somewhere to be.', '它吃完了，隔着门缝舔了舔你的手指，然后一路小跑走了，好像还有地方要去。') },
      { label: T('Drive it off', '把它赶走'), default: true, effects: { stats: { mor: -3 } } },
    ],
  },
  {
    id: 'r_pipe',
    weight: 1,
    endless: true,
    dayRange: [10, 100],
    image: 'house',
    title: T('Burst Pipe', '水管爆了'),
    text: T('A pipe splits with a bang and water sprays across the floor.', '一根水管砰地裂开，水喷了一地。'),
    choices: [
      { label: T('Patch it (1× Plastic Sheet)', '补上（塑料布×1）'), effects: { take: [[20103, 1]], stats: { sta: -5 } } },
      { label: T('Mop and swear', '边拖地边骂'), default: true, effects: { stats: { sta: -12, mor: -4 } } },
    ],
  },
  {
    id: 'r_numbers',
    weight: 1,
    dayRange: [10, 60],
    hours: [20, 2],
    image: 'radio',
    title: T('Numbers Station', '数字电台'),
    text: T('A flat voice reads numbers on an empty frequency. “Six. Six. Eight. Seven.” Then silence.', '一个平板的声音在空频道里念着数字：“六，六，八，七。”然后是一片寂静。'),
    choices: [{ label: CONTINUE, default: true, effects: { stats: { mor: -1 }, memory: { id: 'numbers', text: T('Six, six, eight, seven: something happens on Day 66, and the final horde comes on Day 87.', '六、六、八、七：第66天会发生什么，第87天是终局尸潮。') } } }],
  },
  {
    id: 'r_scavenger',
    weight: 2,
    endless: true,
    once: false,
    cooldown: 12,
    dayRange: [10, 100],
    countdown: 25,
    image: 'stranger',
    title: T('A Scavenger’s Offer', '拾荒者的交易'),
    text: T('A man pushing a shopping cart of scrap waves at your window: two sheets of metal for a door patch kit?', '一个推着满车废品的男人朝你的窗户招手：两块铁皮换一个门板补丁，换不换？'),
    choices: [
      { label: T('Trade (2× Sheet Metal)', '换（铁皮×2）'), effects: { take: [[20004, 2]], items: [[20300, 1]], taboo: 'trade' } },
      { label: T('No thanks', '不用了'), default: true },
    ],
  },
  {
    id: 'r_candle',
    weight: 1,
    endless: true,
    dayRange: [10, 100],
    hours: [18, 23],
    image: 'candle',
    title: T('Candlelight', '烛光晚餐'),
    text: T('You find the stub of a candle and set the table for one, properly: plate, fork, folded napkin.', '你找到半截蜡烛，认认真真地给自己摆了一桌：盘子、叉子、叠好的餐巾。'),
    choices: [
      { label: T('Make it a real dinner (−15 Satiety worth)', '好好吃一顿（约15饱腹）'), effects: { food: 15, stats: { sat: 15, mor: 10 } } },
      { label: T('Save the candle', '把蜡烛留着'), default: true, effects: { stats: { mor: 2 } } },
    ],
  },
  {
    id: 'r_smoke',
    weight: 1,
    endless: true,
    dayRange: [10, 100],
    image: 'fire',
    title: T('Smoke on the Horizon', '天边的浓烟'),
    text: T('A black column rises in the north. By evening the whole sky smells of burning plastic.', '北边升起一根黑色的烟柱。到了傍晚，整片天空都是烧塑料的味道。'),
    choices: [{ label: CONTINUE, default: true, effects: { stats: { mor: -2 } } }],
  },
  {
    id: 'r_insomnia',
    weight: 2,
    endless: true,
    once: false,
    cooldown: 10,
    dayRange: [10, 100],
    hours: [22, 4],
    image: 'night',
    title: T('Can’t Sleep', '失眠'),
    text: T('Every sound is the door giving way. Every silence is worse.', '每一声响动都像是门要被撞开了。每一阵寂静都更可怕。'),
    choices: [
      { label: T('Read until dawn', '一直读到天亮'), effects: { stats: { mor: 3, sta: -8 } } },
      { label: T('Take a sedative (1× Strong Sedative)', '吃镇静剂（强效镇静剂×1）'), effects: { take: [[2409, 1]], cure: ['insomnia'], stats: { mor: 5 } } },
      { label: T('Stare at the ceiling', '盯着天花板'), default: true, effects: { effect: ['insomnia', 8] } },
    ],
  },
  {
    id: 'r_basketGift',
    characters: ['wage', 'student'],
    weight: 1,
    endless: true,
    once: false,
    cooldown: 20,
    dayRange: [8, 100],
    when: (s, q) => q.tag('TAG_NEIGHBOR_MET') && !q.neighbor().dead && q.neighbor().basket,
    image: 'rooftop',
    title: T('A Gift in the Basket', '篮子里的礼物'),
    text: T('The rope line creaks. In the basket: a note with a drawn smiley face and a small loaf wrapped in cloth.', '绳子吱呀作响。篮子里有一张画着笑脸的纸条，还有一小块用布包着的面包。'),
    choices: [{ label: CONTINUE, default: true, effects: { items: [[2502, 1]], stats: { mor: 5 } } }],
  },
  {
    id: 'r_helicopter',
    weight: 1,
    dayRange: [20, 69],
    image: 'heli',
    title: T('Helicopter Overhead', '头顶的直升机'),
    text: T('A military helicopter passes low, its searchlight sweeping the rooftops. It does not stop.', '一架军用直升机低空掠过，探照灯扫过一个个屋顶。它没有停下。'),
    choices: [{ label: CONTINUE, default: true, effects: { stats: { mor: 3 }, memory: { id: 'heli', text: T('Helicopters search for marked rooftops — a beacon on the second floor gets you seen.', '直升机在寻找有标记的屋顶——装在二楼的信标能让你被看见。') } } }],
  },
  {
    id: 'r_walker',
    weight: 2,
    endless: true,
    once: false,
    cooldown: 6,
    dayRange: [5, 100],
    countdown: 20,
    image: 'horde',
    title: T('A Lone Walker', '游荡的丧尸'),
    text: T('A single walker has found your door and is patiently beating on it with a stump.', '一只落单的丧尸找到了你的门，正用断臂耐心地一下下砸着。'),
    choices: [
      { label: T('Deal with it', '解决它'), effects: { stats: { sta: -10 }, kills: 1, chance: { p: 0.2, effects: { effect: ['bleeding', 2] }, text: T('It got a scratch in before it went down.', '倒下之前，它还是挠了你一下。') } } },
      { label: T('Let the door take it', '让门去扛'), default: true, effects: { door: -60 } },
    ],
  },
  {
    id: 'r_journal',
    weight: 2,
    endless: true,
    once: false,
    cooldown: 10,
    dayRange: [5, 100],
    image: 'book',
    title: T('Writing the Log', '写日志'),
    text: T('You write until your hand cramps: what worked, what didn’t, what you would do differently next time.', '你一直写到手抽筋：什么管用，什么不管用，下一次要怎么做。'),
    choices: [{ label: CONTINUE, default: true, effects: { points: 5, max: { mor: 1 } } }],
  },
  {
    id: 'r_pigeon',
    weight: 1,
    endless: true,
    dayRange: [12, 100],
    image: 'birds',
    title: T('Message on a Pigeon', '信鸽'),
    text: T('A pigeon lands on the terrace with a tiny tube on its leg: the coordinates of a trading post and the words “we trade fair”.', '一只鸽子落在露台上，腿上绑着一根小管子：里面是一个交易点的坐标，还有一句话：“公平交易”。'),
    choices: [{ label: CONTINUE, default: true, effects: { stats: { mor: 3 } } }],
  },
  {
    id: 'r_seeds',
    weight: 1,
    endless: true,
    dayRange: [4, 100],
    image: 'garden',
    title: T('Seeds in a Coat Pocket', '大衣口袋里的种子'),
    text: T('In an old coat: a paper packet of tomato seeds from a garden show you never went to.', '一件旧大衣的口袋里：一包番茄种子，来自一场你从没去过的园艺展。'),
    choices: [{ label: CONTINUE, default: true, effects: { items: [[15026, 2]] } }],
  },
  {
    id: 'r_alleyWood',
    weight: 2,
    endless: true,
    once: false,
    cooldown: 15,
    dayRange: [10, 100],
    countdown: 25,
    image: 'workbench',
    title: T('Broken Furniture in the Alley', '巷子里的破家具'),
    text: T('Someone threw a wardrobe off a balcony. The wood is still good.', '有人把一个衣柜从阳台扔了下来。木头还能用。'),
    choices: [
      { label: T('Haul some back', '拖一些回来'), effects: { stats: { sta: -12 }, items: [[20106, 2], [20005, 3]], taboo: 'explore', chance: { p: 0.15, effects: { effect: ['bleeding', 2] }, text: T('A splinter the size of a nail.', '扎进去一根钉子那么粗的木刺。') } } },
      { label: T('Too risky', '太冒险了'), default: true },
    ],
  },
  {
    id: 'r_dejaVu',
    weight: 1,
    dayRange: [5, 100],
    when: (s, q) => q.ngPlus,
    image: 'book',
    title: T('Déjà Vu', '似曾相识'),
    text: T('You have seen this exact morning before: the same crow on the same wire. The loop remembers, even when you don’t.', '这个早晨你见过：同一只乌鸦，蹲在同一根电线上。循环记得一切，哪怕你不记得。'),
    choices: [{ label: CONTINUE, default: true, effects: { points: 3, stats: { mor: 2 } } }],
  },
];

// ------------------------------------------------------------------------------------ clue documents
// line: hospital (the three record fragments; the student's copies count the same), truth (final piece),
// slip (Warehouse Manager delivery stubs). pair: the hospital fragment a student copy stands in for.
export const CLUES = {
  9041: { line: 'hospital', text: T('Outpatient log, Central Hospital. Nine patients in one morning with the same fever and the same injection mark on the left arm. All of them said the same thing: “It was free.”', '中心医院门诊记录。一个上午来了九个病人，同样的高烧，左臂上同样的针眼。他们说的都是同一句话：“是免费的。”') },
  9042: { line: 'hospital', text: T('Lab report, stamped CONFIDENTIAL. The blood samples keep dividing after the donors die. In the margin, in red: THIS IS NOT A SIDE EFFECT.', '化验报告，盖着“机密”章。献血者死后，血样里的细胞仍在不断分裂。页边用红笔写着：这不是副作用。') },
  9043: { line: 'hospital', text: T('Pharmacy dispatch sheet: 11,000 doses of “Immunity Booster (trial)” released to community clinics eleven days before the outbreak. The authorizing signature has been scratched out.', '药房发放单：灾变前十一天，一万一千剂“免疫增强剂（试验）”发往各社区诊所。批准人的签名被刮掉了。') },
  9062: { line: 'truth', text: T('A torn page of the patient register. Your own name is on it, in your own handwriting, dated eleven days before the outbreak. You do not remember signing.', '病人名册的一页残页。上面有你的名字，是你自己的笔迹，日期是灾变前十一天。你不记得自己签过。') },
  9063: { line: 'hospital', pair: 9042, text: T('A patient’s diary. “Day 3 after the shot. I can’t feel cold anymore. The nurse says that’s good.”', '一个病人的日记：“打针后第3天。我感觉不到冷了。护士说这是好事。”') },
  9064: { line: 'hospital', pair: 9043, text: T('Notes torn from a ward wall: “Mom, we’re downstairs.” “They won’t let us in.” “Why is the door locked from the outside?”', '从病房墙上揭下来的纸条：“妈，我们在楼下。”“他们不让我们进去。”“门为什么是从外面锁上的？”') },
  9047: { line: 'truth', text: T('“I guarded the hospital loading dock for two weeks. We were told it was vaccine and not to open the crates. I opened one. To whoever repairs the recorder: the doctor’s last file is the one that matters.”', '“我在医院的卸货区守了两个星期。他们说那是疫苗，不许我们开箱。我开了一箱。致修好记录仪的人：医生的最后一个文件，才是最重要的。”') },
  9065: { line: 'slip', text: T('Third copy of a delivery form: 40 crates, “medical — keep cold”, delivered to the district warehouse. Received by: you.', '一张配送单的第三联：40箱，“医疗用品——冷藏”，送达片区仓库。签收人：你。') },
  9066: { line: 'slip', text: T('A cold-chain handover stub, its temperature strip still attached. The strip turned red — the crates were already warm when they left your dock.', '一张冷链交接存根，温控条还贴在上面。温控条已经变红——这些箱子离开你的月台时就已经不冷了。') },
  9067: { line: 'slip', text: T('A transfer receipt rerouting the crates from the warehouse to every community clinic in the district. You planned that route yourself, for a pharmaceutical client.', '一张调拨回执：货从仓库转运到片区的每一家社区诊所。这条路线是你亲手为一家医药客户规划的。') },
  9068: { line: 'slip', text: T('A dispatch stub with no receipt: “removal — do not log”. The truck left the depot the night before the outbreak and never came back.', '一张没有回执的发车存根：“清运——不入账”。那辆车在灾变前一晚驶出仓库，再也没有回来。') },
};

const CLUE_EVENTS = Object.entries(CLUES).map(([id, c]) => ({
  id: `clue_${id}`,
  manual: true,
  image: 'document',
  title: T('A Clue', '线索'),
  itemTitle: Number(id),
  text: c.text,
  choices: [{ label: T('Keep it', '收好'), default: true }],
}));

// The prologue's envelope (A05): sim/story.js puts it in the backpack at the start of a story loop, and
// opening it hands over the three sticky notes.
export const ENVELOPE = { item: 9010, notes: [9011, 9012, 9013] };

// Documents that are not clues: the envelope and its notes, and the site lore (sites.js `lore` lists).
export const LORE = {
  9010: { text: T('Your name is on the front — in your own handwriting. Inside, a single line pressed so hard the pen tore the paper: “It starts at six tonight. Don’t waste the morning.” You don’t remember writing it. Three sticky notes are tucked in behind it.', '信封上写着你的名字——是你自己的笔迹。里面只有一行字，笔尖压得把纸都划破了：“今晚六点开始。别浪费这个上午。”你不记得自己写过它。信纸后面还夹着三张便签。') },
  9011: { text: T('FOOD FIRST. Cans, dry goods, anything that keeps. Water. The power won’t last the week — don’t count on the fridge.', '先囤吃的。罐头、干货，放得住的都行。还有水。电撑不过这个星期——别指望冰箱。') },
  9012: { text: T('DON’T OPEN THE DOOR. Not for crying, not for knocking, not for someone calling your name. Brace it. Then brace it again.', '别开门。有人哭不开，有人敲不开，有人喊你的名字也不开。把门撑住，然后再撑一遍。') },
  9013: { text: T('Central Hospital. Eleven days before. “Free” shots. Find out who signed — and WRITE IT ALL DOWN.', '中心医院。灾变前十一天。“免费”的针。查清楚是谁签的字——然后，把一切都写下来。') },
  9050: { text: T('The staff rota for the week of the outbreak. Someone went down it with a red pen: “sick”, “sick”, “fever — sent home”, “sick”. The last column has one name left, and beside it, in the same red: “Close at six. Don’t wait for me.”', '灾变那一周的员工排班表。有人拿红笔顺着名单一路写下去：“病假”“病假”“发烧——已回家”“病假”。最后一栏只剩一个名字，旁边还是那支红笔：“六点关门。别等我。”') },
  9051: { text: T('Received 17:12, the day of the outbreak: 60 cases of water, 40 of instant noodles, 12 of luncheon meat. The driver’s signature runs off the edge of the box, as if his hand was pulled away mid-stroke. Nobody signed for the store.', '灾变当天17:12签收：矿泉水60箱，方便面40箱，午餐肉罐头12箱。司机的签名拖出了格子，像是写到一半被人一把拽走了手。店方那一栏，没有人签。') },
  9052: { text: T('PURCHASE LIMIT: 2 per customer — rice, water, canned food. The 2 is crossed out and a 1 written over it. Underneath, in a different hand: “The clinic says it’s only the flu. So why is everyone buying everything?”', '限购：每人限购两件——大米、饮用水、罐头。“两”被划掉，改成了“一”。下面换了一个人的笔迹：“诊所说只是流感。那为什么大家什么都在买？”') },
  9053: { text: T('“They gave the whole school the free shot in the gym today. It stung. Mei cried. The nurse said it makes us strong for winter.” Then pages about a cat, a maths test, a boy in class 3. Eleven days later: “Mei didn’t come. Half the class didn’t come.” The rest is blank.', '“今天全校在体育馆打了免费的针，有点疼，小美哭了。护士说打了冬天就不容易生病。”后面几页写的是一只猫、一次数学考试、三班的一个男生。十一天后：“小美没来。半个班都没来。”再往后就是空白了。') },
  9054: { text: T('Class 1-A, the week of the outbreak. Monday: four absent. Tuesday: nine. On the last page the teacher stopped ticking names and wrote across it in shaking capitals: EVERYONE GO HOME. LOCK YOUR DOORS.', '一年级A班，灾变那一周。周一：缺勤四人。周二：九人。最后一页上，老师不再打勾，而是用发抖的大字横着写满了整页：全体回家。锁好门。') },
  9055: { text: T('The gym became a relief camp on Day 2. Blankets 300, water 120 cases, rice 40 sacks — every day’s column shorter than the last. Day 9: “fever cases moved onto the stage, curtain drawn.” Day 11: the ledger stops.', '第2天，体育馆成了安置点。棉被300床、饮用水120箱、大米40袋——每天那一栏都比前一天短。第9天：“发烧的人挪到舞台上，拉上幕布。”第11天：台账断了。') },
  9056: { text: T('A crayon drawing: a house with every window black but one, a stick figure waving from it, and a yellow sun coloured over and over until the paper wore through. Across the bottom, in wobbly letters: MY HOUSE IS STILL HERE.', '一张蜡笔画：一栋房子，所有窗户都涂成了黑色，只有一扇亮着，一个小人在窗口挥手；天上的黄太阳被一遍遍地涂，涂到纸都磨破了。最下面歪歪扭扭地写着：我的家还在。') },
  9057: { text: T('Delivered to Floor 12, Clinical Programmes: four ultra-low freezers, two cell incubators, 11,000 single-use syringes. Ordered a month before the outbreak, approved the same afternoon. The approving department’s stamp has been cut out with scissors.', '送达12楼临床项目部：超低温冰柜四台、细胞培养箱两台、一次性注射器一万一千支。灾变前一个月下的单，当天下午就批了。批准部门的公章被人用剪刀剪掉了。') },
  9058: { text: T('Cage 14: restless, refusing food, body temperature falling. Cage 15: the same. Cage 16: still moving after breathing stopped — see attached. There is no attachment. In the margin someone wrote HALT THE TRIAL, then crossed it out.', '14号笼：躁动，拒食，体温持续下降。15号笼：同上。16号笼：呼吸停止后仍在活动——见附页。附页不见了。页边有人写了“暂停试验”，后来又划掉了。') },
  9059: { text: T('Cold room B, booster batch: 2 °C, 2 °C, 3 °C — then six empty hours, and 19 °C, 21 °C. A note squeezed into the corner: “Power cut, batch warmed up. Ship it anyway. The clinics are waiting.”', 'B号冷库，增强剂批次：2°C、2°C、3°C——然后空了六个小时，接着是19°C、21°C。角落里挤着一行字：“停过电，批次回温了。照发。诊所都在等。”') },
  9060: { text: T('A staff badge from the company whose logo keeps turning up in the clues. The name and photo have been gouged out with a key, deep enough to scar the plastic. Only the department survives: CLINICAL PROGRAMMES — COMMUNITY OUTREACH.', '一张工牌，上面印着那家在线索里反复出现的公司的标志。名字和照片被人用钥匙刮掉了，刮得塑料都起了槽。只有部门那一栏还看得清：临床项目部——社区推广。') },
  9061: { text: T('“Night shift: the clinics are reporting fevers. Legal says it is not a reaction, it is seasonal flu. Shred the dosage sheets. If anyone asks, the booster was vitamins.” The last note under the clip is in another hand: “I kept a copy. It’s in the hospital’s old recorder.”', '“夜班注意：各诊所都在报发烧。法务说那不是不良反应，是季节性流感。把剂量表碎掉。有人问起，就说增强剂是维生素。”夹子最底下那张换了一个人的笔迹：“我留了一份副本，在医院那台老记录仪里。”') },
};

export function documentText(id) {
  return (CLUES[id] || LORE[id])?.text || null;
}

export const EVENTS = [...STORY, ...COMMIT_EVENTS, ...PROMISE, ...RANDOM, ...CLUE_EVENTS];

// ------------------------------------------------------------------------------------ quests
// { title, desc?, memo? (NG+ narrative memory), characters?, applies(s, q)?, auto(s, q)?, target?,
//   progress(s, q) -> number, done(s, q)?, prog(s, q)? -> text, action? | action(s, q), deadlineDay?,
//   reward? (effects), onDone? (effects), hideDone? }
const NG_EARLY = (q, normal) => q.day >= (q.ngPlus ? 1 : normal);

export const QUESTS = {
  firstNight: {
    title: T('Survive the first night', '熬过第一夜'),
    desc: T('Stay alive until morning. Keep the door shut and your stats up.', '活到天亮。关好门，照顾好自己的状态。'),
    auto: () => true,
    target: 1,
    progress: (s, q) => (q.day > 2 || (q.day === 2 && q.hour >= 6) ? 1 : 0),
    reward: { points: 5 },
  },
  repairStairs: {
    title: T('Repair the stairs', '修复楼梯'),
    desc: T('The way upstairs is broken. Fixing it takes 2× Wooden Plank and some stamina. Click to start.', '去楼上的路坏了。修好它需要木板×2和一些精力。点击开始修理。'),
    memo: T('You remember: two planks were enough last time.', '你记得：上一次两块木板就够了。'),
    applies: (s, q) => q.hasLock('2F'),
    auto: (s, q) => NG_EARLY(q, 3),
    target: 1,
    progress: (s, q) => (q.unlocked('2F') ? 1 : 0),
    prog: (s, q) => (q.unlocked('2F') ? null : T(`Wooden Plank ${Math.min(2, q.count(20106))}/2`, `木板 ${Math.min(2, q.count(20106))}/2`)),
    action: 'repairStairs',
    reward: { points: 5, memory: { id: 'stairs', text: T('Two wooden planks fix the broken stairs to the second floor.', '两块木板就能修好通往二楼的楼梯。') } },
  },
  repairBasement: {
    title: T('Open the basement', '打通地下室'),
    desc: T('The entrance needs clearing, one repair per day. Click to work on it.', '入口需要清理，每天可以修一次。点击开始修理。'),
    memo: T('You remember where the rubble gives way: it only takes a couple of days.', '你记得碎石哪里最松：只要两三天就能打通。'),
    applies: (s, q) => q.hasLock('B1'),
    auto: (s, q) => NG_EARLY(q, 3),
    target: (s, q) => q.repairsNeeded('B1'),
    progress: (s, q) => (q.unlocked('B1') ? q.repairsNeeded('B1') : q.repairs('B1')),
    action: 'repairBasement',
    reward: { points: 5, memory: { id: 'basement', text: T('The basement opens after two days of clearing.', '清理两天就能打通地下室。') } },
  },
  workbench: {
    title: T('Get the workbench working', '让工作台转起来'),
    desc: (s, q) =>
      q.manualAtHome()
        ? T('You found the workbench manual. Click to repair the workbench with it.', '找到了工作台使用手册。点击用它修好工作台。')
        : q.day >= 6
          ? T('No manual? Study the mechanism yourself (Day 6+). Click to start.', '没有手册？自己琢磨它的构造（第6天起）。点击开始。')
          : T('Search the cabinets for the workbench manual, or figure it out yourself from Day 6.', '在柜子里找找工作台使用手册，或者从第6天起自己琢磨。'),
    memo: T('You remember: the manual is tucked into a cabinet on the ground floor.', '你记得：手册塞在一楼的某个柜子里。'),
    auto: (s, q) => NG_EARLY(q, 2),
    target: 1,
    progress: (s, q) => (q.workbenchFixed() ? 1 : 0),
    action: 'workbench',
    reward: { points: 5, prof: { craft: 30 }, memory: { id: 'workbench', text: T('The workbench manual is in a ground-floor cabinet; from Day 6 you can also work out the repair yourself.', '工作台手册在一楼的柜子里；第6天起也可以自己琢磨着修好。') } },
  },
  frontDoor: {
    title: T('Shore up the front door', '加固大门'),
    desc: T('Reinforce the front door with sheet metal, then learn advanced reinforcement (around Day 10).', '先用铁皮加固大门，再学会高级加固（第10天左右）。'),
    memo: T('You already know how to brace a door properly.', '你已经知道怎么把门撑结实了。'),
    auto: (s, q) => q.day >= 2,
    target: 2,
    progress: (s, q) => (q.doorReinforced() ? 1 : 0) + (q.tag('advancedReinforce') ? 1 : 0),
    reward: { points: 5 },
  },
  traps: {
    title: T('Set a trap', '布置陷阱'),
    desc: T('Put a mousetrap in a trap slot (Planning Mode) and bait it with food.', '在陷阱位（规划模式）放一个捕鼠夹，并放上食物做诱饵。'),
    auto: (s, q) => q.ngPlus && q.day >= 1,
    target: 1,
    progress: (s, q) => Math.min(1, q.counter('trap.place')),
    reward: { points: 3, prof: { trap: 30 } },
  },
  heating: {
    title: T('Prepare for the cold', '准备过冬'),
    desc: T('Install any heating: an electric heater, a heater/fireplace or an air conditioner.', '装好任意一种取暖设备：电暖器、暖炉或空调。'),
    auto: (s, q) => q.day >= 21,
    target: 1,
    progress: (s, q) => Math.min(1, q.heaters()),
    reward: { points: 8, memory: { id: 'heating', text: T('A cold wave hits in the second half of the first month. Any heater, fireplace or AC counts.', '寒潮会在第一个月下旬来袭。电暖器、暖炉、空调都算取暖设备。') } },
  },
  truthClues: {
    title: T('What happened at the hospital?', '医院里发生了什么？'),
    desc: T('Bring home the three hospital record fragments and the old data recorder.', '把医院的三份病历碎片和那台老式记录仪带回家。'),
    auto: (s, q) => q.day >= 15,
    target: 4,
    progress: (s, q) => Math.min(3, q.clues('hospital')) + (q.recorderAtHome() ? 1 : 0),
    done: (s, q) => q.tag('TAG_LINE_TRUTH_EXPLORED'),
    reward: { points: 10 },
  },
  rescueBeacon: {
    title: T('Build a rescue beacon', '制作救援信标'),
    desc: (s, q) =>
      q.beacon()
        ? T('Inspect the beacon once to make sure the helicopters can see it.', '检查一次信标，确保直升机能看见它。')
        : q.has(9002) || q.beaconAnywhere()
          ? T('Set the marker up on the second floor (Planning Mode). Click to install it.', '把标记装到二楼（规划模式）。点击安装。')
          : T('Craft the rescue marker at the workbench from the blueprint, paper, glass, plastic and sheet metal.', '用图纸、废纸、碎玻璃、废塑料和铁皮在工作台上做出救援标记。'),
    auto: (s, q) => q.has(9003) || q.has(9002) || !!q.beaconAnywhere(),
    target: 3,
    progress: (s, q) => (q.has(9002) || q.beaconAnywhere() ? 1 : 0) + (q.beacon() ? 1 : 0) + (q.flag('beaconChecks') > 0 ? 1 : 0),
    action: 'beacon',
    reward: { points: 10 },
  },
  wmColdKey: {
    title: T('Open the cold storage', '打开冷库'),
    desc: T('Craft the Cold Storage Key at the workbench (3× Sheet Metal, 1× Waste Plastic).', '在工作台制作冷库钥匙（铁皮×3、废塑料×1）。'),
    characters: ['warehouse'],
    auto: (s, q) => q.day >= 2,
    target: 1,
    progress: (s, q) => (q.unlocked('coldStorage') ? 1 : 0),
    reward: { points: 8 },
  },
  wmGarage: {
    title: T('Open the garage', '打开车库'),
    desc: T('Clear the way to the lower level, then use the shutter key on the garage.', '先打通下层，再用卷帘钥匙打开车库。'),
    characters: ['warehouse'],
    auto: (s, q) => q.has(9069),
    target: 2,
    progress: (s, q) => (q.unlocked('B1') ? 1 : 0) + (q.unlocked('garage') ? 1 : 0),
    action: 'repairBasement',
    reward: { points: 8 },
  },
  wmCabinKey: {
    title: T('Open the left cabin', '打开左侧小屋'),
    desc: T('Hammer out the Side Room Key at the workbench (3× Sheet Metal, 1× Wire).', '在工作台敲出小屋钥匙（铁皮×3、铁丝×1）。'),
    characters: ['warehouse'],
    auto: (s, q) => q.unlocked('garage'),
    target: 1,
    progress: (s, q) => (q.unlocked('cabin') ? 1 : 0),
    reward: { points: 8 },
  },
  wmStock1: {
    title: T('Stock check: the basics', '盘点：打好底子'),
    characters: ['warehouse'],
    auto: (s, q) => q.day >= 8,
    target: 3,
    progress: (s, q) => [q.homeSat() >= 300, q.homeItems() >= 60, q.storage() >= 4].filter(Boolean).length,
    prog: (s, q) => T(`Satiety ${Math.round(q.homeSat())}/300 · Items ${q.homeItems()}/60 · Storage ${q.storage()}/4`, `饱腹 ${Math.round(q.homeSat())}/300 · 物资 ${q.homeItems()}/60 · 储物 ${q.storage()}/4`),
    reward: { points: 8 },
  },
  wmStock2: {
    title: T('Stock check: a real depot', '盘点：像个仓库'),
    characters: ['warehouse'],
    auto: (s, q) => q.day >= 30 && q.done('wmStock1'),
    target: 3,
    progress: (s, q) => [q.homeSat() >= 600, q.homeItems() >= 120, q.storage() >= 6].filter(Boolean).length,
    prog: (s, q) => T(`Satiety ${Math.round(q.homeSat())}/600 · Items ${q.homeItems()}/120 · Storage ${q.storage()}/6`, `饱腹 ${Math.round(q.homeSat())}/600 · 物资 ${q.homeItems()}/120 · 储物 ${q.storage()}/6`),
    reward: { points: 10 },
  },
  wmStock3: {
    title: T('Stock check: the Iron Barrel', '盘点：铁桶'),
    desc: T('Satiety 1200, 180 items and 8 storage furniture at the same time. Checked from Day 71.', '同时达到饱腹1200、物资180、储物家具8个。第71天起核查。'),
    characters: ['warehouse'],
    auto: (s, q) => q.day >= 50 && q.done('wmStock2'),
    target: 3,
    progress: (s, q) => [q.homeSat() >= 1200, q.homeItems() >= 180, q.storage() >= 8].filter(Boolean).length,
    done: (s, q) => q.day >= 71 && q.homeSat() >= 1200 && q.homeItems() >= 180 && q.storage() >= 8,
    prog: (s, q) => T(`Satiety ${Math.round(q.homeSat())}/1200 · Items ${q.homeItems()}/180 · Storage ${q.storage()}/8`, `饱腹 ${Math.round(q.homeSat())}/1200 · 物资 ${q.homeItems()}/180 · 储物 ${q.storage()}/8`),
    reward: { points: 15 },
  },
  stGarden1: {
    title: T('A windowsill garden', '窗台菜园'),
    desc: T('Have 6 planters installed at home.', '家里装好6个种植容器。'),
    characters: ['student'],
    auto: (s, q) => q.day >= 6,
    target: 6,
    progress: (s, q) => Math.min(6, q.planters()),
    reward: { points: 8, prof: { plant: 60 } },
  },
  stGarden2: {
    title: T('Room to grow', '扩建菜园'),
    desc: T('12 planters in total, at least 3 upstairs and 2 in the basement, plus one vase.', '共12个种植容器，其中二楼至少3个、地下室至少2个，再加一个花瓶。'),
    characters: ['student'],
    auto: (s, q) => q.day >= 21 && q.done('stGarden1'),
    target: 4,
    progress: (s, q) => [q.planters() >= 12, q.planters('2F') >= 3, q.planters('B1') >= 2, q.vases() >= 1].filter(Boolean).length,
    prog: (s, q) => T(`Planters ${q.planters()}/12 · 2F ${q.planters('2F')}/3 · B1 ${q.planters('B1')}/2 · Vase ${Math.min(1, q.vases())}/1`, `种植容器 ${q.planters()}/12 · 二楼 ${q.planters('2F')}/3 · 地下室 ${q.planters('B1')}/2 · 花瓶 ${Math.min(1, q.vases())}/1`),
    reward: { points: 10, prof: { plant: 80 } },
  },
  stGarden3: {
    title: T('A house that grows', '会生长的房子'),
    desc: T('24 planters at home. Checked from Day 71 for the Greenhouse path.', '家中有24个种植容器。第71天起作为温室路线的核查条件。'),
    characters: ['student'],
    auto: (s, q) => q.day >= 46 && q.done('stGarden2'),
    target: 24,
    progress: (s, q) => Math.min(24, q.planters()),
    done: (s, q) => q.day >= 71 && q.planters() >= 24,
    reward: { points: 15 },
  },
  myChoice: {
    title: T('My Choice', '我的选择'),
    desc: T('Use the Military Repair Kit on the device of one path before the end of Day 74. Click to see the paths.', '在第74天结束前，对其中一条路线的设备使用军用维修套件。点击查看所有路线。'),
    applies: (s, q) => !q.route,
    auto: (s, q) => (q.kit() || q.day >= 70) && q.day <= 74,
    deadlineDay: 74,
    target: 1,
    progress: (s, q) => (q.route ? 1 : 0),
    prog: (s, q) => {
      const open = q.openRoutes();
      return open.length ? T(`Open: ${open.map((r) => r.en).join(', ')}`, `可选：${open.map((r) => r.zh).join('、')}`) : T('No path is open yet', '暂时没有可选的路线');
    },
    action: 'myChoice',
    hideDone: true,
  },
  promise_evacuate: {
    title: T('Promise: keep the beacon shining', '承诺：让信标一直亮着'),
    desc: T('Inspect the beacon 3 times, survive the final horde, and hold out until Day 101.', '检查信标3次，撑过终局尸潮，坚持到第101天。'),
    target: 3,
    progress: (s, q) => Math.min(3, q.promise().inspections || 0),
    action: 'checkBeacon',
    onDone: { tags: ['TAG_LINE_RESCUE_READY'] },
  },
  promise_girl: {
    title: T('Promise: get her through the winter', '承诺：陪她熬过冬天'),
    desc: T('Answer her three requests across the rope line (rescue 300). Keep her alive.', '回应她通过绳索发来的三次请求（救助进度300）。让她活下去。'),
    target: 300,
    progress: (s, q) => Math.min(300, q.promise().rescue || 0),
    done: (s, q) => q.tag('TAG_NEIGHBOR_RESCUE3_COMPLETE') || (q.promise().rescue || 0) >= 300,
    onDone: { tags: ['TAG_NEIGHBOR_RESCUE3_COMPLETE'] },
  },
  promise_companion: {
    title: T('Promise: keep his stove burning', '承诺：让他的炉火不灭'),
    desc: T('Answer his three requests across the rope line (rescue 300). Keep him alive.', '回应他通过绳索发来的三次请求（救助进度300）。让他活下去。'),
    target: 300,
    progress: (s, q) => Math.min(300, q.promise().rescue || 0),
    done: (s, q) => q.tag('TAG_COMPANION_RESCUE3_COMPLETE') || (q.promise().rescue || 0) >= 300,
    onDone: { tags: ['TAG_COMPANION_RESCUE3_COMPLETE'] },
  },
  promise_stranger: {
    title: T('Promise: build the camp', '承诺：建起据点'),
    desc: T('Fly 4 supply runs to the survivor outpost with the drone.', '用无人机给幸存者据点投送4次物资。'),
    target: 4,
    progress: (s, q) => Math.min(4, q.since('camp.prep.supply')),
    onDone: { tags: ['TAG_LINE_STRANGER_CAMP_DONE'] },
  },
  promise_fortress: {
    title: T('Promise: the sleepless line', '承诺：不眠的防线'),
    desc: (s, q) => T(`Repel at least 40 zombies in the final horde (Day ${q.finalWaveDay}).`, `在终局尸潮（第${q.finalWaveDay}天）中击退至少40只丧尸。`),
    target: 1,
    progress: (s, q) => (q.tag('TAG_LINE_SHELTER_HELD') ? 1 : 0),
  },
  promise_truth: {
    title: T('Promise: the last exploration', '承诺：最后的探索'),
    desc: T('After Day 75, follow the recorder to the hospital records room and find the last piece.', '第75天后，跟着记录仪的线索去医院档案室，找到最后一块拼图。'),
    target: 1,
    progress: (s, q) => (q.tag('TAG_LINE_TRUTH_FINAL') ? 1 : 0),
  },
  promise_greenhouse: {
    title: T('Promise: a greenhouse winter', '承诺：温室里的冬天'),
    desc: (s, q) =>
      T(
        `Harvest 24 flowers and 36 produce, and keep every open floor warm: a heater or AC actually running there (powered, or a lit fire), or ${q.thermostat} °C.`,
        `收获24朵花与36份蔬果，并让每一层开放的楼层都暖和起来：那一层有真正在运转的取暖设备（通电的电暖器或空调、点着的暖炉），或室温达到${q.thermostat}°C。`
      ),
    target: 3,
    progress: (s, q) => [q.harvest().flowers >= 24, q.harvest().produce >= 36, q.allFloorsHeated()].filter(Boolean).length,
    prog: (s, q) => {
      const h = q.harvest();
      const w = q.warmth();
      const cold = w.cold.map((fl) => q.floorLabel(fl));
      return T(
        `Flowers ${Math.min(24, h.flowers)}/24 · Produce ${Math.min(36, h.produce)}/36 · Warm floors ${w.warm}/${w.floors}${cold.length ? ` (cold: ${cold.map((l) => l.en).join(', ')})` : ''}`,
        `花 ${Math.min(24, h.flowers)}/24 · 蔬果 ${Math.min(36, h.produce)}/36 · 温暖楼层 ${w.warm}/${w.floors}${cold.length ? `（偏冷：${cold.map((l) => l.zh).join('、')}）` : ''}`
      );
    },
    onDone: { tags: ['TAG_LINE_GREENHOUSE_DONE'] },
  },
  promise_supply: {
    title: T('Promise: the Iron Barrel', '承诺：铁桶'),
    desc: (s, q) => T(`Trade at the special point, recover the delivery slips, and repel at least 40 zombies in the final horde (Day ${q.finalWaveDay}).`, `在特殊交易点完成交易、找回配送面单，并在终局尸潮（第${q.finalWaveDay}天）中击退至少40只丧尸。`),
    target: 3,
    progress: (s, q) => (q.tag('TAG_SUPPLY_SPECIAL_TRADE') ? 1 : 0) + (q.clues('slip') >= 3 ? 1 : 0) + (q.tag('TAG_LINE_SUPPLY_HELD') ? 1 : 0),
    done: (s, q) => q.tag('TAG_LINE_SUPPLY_HELD'),
  },
  finalHorde: {
    title: (s, q) => T(`Survive the final horde (Day ${q.finalWaveDay})`, `撑过终局尸潮（第${q.finalWaveDay}天）`),
    desc: T('Repair doors and windows the day before and stock patch kits.', '前一天修好门窗，备足补丁。'),
    auto: (s, q) => q.day >= 75 || (q.route && q.day >= q.finalWaveDay - 5),
    target: 1,
    progress: (s, q) => (q.tag('TAG_FINAL_WAVE_SURVIVED') ? 1 : 0),
    reward: { points: 20 },
  },
  holdOut: {
    title: T('Hold out until Day 101', '坚持到第101天'),
    applies: (s, q) => !q.route || q.route === 'evacuate' || q.flag('routeFailed'),
    auto: (s, q) => q.day >= 75 && (!q.route || q.route === 'evacuate'),
    target: 101,
    progress: (s, q) => Math.min(101, q.day),
  },
};
