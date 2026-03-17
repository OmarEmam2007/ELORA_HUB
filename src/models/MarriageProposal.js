const mongoose = require('mongoose');

const marriageProposalSchema = new mongoose.Schema({
    guildId: { type: String, required: true, index: true },
    requesterId: { type: String, required: true, index: true },
    targetId: { type: String, required: true, index: true },

    channelId: { type: String, required: true },
    messageId: { type: String, default: null },

    status: {
        type: String,
        enum: ['pending', 'accepted', 'declined', 'cancelled'],
        default: 'pending',
        index: true,
    },

    createdAt: { type: Date, default: Date.now, index: true },
    resolvedAt: { type: Date, default: null },
    resolvedBy: { type: String, default: null },
});

// Only allow one active pending proposal between two users in the same guild.
marriageProposalSchema.index(
    { guildId: 1, requesterId: 1, targetId: 1, status: 1 },
    {
        unique: true,
        partialFilterExpression: { status: 'pending' },
    }
);

module.exports = mongoose.model('MarriageProposal', marriageProposalSchema);
