const mongoose = require('mongoose');
const User = require('../models/User');

async function findUser(userId, guildId) {
    try {
        return await User.findOne({ userId, guildId }).exec();
    } catch (err) {
        console.error('[MARRIAGE_DB] findUser error:', err);
        throw err;
    }
}

async function createUser(userId, guildId, session = null) {
    try {
        const doc = new User({ userId, guildId });
        return await doc.save({ session });
    } catch (err) {
        // Duplicate key race condition: fetch the existing document.
        if (err && err.code === 11000) {
            return await User.findOne({ userId, guildId }).session(session || null).exec();
        }
        console.error('[MARRIAGE_DB] createUser error:', err);
        throw err;
    }
}

async function getOrCreateUser(userId, guildId, session = null) {
    const existing = await User.findOne({ userId, guildId }).session(session || null).exec();
    if (existing) return existing;
    return await createUser(userId, guildId, session);
}

async function updateUser(userId, guildId, updateData, session = null) {
    try {
        return await User.findOneAndUpdate(
            { userId, guildId },
            updateData,
            { new: true, upsert: true, setDefaultsOnInsert: true, session }
        ).exec();
    } catch (err) {
        console.error('[MARRIAGE_DB] updateUser error:', err);
        throw err;
    }
}

async function withTransaction(work) {
    // Transactions require MongoDB replica set. If not available, fall back to best-effort.
    const canStartSession = typeof mongoose?.startSession === 'function';
    if (!canStartSession) return await work(null);

    const session = await mongoose.startSession();
    try {
        let result;
        await session.withTransaction(async () => {
            result = await work(session);
        });
        return result;
    } catch (err) {
        const msg = String(err?.message || err);
        const code = err?.code;

        // Common cases when MongoDB doesn't support transactions (standalone / wrong topology).
        const looksLikeNoTxnSupport =
            code === 20 ||
            /Transaction numbers are only allowed on a replica set member or mongos/i.test(msg) ||
            /replica set/i.test(msg);

        if (looksLikeNoTxnSupport) {
            console.warn('[MARRIAGE_DB] Transactions not supported by this MongoDB topology. Falling back without transaction.');
            return await work(null);
        }

        console.error('[MARRIAGE_DB] transaction error:', err);
        throw err;
    } finally {
        await session.endSession().catch(() => { });
    }
}

module.exports = {
    findUser,
    createUser,
    getOrCreateUser,
    updateUser,
    withTransaction,
};
