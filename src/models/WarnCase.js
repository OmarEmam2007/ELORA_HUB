const mongoose = require('mongoose');

const warnCaseSchema = new mongoose.Schema({
    guildId: { type: String, required: true, index: true },
    userId: { type: String, required: true, index: true },
    moderatorId: { type: String, required: true },
    reason: { type: String, default: 'No reason provided.' },
    createdAt: { type: Date, default: Date.now }
});

warnCaseSchema.index({ guildId: 1, userId: 1, createdAt: -1 });

module.exports = mongoose.model('WarnCase', warnCaseSchema);
