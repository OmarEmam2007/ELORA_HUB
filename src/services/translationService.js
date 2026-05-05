const translateApi = require('@vitalets/google-translate-api');

const TOP_LANGUAGES = [
    { label: 'English', value: 'en' },
    { label: 'Arabic', value: 'ar' },
    { label: 'French', value: 'fr' },
    { label: 'Spanish', value: 'es' },
    { label: 'German', value: 'de' },
    { label: 'Italian', value: 'it' },
    { label: 'Portuguese', value: 'pt' },
    { label: 'Russian', value: 'ru' },
    { label: 'Turkish', value: 'tr' },
    { label: 'Dutch', value: 'nl' },
    { label: 'Polish', value: 'pl' },
    { label: 'Ukrainian', value: 'uk' },
    { label: 'Romanian', value: 'ro' },
    { label: 'Czech', value: 'cs' },
    { label: 'Greek', value: 'el' },
    { label: 'Swedish', value: 'sv' },
    { label: 'Norwegian', value: 'no' },
    { label: 'Danish', value: 'da' },
    { label: 'Finnish', value: 'fi' },
    { label: 'Hungarian', value: 'hu' },
    { label: 'Hebrew', value: 'iw' },
    { label: 'Japanese', value: 'ja' },
    { label: 'Korean', value: 'ko' },
    { label: 'Chinese (Simplified)', value: 'zh-CN' },
    { label: 'Hindi', value: 'hi' }
];

function clampText(input, max) {
    const s = String(input ?? '');
    if (s.length <= max) return s;
    return `${s.slice(0, Math.max(0, max - 1))}…`;
}

async function translateText(text, { to, from = 'auto' } = {}) {
    const payload = String(text ?? '').trim();
    if (!payload) {
        return { ok: false, error: 'EMPTY_TEXT' };
    }

    try {
        const res = await translateApi(payload, { to, from });
        const detected = res?.from?.language?.iso || 'auto';
        return {
            ok: true,
            text: String(res?.text ?? ''),
            detected,
            raw: res
        };
    } catch (e) {
        return { ok: false, error: e?.message || String(e) };
    }
}

module.exports = {
    TOP_LANGUAGES,
    clampText,
    translateText
};
