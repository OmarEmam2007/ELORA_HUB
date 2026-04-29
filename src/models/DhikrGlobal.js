const mongoose = require('mongoose');

const dhikrGlobalSchema = new mongoose.Schema({
    guildId: { type: String, required: true },
    dateKey: { type: String, required: true },
    channelId: { type: String, required: true },
    messageId: { type: String, default: null },
    goal: { type: Number, default: 10000 },
    total: { type: Number, default: 0 },
    byType: {
        subhan: { type: Number, default: 0 },
        hamd: { type: Number, default: 0 },
        takbir: { type: Number, default: 0 }
    },
    updatedAt: { type: Date, default: Date.now }
});

dhikrGlobalSchema.index({ guildId: 1, dateKey: 1 }, { unique: true });

module.exports = mongoose.model('DhikrGlobal', dhikrGlobalSchema);
