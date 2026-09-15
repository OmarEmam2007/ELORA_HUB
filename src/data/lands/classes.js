/** Character classes for The Forgotten Lands (الأرض المنسية) */

const CLASSES = {
    warrior: {
        id: 'warrior',
        nameAr: 'محارب',
        nameEn: 'Warrior',
        description: 'قوة ودروع. يضرب بعنف ويصمد في الخط الأمامي.',
        baseStats: { strength: 8, agility: 4, intelligence: 2, luck: 3, vitality: 8 },
        skill: {
            id: 'crushing_blow',
            nameAr: 'ضربة ساحقة',
            cooldown: 3,
            manaCost: 0,
            description: 'ضربة قوية بضرر إضافي وتخفيض دفاع العدو مؤقتًا.'
        },
        starterWeapon: 'rusty_blade',
        starterArmor: 'tattered_vest'
    },
    mage: {
        id: 'mage',
        nameAr: 'ساحر',
        nameEn: 'Mage',
        description: 'سحر ناري وذكاء عالي. ضعيف في الدفاع، فتّاك من بعيد.',
        baseStats: { strength: 2, agility: 4, intelligence: 9, luck: 4, vitality: 4 },
        skill: {
            id: 'fireball',
            nameAr: 'كرة نارية',
            cooldown: 3,
            manaCost: 0,
            description: 'ضرر سحري + فرصة حرق العدو.'
        },
        starterWeapon: 'ash_wand',
        starterArmor: 'novice_robe'
    },
    assassin: {
        id: 'assassin',
        nameAr: 'قاتل',
        nameEn: 'Assassin',
        description: 'سرعة وحظ. يضرب نقاط الضعف ويسمّم الخصم.',
        baseStats: { strength: 5, agility: 9, intelligence: 3, luck: 7, vitality: 4 },
        skill: {
            id: 'venom_stab',
            nameAr: 'طعنة السم',
            cooldown: 3,
            manaCost: 0,
            description: 'ضرر عالي + سم يتكرر لعدة أدوار.'
        },
        starterWeapon: 'shadow_dagger',
        starterArmor: 'leather_wraps'
    },
    shepherd: {
        id: 'shepherd',
        nameAr: 'راعي',
        nameEn: 'Shepherd',
        description: 'توازن وبركة. يشفي نفسه ويصمد في الرحلات الطويلة.',
        baseStats: { strength: 4, agility: 5, intelligence: 6, luck: 5, vitality: 7 },
        skill: {
            id: 'natures_blessing',
            nameAr: 'بركة الطبيعة',
            cooldown: 4,
            manaCost: 0,
            description: 'شفاء قوي + إزالة تأثير سلبي خفيف.'
        },
        starterWeapon: 'oak_staff',
        starterArmor: 'wool_cloak'
    }
};

function listClasses() {
    return Object.values(CLASSES);
}

function getClass(id) {
    if (!id) return null;
    const key = String(id).toLowerCase().trim();
    const aliases = {
        محارب: 'warrior',
        ساحر: 'mage',
        قاتل: 'assassin',
        راعي: 'shepherd',
        warrior: 'warrior',
        mage: 'mage',
        assassin: 'assassin',
        shepherd: 'shepherd',
        w: 'warrior',
        m: 'mage',
        a: 'assassin',
        s: 'shepherd'
    };
    const resolved = aliases[key] || key;
    return CLASSES[resolved] || null;
}

module.exports = { CLASSES, listClasses, getClass };
