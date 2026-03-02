const profanityList = require('../profanityList');
let GoogleGenerativeAI = null;
try {
    ({ GoogleGenerativeAI } = require('@google/generative-ai'));
} catch (e) {
    GoogleGenerativeAI = null;
}

// Initialize Gemini for context checks if available
const genAI = (process.env.GEMINI_API_KEY && GoogleGenerativeAI) ? new GoogleGenerativeAI(process.env.GEMINI_API_KEY) : null;
const geminiModelName = process.env.GEMINI_MODEL || 'gemini-2.0-flash-exp';
const model = genAI ? genAI.getGenerativeModel({ model: geminiModelName }) : null;

const _geminiCache = new Map();
function _cacheGet(key) {
    const ttl = Number(process.env.GEMINI_CACHE_TTL_MS || 60000);
    const hit = _geminiCache.get(key);
    if (!hit) return null;
    if (Date.now() - hit.at > ttl) {
        _geminiCache.delete(key);
        return null;
    }
    return hit.val;
}

function _cacheSet(key, val) {
    _geminiCache.set(key, { at: Date.now(), val });
    if (_geminiCache.size > 500) {
        const firstKey = _geminiCache.keys().next().value;
        if (firstKey) _geminiCache.delete(firstKey);
    }
}

async function classifyWithGemini(text) {
    if (!model) return { ok: false };
    const raw = String(text || '');
    const trimmed = raw.trim();
    if (!trimmed) return { ok: true, isViolation: false, confidence: 1, reason: 'empty' };

    const maxLen = Number(process.env.GEMINI_MAX_CHARS || 500);
    const input = trimmed.length > maxLen ? trimmed.slice(0, maxLen) : trimmed;

    const cacheKey = `${geminiModelName}:${input}`;
    const cached = _cacheGet(cacheKey);
    if (cached) return cached;

    const timeoutMs = Number(process.env.GEMINI_TIMEOUT_MS || 5000);
    const prompt =
        `You are a strict profanity moderation classifier for Discord messages.\n` +
        `Detect profanity/insults/slurs/sexual insults in Arabic dialects (EG/Gulf/etc), MSA, English, and Franco-Arabic.\n` +
        `Return ONLY valid minified JSON: {"isViolation":boolean,"confidence":number,"reason":string}.\n` +
        `confidence must be between 0 and 1.\n` +
        `Message: ${JSON.stringify(input)}`;

    try {
        const result = await Promise.race([
            model.generateContent(prompt),
            new Promise((_, rej) => setTimeout(() => rej(new Error('GEMINI_TIMEOUT')), timeoutMs))
        ]);

        const jsonString = result.response.text().replace(/```json/g, '').replace(/```/g, '').trim();
        const parsed = JSON.parse(jsonString);
        const out = {
            ok: true,
            isViolation: Boolean(parsed.isViolation),
            confidence: Math.max(0, Math.min(1, Number(parsed.confidence))),
            reason: String(parsed.reason || '')
        };
        _cacheSet(cacheKey, out);
        return out;
    } catch (e) {
        return { ok: false, error: String(e?.message || e) };
    }
}

async function detectProfanityAI(content, { extraTerms = [], whitelist = [] } = {}) {
    const mode = String(process.env.GEMINI_MODE || 'hybrid').toLowerCase();
    const aiThreshold = Math.max(0, Math.min(1, Number(process.env.GEMINI_CONFIDENCE_THRESHOLD || 0.85)));
    const failSafe = String(process.env.GEMINI_FAILSAFE || 'on').toLowerCase() !== 'off';

    // Always keep rules in the loop for exact blacklist hits + whitelists.
    const rules = detectProfanitySmart(content, { extraTerms, whitelist });

    // In hybrid mode: only consult AI when rules are suspicious.
    // In first mode: consult AI for every message, then optionally fail-safe to rules.
    const shouldAskAI = model && (mode === 'first' || rules.isViolation);
    if (!shouldAskAI) return { ...rules, source: 'rules' };

    const ai = await classifyWithGemini(content);
    if (ai.ok) {
        if (ai.isViolation && ai.confidence >= aiThreshold) {
            return { isViolation: true, matches: rules.matches || [], source: 'ai', ai };
        }
        // If AI says NOT violation, prefer AI to reduce false positives.
        if (!ai.isViolation) {
            // But in fail-safe mode, keep explicit rules hits.
            if (failSafe && rules.isViolation) return { ...rules, source: 'rules', ai };
            return { isViolation: false, matches: [], source: 'ai', ai };
        }
        // AI unsure / low confidence
        return failSafe ? { ...rules, source: 'rules', ai } : { isViolation: false, matches: [], source: 'ai', ai };
    }

    // AI unavailable -> fallback
    return { ...rules, source: 'rules', ai };
}

/**
 * Normalizes text for better detection (Arabic/English)
 */
function normalizeText(text) {
    if (!text) return '';

    // 1) Convert to lowercase
    let normalized = String(text).toLowerCase();

    // Remove emojis (unicode pictographs) early
    normalized = normalized.replace(/[\p{Extended_Pictographic}\uFE0F\u200D]+/gu, ' ');

    // 1.5) Collapse elongated letters early (helps Franco like a7aaaaaaaa)
    normalized = normalized.replace(/([a-z])\1{1,}/g, '$1');
    normalized = normalized.replace(/([\u0621-\u064Aء])\1{1,}/g, '$1');

    // 2) Normalize common "Franco-Arabic" numerals
    // IMPORTANT: only convert digits when they are used as letters (adjacent to [a-z]).
    // This prevents false positives for plain numbers like "5" or "55555".
    normalized = normalized
        .replace(/(?<=[a-z])2|2(?=[a-z])/g, 'ء')
        .replace(/(?<=[a-z])3|3(?=[a-z])/g, 'ع')
        .replace(/(?<=[a-z])4|4(?=[a-z])/g, 'ش')
        .replace(/(?<=[a-z])5|5(?=[a-z])/g, 'خ')
        .replace(/(?<=[a-z])6|6(?=[a-z])/g, 'ط')
        .replace(/(?<=[a-z])7|7(?=[a-z])/g, 'ح')
        .replace(/(?<=[a-z])8|8(?=[a-z])/g, 'ق')
        .replace(/(?<=[a-z])9|9(?=[a-z])/g, 'ص');

    // 3) Normalize Arabic characters (Alef, Yeh, etc.)
    normalized = normalized
        .replace(/[أإآا]/g, 'ا')
        .replace(/[ى]/g, 'ي')
        .replace(/[ة]/g, 'ه')
        .replace(/ؤ/g, 'و')
        .replace(/ئ/g, 'ي');

    // 4) Remove diacritics / tatweel
    normalized = normalized
        .replace(/[\u064B-\u065F\u0670\u06D6-\u06ED]/g, '')
        .replace(/ـ/g, '');

    // 5) Reduce repeated characters to handle elongations
    // - Latin: collapse repeats to 1 ("fuuuuuck" -> "fuck")
    // - Arabic: collapse repeats to 1 ("منيووووك" -> "منيوك")
    normalized = normalized.replace(/([a-z])\1{1,}/g, '$1');
    normalized = normalized.replace(/([\u0621-\u064Aء])\1{1,}/g, '$1');

    // 6) Keep letters/numbers/spaces; convert other chars to spaces (so boundaries still work)
    normalized = normalized.replace(/[^a-z0-9\s\u0621-\u064Aء]/gi, ' ');
    normalized = normalized.replace(/\s+/g, ' ').trim();

    return normalized;
}

// Global whitelist for common false positives
const GLOBAL_WHITELIST = new Set([
    'warning', 'warnings', 'restart', 'restarts', 'message', 'messages', 'class', 'classes',
    'assessment', 'assessments', 'assume', 'assumed', 'assuming', 'pass', 'passed', 'passing',
    'grass', 'glass', 'mass', 'brass', 'compass', 'bass', 'embassy', 'classic', 'classical',
    'associate', 'association', 'asset', 'assets', 'assignment', 'assign', 'assigned',
    'hoeing', 'shoe', 'shoes', 'backhoe', 'titans', 'titanic', 'title', 'titled', 'titles',
    'shitting', 'shifting', 'shirt', 'shirts', 'short', 'shorts', 'shot', 'shots', 'shoot',
    'sheet', 'sheets', 'shell', 'shells', 'shelf', 'shelves', 'shall', 'shape', 'shapes',
    'share', 'shared', 'sharing', 'sharp', 'sharply', 'shake', 'shaken', 'shaking',
    'احلام', 'احلامي', 'احلامك', 'احلامنا', 'احلامكم', 'احلامهم',
    'احسن', 'احسنت', 'احسنتم', 'احسنا', 'احسنوا', 'احسني',
    'احساس', 'احاسيس', 'احساسي', 'احساسك', 'احساسنا', 'احساسكم', 'احساسهم',
    'احمر', 'حمراء', 'حمرة', 'حمار'
]);

function normalizeTextKeepDigits(text) {
    if (!text) return '';
    let normalized = String(text).toLowerCase();
    normalized = normalized
        .replace(/[أإآا]/g, 'ا')
        .replace(/[ى]/g, 'ي')
        .replace(/[ة]/g, 'ه')
        .replace(/ؤ/g, 'و')
        .replace(/ئ/g, 'ي');
    normalized = normalized
        .replace(/[\u064B-\u065F\u0670\u06D6-\u06ED]/g, '')
        .replace(/ـ/g, '');

    // Handle elongations (same as normalizeText)
    normalized = normalized.replace(/([a-z])\1{1,}/g, '$1');
    normalized = normalized.replace(/([\u0621-\u064Aء])\1{1,}/g, '$1');
    normalized = normalized.replace(/[^a-z0-9\s\u0621-\u064Aء]/gi, ' ');
    normalized = normalized.replace(/\s+/g, ' ').trim();
    return normalized;
}

function escapeRegex(s) {
    return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function tokenize(text) {
    const clean = normalizeText(text);
    if (!clean) return [];
    return clean.split(/\s+/).filter(Boolean);
}

function buildWordRegex(term) {
    const t = normalizeText(term);
    const parts = t.split(/\s+/).filter(Boolean).map(escapeRegex);
    if (!parts.length) return null;

    let body = parts.join('\\s+');

    if (parts.length === 1) {
        const rawPart = parts[0];
        const norm = normalizeText(term);
        const isAsciiAlpha = /^[a-z]+$/.test(norm);
        
        if (isAsciiAlpha) {
            if (norm.length <= 3) {
                body = `\\b${rawPart}\\b`;
            } else {
                const flexibleBody = rawPart.split('').map(char => `${char}+`).join('');
                body = `\\b${flexibleBody}(?:s|es|\\'s)?\\b`;
            }
        } else {
            body = `(?:^|\\s)(${rawPart})(?=$|\\s)`;
        }
    } else {
        body = `(?:^|\\s)(${body})(?=$|\\s)`;
    }

    return new RegExp(body, 'i');
}

function detectProfanitySmart(content, { extraTerms = [], whitelist = [] } = {}) {
    const raw = String(content || '');
    const normalized = normalizeText(raw);
    const normalizedDigits = normalizeTextKeepDigits(raw);
    if (!normalized && !normalizedDigits) return { isViolation: false, matches: [] };

    const list = [...new Set([...(Array.isArray(profanityList) ? profanityList : []), ...(Array.isArray(extraTerms) ? extraTerms : [])])];
    const wl = new Set((Array.isArray(whitelist) ? whitelist : []).map(t => normalizeText(t)).filter(Boolean));

    const matches = [];
    for (const term of list) {
        if (!term || typeof term !== 'string') continue;
        const tNorm = normalizeText(term);
        if (tNorm && (wl.has(tNorm) || GLOBAL_WHITELIST.has(tNorm))) continue;

        const rx = buildWordRegex(term);
        if (!rx) continue;

        const hit = rx.exec(normalized) || rx.exec(normalizedDigits);
        if (hit) {
            const matchedString = (hit[1] || hit[0]).trim();
            const matchedNorm = normalizeText(matchedString);
            if (GLOBAL_WHITELIST.has(matchedNorm)) continue;
            matches.push(term);
        }
    }

    if (!matches.length) return { isViolation: false, matches: [] };
    return { isViolation: true, matches: [...new Set(matches)] };
}

function levenshteinDistance(s1, s2) {
    if (s1.length < s2.length) return levenshteinDistance(s2, s1);
    if (s2.length === 0) return s1.length;
    let previousRow = Array.from({ length: s2.length + 1 }, (_, i) => i);
    for (let i = 0; i < s1.length; i++) {
        let currentRow = [i + 1];
        for (let j = 0; j < s2.length; j++) {
            const insertions = previousRow[j + 1] + 1;
            const deletions = currentRow[j] + 1;
            const substitutions = previousRow[j] + (s1[i] !== s2[j] ? 1 : 0);
            currentRow.push(Math.min(insertions, deletions, substitutions));
        }
        previousRow = currentRow;
    }
    return previousRow[s2.length];
}

function getFuzzyMatch(word, blacklist) {
    for (const bad of blacklist) {
        if (bad.length < 3) continue;
        const distance = levenshteinDistance(word, bad);
        const threshold = Math.floor(bad.length * 0.3);
        if (distance <= threshold) return { matched: bad, confidence: 100 - (distance * 10) };
    }
    return null;
}

async function aiContextCheck(text, detectedWords) {
    if (!model) return { isViolation: true, confidence: 80 };
    try {
        const prompt =
            `You are a strict profanity moderation classifier. Decide if the message contains profanity/insults/slurs in English or Arabic (including Franco-Arabic).
Return ONLY valid minified JSON with keys: {"isViolation":boolean,"confidence":number,"reason":string}.
confidence must be between 0 and 1.
Message: ${JSON.stringify(String(text || ''))}
Suspected terms: ${JSON.stringify(detectedWords.slice(0, 10))}`;

        const timeoutMs = Number(process.env.GEMINI_TIMEOUT_MS || 5000);
        const result = await Promise.race([
            model.generateContent(prompt),
            new Promise((_, rej) => setTimeout(() => rej(new Error('GEMINI_TIMEOUT')), timeoutMs))
        ]);
        const jsonString = result.response.text().replace(/```json/g, '').replace(/```/g, '').trim();
        const parsed = JSON.parse(jsonString);
        const conf = Math.max(0, Math.min(1, Number(parsed.confidence)));
        return {
            isViolation: Boolean(parsed.isViolation),
            confidence: conf,
            reason: String(parsed.reason || '')
        };
    } catch (e) {
        return { isViolation: true, confidence: 0.7, reason: 'AI_error' };
    }
}

async function detectProfanityHybrid(content, { extraTerms = [], whitelist = [] } = {}) {
    const base = detectProfanitySmart(content, { extraTerms, whitelist });
    if (!base.isViolation) return { ...base, source: 'rules' };

    // If no AI available, keep rules decision.
    if (!model) return { ...base, source: 'rules' };

    const ai = await aiContextCheck(content, base.matches || []);
    const threshold = Math.max(0, Math.min(1, Number(process.env.GEMINI_CONFIDENCE_THRESHOLD || 0.85)));

    // Only act if AI is confident it's a violation; otherwise treat as non-violation to reduce false positives.
    if (ai?.isViolation && Number(ai.confidence) >= threshold) {
        return { isViolation: true, matches: base.matches || [], source: 'ai', ai };
    }
    return { isViolation: false, matches: [], source: 'ai', ai };
}

async function analyzeMessage(messageContent) {
    const rawContent = messageContent;
    const cleanContent = normalizeText(rawContent);
    const words = cleanContent.split(/\s+/);
    let matches = [];
    let severityScore = 0;
    for (const word of words) {
        if (profanityList.includes(word)) {
            matches.push(word);
            severityScore += 10;
        } else {
            const fuzzy = getFuzzyMatch(word, profanityList);
            if (fuzzy) {
                matches.push(word);
                severityScore += 8;
            }
        }
    }
    if (matches.length === 0) return { isViolation: false };
    if (severityScore < 30) {
        const aiResult = await aiContextCheck(rawContent, matches);
        return { isViolation: aiResult.isViolation, matches: matches, confidence: aiResult.confidence, severity: aiResult.severity, reason: aiResult.reason };
    }
    return { isViolation: true, matches: matches, confidence: 95, severity: severityScore > 50 ? 'Extreme' : 'Severe', reason: 'Direct word match' };
}

module.exports = { analyzeMessage, normalizeText, levenshteinDistance, detectProfanitySmart, detectProfanityHybrid, detectProfanityAI, tokenize };
