const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    userId: { type: String, required: true, unique: true },
    favoriteLang: { type: String, default: null }
});

module.exports = mongoose.models.TranslateUser || mongoose.model('TranslateUser', userSchema);
