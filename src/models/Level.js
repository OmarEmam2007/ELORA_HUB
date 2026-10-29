const mongoose = require('mongoose');

const levelSchema = new mongoose.Schema(
    {
        userId: { type: String, required: true },
        guildId: { type: String, required: true },
        xp: { type: Number, default: 0, min: 0 },
        level: { type: Number, default: 0, min: 0 }
    },
    { timestamps: true }
);

levelSchema.index({ userId: 1, guildId: 1 }, { unique: true });
levelSchema.index({ guildId: 1, level: -1, xp: -1 });

module.exports = mongoose.model('Level', levelSchema);
