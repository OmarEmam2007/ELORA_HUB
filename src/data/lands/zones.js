/** Zones for The Forgotten Lands — unlock by level / reputation */

const ZONES = {
    misty_edge: {
        id: 'misty_edge',
        nameAr: 'حافة الضباب',
        nameEn: 'Misty Edge',
        descriptionAr: 'أول أرض ينساها الزمن. غابات رطبة ووحوش ضعيفة… لكنها تتعلم.',
        descriptionEn: 'The first land time forgot. Damp woods and weak beasts… that still learn.',
        description: 'أول أرض ينساها الزمن. غابات رطبة ووحوش ضعيفة… لكنها تتعلم.',
        minLevel: 1,
        minReputation: 0,
        monsterIds: ['fog_rat', 'moss_wolf', 'ash_slime'],
        bossId: 'elder_wisp',
        rareUnlock: null
    },
    bone_hollow: {
        id: 'bone_hollow',
        nameAr: 'وادي العظام',
        nameEn: 'Bone Hollow',
        descriptionAr: 'قبور مفتوحة وصدى صرخات قديمة. يحتاج مستوى وسمعة أعلى.',
        descriptionEn: 'Open graves and echoes of old screams. Needs higher level and reputation.',
        description: 'قبور مفتوحة وصدى صرخات قديمة. يحتاج مستوى وسمعة أعلى.',
        minLevel: 5,
        minReputation: 50,
        monsterIds: ['bone_hound', 'grave_scarab'],
        bossId: 'hollow_knight',
        rareUnlock: null
    },
    eclipse_marsh: {
        id: 'eclipse_marsh',
        nameAr: 'مستنقع الكسوف',
        nameEn: 'Eclipse Marsh',
        descriptionAr: 'منطقة نادرة تظهر تحت سماء مظلمة. (قريبًا في أحداث العالم)',
        descriptionEn: 'A rare zone under darkened skies. (Coming with world events)',
        description: 'منطقة نادرة تظهر تحت سماء مظلمة. (قريبًا في أحداث العالم)',
        minLevel: 10,
        minReputation: 150,
        monsterIds: ['shadow_leech'],
        bossId: 'eclipse_hydra',
        rareUnlock: { type: 'event', id: 'eclipse' }
    }
};

function getZone(id) {
    return ZONES[id] || null;
}

function listUnlockedZones(level, reputation) {
    return Object.values(ZONES).filter((z) => {
        if (z.rareUnlock) return false;
        return level >= z.minLevel && reputation >= z.minReputation;
    });
}

function canEnterZone(zoneId, level, reputation) {
    const z = getZone(zoneId);
    if (!z) return { ok: false, errorKey: 'zoneMissing' };
    if (z.rareUnlock) return { ok: false, errorKey: 'zoneRare' };
    if (level < z.minLevel) return { ok: false, errorKey: 'zoneNeedLevel', errorVars: { level: z.minLevel } };
    if (reputation < z.minReputation) return { ok: false, errorKey: 'zoneNeedRep', errorVars: { rep: z.minReputation } };
    return { ok: true, zone: z };
}

module.exports = { ZONES, getZone, listUnlockedZones, canEnterZone };
