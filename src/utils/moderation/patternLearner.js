const ModPattern = require('../../models/ModPattern');

/**
 * Logs a detection for learning purposes
 */
async function logDetection(guildId, pattern) {
    try {
        await ModPattern.findOneAndUpdate(
            { guildId, pattern },
            { $inc: { detectedCount: 1 }, $set: { lastDetected: new Date() } },
            { upsert: true, new: true }
        );
    } catch (e) {
        console.error('Pattern Learner Error (Log):', e);
    }
}

/**
 * Records a dismissal (False Positive) and lowers the pattern weight
 */
async function recordDismissal(guildId, pattern) {
    try {
        const doc = await ModPattern.findOneAndUpdate(
            { guildId, pattern },
            { $inc: { dismissedCount: 1 } },
            { upsert: true, new: true }
        );

        // Calculate new weight: 1.0 - (dismissed / detected)
        const weight = Math.max(0.1, 1.0 - (doc.dismissedCount / doc.detectedCount));
        doc.weight = weight;
        await doc.save();

        console.log(`🧠 [Pattern Learner] Reduced weight for "${pattern}" in ${guildId} to ${weight.toFixed(2)}`);
    } catch (e) {
        console.error('Pattern Learner Error (Dismiss):', e);
    }
}

/**
 * Gets the weight for a pattern (Default 1.0)
 */
async function getPatternWeight(guildId, pattern) {
    try {
        const doc = await ModPattern.findOne({ guildId, pattern });
        return doc ? doc.weight : 1.0;
    } catch (e) {
        return 1.0;
    }
}

module.exports = { logDetection, recordDismissal, getPatternWeight };
