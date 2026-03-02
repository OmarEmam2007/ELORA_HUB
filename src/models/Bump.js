const mongoose = require('mongoose');

const bumpSchema = new mongoose.Schema({
    guildId: { type: String, required: true, unique: true },
    nextBumpTime: { type: Date, required: true },
    reminded: { type: Boolean, default: false }
});

module.exports = mongoose.model('Bump', bumpSchema);
