const { EmbedBuilder } = require('discord.js');
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');

const ACTIVE_GEO_CHANNELS = new Set();

const REST_COUNTRIES_CACHE = {
    data: null,
    fetchedAt: 0,
    inFlight: null
};

const REST_COUNTRIES_CACHE_TTL_MS = 6 * 60 * 60 * 1000;

const FALLBACK_COUNTRIES = [
    {
        name: { common: 'Japan', official: 'Japan' },
        altSpellings: ['JP', 'Nippon', 'Nihon'],
        region: 'Asia',
        subregion: 'Eastern Asia',
        capital: ['Tokyo'],
        tld: ['.jp'],
        idd: { root: '+8', suffixes: ['1'] },
        currencies: { JPY: { name: 'Japanese yen' } },
        cca2: 'JP',
        cca3: 'JPN',
        flag: '🇯🇵'
    },
    {
        name: { common: 'Brazil', official: 'Federative Republic of Brazil' },
        altSpellings: ['BR', 'Brasil'],
        region: 'Americas',
        subregion: 'South America',
        capital: ['Brasília'],
        tld: ['.br'],
        idd: { root: '+5', suffixes: ['5'] },
        currencies: { BRL: { name: 'Brazilian real' } },
        cca2: 'BR',
        cca3: 'BRA',
        flag: '🇧🇷'
    },
    {
        name: { common: 'Germany', official: 'Federal Republic of Germany' },
        altSpellings: ['DE', 'Deutschland'],
        region: 'Europe',
        subregion: 'Western Europe',
        capital: ['Berlin'],
        tld: ['.de'],
        idd: { root: '+4', suffixes: ['9'] },
        currencies: { EUR: { name: 'Euro' } },
        cca2: 'DE',
        cca3: 'DEU',
        flag: '🇩🇪'
    },
    {
        name: { common: 'Canada', official: 'Canada' },
        altSpellings: ['CA'],
        region: 'Americas',
        subregion: 'North America',
        capital: ['Ottawa'],
        tld: ['.ca'],
        idd: { root: '+1', suffixes: [''] },
        currencies: { CAD: { name: 'Canadian dollar' } },
        cca2: 'CA',
        cca3: 'CAN',
        flag: '🇨🇦'
    },
    {
        name: { common: 'Egypt', official: 'Arab Republic of Egypt' },
        altSpellings: ['EG', 'Misr'],
        region: 'Africa',
        subregion: 'Northern Africa',
        capital: ['Cairo'],
        tld: ['.eg'],
        idd: { root: '+2', suffixes: ['0'] },
        currencies: { EGP: { name: 'Egyptian pound' } },
        cca2: 'EG',
        cca3: 'EGY',
        flag: '🇪🇬'
    },
    {
        name: { common: 'Australia', official: 'Commonwealth of Australia' },
        altSpellings: ['AU'],
        region: 'Oceania',
        subregion: 'Australia and New Zealand',
        capital: ['Canberra'],
        tld: ['.au'],
        idd: { root: '+6', suffixes: ['1'] },
        currencies: { AUD: { name: 'Australian dollar' } },
        cca2: 'AU',
        cca3: 'AUS',
        flag: '🇦🇺'
    },
    {
        name: { common: 'France', official: 'French Republic' },
        altSpellings: ['FR', 'République française'],
        region: 'Europe',
        subregion: 'Western Europe',
        capital: ['Paris'],
        tld: ['.fr'],
        idd: { root: '+3', suffixes: ['3'] },
        currencies: { EUR: { name: 'Euro' } },
        cca2: 'FR',
        cca3: 'FRA',
        flag: '🇫🇷'
    },
    {
        name: { common: 'India', official: 'Republic of India' },
        altSpellings: ['IN', 'Bharat'],
        region: 'Asia',
        subregion: 'Southern Asia',
        capital: ['New Delhi'],
        tld: ['.in'],
        idd: { root: '+9', suffixes: ['1'] },
        currencies: { INR: { name: 'Indian rupee' } },
        cca2: 'IN',
        cca3: 'IND',
        flag: '🇮🇳'
    }
];

const SCORES_FILE_PATH = path.join(__dirname, '../../../data/geo_scores.json');

function clampStr(s, maxLen) {
    const str = String(s ?? '');
    if (str.length <= maxLen) return str;
    return str.slice(0, maxLen - 1) + '…';
}

function safeLower(s) {
    return String(s ?? '').trim().toLowerCase();
}

function normalizeGuess(s) {
    return safeLower(s)
        .replace(/[`*_~|>]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

function shuffleArray(arr) {
    const a = Array.from(arr);
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

function scrambleWord(s) {
    const str = String(s ?? '').trim();
    if (!str) return '';
    const chars = str.replace(/\s+/g, '').split('');
    if (chars.length <= 2) return str;

    let attempt = 0;
    while (attempt < 8) {
        const scrambled = shuffleArray(chars).join('');
        if (scrambled.toLowerCase() !== chars.join('').toLowerCase()) return scrambled;
        attempt++;
    }
    return shuffleArray(chars).join('');
}

function buildLetterMask(name) {
    const n = String(name ?? '').trim();
    if (!n) return '—';
    const lettersOnly = n.replace(/[^A-Za-z]/g, '');
    const count = lettersOnly.length || n.replace(/\s+/g, '').length;
    return Array.from({ length: Math.min(count, 28) }, () => '_').join(' ');
}

function titleCase(s) {
    const str = String(s ?? '').trim();
    if (!str) return '';
    return str
        .toLowerCase()
        .split(' ')
        .filter(Boolean)
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' ');
}

function extractCallingCode(country) {
    const root = country?.idd?.root;
    const suffixes = Array.isArray(country?.idd?.suffixes) ? country.idd.suffixes : [];
    if (!root) return '—';
    if (!suffixes.length) return root;
    return `${root}${suffixes[0]}`;
}

function extractCurrencyName(country) {
    const currencies = country?.currencies;
    if (!currencies || typeof currencies !== 'object') return '—';
    const firstKey = Object.keys(currencies)[0];
    const cur = firstKey ? currencies[firstKey] : null;
    const name = cur?.name;
    return name ? String(name) : '—';
}

function extractTld(country) {
    const tld = Array.isArray(country?.tld) ? country.tld : [];
    return tld.length ? String(tld[0]) : '—';
}

function extractRegion(country) {
    const region = country?.region;
    const sub = country?.subregion;
    if (region && sub) return `${region} / ${sub}`;
    return region || sub || '—';
}

function extractCapital(country) {
    const cap = Array.isArray(country?.capital) ? country.capital : [];
    return cap.length ? String(cap[0]) : '—';
}

function inferFlagColors(country) {
    const name = country?.name?.common || country?.name?.official || '';
    const flag = country?.flag || '';
    const code = country?.cca2 || country?.cca3 || '';

    const colors = [];
    const push = (c) => {
        if (!c) return;
        if (!colors.includes(c)) colors.push(c);
    };

    const text = `${name} ${flag} ${code}`.toLowerCase();
    if (text.includes('red')) push('red');
    if (text.includes('blue')) push('blue');
    if (text.includes('green')) push('green');
    if (text.includes('yellow') || text.includes('gold')) push('yellow');
    if (text.includes('white')) push('white');
    if (text.includes('black')) push('black');

    return colors.length ? colors.map(titleCase).join(', ') : 'Unknown';
}

async function ensureScoresFile() {
    try {
        // 1) Requested: ensure ./data exists before read/write
        try {
            fs.mkdirSync('./data', { recursive: true });
        } catch (_) {
            // ignore; we'll still attempt the absolute path mkdir below
        }

        await fsp.mkdir(path.dirname(SCORES_FILE_PATH), { recursive: true });
        if (!fs.existsSync(SCORES_FILE_PATH)) {
            await fsp.writeFile(SCORES_FILE_PATH, JSON.stringify({ version: 1, scores: {} }, null, 2), 'utf8');
        }
    } catch (e) {
        throw new Error(`Failed to initialize scores storage: ${e?.message || e}`);
    }
}

async function readScores() {
    await ensureScoresFile();
    try {
        const raw = await fsp.readFile(SCORES_FILE_PATH, 'utf8');
        const parsed = JSON.parse(raw || '{}');
        const scores = parsed?.scores && typeof parsed.scores === 'object' ? parsed.scores : {};
        return scores;
    } catch (e) {
        return {};
    }
}

async function writeScores(scores) {
    await ensureScoresFile();
    const payload = { version: 1, scores: scores && typeof scores === 'object' ? scores : {} };
    await fsp.writeFile(SCORES_FILE_PATH, JSON.stringify(payload, null, 2), 'utf8');
}

async function incrementScore(userId) {
    const scores = await readScores();
    const current = Number(scores[userId] || 0);
    scores[userId] = current + 1;
    await writeScores(scores);
    return scores[userId];
}

function buildInterceptEmbed({ stage, country, meta }) {
    const region = extractRegion(country);
    const tld = extractTld(country);
    const calling = extractCallingCode(country);
    const currency = extractCurrencyName(country);
    const nameCommon = country?.name?.common || 'Unknown';
    const capital = extractCapital(country);

    const letterMask = buildLetterMask(nameCommon);
    const scrambledCap = capital === '—' ? '—' : scrambleWord(capital);

    const flagColors = inferFlagColors(country);

    const lines = [];
    lines.push('```');
    lines.push('ELORA SIGINT // GEO-INTERCEPT');
    lines.push('');

    if (stage >= 1) {
        lines.push(`[ STAGE-1 ] REGION      : ${region}`);
        lines.push(`[ STAGE-1 ] TLD         : ${tld}`);
        lines.push(`[ STAGE-1 ] CALLING     : ${calling}`);
    }
    if (stage >= 2) {
        lines.push('');
        lines.push(`[ STAGE-2 ] CURRENCY    : ${currency}`);
        lines.push(`[ STAGE-2 ] NAME LENGTH : ${letterMask}`);
    }
    if (stage >= 3) {
        lines.push('');
        lines.push(`[ STAGE-3 ] CAPITAL     : ${scrambledCap}`);
        lines.push(`[ STAGE-3 ] FLAG COLORS : ${flagColors}`);
    }

    lines.push('```');

    const title = stage === 1
        ? '📡 INTERCEPTING SATELLITE DATA...'
        : stage === 2
            ? '📡 DECRYPTION PROGRESSING...'
            : '📡 SIGNAL CLARITY IMPROVING...';

    const e = new EmbedBuilder()
        .setColor(0x0b0f14)
        .setTitle(title)
        .setDescription(lines.join('\n'))
        .setFooter({ text: `Channel Lock: Active • Window: ${meta?.timeLeft ?? 45}s` })
        .setTimestamp();

    return e;
}

function buildAccessGrantedEmbed({ winner, country, newScore }) {
    const nameCommon = country?.name?.common || 'Unknown';
    const nameOfficial = country?.name?.official || null;
    const capital = extractCapital(country);

    const desc = [
        '```',
        'ACCESS GRANTED // TARGET VERIFIED',
        '',
        `AGENT   : ${winner?.tag || winner?.username || winner?.id || 'Unknown'}`,
        `TARGET  : ${nameCommon}${nameOfficial ? ` / ${nameOfficial}` : ''}`,
        `CAPITAL : ${capital}`,
        `SCORE   : ${newScore} decryptions`,
        '```'
    ].join('\n');

    return new EmbedBuilder()
        .setColor(0x101418)
        .setTitle('✅ ACCESS GRANTED')
        .setDescription(desc)
        .setTimestamp();
}

function buildConnectionLostEmbed(country) {
    const nameCommon = country?.name?.common || 'Unknown';
    const nameOfficial = country?.name?.official || null;
    const region = extractRegion(country);
    const capital = extractCapital(country);

    const desc = [
        '```',
        'CONNECTION LOST // SIGNAL TIMED OUT',
        '',
        `TARGET  : ${nameCommon}${nameOfficial ? ` / ${nameOfficial}` : ''}`,
        `REGION  : ${region}`,
        `CAPITAL : ${capital}`,
        '```'
    ].join('\n');

    return new EmbedBuilder()
        .setColor(0x0f1317)
        .setTitle('❌ CONNECTION LOST')
        .setDescription(desc)
        .setTimestamp();
}

async function fetchRandomCountry() {
    const pickRandom = (arr) => {
        if (!Array.isArray(arr) || !arr.length) return null;
        return arr[Math.floor(Math.random() * arr.length)];
    };

    const sanitizeCountries = (data) => {
        if (!Array.isArray(data) || !data.length) return [];
        const candidates = data.filter((c) => {
            const common = c?.name?.common;
            const official = c?.name?.official;
            return typeof common === 'string' && common.trim().length >= 3 && typeof official === 'string' && official.trim();
        });
        return candidates.length ? candidates : data;
    };

    try {
        const now = Date.now();
        if (Array.isArray(REST_COUNTRIES_CACHE.data) && REST_COUNTRIES_CACHE.data.length) {
            const age = now - REST_COUNTRIES_CACHE.fetchedAt;
            if (age >= 0 && age < REST_COUNTRIES_CACHE_TTL_MS) {
                return pickRandom(REST_COUNTRIES_CACHE.data);
            }
        }

        if (!REST_COUNTRIES_CACHE.inFlight) {
            REST_COUNTRIES_CACHE.inFlight = (async () => {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => {
                    try { controller.abort(); } catch (_) { }
                }, 10_000);

                try {
                    const url = 'https://restcountries.com/v3.1/all';
                    const res = await fetch(url, {
                        method: 'GET',
                        headers: {
                            'User-Agent': 'ELORA Geo-Intercept (Discord Bot)',
                            'Accept': 'application/json'
                        },
                        signal: controller.signal
                    });

                    if (!res?.ok) {
                        throw new Error(`REST Countries API failed: HTTP ${res?.status ?? 'Unknown'}`);
                    }

                    const json = await res.json();
                    const pool = sanitizeCountries(json);
                    if (!pool.length) throw new Error('REST Countries API returned empty payload');

                    REST_COUNTRIES_CACHE.data = pool;
                    REST_COUNTRIES_CACHE.fetchedAt = Date.now();
                    return pool;
                } finally {
                    clearTimeout(timeoutId);
                }
            })()
                .catch((e) => {
                    console.error('[Geo-Intercept Error]:', e);
                    return null;
                })
                .finally(() => {
                    REST_COUNTRIES_CACHE.inFlight = null;
                });
        }

        const pool = await REST_COUNTRIES_CACHE.inFlight;
        const chosen = pickRandom(pool);
        if (chosen) return chosen;
    } catch (e) {
        console.error('[Geo-Intercept Error]:', e);
    }

    return pickRandom(FALLBACK_COUNTRIES);
}

function makeAnswerSet(country) {
    const answers = new Set();
    const common = country?.name?.common;
    const official = country?.name?.official;

    if (common) answers.add(normalizeGuess(common));
    if (official) answers.add(normalizeGuess(official));

    const altSpellings = Array.isArray(country?.altSpellings) ? country.altSpellings : [];
    for (const a of altSpellings) {
        if (typeof a === 'string' && a.trim().length >= 3) answers.add(normalizeGuess(a));
    }

    return answers;
}

function buildLeaderboardEmbed(rows) {
    const symbols = ['❖', '◈', '⟡', '⛊', '⊞', '◈', '❖', '⟡', '⛊', '⊞'];

    const e = new EmbedBuilder()
        .setColor(0x0b0f14)
        .setTitle('✧ ELORA Geo-Intelligence Leaderboard ✧')
        .setTimestamp();

    if (!rows.length) {
        e.setDescription('```\nNo data intercepted yet.\n```');
        return e;
    }

    const lines = [];
    for (let i = 0; i < rows.length; i++) {
        const { userTag, userId, score } = rows[i];
        const rank = String(i + 1).padStart(2, ' ');
        const sym = symbols[i] || '◈';
        const display = userTag ? `@${userTag}` : `@${userId}`;
        const scoreLabel = score === 1 ? 'Decryption' : 'Decryptions';
        lines.push(`[ ${rank} ] ${sym} ${display} ⟡ ${score} ${scoreLabel}`);
    }

    const block = ['```', ...lines, '```'].join('\n');
    e.setDescription(block);

    return e;
}

module.exports = {
    name: 'geo',
    aliases: ['geoint', 'geoguess', 'intercept'],

    async execute(message, client, args) {
        const sub = safeLower(args?.[0]);

        if (sub === 'lb' || sub === 'leaderboard') {
            try {
                const scores = await readScores();
                const entries = Object.entries(scores)
                    .map(([userId, score]) => ({ userId, score: Number(score) || 0 }))
                    .filter((x) => x.score > 0)
                    .sort((a, b) => b.score - a.score)
                    .slice(0, 10);

                const rows = [];
                for (const entry of entries) {
                    const user = await client.users.fetch(entry.userId).catch(() => null);
                    rows.push({
                        userId: entry.userId,
                        userTag: user?.username || user?.tag || null,
                        score: entry.score
                    });
                }

                const embed = buildLeaderboardEmbed(rows);
                return await message.reply({ embeds: [embed] });
            } catch (error) {
                // 2) Requested: log actual error
                console.error('[Geo-Intercept Error]:', error);

                const err = new EmbedBuilder()
                    .setColor(0x0f1317)
                    .setTitle('❌ CONNECTION LOST')
                    .setDescription('```\nLeaderboard subsystem offline.\n```');
                return await message.reply({ embeds: [err] });
            }
        }

        const channelId = message.channelId;
        if (ACTIVE_GEO_CHANNELS.has(channelId)) {
            const embed = new EmbedBuilder()
                .setColor(0x0b0f14)
                .setTitle('📡 INTERCEPT ACTIVE')
                .setDescription('```\nA Geo-Intercept is already running in this channel.\nWait for the current window to close.\n```');
            return await message.reply({ embeds: [embed] });
        }

        ACTIVE_GEO_CHANNELS.add(channelId);

        let country = null;
        let collector = null;
        let intervalIds = [];
        let gameMessage = null;

        const cleanup = () => {
            for (const id of intervalIds) {
                try { clearTimeout(id); } catch (_) { }
            }
            intervalIds = [];
            try { collector?.stop(); } catch (_) { }
            ACTIVE_GEO_CHANNELS.delete(channelId);
        };

        try {
            country = await fetchRandomCountry();
            const answerSet = makeAnswerSet(country);

            const meta = { timeLeft: 45 };
            const embed1 = buildInterceptEmbed({ stage: 1, country, meta });
            gameMessage = await message.reply({ embeds: [embed1] });

            const startedAt = Date.now();
            const updateFooter = () => {
                const elapsed = (Date.now() - startedAt) / 1000;
                meta.timeLeft = Math.max(0, Math.ceil(45 - elapsed));
            };

            intervalIds.push(setTimeout(async () => {
                try {
                    updateFooter();
                    const embed2 = buildInterceptEmbed({ stage: 2, country, meta });
                    await gameMessage.edit({ embeds: [embed2] }).catch(() => { });
                } catch (_) { }
            }, 10_000));

            intervalIds.push(setTimeout(async () => {
                try {
                    updateFooter();
                    const embed3 = buildInterceptEmbed({ stage: 3, country, meta });
                    await gameMessage.edit({ embeds: [embed3] }).catch(() => { });
                } catch (_) { }
            }, 20_000));

            collector = message.channel.createMessageCollector({
                filter: (m) => !m.author.bot,
                time: 45_000
            });

            collector.on('collect', async (m) => {
                try {
                    const guess = normalizeGuess(m.content);
                    if (!guess) return;

                    if (answerSet.has(guess)) {
                        collector.stop('winner');
                        const newScore = await incrementScore(m.author.id).catch(() => null);

                        const winEmbed = buildAccessGrantedEmbed({
                            winner: m.author,
                            country,
                            newScore: newScore ?? '—'
                        });
                        await message.channel.send({ embeds: [winEmbed] }).catch(() => null);
                        return;
                    }
                } catch (_) {
                    return;
                }
            });

            collector.on('end', async (_collected, reason) => {
                try {
                    if (reason !== 'winner') {
                        const loseEmbed = buildConnectionLostEmbed(country);
                        await message.channel.send({ embeds: [loseEmbed] }).catch(() => { });
                    }
                } finally {
                    cleanup();
                }
            });
        } catch (error) {
            // 2) Requested: log actual error
            console.error('[Geo-Intercept Error]:', error);

            cleanup();
            return await message.reply({
                content: '▫️ The Geo-Intercept satellite is currently down. Try again later.'
            });
        }
    }
};