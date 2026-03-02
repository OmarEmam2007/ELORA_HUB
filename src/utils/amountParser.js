/**
 * Parse amount from string input
 * Supports:
 * - "all" or "max" - returns "all"
 * - "k" notation: "3k" = 3000, "10k" = 10000
 * - Regular numbers: "1000" = 1000
 * @param {string} input - The input string
 * @returns {number|string} - Parsed amount or "all"
 */
function parseAmount(input) {
    if (!input) return null;
    
    const lower = input.toLowerCase().trim();
    
    // Check for "all" or "max"
    if (lower === 'all' || lower === 'max') {
        return 'all';
    }

    // Check for "m" notation (e.g., "3m", "10m", "1.5m")
    const mMatch = lower.match(/^([\d.]+)m$/);
    if (mMatch) {
        const num = parseFloat(mMatch[1]);
        if (!isNaN(num) && num > 0) {
            return Math.floor(num * 1000000);
        }
    }
    
    // Check for "k" notation (e.g., "3k", "10k", "1.5k")
    const kMatch = lower.match(/^([\d.]+)k$/);
    if (kMatch) {
        const num = parseFloat(kMatch[1]);
        if (!isNaN(num) && num > 0) {
            return Math.floor(num * 1000);
        }
    }
    
    // Regular number
    const num = parseInt(input);
    if (!isNaN(num) && num > 0) {
        return num;
    }
    
    return null;
}

module.exports = { parseAmount };
