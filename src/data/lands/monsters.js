/** Monsters & bosses for The Forgotten Lands */

const MONSTERS = {
    fog_rat: {
        id: 'fog_rat',
        nameAr: 'فأر الضباب',
        nameEn: 'Fog Rat',
        level: 1,
        hp: 28,
        attack: 6,
        defense: 1,
        agility: 8,
        xp: 18,
        gold: [2, 6],
        drops: [{ itemId: 'rat_pelt', chance: 0.35 }],
        skills: [],
        learnWeight: 0.05
    },
    moss_wolf: {
        id: 'moss_wolf',
        nameAr: 'ذئب الطحالب',
        nameEn: 'Moss Wolf',
        level: 2,
        hp: 45,
        attack: 10,
        defense: 3,
        agility: 7,
        xp: 32,
        gold: [4, 12],
        drops: [{ itemId: 'wolf_fang', chance: 0.28 }, { itemId: 'healing_herb', chance: 0.2 }],
        skills: [{ id: 'bite', nameAr: 'عضّة', nameEn: 'Bite', chance: 0.25, mult: 1.35 }],
        learnWeight: 0.08
    },
    ash_slime: {
        id: 'ash_slime',
        nameAr: 'هلام الرماد',
        nameEn: 'Ash Slime',
        level: 2,
        hp: 55,
        attack: 7,
        defense: 5,
        agility: 3,
        xp: 28,
        gold: [3, 9],
        drops: [{ itemId: 'slime_gel', chance: 0.4 }, { itemId: 'healing_herb', chance: 0.15 }],
        skills: [{ id: 'spit', nameAr: 'بصقة حامضية', nameEn: 'Acid Spit', chance: 0.2, effect: 'burn', turns: 2 }],
        learnWeight: 0.06
    },
    elder_wisp: {
        id: 'elder_wisp',
        nameAr: 'الوميض العتيق',
        nameEn: 'Elder Wisp',
        level: 4,
        hp: 120,
        attack: 14,
        defense: 4,
        agility: 9,
        xp: 90,
        gold: [20, 40],
        drops: [{ itemId: 'wisp_core', chance: 0.55 }, { itemId: 'healing_draught', chance: 0.4 }],
        skills: [
            { id: 'flare', nameAr: 'وهج', nameEn: 'Flare', chance: 0.35, mult: 1.5, effect: 'burn', turns: 2 },
            { id: 'fear', nameAr: 'رعب قديم', nameEn: 'Ancient Fear', chance: 0.2, effect: 'fear', turns: 1 }
        ],
        isBoss: true,
        learnWeight: 0.12
    },
    bone_hound: {
        id: 'bone_hound',
        nameAr: 'كلب العظام',
        nameEn: 'Bone Hound',
        level: 5,
        hp: 80,
        attack: 16,
        defense: 6,
        agility: 6,
        xp: 55,
        gold: [10, 22],
        drops: [{ itemId: 'bone_shard', chance: 0.45 }],
        skills: [{ id: 'howl', nameAr: 'عواء', nameEn: 'Howl', chance: 0.2, effect: 'fear', turns: 1 }],
        learnWeight: 0.1
    },
    grave_scarab: {
        id: 'grave_scarab',
        nameAr: 'جعلان القبور',
        nameEn: 'Grave Scarab',
        level: 6,
        hp: 70,
        attack: 13,
        defense: 8,
        agility: 5,
        xp: 60,
        gold: [12, 25],
        drops: [{ itemId: 'scarab_shell', chance: 0.35 }],
        skills: [{ id: 'sting', nameAr: 'لسعة', nameEn: 'Sting', chance: 0.3, effect: 'poison', turns: 3 }],
        learnWeight: 0.1
    },
    hollow_knight: {
        id: 'hollow_knight',
        nameAr: 'فارس الأجوف',
        nameEn: 'Hollow Knight',
        level: 8,
        hp: 200,
        attack: 22,
        defense: 10,
        agility: 7,
        xp: 180,
        gold: [50, 90],
        drops: [{ itemId: 'hollow_blade', chance: 0.25 }, { itemId: 'healing_draught', chance: 0.5 }],
        skills: [{ id: 'cleave', nameAr: 'شقّ', nameEn: 'Cleave', chance: 0.35, mult: 1.6 }],
        isBoss: true,
        learnWeight: 0.15
    },
    shadow_leech: {
        id: 'shadow_leech',
        nameAr: 'علقة الظل',
        nameEn: 'Shadow Leech',
        level: 10,
        hp: 95,
        attack: 18,
        defense: 5,
        agility: 10,
        xp: 85,
        gold: [18, 35],
        drops: [{ itemId: 'shadow_ink', chance: 0.3 }],
        skills: [{ id: 'drain', nameAr: 'امتصاص', nameEn: 'Drain', chance: 0.3, mult: 1.2, healSelf: 0.4 }],
        learnWeight: 0.12
    },
    eclipse_hydra: {
        id: 'eclipse_hydra',
        nameAr: 'هيدرا الكسوف',
        nameEn: 'Eclipse Hydra',
        level: 14,
        hp: 350,
        attack: 28,
        defense: 12,
        agility: 8,
        xp: 400,
        gold: [100, 180],
        drops: [{ itemId: 'hydra_scale', chance: 0.4 }],
        skills: [{ id: 'triple_bite', nameAr: 'عضّات ثلاث', nameEn: 'Triple Bite', chance: 0.4, mult: 1.8 }],
        isBoss: true,
        learnWeight: 0.2
    }
};

function getMonster(id) {
    return MONSTERS[id] || null;
}

function pickZoneMonster(zone, { bossChance = 0.08 } = {}) {
    if (!zone) return null;
    if (zone.bossId && Math.random() < bossChance) {
        return getMonster(zone.bossId);
    }
    const pool = (zone.monsterIds || []).map(getMonster).filter(Boolean);
    if (!pool.length) return null;
    return pool[Math.floor(Math.random() * pool.length)];
}

function rollGold(monster) {
    const [min, max] = monster.gold || [1, 3];
    return min + Math.floor(Math.random() * (max - min + 1));
}

function rollDrops(monster) {
    const out = [];
    for (const d of monster.drops || []) {
        if (Math.random() < (d.chance || 0)) out.push(d.itemId);
    }
    return out;
}

module.exports = { MONSTERS, getMonster, pickZoneMonster, rollGold, rollDrops };
