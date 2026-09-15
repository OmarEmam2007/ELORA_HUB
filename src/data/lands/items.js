/** Items for The Forgotten Lands inventory / combat / crafting seeds */

const ITEMS = {
    rusty_blade: { id: 'rusty_blade', nameAr: 'شفرة صدئة', nameEn: 'Rusty Blade', type: 'weapon', slot: 'weapon', attack: 3, rarity: 'common' },
    ash_wand: { id: 'ash_wand', nameAr: 'عصا الرماد', nameEn: 'Ash Wand', type: 'weapon', slot: 'weapon', attack: 2, magic: 4, rarity: 'common' },
    shadow_dagger: { id: 'shadow_dagger', nameAr: 'خنجر الظل', nameEn: 'Shadow Dagger', type: 'weapon', slot: 'weapon', attack: 4, agility: 1, rarity: 'common' },
    oak_staff: { id: 'oak_staff', nameAr: 'عصا البلوط', nameEn: 'Oak Staff', type: 'weapon', slot: 'weapon', attack: 2, magic: 2, vitality: 1, rarity: 'common' },
    hollow_blade: { id: 'hollow_blade', nameAr: 'نصل الأجوف', nameEn: 'Hollow Blade', type: 'weapon', slot: 'weapon', attack: 9, rarity: 'rare' },

    tattered_vest: { id: 'tattered_vest', nameAr: 'سترة ممزقة', nameEn: 'Tattered Vest', type: 'armor', slot: 'armor', defense: 2, rarity: 'common' },
    novice_robe: { id: 'novice_robe', nameAr: 'ثوب مبتدئ', nameEn: 'Novice Robe', type: 'armor', slot: 'armor', defense: 1, magic: 1, rarity: 'common' },
    leather_wraps: { id: 'leather_wraps', nameAr: 'لفائف جلد', nameEn: 'Leather Wraps', type: 'armor', slot: 'armor', defense: 1, agility: 2, rarity: 'common' },
    wool_cloak: { id: 'wool_cloak', nameAr: 'عباءة صوف', nameEn: 'Wool Cloak', type: 'armor', slot: 'armor', defense: 2, vitality: 1, rarity: 'common' },

    healing_herb: {
        id: 'healing_herb',
        nameAr: 'عشبة شفاء',
        nameEn: 'Healing Herb',
        type: 'consumable',
        heal: 25,
        combatUsable: true,
        rarity: 'common',
        descriptionAr: 'تشفي 25 نقطة حياة.',
        descriptionEn: 'Restores 25 HP.'
    },
    healing_draught: {
        id: 'healing_draught',
        nameAr: 'جرعة شفاء',
        nameEn: 'Healing Draught',
        type: 'consumable',
        heal: 55,
        combatUsable: true,
        rarity: 'uncommon',
        descriptionAr: 'تشفي 55 نقطة حياة.',
        descriptionEn: 'Restores 55 HP.'
    },
    antidote: {
        id: 'antidote',
        nameAr: 'ترياق',
        nameEn: 'Antidote',
        type: 'consumable',
        clearEffects: ['poison'],
        combatUsable: true,
        rarity: 'common',
        descriptionAr: 'يزيل السم.',
        descriptionEn: 'Clears poison.'
    },

    rat_pelt: { id: 'rat_pelt', nameAr: 'جلد فأر', nameEn: 'Rat Pelt', type: 'material', rarity: 'common' },
    wolf_fang: { id: 'wolf_fang', nameAr: 'ناب ذئب', nameEn: 'Wolf Fang', type: 'material', rarity: 'common' },
    slime_gel: { id: 'slime_gel', nameAr: 'هلام لزج', nameEn: 'Slime Gel', type: 'material', rarity: 'common' },
    wisp_core: { id: 'wisp_core', nameAr: 'قلب وميض', nameEn: 'Wisp Core', type: 'material', rarity: 'rare' },
    bone_shard: { id: 'bone_shard', nameAr: 'شظية عظم', nameEn: 'Bone Shard', type: 'material', rarity: 'common' },
    scarab_shell: { id: 'scarab_shell', nameAr: 'درع جعلان', nameEn: 'Scarab Shell', type: 'material', rarity: 'uncommon' },
    shadow_ink: { id: 'shadow_ink', nameAr: 'حبر ظل', nameEn: 'Shadow Ink', type: 'material', rarity: 'uncommon' },
    hydra_scale: { id: 'hydra_scale', nameAr: 'حرشفة هيدرا', nameEn: 'Hydra Scale', type: 'material', rarity: 'rare' }
};

function getItem(id) {
    return ITEMS[id] || null;
}

function itemLabel(id, lang = 'ar') {
    const it = getItem(id);
    if (!it) return id;
    return lang === 'en' ? it.nameEn || it.nameAr : it.nameAr || it.nameEn;
}

module.exports = { ITEMS, getItem, itemLabel };
