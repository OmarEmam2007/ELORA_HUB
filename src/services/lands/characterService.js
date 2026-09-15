const LandsCharacter = require('../../models/LandsCharacter');
const { getClass } = require('../../data/lands/classes');
const { getItem } = require('../../data/lands/items');
const { canEnterZone, getZone, listUnlockedZones } = require('../../data/lands/zones');
const { resolveLang } = require('./i18n');

function xpToNext(level) {
    return Math.floor(100 * level * (1 + level * 0.15));
}

function calcMaxHp(stats, level) {
    return Math.floor(30 + (stats.vitality || 1) * 10 + level * 5);
}

function addToInventory(char, itemId, qty = 1) {
    const existing = char.inventory.find((i) => i.itemId === itemId);
    if (existing) existing.qty += qty;
    else char.inventory.push({ itemId, qty });
}

function removeFromInventory(char, itemId, qty = 1) {
    const idx = char.inventory.findIndex((i) => i.itemId === itemId);
    if (idx < 0) return false;
    if (char.inventory[idx].qty < qty) return false;
    char.inventory[idx].qty -= qty;
    if (char.inventory[idx].qty <= 0) char.inventory.splice(idx, 1);
    return true;
}

function countItem(char, itemId) {
    const it = char.inventory.find((i) => i.itemId === itemId);
    return it ? it.qty : 0;
}

async function findCharacter(userId, guildId) {
    return LandsCharacter.findOne({ userId, guildId }).exec();
}

async function createCharacter(userId, guildId, name, classKey) {
    const existing = await findCharacter(userId, guildId);
    if (existing) return { ok: false, errorKey: 'alreadyHasCharacter' };

    const cls = getClass(classKey);
    if (!cls) return { ok: false, errorKey: 'badClass' };

    const cleanName = String(name || '').trim().slice(0, 24);
    if (cleanName.length < 2) return { ok: false, errorKey: 'nameTooShort' };

    const stats = { ...cls.baseStats };
    const maxHp = calcMaxHp(stats, 1);
    const locale = await resolveLang(userId, guildId);

    const char = await LandsCharacter.create({
        userId,
        guildId,
        name: cleanName,
        classId: cls.id,
        locale,
        stats,
        hp: maxHp,
        maxHp,
        equipped: {
            weapon: cls.starterWeapon,
            armor: cls.starterArmor
        },
        inventory: [
            { itemId: cls.starterWeapon, qty: 1 },
            { itemId: cls.starterArmor, qty: 1 },
            { itemId: 'healing_herb', qty: 3 },
            { itemId: 'antidote', qty: 1 }
        ],
        zoneId: 'misty_edge',
        gold: 25
    });

    return { ok: true, character: char, classDef: cls };
}

function applyLevelUps(char) {
    let leveled = 0;
    let need = xpToNext(char.level);
    while (char.xp >= need) {
        char.xp -= need;
        char.level += 1;
        char.skillPoints += 3;
        char.reputation += 2;
        leveled += 1;
        need = xpToNext(char.level);
    }
    if (leveled > 0) {
        char.maxHp = calcMaxHp(char.stats, char.level);
        char.hp = char.maxHp;
    }
    return leveled;
}

function getEffectiveStats(char) {
    const s = { ...char.stats };
    const weapon = getItem(char.equipped?.weapon);
    const armor = getItem(char.equipped?.armor);
    if (weapon) {
        s.strength += weapon.attack || 0;
        s.intelligence += weapon.magic || 0;
        s.agility += weapon.agility || 0;
        s.vitality += weapon.vitality || 0;
    }
    if (armor) {
        s.defense = (s.defense || 0) + (armor.defense || 0);
        s.intelligence += armor.magic || 0;
        s.agility += armor.agility || 0;
        s.vitality += armor.vitality || 0;
    } else {
        s.defense = s.defense || 0;
    }
    return s;
}

async function allocateStat(userId, guildId, statName) {
    const map = {
        strength: 'strength',
        str: 'strength',
        قوة: 'strength',
        agility: 'agility',
        agi: 'agility',
        رشاقة: 'agility',
        intelligence: 'intelligence',
        int: 'intelligence',
        ذكاء: 'intelligence',
        luck: 'luck',
        حظ: 'luck',
        vitality: 'vitality',
        vit: 'vitality',
        حيوية: 'vitality'
    };
    const resolved = map[String(statName || '').toLowerCase()];
    if (!resolved) return { ok: false, errorKey: 'badStat' };

    const char = await findCharacter(userId, guildId);
    if (!char) return { ok: false, errorKey: 'noCharacter' };
    if (char.skillPoints < 1) return { ok: false, errorKey: 'noSkillPoints' };

    char.skillPoints -= 1;
    char.stats[resolved] += 1;
    if (resolved === 'vitality') {
        char.maxHp = calcMaxHp(char.stats, char.level);
        char.hp = Math.min(char.hp + 10, char.maxHp);
    }
    await char.save();
    return { ok: true, character: char, stat: resolved };
}

async function travel(userId, guildId, zoneId) {
    const char = await findCharacter(userId, guildId);
    if (!char) return { ok: false, errorKey: 'noCharacter' };
    if (char.inCombat) return { ok: false, errorKey: 'inCombatFinish' };

    const check = canEnterZone(zoneId, char.level, char.reputation);
    if (!check.ok) return check;

    char.zoneId = check.zone.id;
    await char.save();
    return { ok: true, character: char, zone: check.zone };
}

async function rest(userId, guildId) {
    const char = await findCharacter(userId, guildId);
    if (!char) return { ok: false, errorKey: 'noCharacterShort' };
    if (char.inCombat) return { ok: false, errorKey: 'cantRestInCombat' };
    const cost = Math.max(5, Math.floor(char.level * 3));
    if (char.gold < cost) return { ok: false, errorKey: 'restCost', errorVars: { cost } };
    char.gold -= cost;
    char.hp = char.maxHp;
    await char.save();
    return { ok: true, character: char, cost };
}

module.exports = {
    LandsCharacter,
    findCharacter,
    createCharacter,
    xpToNext,
    calcMaxHp,
    applyLevelUps,
    getEffectiveStats,
    addToInventory,
    removeFromInventory,
    countItem,
    allocateStat,
    travel,
    rest,
    getZone,
    listUnlockedZones,
    getClass
};
