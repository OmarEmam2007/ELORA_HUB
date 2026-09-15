/** Items for The Forgotten Lands inventory / combat / crafting seeds */

const ITEMS = {
    // Weapons
    rusty_blade: { id: 'rusty_blade', nameAr: 'شفرة صدئة', type: 'weapon', slot: 'weapon', attack: 3, rarity: 'common' },
    ash_wand: { id: 'ash_wand', nameAr: 'عصا الرماد', type: 'weapon', slot: 'weapon', attack: 2, magic: 4, rarity: 'common' },
    shadow_dagger: { id: 'shadow_dagger', nameAr: 'خنجر الظل', type: 'weapon', slot: 'weapon', attack: 4, agility: 1, rarity: 'common' },
    oak_staff: { id: 'oak_staff', nameAr: 'عصا البلوط', type: 'weapon', slot: 'weapon', attack: 2, magic: 2, vitality: 1, rarity: 'common' },
    hollow_blade: { id: 'hollow_blade', nameAr: 'نصل الأجوف', type: 'weapon', slot: 'weapon', attack: 9, rarity: 'rare' },

    // Armor
    tattered_vest: { id: 'tattered_vest', nameAr: 'سترة ممزقة', type: 'armor', slot: 'armor', defense: 2, rarity: 'common' },
    novice_robe: { id: 'novice_robe', nameAr: 'ثوب مبتدئ', type: 'armor', slot: 'armor', defense: 1, magic: 1, rarity: 'common' },
    leather_wraps: { id: 'leather_wraps', nameAr: 'لفائف جلد', type: 'armor', slot: 'armor', defense: 1, agility: 2, rarity: 'common' },
    wool_cloak: { id: 'wool_cloak', nameAr: 'عباءة صوف', type: 'armor', slot: 'armor', defense: 2, vitality: 1, rarity: 'common' },

    // Consumables
    healing_herb: {
        id: 'healing_herb',
        nameAr: 'عشبة شفاء',
        type: 'consumable',
        heal: 25,
        combatUsable: true,
        rarity: 'common',
        description: 'تشفي 25 نقطة حياة.'
    },
    healing_draught: {
        id: 'healing_draught',
        nameAr: 'جرعة شفاء',
        type: 'consumable',
        heal: 55,
        combatUsable: true,
        rarity: 'uncommon',
        description: 'تشفي 55 نقطة حياة.'
    },
    antidote: {
        id: 'antidote',
        nameAr: 'ترياق',
        type: 'consumable',
        clearEffects: ['poison'],
        combatUsable: true,
        rarity: 'common',
        description: 'يزيل السم.'
    },

    // Materials / trophies
    rat_pelt: { id: 'rat_pelt', nameAr: 'جلد فأر', type: 'material', rarity: 'common' },
    wolf_fang: { id: 'wolf_fang', nameAr: 'ناب ذئب', type: 'material', rarity: 'common' },
    slime_gel: { id: 'slime_gel', nameAr: 'هلام لزج', type: 'material', rarity: 'common' },
    wisp_core: { id: 'wisp_core', nameAr: 'قلب وميض', type: 'material', rarity: 'rare' },
    bone_shard: { id: 'bone_shard', nameAr: 'شظية عظم', type: 'material', rarity: 'common' },
    scarab_shell: { id: 'scarab_shell', nameAr: 'درع جعلان', type: 'material', rarity: 'uncommon' },
    shadow_ink: { id: 'shadow_ink', nameAr: 'حبر ظل', type: 'material', rarity: 'uncommon' },
    hydra_scale: { id: 'hydra_scale', nameAr: 'حرشفة هيدرا', type: 'material', rarity: 'rare' }
};

function getItem(id) {
    return ITEMS[id] || null;
}

function itemLabel(id) {
    const it = getItem(id);
    return it ? it.nameAr : id;
}

module.exports = { ITEMS, getItem, itemLabel };
