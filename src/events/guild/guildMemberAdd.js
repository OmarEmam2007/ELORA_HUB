const { EmbedBuilder, AttachmentBuilder } = require('discord.js');
const path = require('path');

module.exports = {
    name: 'guildMemberAdd',
    async execute(member, client) {
        try {
            const toSmallCaps = (input) => {
                const map = {
                    a: 'ᴀ', b: 'ʙ', c: 'ᴄ', d: 'ᴅ', e: 'ᴇ', f: 'ꜰ', g: 'ɢ', h: 'ʜ', i: 'ɪ', j: 'ᴊ', k: 'ᴋ', l: 'ʟ', m: 'ᴍ',
                    n: 'ɴ', o: 'ᴏ', p: 'ᴘ', q: 'ǫ', r: 'ʀ', s: 'ꜱ', t: 'ᴛ', u: 'ᴜ', v: 'ᴠ', w: 'ᴡ', x: 'x', y: 'ʏ', z: 'ᴢ'
                };
                return String(input || '').split('').map((ch) => {
                    const lower = ch.toLowerCase();
                    return map[lower] || ch;
                }).join('');
            };

            const welcomeChannelId = client?.config?.welcomeChannelId;
            if (!welcomeChannelId) return;

            const channel = member.guild.channels.cache.get(welcomeChannelId);
            if (!channel || !channel.isTextBased?.()) return;

            const guild = member.guild;
            const guildId = guild.id;

            let inviterText = '@DISBOARD';

            try {
                if (!client.inviteCache) client.inviteCache = new Map();
                const oldInvites = client.inviteCache.get(guildId) || new Map();
                const invites = await guild.invites.fetch().catch(() => null);

                if (invites) {
                    let usedInvite = null;
                    for (const inv of invites.values()) {
                        const prev = oldInvites.get(inv.code) || 0;
                        const nowUses = inv.uses || 0;
                        if (nowUses > prev) {
                            usedInvite = inv;
                            break;
                        }
                    }

                    const inviteMap = new Map();
                    for (const inv of invites.values()) inviteMap.set(inv.code, inv.uses || 0);
                    client.inviteCache.set(guildId, inviteMap);

                    if (usedInvite?.inviter) {
                        inviterText = `${usedInvite.inviter}`;
                    }
                }
            } catch (_) {
                inviterText = '@DISBOARD';
            }

            const bannerName = String(client?.config?.welcomeBanner || '1.png');
            const bannerPath = path.join(__dirname, '../../assets', bannerName);
            const bannerFile = new AttachmentBuilder(bannerPath);

            const header = '**' + toSmallCaps('WELCOME TO LUNÁR') + '**';
            const body = [
                `**${toSmallCaps('USER')}:** ${member}`,
                `**${toSmallCaps('INVITED BY')}:** ${inviterText}`,
                `**${toSmallCaps('MEMBER COUNT')}:** ${guild.memberCount}`
            ].join('\n');

            const embed = new EmbedBuilder()
                .setColor(client?.config?.colors?.primary || 0x2b2d31)
                .setTitle(header)
                .setDescription(body)
                .setImage(`attachment://${bannerName}`);

            await channel.send({ embeds: [embed], files: [bannerFile] }).catch(() => { });

            // 8. Assign Nickname? (Requires permissions, risky if owner)
            // if (member.manageable) {
            //    member.setNickname(loreData.title).catch(e => console.log('Cannot set nick'));
            // }

        } catch (error) {
            console.error('❌ Sentient Entry Error:', error);
        }
    },
};
