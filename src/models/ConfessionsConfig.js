const mongoose = require('mongoose');

const confessionsConfigSchema = new mongoose.Schema({
    guildId: { type: String, required: true, unique: true },
    confessionsChannelId: { type: String, default: null },
    confessionLogsChannelId: { type: String, default: null }
}, { timestamps: true });

confessionsConfigSchema.index({ guildId: 1 }, { unique: true });

module.exports = mongoose.model('ConfessionsConfig', confessionsConfigSchema);
