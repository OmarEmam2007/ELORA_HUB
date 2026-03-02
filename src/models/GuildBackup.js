const mongoose = require('mongoose');

const guildBackupSchema = new mongoose.Schema(
    {
        guildId: { type: String, required: true },
        createdBy: { type: String, required: true },
        note: { type: String, default: null },

        // Snapshot payload (roles + channels + overwrites + basic guild settings)
        snapshot: { type: mongoose.Schema.Types.Mixed, required: true },

        version: { type: Number, default: 1 }
    },
    { timestamps: true }
);

guildBackupSchema.index({ guildId: 1, createdAt: -1 });

module.exports = mongoose.model('GuildBackup', guildBackupSchema);
