const mongoose = require('mongoose');

const confessionSchema = new mongoose.Schema({
    confessionId: { type: String, required: true, unique: true },
    guildId: { type: String, required: true },
    userId: { type: String, required: true }, // Stored for moderation purposes but not displayed
    content: { type: String, required: true },
    messageId: { type: String }, // Discord message ID in confessions channel
    createdAt: { type: Date, default: Date.now }
});

confessionSchema.index({ guildId: 1, createdAt: -1 });

module.exports = mongoose.model('Confession', confessionSchema);
