const mongoose = require('mongoose');

const StaffApplicationSchema = new mongoose.Schema(
    {
        guildId: { type: String, required: true, index: true },
        userId: { type: String, required: true, index: true },

        departmentKey: { type: String, required: true, index: true },
        departmentRoleId: { type: String, required: true },

        status: {
            type: String,
            enum: ['draft', 'submitted', 'under_review', 'accepted', 'rejected', 'closed'],
            default: 'draft',
            index: true
        },

        channelId: { type: String, default: null, index: true },
        reviewMessageId: { type: String, default: null },

        // Applicant info
        applicantTag: { type: String, default: null },

        // Answers
        answers: {
            type: Object,
            default: {}
        },

        // Review
        votes: {
            type: Object,
            default: {}
        },
        ratingByUser: {
            type: Object,
            default: {}
        },
        internalNotes: {
            type: Array,
            default: []
        },

        rejectionReasonDraft: { type: String, default: null },
        rejectionReason: { type: String, default: null },

        lastApplicantActivityAt: { type: Date, default: null },
        lastStaffActivityAt: { type: Date, default: null },

        submittedAt: { type: Date, default: null },
        decidedAt: { type: Date, default: null },
        closedAt: { type: Date, default: null },

        // Cooldown support
        lastAppliedAt: { type: Date, default: null }
    },
    { timestamps: true }
);

StaffApplicationSchema.index({ guildId: 1, userId: 1, status: 1 });

module.exports = mongoose.model('StaffApplication', StaffApplicationSchema);
