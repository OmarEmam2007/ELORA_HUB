const mongoose = require('mongoose');

const modSettingsSchema = new mongoose.Schema({
    guildId: { type: String, required: true, unique: true },
    enabled: { type: Boolean, default: true },
    mode: { type: String, enum: ['normal', 'strict'], default: 'normal' },
    logChannelId: { type: String, default: null },
    sensitivity: { type: Number, default: 3 }, // 1-5
    multilingual: { type: Boolean, default: true },
    learningMode: { type: Boolean, default: true },
    whitelistRoles: { type: [String], default: [] },
    whitelistChannels: { type: [String], default: [] },
    customBlacklist: { type: [String], default: [] },
    antiSwearWhitelist: { type: [String], default: [] },
    antiSwearThreshold: { type: Number, default: 5 },
    autoActions: {
        mild: { type: String, default: 'warn' }, // warn, delete
        severe: { type: String, default: 'timeout' }, // timeout, delete
        extreme: { type: String, default: 'ban' } // ban
    }
});

module.exports = mongoose.model('ModSettings', modSettingsSchema);
