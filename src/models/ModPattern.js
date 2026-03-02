const mongoose = require('mongoose');

const modPatternSchema = new mongoose.Schema({
    guildId: { type: String, required: true },
    pattern: { type: String, required: true }, // The word or phrase
    detectedCount: { type: Number, default: 0 },
    dismissedCount: { type: Number, default: 0 }, // False positives
    weight: { type: Number, default: 1.0 }, // Adjusted by learning system
    lastDetected: { type: Date, default: Date.now }
});

modPatternSchema.index({ guildId: 1, pattern: 1 }, { unique: true });

module.exports = mongoose.model('ModPattern', modPatternSchema);
