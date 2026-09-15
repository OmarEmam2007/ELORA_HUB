const {
    SlashCommandBuilder,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle
} = require('discord.js');

const THEME = require('../../utils/theme');
const { listClasses, getClass } = require('../../data/lands/classes');
const { itemLabel, getItem } = require('../../data/lands/items');
const { getZone, listUnlockedZones } = require('../../data/lands/zones');
const characterService = require('../../services/lands/characterService');
const combatService = require('../../services/lands/combatService');
const questService = require('../../services/lands/questService');
const i18n = require('../../services/lands/i18n');

function errMsg(lang, res) {
    if (!res) return i18n.t(lang, 'actionFailed');
    if (res.error) return res.error;
    if (res.errorKey) return i18n.t(lang, res.errorKey, res.errorVars || {});
    if (res.reason) return res.reason;
    return i18n.t(lang, 'actionFailed');
}

function baseEmbed(lang, title) {
    return new EmbedBuilder()
        .setColor(THEME.COLORS.ACCENT)
        .setTitle(title)
        .setFooter({ text: i18n.t(lang, 'footer') })
        .setTimestamp();
}

function helpEmbed(lang, pageIndex = 0) {
    const pages = i18n.helpPages(lang);
    const total = pages.length;
    const i = ((pageIndex % total) + total) % total;
    const page = pages[i];

    return new EmbedBuilder()
        .setColor(page.color)
        .setTitle(page.title)
        .setDescription(page.description)
        .addFields({
            name: i18n.t(lang, 'guideNav'),
            value: pages.map((p, idx) => (idx === i ? `**▸ ${p.label}**` : `· ${p.label}`)).join('   '),
            inline: false
        })
        .setFooter({ text: i18n.t(lang, 'guideFooter', { page: i + 1, total }) })
        .setTimestamp();
}

function helpButtons(lang, pageIndex = 0, disabled = false) {
    const pages = i18n.helpPages(lang);
    const total = pages.length;
    const i = ((pageIndex % total) + total) % total;
    return [
        new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`landshelp:prev:${i}:${lang}`)
                .setLabel(i18n.t(lang, 'btnPrev'))
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(disabled),
            new ButtonBuilder()
                .setCustomId(`landshelp:next:${i}:${lang}`)
                .setLabel(i18n.t(lang, 'btnNext'))
                .setStyle(ButtonStyle.Primary)
                .setDisabled(disabled),
            new ButtonBuilder()
                .setCustomId(`landshelp:close:${i}:${lang}`)
                .setLabel(i18n.t(lang, 'btnClose'))
                .setStyle(ButtonStyle.Danger)
                .setDisabled(disabled)
        )
    ];
}

async function attachHelpCollector(message, ownerId, lang, startPage = 0) {
    let page = startPage;
    let currentLang = lang;
    const collector = message.createMessageComponentCollector({
        time: 4 * 60_000,
        filter: (i) => String(i.customId || '').startsWith('landshelp:')
    });

    collector.on('collect', async (i) => {
        try {
            if (i.user.id !== ownerId) {
                await i.reply({ content: i18n.t(currentLang, 'notYourGuide'), ephemeral: true });
                return;
            }

            const parts = String(i.customId).split(':');
            const action = parts[1];
            const current = Number(parts[2]) || page;
            currentLang = parts[3] === 'en' ? 'en' : 'ar';

            if (action === 'close') {
                collector.stop('close');
                await i.update({
                    embeds: [helpEmbed(currentLang, current)],
                    components: helpButtons(currentLang, current, true)
                });
                return;
            }

            if (action === 'prev') page = current - 1;
            else if (action === 'next') page = current + 1;
            else page = current;

            const total = i18n.helpPages(currentLang).length;
            page = ((page % total) + total) % total;
            await i.update({
                embeds: [helpEmbed(currentLang, page)],
                components: helpButtons(currentLang, page, false)
            });
        } catch (e) {
            console.error('[lands help]', e);
        }
    });

    collector.on('end', async () => {
        try {
            await message.edit({ components: helpButtons(currentLang, page, true) });
        } catch (_) {}
    });
}

async function runHelp(ctx, lang) {
    const sent = await ctx.reply(
        { embeds: [helpEmbed(lang, 0)], components: helpButtons(lang, 0) },
        true
    );
    if (sent) await attachHelpCollector(sent, ctx.userId, lang, 0);
}

function profileEmbed(char, user, lang) {
    const cls = getClass(char.classId);
    const zone = getZone(char.zoneId);
    const need = characterService.xpToNext(char.level);
    const rawStats = char.stats?.toObject ? char.stats.toObject() : { ...(char.stats || {}) };
    const stats = Object.entries(rawStats)
        .filter(([k]) => ['strength', 'agility', 'intelligence', 'luck', 'vitality'].includes(k))
        .map(([k, v]) => `**${i18n.statLabel(lang, k)}**: ${v}`)
        .join(' · ');

    return baseEmbed(lang, `📜 ${char.name}`)
        .setThumbnail(user.displayAvatarURL({ dynamic: true }))
        .setDescription(`<@${char.userId}> — **${i18n.localeName(cls, lang)}**`)
        .addFields(
            {
                name: i18n.t(lang, 'progress'),
                value: i18n.t(lang, 'progressVal', {
                    level: char.level,
                    xp: char.xp,
                    need,
                    gold: char.gold,
                    rep: char.reputation,
                    sp: char.skillPoints
                }),
                inline: false
            },
            {
                name: i18n.t(lang, 'life'),
                value: `HP **${char.hp}/${char.maxHp}**${char.inCombat ? i18n.t(lang, 'inFight') : ''}`,
                inline: true
            },
            {
                name: i18n.t(lang, 'zone'),
                value: zone ? `**${i18n.localeName(zone, lang)}**` : char.zoneId,
                inline: true
            },
            { name: i18n.t(lang, 'skills'), value: stats, inline: false },
            {
                name: i18n.t(lang, 'gear'),
                value: `${i18n.t(lang, 'weapon')}: **${itemLabel(char.equipped?.weapon, lang)}**\n${i18n.t(lang, 'armor')}: **${itemLabel(char.equipped?.armor, lang)}**`,
                inline: false
            },
            {
                name: i18n.t(lang, 'record'),
                value: i18n.t(lang, 'recordVal', {
                    kills: char.kills,
                    bosses: char.bossKills,
                    deaths: char.deaths
                }),
                inline: false
            }
        );
}

function inventoryEmbed(char, lang) {
    const lines = (char.inventory || []).map((i) => {
        const it = getItem(i.itemId);
        return `• **${itemLabel(i.itemId, lang)}** ×${i.qty}${it?.type ? ` _(${it.type})_` : ''}`;
    });
    return baseEmbed(lang, i18n.t(lang, 'invTitle', { name: char.name })).setDescription(
        lines.length ? lines.join('\n') : i18n.t(lang, 'emptyInv')
    );
}

function combatEmbed(session) {
    const lang = session.lang || 'ar';
    const data = combatService.formatSessionEmbedData(session);
    const cls = getClass(session.classId);
    const cd =
        session.skillCd > 0
            ? i18n.t(lang, 'skillCooldown', { cd: session.skillCd })
            : i18n.t(lang, 'skillReady');
    return baseEmbed(lang, data.title)
        .setColor(THEME.COLORS.WARNING)
        .setDescription(
            [
                data.playerLine,
                data.enemyLine,
                '',
                i18n.t(lang, 'skillLabel', {
                    skill: i18n.localeName(cls?.skill, lang) || '—',
                    cd
                }),
                '',
                data.logs
            ].join('\n')
        );
}

function combatButtons(lang, disabled = false) {
    return [
        new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('lands:atk')
                .setLabel(i18n.t(lang, 'btnAtk'))
                .setStyle(ButtonStyle.Danger)
                .setDisabled(disabled),
            new ButtonBuilder()
                .setCustomId('lands:skill')
                .setLabel(i18n.t(lang, 'btnSkill'))
                .setStyle(ButtonStyle.Primary)
                .setDisabled(disabled),
            new ButtonBuilder()
                .setCustomId('lands:item')
                .setLabel(i18n.t(lang, 'btnItem'))
                .setStyle(ButtonStyle.Success)
                .setDisabled(disabled),
            new ButtonBuilder()
                .setCustomId('lands:flee')
                .setLabel(i18n.t(lang, 'btnFlee'))
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(disabled)
        )
    ];
}

async function attachCombatCollector(message, userId, lang) {
    const collector = message.createMessageComponentCollector({
        time: 5 * 60_000,
        filter: (i) => i.user.id === userId && String(i.customId || '').startsWith('lands:')
    });

    collector.on('collect', async (i) => {
        try {
            const actionMap = {
                'lands:atk': 'attack',
                'lands:skill': 'skill',
                'lands:item': 'item',
                'lands:flee': 'flee'
            };
            const action = actionMap[i.customId];
            if (!action) {
                await i.reply({ content: i18n.t(lang, 'unknownButton'), ephemeral: true });
                return;
            }

            const result = await combatService.playerAction(
                userId,
                i.guildId,
                action,
                action === 'item' ? { itemId: 'healing_herb' } : {}
            );

            const sessionLang = result.session?.lang || lang;

            if (!result.ok) {
                await i.reply({ content: errMsg(sessionLang, result), ephemeral: true });
                return;
            }

            if (result.ended) {
                collector.stop('ended');
                const color =
                    result.outcome === 'win'
                        ? THEME.COLORS.SUCCESS
                        : result.outcome === 'lose'
                          ? THEME.COLORS.ERROR
                          : THEME.COLORS.ACCENT;
                const titleKey = result.outcome === 'win' ? 'win' : result.outcome === 'lose' ? 'lose' : 'fleeTitle';
                const embed = baseEmbed(sessionLang, i18n.t(sessionLang, titleKey))
                    .setColor(color)
                    .setDescription((result.logs || []).join('\n'));
                await i.update({ embeds: [embed], components: combatButtons(sessionLang, true) });
                return;
            }

            await i.update({
                embeds: [combatEmbed(result.session)],
                components: combatButtons(sessionLang, false)
            });
        } catch (e) {
            console.error('[lands combat]', e);
            try {
                await i.reply({ content: i18n.t(lang, 'combatError'), ephemeral: true });
            } catch (_) {}
        }
    });

    collector.on('end', async (_, reason) => {
        if (reason === 'ended') return;
        try {
            await message.edit({ components: combatButtons(lang, true) });
        } catch (_) {}
    });
}

async function runStart(ctx, name, classKey, lang) {
    const res = await characterService.createCharacter(ctx.userId, ctx.guildId, name, classKey);
    if (!res.ok) {
        return ctx.reply({
            embeds: [baseEmbed(lang, '❌').setColor(THEME.COLORS.ERROR).setDescription(errMsg(lang, res))]
        });
    }

    const cls = res.classDef;
    const embed = baseEmbed(lang, i18n.t(lang, 'bornTitle'))
        .setColor(THEME.COLORS.SUCCESS)
        .setDescription(
            i18n.t(lang, 'bornBody', {
                name: res.character.name,
                class: i18n.localeName(cls, lang),
                desc: i18n.localeDesc(cls, lang),
                skill: i18n.localeName(cls.skill, lang),
                skillDesc: i18n.localeDesc(cls.skill, lang)
            })
        );
    return ctx.reply({ embeds: [embed] });
}

async function runProfile(ctx, lang) {
    const char = await characterService.findCharacter(ctx.userId, ctx.guildId);
    if (!char) {
        return ctx.reply({
            embeds: [
                baseEmbed(lang, '❌').setColor(THEME.COLORS.ERROR).setDescription(i18n.t(lang, 'noCharacter'))
            ]
        });
    }
    return ctx.reply({ embeds: [profileEmbed(char, ctx.user, lang)] });
}

async function runHunt(ctx, lang) {
    const res = await combatService.startHunt(ctx.userId, ctx.guildId);
    if (!res.ok) {
        return ctx.reply({
            embeds: [baseEmbed(lang, '❌').setColor(THEME.COLORS.ERROR).setDescription(errMsg(lang, res))]
        });
    }

    const sessionLang = res.session.lang || lang;
    const sent = await ctx.reply(
        { embeds: [combatEmbed(res.session)], components: combatButtons(sessionLang, false) },
        true
    );
    if (sent) await attachCombatCollector(sent, ctx.userId, sessionLang);
}

async function runCombatText(ctx, action, opts, lang) {
    const res = await combatService.playerAction(ctx.userId, ctx.guildId, action, opts);
    const sessionLang = res.session?.lang || lang;
    if (!res.ok) {
        return ctx.reply({
            embeds: [baseEmbed(lang, '❌').setColor(THEME.COLORS.ERROR).setDescription(errMsg(lang, res))]
        });
    }
    if (res.ended) {
        const color =
            res.outcome === 'win'
                ? THEME.COLORS.SUCCESS
                : res.outcome === 'lose'
                  ? THEME.COLORS.ERROR
                  : THEME.COLORS.ACCENT;
        const titleKey = res.outcome === 'win' ? 'win' : res.outcome === 'lose' ? 'lose' : 'fleeTitle';
        return ctx.reply({
            embeds: [
                baseEmbed(sessionLang, i18n.t(sessionLang, titleKey))
                    .setColor(color)
                    .setDescription((res.logs || []).join('\n'))
            ]
        });
    }
    const sent = await ctx.reply(
        { embeds: [combatEmbed(res.session)], components: combatButtons(sessionLang, false) },
        true
    );
    if (sent) await attachCombatCollector(sent, ctx.userId, sessionLang);
}

function makeCtxFromMessage(message) {
    return {
        userId: message.author.id,
        guildId: message.guild.id,
        user: message.author,
        async reply(payload, fetchReply = false) {
            const msg = await message.reply(payload);
            return fetchReply ? msg : null;
        }
    };
}

function makeCtxFromInteraction(interaction) {
    return {
        userId: interaction.user.id,
        guildId: interaction.guildId,
        user: interaction.user,
        async reply(payload, fetchReply = false) {
            if (interaction.deferred || interaction.replied) {
                const msg = await interaction.followUp({ ...payload, fetchReply: true });
                return fetchReply ? msg : null;
            }
            const msg = await interaction.reply({ ...payload, fetchReply: true });
            return fetchReply ? msg : msg;
        }
    };
}

async function dispatch(ctx, sub, args) {
    const lang = await i18n.resolveLang(ctx.userId, ctx.guildId);
    const cmd = String(sub || 'help').toLowerCase();

    if (cmd === 'help' || cmd === 'مساعدة' || cmd === 'دليل') return runHelp(ctx, lang);

    if (cmd === 'lang' || cmd === 'language' || cmd === 'لغة') {
        const next = args[0];
        if (!next) {
            const label = lang === 'en' ? i18n.t(lang, 'langNameEn') : i18n.t(lang, 'langNameAr');
            return ctx.reply({
                embeds: [
                    baseEmbed(lang, i18n.t(lang, 'langTitle')).setDescription(
                        i18n.t(lang, 'langCurrent', { lang: label })
                    )
                ]
            });
        }
        const res = await i18n.setLang(ctx.userId, ctx.guildId, next);
        if (!res.ok) {
            return ctx.reply({
                embeds: [
                    baseEmbed(lang, '❌').setColor(THEME.COLORS.ERROR).setDescription(i18n.t(lang, 'langBad'))
                ]
            });
        }
        const newLang = res.locale;
        const label = newLang === 'en' ? i18n.t(newLang, 'langNameEn') : i18n.t(newLang, 'langNameAr');
        return ctx.reply({
            embeds: [
                baseEmbed(newLang, i18n.t(newLang, 'langTitle'))
                    .setColor(THEME.COLORS.SUCCESS)
                    .setDescription(i18n.t(newLang, 'langSet', { lang: label }))
            ]
        });
    }

    if (cmd === 'start' || cmd === 'create' || cmd === 'ابدأ') {
        const name = args[0];
        const classKey = args[1];
        if (!name || !classKey) {
            const classes = listClasses()
                .map((c) => `• **${i18n.localeName(c, lang)}** (\`${c.id}\`) — ${i18n.localeDesc(c, lang)}`)
                .join('\n');
            return ctx.reply({
                embeds: [
                    baseEmbed(lang, i18n.t(lang, 'createTitle')).setDescription(
                        i18n.t(lang, 'createUsage', { classes })
                    )
                ]
            });
        }
        return runStart(ctx, name, classKey, lang);
    }

    if (cmd === 'profile' || cmd === 'me' || cmd === 'ملف') return runProfile(ctx, lang);

    if (cmd === 'inv' || cmd === 'inventory' || cmd === 'مخزون') {
        const char = await characterService.findCharacter(ctx.userId, ctx.guildId);
        if (!char) {
            return ctx.reply({
                embeds: [baseEmbed(lang, '❌').setDescription(i18n.t(lang, 'noCharacterShort'))]
            });
        }
        return ctx.reply({ embeds: [inventoryEmbed(char, lang)] });
    }

    if (cmd === 'allocate' || cmd === 'stat' || cmd === 'نقطة') {
        const res = await characterService.allocateStat(ctx.userId, ctx.guildId, args[0]);
        if (!res.ok) {
            return ctx.reply({
                embeds: [baseEmbed(lang, '❌').setColor(THEME.COLORS.ERROR).setDescription(errMsg(lang, res))]
            });
        }
        return ctx.reply({
            embeds: [
                baseEmbed(lang, i18n.t(lang, 'allocateTitle'))
                    .setColor(THEME.COLORS.SUCCESS)
                    .setDescription(
                        i18n.t(lang, 'allocated', {
                            stat: i18n.statLabel(lang, res.stat),
                            left: res.character.skillPoints
                        })
                    )
            ]
        });
    }

    if (cmd === 'zones' || cmd === 'مناطق') {
        const char = await characterService.findCharacter(ctx.userId, ctx.guildId);
        if (!char) {
            return ctx.reply({
                embeds: [baseEmbed(lang, '❌').setDescription(i18n.t(lang, 'noCharacterShort'))]
            });
        }
        const unlocked = listUnlockedZones(char.level, char.reputation);
        const lines = unlocked.map((z) =>
            i18n.t(lang, 'zoneLine', {
                id: z.id,
                name: i18n.localeName(z, lang),
                level: z.minLevel,
                rep: z.minReputation
            })
        );
        return ctx.reply({
            embeds: [
                baseEmbed(lang, i18n.t(lang, 'zonesTitle')).setDescription(
                    lines.join('\n') || i18n.t(lang, 'zonesEmpty')
                )
            ]
        });
    }

    if (cmd === 'travel' || cmd === 'go' || cmd === 'سفر') {
        const zoneId = String(args[0] || '').toLowerCase();
        if (!zoneId) {
            return ctx.reply({
                embeds: [
                    baseEmbed(lang, i18n.t(lang, 'travelTitle')).setDescription(i18n.t(lang, 'travelHint'))
                ]
            });
        }
        const res = await characterService.travel(ctx.userId, ctx.guildId, zoneId);
        if (!res.ok) {
            return ctx.reply({
                embeds: [baseEmbed(lang, '❌').setColor(THEME.COLORS.ERROR).setDescription(errMsg(lang, res))]
            });
        }
        return ctx.reply({
            embeds: [
                baseEmbed(lang, i18n.t(lang, 'arrived')).setDescription(
                    i18n.t(lang, 'arrivedBody', {
                        name: i18n.localeName(res.zone, lang),
                        desc: i18n.localeDesc(res.zone, lang)
                    })
                )
            ]
        });
    }

    if (cmd === 'rest' || cmd === 'راحة') {
        const res = await characterService.rest(ctx.userId, ctx.guildId);
        if (!res.ok) {
            return ctx.reply({
                embeds: [baseEmbed(lang, '❌').setColor(THEME.COLORS.ERROR).setDescription(errMsg(lang, res))]
            });
        }
        return ctx.reply({
            embeds: [
                baseEmbed(lang, i18n.t(lang, 'restTitle'))
                    .setColor(THEME.COLORS.SUCCESS)
                    .setDescription(
                        i18n.t(lang, 'restBody', {
                            cost: res.cost,
                            hp: res.character.hp,
                            max: res.character.maxHp
                        })
                    )
            ]
        });
    }

    if (cmd === 'hunt' || cmd === 'explore' || cmd === 'صيد' || cmd === 'استكشاف') {
        return runHunt(ctx, lang);
    }

    if (cmd === 'attack' || cmd === 'هجوم') return runCombatText(ctx, 'attack', {}, lang);
    if (cmd === 'skill' || cmd === 'مهارة') return runCombatText(ctx, 'skill', {}, lang);
    if (cmd === 'item' || cmd === 'غرض') {
        return runCombatText(ctx, 'item', { itemId: args[0] || 'healing_herb' }, lang);
    }
    if (cmd === 'flee' || cmd === 'هروب') return runCombatText(ctx, 'flee', {}, lang);

    if (cmd === 'quest' || cmd === 'daily' || cmd === 'مهمة') {
        const char = await characterService.findCharacter(ctx.userId, ctx.guildId);
        if (!char) {
            return ctx.reply({
                embeds: [baseEmbed(lang, '❌').setDescription(i18n.t(lang, 'noCharacterShort'))]
            });
        }
        questService.ensureDailyQuest(char);
        await char.save();
        const q = char.dailyQuest;
        const status = q.claimed
            ? i18n.t(lang, 'questClaimed')
            : q.completed
              ? i18n.t(lang, 'questReady')
              : i18n.t(lang, 'questProgress', { cur: q.progress, max: q.target.count });
        return ctx.reply({
            embeds: [
                baseEmbed(lang, i18n.t(lang, 'questTitle', { title: questService.questTitle(q, lang) })).setDescription(
                    [
                        questService.questDesc(q, lang),
                        '',
                        status,
                        '',
                        i18n.t(lang, 'questReward', {
                            xp: q.rewardXp,
                            gold: q.rewardGold,
                            rep: q.rewardReputation
                        }),
                        q.completed && !q.claimed ? i18n.t(lang, 'questClaimHint') : ''
                    ]
                        .filter(Boolean)
                        .join('\n')
                )
            ]
        });
    }

    if (cmd === 'claim' || cmd === 'استلام') {
        const char = await characterService.findCharacter(ctx.userId, ctx.guildId);
        if (!char) {
            return ctx.reply({
                embeds: [baseEmbed(lang, '❌').setDescription(i18n.t(lang, 'noCharacterShort'))]
            });
        }
        const res = questService.claimDaily(char, lang);
        if (!res.ok) {
            await char.save();
            return ctx.reply({
                embeds: [baseEmbed(lang, '❌').setColor(THEME.COLORS.ERROR).setDescription(errMsg(lang, res))]
            });
        }
        const leveled = characterService.applyLevelUps(char);
        await char.save();
        return ctx.reply({
            embeds: [
                baseEmbed(lang, i18n.t(lang, 'claimTitle'))
                    .setColor(THEME.COLORS.SUCCESS)
                    .setDescription(
                        i18n.t(lang, 'claimBody', {
                            xp: res.rewards.xp,
                            gold: res.rewards.gold,
                            rep: res.rewards.reputation
                        }) + (leveled ? i18n.t(lang, 'levelUp', { n: leveled }) : '')
                    )
            ]
        });
    }

    return runHelp(ctx, lang);
}

module.exports = {
    name: 'lands',
    aliases: ['land', 'forgotten', 'منسية', 'rpg'],
    data: new SlashCommandBuilder()
        .setName('lands')
        .setDescription('The Forgotten Lands — persistent text RPG / الأرض المنسية')
        .addSubcommand((sc) => sc.setName('help').setDescription('Game guide / دليل اللعبة'))
        .addSubcommand((sc) =>
            sc
                .setName('lang')
                .setDescription('Set language / اختيار اللغة')
                .addStringOption((o) =>
                    o
                        .setName('locale')
                        .setDescription('ar or en')
                        .setRequired(true)
                        .addChoices({ name: 'العربية', value: 'ar' }, { name: 'English', value: 'en' })
                )
        )
        .addSubcommand((sc) =>
            sc
                .setName('start')
                .setDescription('Create character / إنشاء شخصية')
                .addStringOption((o) => o.setName('name').setDescription('Character name').setRequired(true))
                .addStringOption((o) =>
                    o
                        .setName('class')
                        .setDescription('Class / الفئة')
                        .setRequired(true)
                        .addChoices(
                            { name: 'Warrior / محارب', value: 'warrior' },
                            { name: 'Mage / ساحر', value: 'mage' },
                            { name: 'Assassin / قاتل', value: 'assassin' },
                            { name: 'Shepherd / راعي', value: 'shepherd' }
                        )
                )
        )
        .addSubcommand((sc) => sc.setName('profile').setDescription('Character profile / الملف'))
        .addSubcommand((sc) => sc.setName('inv').setDescription('Inventory / المخزون'))
        .addSubcommand((sc) =>
            sc
                .setName('allocate')
                .setDescription('Spend skill point / صرف نقطة')
                .addStringOption((o) =>
                    o
                        .setName('stat')
                        .setDescription('Stat')
                        .setRequired(true)
                        .addChoices(
                            { name: 'Strength / قوة', value: 'strength' },
                            { name: 'Agility / رشاقة', value: 'agility' },
                            { name: 'Intelligence / ذكاء', value: 'intelligence' },
                            { name: 'Luck / حظ', value: 'luck' },
                            { name: 'Vitality / حيوية', value: 'vitality' }
                        )
                )
        )
        .addSubcommand((sc) => sc.setName('zones').setDescription('Zones / المناطق'))
        .addSubcommand((sc) =>
            sc
                .setName('travel')
                .setDescription('Travel / سفر')
                .addStringOption((o) => o.setName('zone').setDescription('Zone id').setRequired(true))
        )
        .addSubcommand((sc) => sc.setName('rest').setDescription('Rest / راحة'))
        .addSubcommand((sc) => sc.setName('hunt').setDescription('Hunt / صيد'))
        .addSubcommand((sc) => sc.setName('quest').setDescription('Daily quest / مهمة يومية'))
        .addSubcommand((sc) => sc.setName('claim').setDescription('Claim reward / استلام')),

    async execute(message, client, args) {
        if (!message.guild) {
            const lang = await i18n.resolveLang(message.author.id, 'dm');
            return message.reply(i18n.t(lang, 'guildOnly'));
        }
        const sub = args?.[0] || 'help';
        const rest = (args || []).slice(1);
        return dispatch(makeCtxFromMessage(message), sub, rest);
    },

    async executeSlash(interaction) {
        if (!interaction.guild) {
            const lang = await i18n.resolveLang(interaction.user.id, 'dm');
            return interaction.reply({ content: i18n.t(lang, 'guildOnly'), ephemeral: true });
        }
        const sub = interaction.options.getSubcommand();
        const args = [];
        if (sub === 'start') {
            args.push(interaction.options.getString('name'), interaction.options.getString('class'));
        } else if (sub === 'allocate') {
            args.push(interaction.options.getString('stat'));
        } else if (sub === 'travel') {
            args.push(interaction.options.getString('zone'));
        } else if (sub === 'lang') {
            args.push(interaction.options.getString('locale'));
        }
        return dispatch(makeCtxFromInteraction(interaction), sub, args);
    },

    async run(interaction) {
        return this.executeSlash(interaction);
    }
};

const _origExecute = module.exports.execute;
module.exports.execute = async function executeCompat(first, second, third) {
    if (first && first.isChatInputCommand && first.isChatInputCommand()) {
        return module.exports.executeSlash(first);
    }
    return _origExecute(first, second, third);
};
