const mongoose = require('mongoose');

const nicknameLockSchema = new mongoose.Schema(
    {
        guildId: { type: String, required: true },
        userId: { type: String, required: true },
        nickname: { type: String, default: null },
        locked: { type: Boolean, default: true },
        setBy: { type: String, required: true }
    },
    { timestamps: true }
);

nicknameLockSchema.index({ guildId: 1, userId: 1 }, { unique: true });

module.exports = mongoose.model('NicknameLock', nicknameLockSchema);
