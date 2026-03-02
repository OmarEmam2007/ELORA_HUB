const mongoose = require('mongoose');

const modLogSchema = new mongoose.Schema({
    guildId: { type: String, required: true },
    caseId: { type: Number, required: true },
    userId: { type: String, required: true },
    moderatorId: { type: String, default: 'ELORA_AUTO_MOD' },
    type: { type: String, enum: ['Profanity', 'Link', 'Spam', 'Malware', 'Unknown'], default: 'Profanity' },
    content: { type: String }, // Censored/Stored context
    severity: { type: String, enum: ['Mild', 'Severe', 'Extreme'], default: 'Mild' },
    confidence: { type: Number, default: 100 },
    status: { type: String, enum: ['Active', 'Dismissed', 'Appealed'], default: 'Active' },
    timestamp: { type: Date, default: Date.now }
});

// Compound index for case lookup per guild
modLogSchema.index({ guildId: 1, caseId: 1 }, { unique: true });

module.exports = mongoose.model('ModLog', modLogSchema);
