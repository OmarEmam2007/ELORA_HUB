const mongoose = require('mongoose');

const landsPrefsSchema = new mongoose.Schema(
    {
        userId: { type: String, required: true },
        guildId: { type: String, required: true },
        locale: { type: String, enum: ['ar', 'en'], default: 'ar' }
    },
    { timestamps: true }
);

landsPrefsSchema.index({ userId: 1, guildId: 1 }, { unique: true });

module.exports = mongoose.model('LandsPrefs', landsPrefsSchema);
