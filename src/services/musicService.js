const path = require('path');
const fs = require('fs');
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');
const {
    joinVoiceChannel,
    getVoiceConnection,
    createAudioPlayer,
    createAudioResource,
    AudioPlayerStatus,
    VoiceConnectionStatus,
    entersState,
    demuxProbe,
} = require('@discordjs/voice');
const play = require('play-dl');

let playDlInitPromise = null;
let youtubeEnabled = true;

function isRailway() {
    return Boolean(process.env.RAILWAY_ENVIRONMENT || process.env.RAILWAY_PROJECT_ID || process.env.RAILWAY_SERVICE_ID);
}

function isYouTubeDisabledByEnv() {
    const v = String(process.env.DISABLE_YOUTUBE || '').trim().toLowerCase();
    return v === '1' || v === 'true' || v === 'yes' || v === 'on';
}

async function initializePlayDL() {
    try {
        // Railway IPs are commonly blocked by YouTube (bot-check). If disabled, never attempt YouTube.
        if (isRailway() || isYouTubeDisabledByEnv()) {
            await play.setToken({
                user_agent: ['Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36']
            });
            youtubeEnabled = false;
            console.log(' [MUSIC] YouTube is disabled (Railway/DISABLE_YOUTUBE). Using SoundCloud/Spotify only.');
            return;
        }

        const rawCookies = process.env.YT_COOKIES;

        if (rawCookies) {
            try {
                // تحويل النص اللي جاي من Railway لـ JSON Array
                const cookiesArray = JSON.parse(rawCookies);
                await play.setToken({
                    youtube: {
                        cookie: cookiesArray
                    },
                    user_agent: ['Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36']
                });
                youtubeEnabled = true;
                console.log(" [COOKIES] Successfully loaded into Play-DL");
            } catch (e) {
                console.error(" Cookies Parsing Error: Make sure YT_COOKIES is a valid JSON array");
                // Without cookies, YouTube is very likely to fail on Railway with bot-check.
                youtubeEnabled = false;
            }
            console.log(" Play-DL is ready with your account cookies!");
        } else {
            await play.setToken({
                user_agent: ['Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36']
            });
            console.log(" Play-DL is ready (no cookies). Note: YouTube playback may be unstable without cookies.");
            youtubeEnabled = false;
        }
    } catch (error) {
        console.error(" Setup error:", error.message);
        youtubeEnabled = false;
    }
}

class MusicService {
    constructor(client, options = {}) {
        this.client = client;
        this.group = options.group || 'default';
        this.guildStates = new Map();

        // Best-effort init; don't block bot startup.
        if (!playDlInitPromise) {
            playDlInitPromise = initializePlayDL();
        }
        playDlInitPromise.catch(() => { });
    }

    _getState(guildId) {
        if (!this.guildStates.has(guildId)) {
            const player = createAudioPlayer();
            const state = {
                guildId, voiceChannelId: null, textChannelId: null, controllerMessageId: null,
                queue: [], nowPlaying: null, looping: false, volume: 1,
                player, connection: null, playing: false, resource: null,
            };

            player.on(AudioPlayerStatus.Idle, async () => {
                const s = this.guildStates.get(guildId);
                if (!s) return;
                if (s.nowPlaying && s.looping) return this._playNow(guildId, s.nowPlaying).catch(() => { });
                s.nowPlaying = null; s.playing = false;
                await this._playNext(guildId).catch(() => { });
            });

            this.guildStates.set(guildId, state);
        }
        return this.guildStates.get(guildId);
    }

    async _ensureConnection(guildId, voiceChannelId) {
        const guild = this.client.guilds.cache.get(guildId);
        const state = this._getState(guildId);
        if (state.connection && state.voiceChannelId === voiceChannelId) return state.connection;

        const connection = joinVoiceChannel({
            channelId: voiceChannelId, guildId: guild.id,
            adapterCreator: guild.voiceAdapterCreator, selfDeaf: true, group: this.group,
        });

        state.connection = connection; state.voiceChannelId = voiceChannelId;
        await entersState(connection, VoiceConnectionStatus.Ready, 30_000).catch(e => {
            connection.destroy(); state.connection = null; throw e;
        });
        connection.subscribe(state.player);
        return connection;
    }

    // --- مصدر وحيد: SoundCloud أولاً لتفادي مشاكل يوتيوب / DNS ---
    async _resolveQuery(query) {
        // If it's already a valid URL, don't search.
        if (query && typeof query === 'string') {
            const trimmed = query.trim();
            if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
                let u;
                try {
                    u = new URL(trimmed);
                } catch (_) {
                    u = null;
                }

                if (u) {
                    const h = (u.hostname || '').toLowerCase();
                    const isYT = h.includes('youtube.com') || h === 'youtu.be';

                    // If it's a direct YouTube URL and YouTube is disabled (Railway bot-check),
                    // don't return it as-is. Force fallback to SoundCloud search.
                    if (!(isYT && !youtubeEnabled)) {
                        return {
                            url: trimmed,
                            title: trimmed,
                            thumbnail: null,
                            duration: null
                        };
                    }
                }
            }
        }

        const qStr = String(query || '').trim();
        const shouldAttemptYouTubeSearch = youtubeEnabled;

        // 1) حاول تجيب تراك من ساوند كلاود أولاً (أكثر ثباتاً على Railway)
        const scResults = await play.search(query, {
            limit: 1,
            source: { soundcloud: 'tracks' }
        }).catch(() => []);

        if (scResults && scResults.length > 0) {
            const first = scResults[0];
            const url = first?.url;

            if (url && typeof url === 'string' && url !== 'undefined') {
                return {
                    url,
                    title: "[SC] " + (first.name || first.title),
                    thumbnail: first.thumbnail,
                    duration: first.durationInSec
                };
            }
        }

        // 2) آخر محاولة: بحث خفيف في يوتيوب (قد ينجح على بعض الأغاني)
        // On Railway, YouTube frequently fails without cookies (bot-check), so skip this unless enabled.
        if (!shouldAttemptYouTubeSearch) {
            throw new Error('No playable results from SoundCloud. (YouTube search disabled: missing/invalid cookies)');
        }

        const ytResults = await play.search(query, {
            limit: 1,
            source: { youtube: 'video' }
        }).catch(() => []);

        if (ytResults && ytResults.length > 0) {
            const first = ytResults[0];
            const url = first?.url;

            if (url && typeof url === 'string' && url !== 'undefined') {
                return {
                    url,
                    title: first.title,
                    thumbnail: first.thumbnails?.[0]?.url,
                    duration: first.durationInSec
                };
            }
        }

        throw new Error('No playable results from SoundCloud or YouTube.');
    }

    // --- تعديل دالة جلب الصوت لتقليل الحظر + حماية من URLs فاسدة ---
    async _getAudioUrl(videoUrl) {
        if (!videoUrl || typeof videoUrl !== 'string' || videoUrl === 'undefined') {
            throw new Error('Invalid or missing URL for streaming');
        }

        // Validate URL early to avoid play-dl throwing cryptic errors.
        let parsed;
        try {
            parsed = new URL(videoUrl);
        } catch (e) {
            throw new Error(`Invalid URL for streaming: ${videoUrl}`);
        }

        // Normalize YouTube short links + strip tracking params.
        let normalizedUrl = videoUrl;
        const host = (parsed.hostname || '').toLowerCase();
        if (host === 'youtu.be') {
            const videoId = (parsed.pathname || '').replace('/', '').trim();
            if (videoId) {
                normalizedUrl = `https://www.youtube.com/watch?v=${videoId}`;
            }
        }
        if (host.includes('youtube.com') || host.includes('youtu.be')) {
            try {
                const n = new URL(normalizedUrl);
                const v = n.searchParams.get('v');
                if (v) normalizedUrl = `https://www.youtube.com/watch?v=${v}`;
            } catch (_) {
                // ignore
            }
        }

        let normalizedParsed;
        try {
            normalizedParsed = new URL(normalizedUrl);
        } catch (_) {
            normalizedParsed = parsed;
        }

        const normalizedHost = (normalizedParsed.hostname || '').toLowerCase();
        const isYouTube = normalizedHost.includes('youtube.com') || normalizedHost === 'youtu.be';

        console.log(`Normalized URL: ${normalizedUrl}`);

        // For YouTube, prefer video_info -> stream_from_info (more reliable).
        if (isYouTube && normalizedUrl.includes('youtube.com/watch')) {
            const info = await play.video_info(normalizedUrl);
            return await play.stream_from_info(info, {
                quality: 0,
                discordPlayerCompatibility: true
            });
        }

        return await play.stream(normalizedUrl, {
            quality: 0,
            discordPlayerCompatibility: true,
            htmert: false,
            fallback: true
        });
    }

    async _playNow(guildId, track) {
        const state = this._getState(guildId);
        try {
            if (!track?.url) {
                throw new Error('Track has no URL to play');
            }
            let stream;
            try {
                stream = await this._getAudioUrl(track.url);
            } catch (e) {
                // Option 2: fallback to SoundCloud if YouTube fails (common on hosted environments).
                const urlStr = String(track.url);
                let isYouTube = false;
                try {
                    const u = new URL(urlStr);
                    const h = (u.hostname || '').toLowerCase();
                    isYouTube = h.includes('youtube.com') || h === 'youtu.be';
                } catch (_) {
                    isYouTube = urlStr.includes('youtube.com') || urlStr.includes('youtu.be');
                }
                if (!isYouTube) throw e;

                const fallbackQuery = track.originalQuery || track.title || urlStr;
                console.error('[MUSIC] YouTube stream failed, falling back to SoundCloud. Query:', fallbackQuery);

                const scResults = await play.search(fallbackQuery, {
                    limit: 1,
                    source: { soundcloud: 'tracks' }
                }).catch(() => []);

                const first = scResults?.[0];
                const scUrl = first?.url;
                if (!scUrl || typeof scUrl !== 'string' || scUrl === 'undefined') {
                    throw e;
                }

                // Switch track to SC.
                track.url = scUrl;
                track.title = `[SC] ${first.name || first.title || track.title || 'Unknown'}`;
                track.thumbnail = first.thumbnail || track.thumbnail;
                track.duration = first.durationInSec || track.duration;

                // Important: stream SoundCloud directly (avoid YouTube-specific path).
                stream = await play.stream(track.url, {
                    quality: 0,
                    discordPlayerCompatibility: true,
                    fallback: true
                });
            }
            const resource = createAudioResource(stream.stream, { inputType: stream.type, inlineVolume: true });
            resource.volume?.setVolume(state.volume);
            state.nowPlaying = track; state.playing = true; state.resource = resource;
            state.player.play(resource);

            await this.updateController(guildId).catch(() => { });
        } catch (error) {
            console.error('Play error:', error);
            state.playing = false; await this._playNext(guildId);
        }
    }

    async _playNext(guildId) {
        const state = this._getState(guildId);
        if (state.playing) return;
        const next = state.queue.shift();
        if (!next) { state.nowPlaying = null; return this.updateController(guildId).catch(() => { }); }
        await this._playNow(guildId, next).catch(() => this._playNext(guildId));
    }

    async enqueueByIds({ guildId, voiceChannelId, textChannelId, userId, query }) {
        const state = this._getState(guildId);
        state.textChannelId = textChannelId;
        await this._ensureConnection(guildId, voiceChannelId);
        const res = await this._resolveQuery(query);
        console.log(`[MUSIC] resolveQuery input="${String(query).slice(0, 200)}" -> url="${res?.url}" title="${res?.title}"`);
        if (!res?.url || typeof res.url !== 'string' || res.url === 'undefined') {
            throw new Error('Could not resolve a playable URL for this track.');
        }
        const track = { ...res, requestedBy: userId, originalQuery: query };

        if (!state.nowPlaying && !state.playing) {
            state.nowPlaying = track; await this._playNow(guildId, track);
        } else {
            state.queue.push(track); await this.updateController(guildId).catch(() => { });
        }
        return track;
    }

    togglePause(guildId) {
        const s = this._getState(guildId);
        s.player.state.status === AudioPlayerStatus.Paused ? s.player.unpause() : s.player.pause();
    }
    setVolume(guildId, vol) {
        const s = this._getState(guildId);
        s.volume = Math.max(0, Math.min(2, vol));
        if (s.resource?.volume) s.resource.volume.setVolume(s.volume);
    }
    skip(guildId) { this._getState(guildId).player.stop(true); }
    stop(guildId) {
        const s = this._getState(guildId);
        s.queue = []; s.nowPlaying = null; s.playing = false;
        try { s.player.stop(true); s.connection?.destroy(); } catch (_) { }
        s.connection = null;
    }
    toggleLoop(guildId) { const s = this._getState(guildId); s.looping = !s.looping; }

    _buildControllerComponents(guildId) {
        const s = this._getState(guildId);
        const paused = s.player.state.status === AudioPlayerStatus.Paused;
        return [
            new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('music_toggle').setStyle(ButtonStyle.Secondary).setLabel(paused ? 'Resume' : 'Pause'),
                new ButtonBuilder().setCustomId('music_skip').setStyle(ButtonStyle.Primary).setLabel('Skip'),
                new ButtonBuilder().setCustomId('music_stop').setStyle(ButtonStyle.Danger).setLabel('Stop'),
                new ButtonBuilder().setCustomId('music_loop').setStyle(s.looping ? ButtonStyle.Success : ButtonStyle.Secondary).setLabel(s.looping ? 'Loop: ON' : 'Loop: OFF'),
                new ButtonBuilder().setCustomId('music_queue').setStyle(ButtonStyle.Secondary).setLabel('Queue')
            ),
            new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('music_vol_down').setStyle(ButtonStyle.Secondary).setLabel('Vol -'),
                new ButtonBuilder().setCustomId('music_vol_up').setStyle(ButtonStyle.Secondary).setLabel('Vol +')
            )
        ];
    }

    _buildControllerEmbed(guildId) {
        const s = this._getState(guildId);
        const now = s.nowPlaying;
        const qLines = s.queue.slice(0, 5).map((t, i) => `${i + 1}. ${t.title}`).join('\n');
        const embed = new EmbedBuilder().setColor('#111827').setTitle('Music Control Panel').setTimestamp();
        embed.setDescription(now ? `**Now Playing:**\n${now.title}` : '**Now Playing:**\nNothing');
        if (now?.thumbnail) embed.setThumbnail(now.thumbnail);
        embed.addFields(
            { name: 'Queue', value: qLines.length ? qLines : 'Empty', inline: false },
            { name: 'Volume', value: `${Math.round(s.volume * 100)}%`, inline: true },
            { name: 'Loop', value: s.looping ? 'ON' : 'OFF', inline: true }
        );
        return embed;
    }

    async updateController(guildId) {
        const s = this._getState(guildId);
        if (!s.textChannelId) return;
        const channel = await this.client.channels.fetch(s.textChannelId).catch(() => null);
        if (!channel) return;
        const embed = this._buildControllerEmbed(guildId);
        const components = this._buildControllerComponents(guildId);
        if (s.controllerMessageId) {
            const msg = await channel.messages.fetch(s.controllerMessageId).catch(() => null);
            if (msg) return await msg.edit({ embeds: [embed], components });
        }
        const sent = await channel.send({ embeds: [embed], components });
        s.controllerMessageId = sent.id;
    }

    async handleButton(interaction) {
        const gId = interaction.guildId;
        const s = this._getState(gId);
        if (!s.voiceChannelId) return interaction.reply({ content: '❌ No active session.', ephemeral: true });
        switch (interaction.customId) {
            case 'music_toggle': this.togglePause(gId); break;
            case 'music_skip': this.skip(gId); break;
            case 'music_stop': this.stop(gId); break;
            case 'music_loop': this.toggleLoop(gId); break;
            case 'music_vol_down': this.setVolume(gId, s.volume - 0.1); break;
            case 'music_vol_up': this.setVolume(gId, s.volume + 0.1); break;
        }
        await interaction.deferUpdate().catch(() => { });
        await this.updateController(gId).catch(() => { });
    }
}

module.exports = MusicService;