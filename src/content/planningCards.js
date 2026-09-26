// Daily planning cards: at every daily settlement the survivor is offered 3 and may buy 1 with
// Planning Points (sources: demo notes 07-10, patches 08-14, 08-19, 08-20, 08-22, 08-23).
// `recipes` unlock craft recipe ids (Config_ProductionList). `once` cards apply immediately.
export const PLANNING_CARDS = [
  // farming path
  { id: 'deepCultivation', path: 'farm', cost: 30, name: { en: 'Deep Cultivation', zh: '深耕细作' }, desc: { en: 'Crops take 30% longer but yield 50% more; +planting proficiency.', zh: '作物生长时间+30%，产量+50%，额外获得种植熟练度。' }, mods: { growMult: -0.3, plantYield: 0.5, plantExp: 0.3 } },
  { id: 'seedSaver', path: 'farm', cost: 20, name: { en: 'Seed Saver', zh: '留种' }, desc: { en: 'Harvests return seeds more often.', zh: '收获时更容易获得种子。' }, mods: { seedRate: 0.25 } },
  { id: 'thermoBoxes', path: 'farm', cost: 40, name: { en: 'Warm Beds', zh: '恒温苗床' }, desc: { en: 'Unlocks thermostatic box recipes.', zh: '解锁恒温培育箱配方。' }, recipes: [365, 366, 367] },
  { id: 'growLights', path: 'farm', cost: 50, name: { en: 'Grow Lights', zh: '补光种植' }, desc: { en: 'Unlocks plant-light box and hydroponic station recipes.', zh: '解锁植物灯培育箱与水培站配方。' }, recipes: [363, 364, 318, 319] },
  { id: 'fancyPots', path: 'farm', cost: 25, name: { en: 'Better Pots', zh: '好盆好土' }, desc: { en: 'Unlocks clay, fertile, pest-proof, weed-proof and fine flowerpot recipes.', zh: '解锁陶土、沃肥、防虫、防草与精美花盆配方。' }, recipes: [368, 369, 315, 370, 316, 317, 371] },
  { id: 'compost', path: 'farm', cost: 15, name: { en: 'Composting', zh: '堆肥' }, desc: { en: 'Unlocks the compost bin recipe.', zh: '解锁堆肥箱配方。' }, recipes: [350] },
  // drone path
  { id: 'scavenging', path: 'drone', cost: 30, name: { en: 'Scavenging', zh: '拾荒' }, desc: { en: '+1 drone scavenging dispatch per day.', zh: '无人机每日拾荒次数+1。' }, mods: { scavengeQuota: 1 } },
  { id: 'enduranceDrone', path: 'drone', cost: 30, name: { en: 'Endurance Drone', zh: '长航无人机' }, desc: { en: '+1 drone trade per day.', zh: '无人机每日交易次数+1。' }, mods: { tradeQuota: 1 } },
  { id: 'cargoBay', path: 'drone', cost: 25, name: { en: 'Bigger Cargo Bay', zh: '扩容货舱' }, desc: { en: 'Drone cargo holds carry 50% more.', zh: '无人机货舱容量+50%。' }, mods: { droneCargo: 0.5 } },
  // cooking path
  { id: 'slowRoast', path: 'cook', cost: 40, name: { en: 'Slow Roast and Fine Bake', zh: '慢烤细焙' }, desc: { en: 'Unlocks the Electric Oven recipe.', zh: '解锁电烤箱配方。' }, recipes: [418] },
  { id: 'hotPot', path: 'cook', cost: 30, name: { en: 'Hot Pot Night', zh: '火锅之夜' }, desc: { en: 'Unlocks the Electric Hot Pot and Kettle recipes.', zh: '解锁电火锅与热水壶配方。' }, recipes: [357, 356] },
  { id: 'coffeeBreak', path: 'cook', cost: 25, name: { en: 'Coffee Break', zh: '咖啡时间' }, desc: { en: 'Unlocks the Coffee Machine and Juicer recipes.', zh: '解锁咖啡机与榨汁机配方。' }, recipes: [334, 335] },
  { id: 'microwave', path: 'cook', cost: 30, name: { en: 'Quick Meals', zh: '速食生活' }, desc: { en: 'Unlocks Microwave and Large Gas Stove recipes.', zh: '解锁微波炉与大型燃气灶配方。' }, recipes: [355, 347] },
  { id: 'seasonedCook', path: 'cook', cost: 35, name: { en: 'Seasoned Cook', zh: '掌勺' }, desc: { en: 'Cooking quality +10.', zh: '烹饪品质+10。' }, mods: { cookQuality: 10 } },
  { id: 'brewing', path: 'cook', cost: 30, name: { en: 'Home Brewing', zh: '家酿' }, desc: { en: 'Unlocks the Brewing Barrel recipe.', zh: '解锁酿酒桶配方。' }, recipes: [336] },
  // storage path
  { id: 'properStorage', path: 'store', cost: 30, name: { en: 'Proper Storage', zh: '妥善储存' }, desc: { en: 'Food outside fridges spoils 25% slower.', zh: '冰箱外的食物腐坏减慢25%。' }, mods: { roomSpoil: -0.25 } },
  { id: 'fridgeManagement', path: 'store', cost: 45, name: { en: 'Fridge Management', zh: '冰箱管理' }, desc: { en: 'Unlocks Double-Door Refrigerator and Chest Freezer recipes.', zh: '解锁双门冰箱与冰柜配方。' }, recipes: [332, 351, 352] },
  { id: 'bigShelves', path: 'store', cost: 25, name: { en: 'Tidy Shelves', zh: '井井有条' }, desc: { en: 'Unlocks shelf, wardrobe, bedside and tool cabinet recipes.', zh: '解锁置物架、衣柜、床头柜与工具柜配方。' }, recipes: [337, 338, 339, 389] },
  { id: 'homeComforts', path: 'store', cost: 30, name: { en: 'Home Comforts', zh: '居家舒适' }, desc: { en: 'Unlocks beds, sofa, tables, sink, toilet, bath, massage chair and washing machine recipes.', zh: '解锁床、沙发、桌子、水池、马桶、浴缸、按摩椅与洗衣机配方。' }, recipes: [320, 321, 322, 340, 341, 342, 343, 344, 345, 346, 353] },
  { id: 'leisure', path: 'store', cost: 25, name: { en: 'Leisure Time', zh: '闲暇时光' }, desc: { en: 'Unlocks TV, record player, dartboard, yoga mat and vase recipes.', zh: '解锁电视、唱片机、飞镖盘、瑜伽垫与花瓶配方。' }, recipes: [358, 359, 349, 348, 325] },
  // power path
  { id: 'capacity1', path: 'power', cost: 25, name: { en: 'Capacity Upgrade I', zh: '扩容升级 I' }, desc: { en: '+1 fuel slot on every fuel generator.', zh: '所有燃油发电机燃料槽+1。' }, mods: { fuelSlots: 1 } },
  { id: 'capacity2', path: 'power', cost: 35, requires: 'capacity1', name: { en: 'Capacity Upgrade II', zh: '扩容升级 II' }, desc: { en: '+1 fuel slot on every fuel generator.', zh: '所有燃油发电机燃料槽+1。' }, mods: { fuelSlots: 1 } },
  { id: 'capacity3', path: 'power', cost: 45, requires: 'capacity2', name: { en: 'Capacity Upgrade III', zh: '扩容升级 III' }, desc: { en: '+1 fuel slot on every fuel generator.', zh: '所有燃油发电机燃料槽+1。' }, mods: { fuelSlots: 1 } },
  { id: 'solar', path: 'power', cost: 40, name: { en: 'Solar Engineering', zh: '光伏工程' }, desc: { en: 'Unlocks solar panel recipes.', zh: '解锁太阳能板配方。' }, recipes: [308, 309, 310] },
  { id: 'batteries', path: 'power', cost: 40, name: { en: 'Battery Bank', zh: '储能阵列' }, desc: { en: 'Unlocks lead-acid battery, UPS and home storage station recipes.', zh: '解锁蓄电池、UPS与家用储电站配方。' }, recipes: [311, 362, 312] },
  { id: 'generators', path: 'power', cost: 40, name: { en: 'Generator Workshop', zh: '发电机工坊' }, desc: { en: 'Unlocks hand-crank and fuel generator recipes.', zh: '解锁人力与燃油发电机配方。' }, recipes: [333, 360, 361] },
  { id: 'ratPower', path: 'power', cost: 30, name: { en: 'Rat Power', zh: '鼠力发电' }, desc: { en: 'Unlocks small, medium and large mouse cage recipes.', zh: '解锁小、中、大型老鼠笼配方。' }, recipes: [327, 328, 329] },
  // defense path
  { id: 'barricades', path: 'defense', cost: 20, name: { en: 'Barricade Guide', zh: '街垒指南' }, desc: { en: 'Unlocks Sandbags and Spike Barrier recipes.', zh: '解锁沙包与尖刺障碍配方。' }, recipes: [400, 401] },
  { id: 'electricNet', path: 'defense', cost: 40, name: { en: 'Electric Net', zh: '电网' }, desc: { en: 'Unlocks the Electric Net recipe.', zh: '解锁电网配方。' }, recipes: [402] },
  { id: 'chainsaw', path: 'defense', cost: 60, name: { en: 'Mechanical Chainsaw', zh: '机械电锯' }, desc: { en: 'Unlocks the Mechanical Chainsaw recipe.', zh: '解锁机械电锯配方。' }, recipes: [403] },
  { id: 'molotov', path: 'defense', cost: 35, character: ['wage', 'warehouse'], name: { en: 'Molotov Cocktails', zh: '燃烧瓶' }, desc: { en: 'Unlocks Molotov cocktail recipes (not for the College Student).', zh: '解锁燃烧瓶配方（女大学生不可用）。' }, recipes: [404, 405, 406] },
  { id: 'heavyDoors', path: 'defense', cost: 50, name: { en: 'Heavy Doors', zh: '重型门窗' }, desc: { en: 'Unlocks Titanium Alloy Door and Bulletproof Window recipes.', zh: '解锁钛合金大门与防弹窗配方。' }, recipes: [407, 408] },
  { id: 'heating', path: 'defense', cost: 35, name: { en: 'Keeping Warm', zh: '取暖' }, desc: { en: 'Unlocks Heater, Electric Heater and Air Conditioner recipes.', zh: '解锁暖炉、电暖器与空调配方。' }, recipes: [417, 314, 354] },
  { id: 'disinfect', path: 'defense', cost: 20, name: { en: 'Disinfection', zh: '消毒' }, desc: { en: 'Unlocks disinfectant spray recipes.', zh: '解锁消毒喷雾配方。' }, recipes: [410, 409, 411] },
  // crafting path
  { id: 'workshopTricks', path: 'craft', cost: 30, name: { en: 'Workshop Tricks', zh: '工坊窍门' }, desc: { en: 'Crafting costs 20% less Stamina.', zh: '制造消耗的精力-20%。' }, mods: { craftStamina: -0.2 } },
  { id: 'precision', path: 'craft', cost: 35, name: { en: 'Precision Work', zh: '精工细作' }, desc: { en: '+10% chance of Perfect crafting.', zh: '完美制造概率+10%。' }, mods: { craftPerfect: 0.1 } },
  { id: 'recycler', path: 'craft', cost: 35, name: { en: 'Recycler', zh: '回收再造' }, desc: { en: 'Unlocks the Shredder recipe.', zh: '解锁粉碎机配方。' }, recipes: [415] },
  // consumables
  { id: 'hotShower', path: 'life', cost: 10, once: true, name: { en: 'Hot Shower', zh: '热水澡' }, desc: { en: 'Instantly +20 Morale.', zh: '立即恢复20心态。' }, apply: { mor: 20 } },
  { id: 'feast', path: 'life', cost: 15, once: true, name: { en: 'Little Feast', zh: '小小犒劳' }, desc: { en: 'Instantly +15 Satiety and +10 Morale.', zh: '立即恢复15饱腹与10心态。' }, apply: { sat: 15, mor: 10 } },
  { id: 'powerNap', path: 'life', cost: 10, once: true, name: { en: 'Power Nap', zh: '小憩' }, desc: { en: 'Instantly +25 Stamina.', zh: '立即恢复25精力。' }, apply: { sta: 25 } },
];

export const CARD_BY_ID = Object.fromEntries(PLANNING_CARDS.map((c) => [c.id, c]));
