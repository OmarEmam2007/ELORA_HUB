const mongoose = require('mongoose');

const reviveSchema = new mongoose.Schema({
    guildId: { type: String, required: true, unique: true },
    channelId: { type: String, required: true },
    roleId: { type: String, required: true },
    cooldownMinutes: { type: Number, default: 30, min: 1, max: 1440 },
    lastReviveAt: { type: Date, default: null }
});

module.exports = mongoose.model('ReviveSettings', reviveSchema);

