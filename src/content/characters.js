// The three playable pasts (store page, dev log #6, launch notes, guides G1/G5).
export const CHARACTERS = {
  wage: {
    id: 'wage',
    name: { en: 'Wage Slave', zh: '打工仔' },
    blurb: {
      en: 'An ordinary office worker in a rented apartment. Good with his hands: crafting is his strength, and he knows how to make Molotov cocktails.',
      zh: '住在出租屋里的普通上班族。动手能力强，擅长制造，会做燃烧瓶。',
    },
    defenseLine: {
      en: 'Defense Line: Molotov cocktails and a chainsaw perimeter.',
      zh: '防线：燃烧瓶与电锯防线。',
    },
    startMoney: 1000,
    wallet: 70,
    loan: 500,
    home: 'apartment',
    neighbor: 'student',
    startProf: { craft: 2, cook: 1, plant: 0, trap: 1, explore: 1 },
    mods: { molotov: 1 },
    color: '#c9a36b',
    unlocked: true,
  },
  student: {
    id: 'student',
    name: { en: 'College Student', zh: '大学生' },
    blurb: {
      en: 'The girl from next door. Her duplex has a sunny balcony and her skills go into farming and cooking. She cannot make Molotovs, but Boston Ivy guards her walls.',
      zh: '隔壁的女大学生。复式公寓带着阳光充足的阳台，擅长种植与烹饪。她不会做燃烧瓶，但爬山虎会守护她的外墙。',
    },
    defenseLine: {
      en: 'Defense Line: spikes, electric nets and Boston Ivy on the walls.',
      zh: '防线：尖刺、电网与外墙的爬山虎。',
    },
    startMoney: 1500,
    wallet: 50,
    loan: 500,
    home: 'duplex',
    neighbor: 'wage',
    startProf: { craft: 1, cook: 2, plant: 2, trap: 0, explore: 1 },
    mods: { growMult: 0.1, plantYield: 0.1, cookQuality: 5 },
    color: '#d98ca8',
    unlockHint: {
      en: 'Help the neighbor girl survive as the Wage Slave, or reach any ending.',
      zh: '以打工仔身份帮助隔壁女孩活下来，或达成任意结局。',
    },
  },
  warehouse: {
    id: 'warehouse',
    name: { en: 'Warehouse Manager', zh: '仓库管理员' },
    blurb: {
      en: 'He runs a supply warehouse on the edge of the district. Huge storage, sharp eyes for hidden supplies, and a cold storage room — if he can get it running.',
      zh: '城郊物资仓库的管理员。储物空间巨大，能一眼看出藏起来的物资，还有一间冷库——前提是能让它运转起来。',
    },
    defenseLine: {
      en: 'Defense Line: heavy doors, sandbag walls and Molotovs.',
      zh: '防线：重型门窗、沙包墙与燃烧瓶。',
    },
    startMoney: 1200,
    wallet: 40,
    loan: 500,
    home: 'warehouse',
    neighbor: null,
    startProf: { craft: 1, cook: 1, plant: 0, trap: 2, explore: 2 },
    mods: { storageMult: 0.3, highlightLoot: 1, molotov: 1, carryKg: 5 },
    color: '#7ea0b8',
    unlockHint: {
      en: 'As the College Student, find the note in the supermarket truck and feed the Warehouse Manager 10 times — or reach any ending once the College Student is unlocked.',
      zh: '以大学生身份在超市货车里找到纸条并给仓库管理员送10次食物，或在解锁大学生后达成任意结局。',
    },
  },
};

export const CHARACTER_ORDER = ['wage', 'student', 'warehouse'];
