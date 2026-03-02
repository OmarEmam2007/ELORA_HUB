const mongoose = require('mongoose');

const inviteeSchema = new mongoose.Schema(
    {
        userId: { type: String, required: true },
        joinedAt: { type: Date, default: Date.now },
        isFake: { type: Boolean, default: false },
        left: { type: Boolean, default: false }
    },
    { _id: false }
);

const inviteStatsSchema = new mongoose.Schema(
    {
        guildId: { type: String, required: true },
        userId: { type: String, required: true },

        inviteCount: { type: Number, default: 0 },
        regularInvites: { type: Number, default: 0 },
        fakeInvites: { type: Number, default: 0 },
        leaves: { type: Number, default: 0 },

        invitedUsers: { type: [inviteeSchema], default: [] }
    },
    { timestamps: true }
);

inviteStatsSchema.index({ guildId: 1, userId: 1 }, { unique: true });

module.exports = mongoose.model('InviteStats', inviteStatsSchema);
