const mongoose = require('mongoose');

const customReplySchema = new mongoose.Schema(
    {
        guildId: { type: String, required: true },
        trigger: { type: String, required: true },
        reply: { type: String, required: true },
        matchType: { type: String, enum: ['exact', 'startsWith'], default: 'exact' },
        enabled: { type: Boolean, default: true },
        createdBy: { type: String, required: true }
    },
    { timestamps: true }
);

customReplySchema.index({ guildId: 1, trigger: 1 }, { unique: true });

module.exports = mongoose.model('CustomReply', customReplySchema);
