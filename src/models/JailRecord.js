const mongoose = require('mongoose');

const JailRecordSchema = new mongoose.Schema(
    {
        guildId: { type: String, required: true, index: true },
        userId: { type: String, required: true, index: true },
        roles: { type: [String], default: [] },
        jailedAt: { type: Date, default: Date.now },
        releaseAt: { type: Date, default: null, index: true },
        active: { type: Boolean, default: true, index: true },
    },
    { timestamps: true }
);

JailRecordSchema.index({ guildId: 1, userId: 1, active: 1 });

module.exports = mongoose.model('JailRecord', JailRecordSchema);
