const mongoose = require('mongoose');

const dhikrProfileSchema = new mongoose.Schema({
    userId: { type: String, required: true },
    guildId: { type: String, required: true },

    pointsTotal: { type: Number, default: 0 },
    pointsWeekly: { type: Number, default: 0 },

    pressesTotal: { type: Number, default: 0 },

    lastMorningCompleteKey: { type: String, default: null },
    lastEveningCompleteKey: { type: String, default: null },

    lastUpdatedAt: { type: Date, default: Date.now }
});

dhikrProfileSchema.index({ userId: 1, guildId: 1 }, { unique: true });

module.exports = mongoose.model('DhikrProfile', dhikrProfileSchema);
