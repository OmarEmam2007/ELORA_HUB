const mongoose = require('mongoose');

const inventoryItemSchema = new mongoose.Schema(
    {
        itemId: { type: String, required: true },
        qty: { type: Number, default: 1, min: 1 }
    },
    { _id: false }
);

const questSchema = new mongoose.Schema(
    {
        id: String,
        type: { type: String, default: 'daily' },
        titleAr: String,
        titleEn: String,
        descriptionAr: String,
        descriptionEn: String,
        target: {
            kind: String, // kill | collect | explore
            monsterId: String,
            itemId: String,
            count: Number
        },
        progress: { type: Number, default: 0 },
        rewardXp: { type: Number, default: 40 },
        rewardGold: { type: Number, default: 25 },
        rewardReputation: { type: Number, default: 5 },
        completed: { type: Boolean, default: false },
        claimed: { type: Boolean, default: false },
        expiresAt: Date
    },
    { _id: false }
);

const landsCharacterSchema = new mongoose.Schema(
    {
        userId: { type: String, required: true },
        guildId: { type: String, required: true },
        name: { type: String, required: true, maxlength: 24 },
        classId: { type: String, required: true, enum: ['warrior', 'mage', 'assassin', 'shepherd'] },
        locale: { type: String, enum: ['ar', 'en'], default: 'ar' },

        level: { type: Number, default: 1, min: 1 },
        xp: { type: Number, default: 0, min: 0 },
        gold: { type: Number, default: 25, min: 0 },
        reputation: { type: Number, default: 0, min: 0 },

        stats: {
            strength: { type: Number, default: 1 },
            agility: { type: Number, default: 1 },
            intelligence: { type: Number, default: 1 },
            luck: { type: Number, default: 1 },
            vitality: { type: Number, default: 1 }
        },
        // Unspent points from leveling
        skillPoints: { type: Number, default: 0, min: 0 },

        hp: { type: Number, default: 50 },
        maxHp: { type: Number, default: 50 },

        zoneId: { type: String, default: 'misty_edge' },
        inventory: { type: [inventoryItemSchema], default: [] },
        equipped: {
            weapon: { type: String, default: null },
            armor: { type: String, default: null }
        },

        // Monster learning memory: monsterId -> { timesFought, playerPreferSkill }
        monsterMemory: { type: Map, of: mongoose.Schema.Types.Mixed, default: {} },

        dailyQuest: { type: questSchema, default: null },
        lastDailyAt: { type: Date, default: null },

        deaths: { type: Number, default: 0 },
        kills: { type: Number, default: 0 },
        bossKills: { type: Number, default: 0 },

        inCombat: { type: Boolean, default: false },
        createdAt: { type: Date, default: Date.now }
    },
    { timestamps: true }
);

landsCharacterSchema.index({ userId: 1, guildId: 1 }, { unique: true });

module.exports = mongoose.model('LandsCharacter', landsCharacterSchema);
