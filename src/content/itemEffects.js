// Special effects for non-food items. Values follow the in-game descriptions (Config_Item.ItemDes2).
// cure: effect ids removed; add: [effectId, hours]; stats: per use; max: permanent cap change.
export const MEDICINE = {
  6: { stats: { life: 5 }, max: { life: 0.5 } },
  2003: { stats: { mor: 3, life: 2 }, cure: ['cold'], add: [['warm', 3]] }, // Brewed Tea: a hot drink
  8: { stats: { life: 15 }, cure: ['fever'] },
  2147: { stats: { life: 5 }, max: { life: 1 }, daily: 1 },
  2400: { stats: { life: 10 }, cure: ['bleeding'] },
  2401: { stats: { life: 30 }, cure: ['bleeding', 'shock'] },
  2402: { stats: { life: 5, mor: 2 }, max: { life: 1 }, daily: 1 },
  2403: { stats: { sta: 50 }, add: [['tense', 0]] },
  2404: { stats: { sta: 35, life: -5 } },
  2405: { stats: { life: 10 }, cure: ['fever', '1104'] },
  2406: { stats: { life: 5 }, cure: ['fever', 'cold'] },
  2407: { stats: { life: 3 }, cure: ['1102', '1101'] },
  2408: { stats: { mor: 5, life: 3 } },
  2409: { stats: { mor: 10 }, cure: ['insomnia', 'tense', 'breakdown'] },
  2410: { stats: { mor: 18 }, cure: ['mentalBlock'] },
  2411: { stats: { mor: 8, sta: 8 } },
  2412: { stats: { life: 5 }, cure: ['1103', '1104', '1105'] },
  2509: { stats: { life: 4 }, cure: ['bleeding'] },
  11008: { stats: { life: 20 }, cure: ['bleeding', 'fever', 'cold'] },
};

// Books & notes, exactly as described in Config_Item.ItemDes2 (read time in minutes; notes read faster).
// prof: proficiency exp; profLv: proficiency levels; add: [effectId, hours]; max: permanent cap change.
const skillBook = (key) => ({ prof: { [key]: 200 } });
const scattered = (key, exp) => ({ prof: { [key]: exp }, dur: 10, free: true });
const organized = (key, exp) => ({ prof: { [key]: exp }, dur: 15, free: true });
const manuscript = (key, exp) => ({ prof: { [key]: exp }, dur: 20, free: true });
export const BOOKS = {
  4: { stats: { mor: 5 } },
  2505: { stats: { mor: 6 }, dur: 30, free: true },
  2506: { stats: { mor: 3 }, memory: 'news', dur: 20, free: true },
  3001: { add: [['calm', 24]], max: { mor: 3 } },
  3002: { stats: { mor: 25 }, max: { mor: 2 } },
  3003: { stats: { life: 10 }, max: { life: 2 } },
  3004: { stats: { sat: -5 }, add: [['gourmet', 24]], max: { sat: 2 } },
  3005: { add: [['handy', 24]], max: { sta: 2 } },
  3006: { add: [['sleepy', 12]], max: { sta: 2 }, free: true },
  3010: { max: { sat: 2, sta: 2, mor: 2, life: 2 }, add: [['elegant', 48]] },
  3011: skillBook('craft'),
  3012: skillBook('plant'),
  3013: skillBook('cook'),
  3014: skillBook('trap'),
  3015: skillBook('explore'),
  3016: { profLv: { craft: 1 } },
  3017: { profLv: { plant: 1 } },
  3018: { profLv: { cook: 1 } },
  3019: { profLv: { trap: 1 } },
  3020: { profLv: { explore: 1 } },
  3021: skillBook('defense'),
  3022: { add: [['firstAid', 24]], max: { life: 2 } },
  3023: { add: [['ration', 24]], max: { sat: 2 } },
  3024: { stats: { mor: 3 }, memory: 'news', dur: 20, free: true },
  3025: { add: [['gameCook', 24]], max: { life: 2 } },
  3026: { stats: { mor: 25 }, max: { mor: 3 }, story: 'diary' },
  3027: scattered('craft', 600),
  3028: scattered('plant', 920),
  3029: scattered('cook', 600),
  3030: scattered('trap', 280),
  3031: scattered('explore', 400),
  3032: scattered('defense', 350),
  3033: organized('defense', 1000),
  3034: manuscript('craft', 11000),
  3035: manuscript('plant', 41000),
  3036: manuscript('cook', 36600),
  3037: manuscript('trap', 5380),
  3038: manuscript('explore', 2200),
  3039: manuscript('defense', 3900),
  3040: organized('craft', 4500),
  3041: organized('plant', 5000),
  3042: organized('cook', 4600),
  3043: organized('trap', 1380),
  3044: organized('explore', 1500),
};

// Daily-use sundries (Category 5).
export const SUNDRIES = {
  2508: { stats: { mor: 6 }, dur: 30 },
  11001: { stats: { mor: 2, sta: -8 }, max: { sta: 1 }, daily: 1, dur: 30 },
  11006: { stats: { mor: 5 }, dur: 5 },
  11009: { stats: { life: 1 }, daily: 1, dur: 5, max: { life: 0.2 } },
  11010: { stats: { life: 1 }, daily: 1, dur: 5, max: { life: 0.2 } },
  11011: { stats: { life: 1 }, daily: 1, dur: 5, max: { life: 0.2 } },
  11012: { stats: { mor: 2 }, daily: 1, dur: 5 },
  11013: { stats: { mor: 2 }, daily: 1, dur: 5, max: { mor: 0.2 } },
  20213: { wish: true, dur: 10 },
  20215: { stats: { mor: 6, life: -1 }, dur: 10 },
  20217: { points: 5, dur: 10 },
  20220: { stats: { mor: 5 }, dur: 5 },
  20221: { stats: { mor: 4 }, dur: 5 },
  31001: { stats: { mor: 2 }, daily: 1, dur: 5 },
  5: { stats: { mor: 12, sta: -5 }, daily: 2, dur: 60 },
  11002: { stats: { mor: 10, sta: -4 }, daily: 2, dur: 45 },
  24114: { wear: 'scarf', dur: 5 }, // Hand-Knitted Scarf: felt temperature one level warmer for the rest of the run
  // the neighbour's keepsakes, as their config text says: the charm is reusable (uses -1), morale recovers faster
  // for about 3 hours; the dried bouquet lifts morale at once (its config mor 20); the paper crane is a wish, and
  // for a while (decided: 6 hours) Life slowly recovers
  24111: { effect: ['soothed', 3], dur: 5 },
  24112: { stats: { mor: 20 }, dur: 5 },
  24113: { effect: ['blessed', 6], dur: 5 },
};

// Keepsakes the config says can be taken apart for materials ("可回收成…"): what each gives. The small flower (24115)
// is buried in a pot and "leaves two portions of basic fertilizer".
export const RECYCLE = {
  24115: [[15501, 2]], // A Small Flower → Basic Fertilizer ×2
  24116: [[20001, 1]], // Note → Paper Scrap
  24123: [[20001, 1]],
  24119: [[20001, 1]], // A Pencil Drawing → Paper Scrap
  24118: [[20004, 1]], // Washed Empty Can → Tin Sheet
  24124: [[20004, 1]], // Tin Wind Chime → Tin Sheet
  24127: [[20004, 1]],
  24120: [[20003, 1]], // Sweet Wrappers → Scrap Plastic
  24125: [[20003, 1]], // Jar of Paper Stars → Scrap Plastic
  24128: [[20003, 1]],
  24121: [[20002, 1]], // Polished Marble → Broken Glass
  24126: [[20002, 1]], // Marble Mosaic → Broken Glass
  24129: [[20002, 1]],
};

// Package items (food packs and material packs) that open into contents.
export const PACKS = {
  11003: { rolls: 6, pool: 'food' },
  11005: { give: [[2913, 1]], rolls: 0 },
  11007: { rolls: 4, pool: 'snack' },
  12001: { rolls: 6, pool: 'snack' },
  12002: { rolls: 6, pool: 'fruit' },
  12003: { rolls: 5, pool: 'emergency' },
  12004: { rolls: 5, pool: 'frozen' },
  13001: { rolls: 8, pool: 'material' },
  11004: { give: [[2131, 6]], rolls: 0 },
};

export const PACK_POOLS = {
  food: [2101, 2103, 2104, 2105, 2106, 2107, 2108, 2115, 2117, 2123, 2129, 2155],
  snack: [2132, 2133, 2134, 2135, 2138, 2143, 2141, 2130],
  fruit: [2125, 2127, 2152, 2533, 2539],
  emergency: [2101, 2107, 2139, 2400, 2402, 2131],
  frozen: [2201, 2202, 2203, 2205, 2207, 2209, 2210, 2215],
  material: [20001, 20002, 20003, 20004, 20005, 20001, 20002, 20003, 20004, 20104, 20101, 20102, 20103],
};
