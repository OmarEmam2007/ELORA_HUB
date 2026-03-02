const mongoose = require('mongoose');

const guildSecurityConfigSchema = new mongoose.Schema({
    guildId: { type: String, required: true, unique: true },

    antiNukeEnabled: { type: Boolean, default: true },
    punishmentTimeoutHours: { type: Number, default: 12 },

    securityLogChannelId: { type: String, default: null },

    whitelistUsers: { type: [String], default: [] },
    whitelistRoles: { type: [String], default: [] },

    // Optional: protect specific channels/roles from deletion/edits (IDs)
    protectedChannels: { type: [String], default: [] },
    protectedRoles: { type: [String], default: [] }
}, { timestamps: true });

module.exports = mongoose.model('GuildSecurityConfig', guildSecurityConfigSchema);
