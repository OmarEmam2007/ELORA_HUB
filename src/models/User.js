const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    userId: { type: String, required: true },
    guildId: { type: String, required: true },
    xp: { type: Number, default: 0 },
    level: { type: Number, default: 1 },
    voiceXp: { type: Number, default: 0 },
    voiceLevel: { type: Number, default: 1 },
    voiceTotalMs: { type: Number, default: 0 },
    voiceSessionStart: { type: Number, default: 0 },
    lastMessageTimestamp: { type: Number, default: 0 }, // For XP cooldown
    antiSwearWarningsCount: { type: Number, default: 0 },
    antiSwearLastAt: { type: Date, default: null }
});

userSchema.index({ userId: 1, guildId: 1 }, { unique: true });

module.exports = mongoose.model('User', userSchema);
