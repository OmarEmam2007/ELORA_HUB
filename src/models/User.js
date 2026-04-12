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
    antiSwearLastAt: { type: Date, default: null },

    // --- Marriage & Divorce System ---
    partnerId: { type: String, default: null }, // Discord ID of the current partner
    marriageCount: { type: Number, default: 0 }, // Total number of marriages
    divorceCount: { type: Number, default: 0 }, // Total number of divorces
    marryDate: { type: Date, default: null }, // Date of current marriage
    lastDivorceDate: { type: Date, default: null }, // Date of last divorce, for cooldown

    afkAutoMuted: { type: Boolean, default: false },
    afkAutoDeafened: { type: Boolean, default: false },
    afkAutoAppliedAt: { type: Number, default: 0 },
    afkAutoChannelId: { type: String, default: null }
});

userSchema.index({ userId: 1, guildId: 1 }, { unique: true });

module.exports = mongoose.model('User', userSchema);
