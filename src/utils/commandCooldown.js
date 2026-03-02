// Command cooldown system
const cooldowns = new Map();

/**
 * Check if user is on cooldown
 * @param {string} userId - User ID
 * @param {number} cooldownTime - Cooldown in milliseconds (default 7000)
 * @returns {boolean} - True if on cooldown, false if not
 */
function checkCooldown(userId, cooldownTime = 7000) {
    const now = Date.now();
    const userCooldown = cooldowns.get(userId);

    if (!userCooldown || (now - userCooldown) >= cooldownTime) {
        cooldowns.set(userId, now);
        return false; // Not on cooldown
    }

    return true; // On cooldown
}

/**
 * Get remaining cooldown time
 * @param {string} userId - User ID
 * @param {number} cooldownTime - Cooldown in milliseconds
 * @returns {number} - Remaining time in milliseconds
 */
function getRemainingCooldown(userId, cooldownTime = 7000) {
    const now = Date.now();
    const userCooldown = cooldowns.get(userId);

    if (!userCooldown) return 0;

    const remaining = cooldownTime - (now - userCooldown);
    return remaining > 0 ? remaining : 0;
}

module.exports = { checkCooldown, getRemainingCooldown };
