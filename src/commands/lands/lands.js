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

const STAT_AR = {
    strength: 'قوة',
    agility: 'رشاقة',
    intelligence: 'ذكاء',
    luck: 'حظ',
    vitality: 'حيوية'
};

function baseEmbed(title) {
    return new EmbedBuilder()
        .setColor(THEME.COLORS.ACCENT)
        .setTitle(title)
        .setFooter({ text: 'الأرض المنسية • The Forgotten Lands' })
        .setTimestamp();
}

function helpEmbed() {
    return baseEmbed('🗺️ الأرض المنسية — الأوامر')
        .setDescription(
            [
                'عالم RPG نصي مستمر. شخصيتك بتتطور والعالم بيتغير.',
                '',
                '**البداية**',
                '`elora lands start <اسم> <فئة>` — محارب / ساحر / قاتل / راعي',
                '',
                '**الشخصية**',
                '`elora lands profile` — ملفك',
                '`elora lands inv` — المخزون',
                '`elora lands allocate <مهارة>` — صرف نقطة مهارة',
                '`elora lands rest` — استراحة (ذهب مقابل HP كامل)',
                '',
                '**العالم**',
                '`elora lands zones` — المناطق المتاحة',
                '`elora lands travel <منطقة>` — سفر',
                '`elora lands hunt` — استكشاف وقتال',
                '',
                '**المهام**',
                '`elora lands quest` — المهمة اليومية',
                '`elora lands claim` — استلام المكافأة',
                '',
                '**القتال**',
                'أزرار: هجوم / مهارة / غرض / هروب',
                'أو: `elora lands attack` / `skill` / `item` / `flee`'
            ].join('\n')
        );
}

function profileEmbed(char, user) {
    const cls = getClass(char.classId);
    const zone = getZone(char.zoneId);
    const need = characterService.xpToNext(char.level);
    const rawStats = char.stats?.toObject ? char.stats.toObject() : { ...(char.stats || {}) };
    const stats = Object.entries(rawStats)
        .filter(([k]) => STAT_AR[k])
        .map(([k, v]) => `**${STAT_AR[k]}**: ${v}`)
        .join(' · ');

    return baseEmbed(`📜 ${char.name}`)
        .setThumbnail(user.displayAvatarURL({ dynamic: true }))
        .setDescription(`<@${char.userId}> — **${cls?.nameAr || char.classId}**`)
        .addFields(
            {
                name: 'التقدّم',
                value: `مستوى **${char.level}** | XP **${char.xp}/${need}**\nذهب **${char.gold}** | سمعة **${char.reputation}**\nنقاط مهارات **${char.skillPoints}**`,
                inline: false
            },
            { name: 'الحياة', value: `HP **${char.hp}/${char.maxHp}**${char.inCombat ? ' ⚔️ (في قتال)' : ''}`, inline: true },
            { name: 'المنطقة', value: zone ? `**${zone.nameAr}**` : char.zoneId, inline: true },
            { name: 'المهارات', value: stats, inline: false },
            {
                name: 'التجهيز',
                value: `سلاح: **${itemLabel(char.equipped?.weapon)}**\nدرع: **${itemLabel(char.equipped?.armor)}**`,
                inline: false
            },
            {
                name: 'سجل',
                value: `قتل **${char.kills}** · بوس **${char.bossKills}** · موت **${char.deaths}**`,
                inline: false
            }
        );
}

function inventoryEmbed(char) {
    const lines = (char.inventory || []).map((i) => {
        const it = getItem(i.itemId);
        return `• **${it?.nameAr || i.itemId}** ×${i.qty}${it?.type ? ` _( ${it.type})_` : ''}`;
    });
    return baseEmbed(`🎒 مخزون — ${char.name}`)
        .setDescription(lines.length ? lines.join('\n') : '_فاضي_');
}

function combatEmbed(session) {
    const data = combatService.formatSessionEmbedData(session);
    const cls = getClass(session.classId);
    return baseEmbed(data.title)
        .setColor(THEME.COLORS.WARNING)
        .setDescription(
            [
                data.playerLine,
                data.enemyLine,
                '',
                `مهارة: **${cls?.skill?.nameAr || '—'}**${session.skillCd > 0 ? ` (كولداون ${session.skillCd})` : ' ✓'}`,
                '',
                data.logs
            ].join('\n')
        );
}

function combatButtons(disabled = false) {
    return [
        new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('lands:atk').setLabel('هجوم').setStyle(ButtonStyle.Danger).setDisabled(disabled),
            new ButtonBuilder().setCustomId('lands:skill').setLabel('مهارة').setStyle(ButtonStyle.Primary).setDisabled(disabled),
            new ButtonBuilder().setCustomId('lands:item').setLabel('عشبة شفاء').setStyle(ButtonStyle.Success).setDisabled(disabled),
            new ButtonBuilder().setCustomId('lands:flee').setLabel('هروب').setStyle(ButtonStyle.Secondary).setDisabled(disabled)
        )
    ];
}

async function attachCombatCollector(message, userId) {
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
                await i.reply({ content: 'زر غير معروف.', ephemeral: true });
                return;
            }

            const result = await combatService.playerAction(
                userId,
                i.guildId,
                action,
                action === 'item' ? { itemId: 'healing_herb' } : {}
            );

            if (!result.ok) {
                await i.reply({ content: result.error || 'فشل الإجراء.', ephemeral: true });
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
                const embed = baseEmbed(
                    result.outcome === 'win' ? '🏆 انتصار' : result.outcome === 'lose' ? '💀 هزيمة' : '🏃 انسحاب'
                )
                    .setColor(color)
                    .setDescription((result.logs || []).join('\n'));
                await i.update({ embeds: [embed], components: combatButtons(true) });
                return;
            }

            await i.update({ embeds: [combatEmbed(result.session)], components: combatButtons(false) });
        } catch (e) {
            console.error('[lands combat]', e);
            try {
                await i.reply({ content: 'حصل خطأ في القتال.', ephemeral: true });
            } catch (_) {}
        }
    });

    collector.on('end', async (_, reason) => {
        if (reason === 'ended') return;
        try {
            await message.edit({ components: combatButtons(true) });
        } catch (_) {}
    });
}

async function runStart(ctx, name, classKey) {
    const { userId, guildId, reply } = ctx;
    const res = await characterService.createCharacter(userId, guildId, name, classKey);
    if (!res.ok) return reply({ embeds: [baseEmbed('❌').setColor(THEME.COLORS.ERROR).setDescription(res.error)] });

    const embed = baseEmbed('🌅 وُلدت أسطورة جديدة')
        .setColor(THEME.COLORS.SUCCESS)
        .setDescription(
            [
                `**${res.character.name}** انضم للأرض المنسية كـ **${res.classDef.nameAr}**.`,
                '',
                res.classDef.description,
                '',
                `مهارتك الخاصة: **${res.classDef.skill.nameAr}** — ${res.classDef.skill.description}`,
                '',
                'ابدأ الاستكشاف: `elora lands hunt`'
            ].join('\n')
        );
    return reply({ embeds: [embed] });
}

async function runProfile(ctx) {
    const char = await characterService.findCharacter(ctx.userId, ctx.guildId);
    if (!char) {
        return ctx.reply({
            embeds: [baseEmbed('❌').setColor(THEME.COLORS.ERROR).setDescription('مفيش شخصية. `elora lands start <اسم> <فئة>`')]
        });
    }
    return ctx.reply({ embeds: [profileEmbed(char, ctx.user)] });
}

async function runHunt(ctx) {
    const res = await combatService.startHunt(ctx.userId, ctx.guildId);
    if (!res.ok) {
        return ctx.reply({
            embeds: [baseEmbed('❌').setColor(THEME.COLORS.ERROR).setDescription(res.error)]
        });
    }

    const msgPayload = {
        embeds: [combatEmbed(res.session)],
        components: combatButtons(false)
    };

    const sent = await ctx.reply(msgPayload, true);
    if (sent) await attachCombatCollector(sent, ctx.userId);
}

async function runCombatText(ctx, action, opts) {
    const res = await combatService.playerAction(ctx.userId, ctx.guildId, action, opts);
    if (!res.ok) {
        return ctx.reply({
            embeds: [baseEmbed('❌').setColor(THEME.COLORS.ERROR).setDescription(res.error)]
        });
    }
    if (res.ended) {
        const color =
            res.outcome === 'win' ? THEME.COLORS.SUCCESS : res.outcome === 'lose' ? THEME.COLORS.ERROR : THEME.COLORS.ACCENT;
        return ctx.reply({
            embeds: [
                baseEmbed(res.outcome === 'win' ? '🏆 انتصار' : res.outcome === 'lose' ? '💀 هزيمة' : '🏃 انسحاب')
                    .setColor(color)
                    .setDescription((res.logs || []).join('\n'))
            ]
        });
    }
    const sent = await ctx.reply({ embeds: [combatEmbed(res.session)], components: combatButtons(false) }, true);
    if (sent) await attachCombatCollector(sent, ctx.userId);
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
    const cmd = String(sub || 'help').toLowerCase();

    if (cmd === 'help' || cmd === 'مساعدة') return ctx.reply({ embeds: [helpEmbed()] });

    if (cmd === 'start' || cmd === 'create' || cmd === 'ابدأ') {
        const name = args[0];
        const classKey = args[1];
        if (!name || !classKey) {
            const classes = listClasses()
                .map((c) => `• **${c.nameAr}** (\`${c.id}\`) — ${c.description}`)
                .join('\n');
            return ctx.reply({
                embeds: [
                    baseEmbed('إنشاء شخصية')
                        .setDescription(`الاستخدام: \`elora lands start <اسم> <فئة>\`\n\n${classes}`)
                ]
            });
        }
        return runStart(ctx, name, classKey);
    }

    if (cmd === 'profile' || cmd === 'me' || cmd === 'ملف') return runProfile(ctx);

    if (cmd === 'inv' || cmd === 'inventory' || cmd === 'مخزون') {
        const char = await characterService.findCharacter(ctx.userId, ctx.guildId);
        if (!char) return ctx.reply({ embeds: [baseEmbed('❌').setDescription('مفيش شخصية.')] });
        return ctx.reply({ embeds: [inventoryEmbed(char)] });
    }

    if (cmd === 'allocate' || cmd === 'stat' || cmd === 'نقطة') {
        const res = await characterService.allocateStat(ctx.userId, ctx.guildId, args[0]);
        if (!res.ok) return ctx.reply({ embeds: [baseEmbed('❌').setColor(THEME.COLORS.ERROR).setDescription(res.error)] });
        return ctx.reply({
            embeds: [
                baseEmbed('📈 تطوير')
                    .setColor(THEME.COLORS.SUCCESS)
                    .setDescription(`زودت **${STAT_AR[res.stat] || res.stat}**. متبقي **${res.character.skillPoints}** نقطة.`)
            ]
        });
    }

    if (cmd === 'zones' || cmd === 'مناطق') {
        const char = await characterService.findCharacter(ctx.userId, ctx.guildId);
        if (!char) return ctx.reply({ embeds: [baseEmbed('❌').setDescription('مفيش شخصية.')] });
        const unlocked = listUnlockedZones(char.level, char.reputation);
        const lines = unlocked.map((z) => `• \`${z.id}\` — **${z.nameAr}** (مستوى ${z.minLevel}+ / سمعة ${z.minReputation}+)`);
        return ctx.reply({
            embeds: [
                baseEmbed('🧭 المناطق المتاحة').setDescription(
                    lines.join('\n') || 'مفيش مناطق متاحة… غريب.'
                )
            ]
        });
    }

    if (cmd === 'travel' || cmd === 'go' || cmd === 'سفر') {
        const zoneId = String(args[0] || '').toLowerCase();
        if (!zoneId) {
            return ctx.reply({
                embeds: [baseEmbed('سفر').setDescription('`elora lands travel misty_edge`')]
            });
        }
        const res = await characterService.travel(ctx.userId, ctx.guildId, zoneId);
        if (!res.ok) return ctx.reply({ embeds: [baseEmbed('❌').setColor(THEME.COLORS.ERROR).setDescription(res.reason || res.error)] });
        return ctx.reply({
            embeds: [
                baseEmbed('🏕️ وصلت')
                    .setDescription(`انت دلوقتي في **${res.zone.nameAr}**.\n${res.zone.description}`)
            ]
        });
    }

    if (cmd === 'rest' || cmd === 'راحة') {
        const res = await characterService.rest(ctx.userId, ctx.guildId);
        if (!res.ok) return ctx.reply({ embeds: [baseEmbed('❌').setColor(THEME.COLORS.ERROR).setDescription(res.error)] });
        return ctx.reply({
            embeds: [
                baseEmbed('😴 راحة')
                    .setColor(THEME.COLORS.SUCCESS)
                    .setDescription(`تعافت بالكامل. دفعت **${res.cost}** ذهب.\nHP **${res.character.hp}/${res.character.maxHp}**`)
            ]
        });
    }

    if (cmd === 'hunt' || cmd === 'explore' || cmd === 'صيد' || cmd === 'استكشاف') {
        return runHunt(ctx);
    }

    if (cmd === 'attack' || cmd === 'هجوم') return runCombatText(ctx, 'attack');
    if (cmd === 'skill' || cmd === 'مهارة') return runCombatText(ctx, 'skill');
    if (cmd === 'item' || cmd === 'غرض') return runCombatText(ctx, 'item', { itemId: args[0] || 'healing_herb' });
    if (cmd === 'flee' || cmd === 'هروب') return runCombatText(ctx, 'flee');

    if (cmd === 'quest' || cmd === 'daily' || cmd === 'مهمة') {
        const char = await characterService.findCharacter(ctx.userId, ctx.guildId);
        if (!char) return ctx.reply({ embeds: [baseEmbed('❌').setDescription('مفيش شخصية.')] });
        questService.ensureDailyQuest(char);
        await char.save();
        const q = char.dailyQuest;
        const status = q.claimed ? '✅ تم الاستلام' : q.completed ? '🎁 جاهزة للاستلام' : `تقدّم **${q.progress}/${q.target.count}**`;
        return ctx.reply({
            embeds: [
                baseEmbed(`📋 مهمة يومية — ${q.titleAr}`)
                    .setDescription(
                        [
                            q.descriptionAr,
                            '',
                            status,
                            '',
                            `مكافأة: **${q.rewardXp}** XP · **${q.rewardGold}** ذهب · **${q.rewardReputation}** سمعة`,
                            q.completed && !q.claimed ? 'استلم بـ `elora lands claim`' : ''
                        ]
                            .filter(Boolean)
                            .join('\n')
                    )
            ]
        });
    }

    if (cmd === 'claim' || cmd === 'استلام') {
        const char = await characterService.findCharacter(ctx.userId, ctx.guildId);
        if (!char) return ctx.reply({ embeds: [baseEmbed('❌').setDescription('مفيش شخصية.')] });
        const res = questService.claimDaily(char);
        if (!res.ok) {
            await char.save();
            return ctx.reply({ embeds: [baseEmbed('❌').setColor(THEME.COLORS.ERROR).setDescription(res.error)] });
        }
        const leveled = characterService.applyLevelUps(char);
        await char.save();
        return ctx.reply({
            embeds: [
                baseEmbed('🎁 مكافأة يومية')
                    .setColor(THEME.COLORS.SUCCESS)
                    .setDescription(
                        `+${res.rewards.xp} XP · +${res.rewards.gold} ذهب · +${res.rewards.reputation} سمعة` +
                            (leveled ? `\n🌟 مستوى جديد ×${leveled}!` : '')
                    )
            ]
        });
    }

    return ctx.reply({ embeds: [helpEmbed()] });
}

module.exports = {
    name: 'lands',
    aliases: ['land', 'forgotten', 'منسية', 'rpg'],
    data: new SlashCommandBuilder()
        .setName('lands')
        .setDescription('الأرض المنسية — RPG نصي مستمر')
        .addSubcommand((sc) =>
            sc
                .setName('help')
                .setDescription('قائمة أوامر اللعبة')
        )
        .addSubcommand((sc) =>
            sc
                .setName('start')
                .setDescription('إنشاء شخصية')
                .addStringOption((o) => o.setName('name').setDescription('اسم الشخصية').setRequired(true))
                .addStringOption((o) =>
                    o
                        .setName('class')
                        .setDescription('الفئة')
                        .setRequired(true)
                        .addChoices(
                            { name: 'محارب', value: 'warrior' },
                            { name: 'ساحر', value: 'mage' },
                            { name: 'قاتل', value: 'assassin' },
                            { name: 'راعي', value: 'shepherd' }
                        )
                )
        )
        .addSubcommand((sc) => sc.setName('profile').setDescription('عرض الشخصية'))
        .addSubcommand((sc) => sc.setName('inv').setDescription('المخزون'))
        .addSubcommand((sc) =>
            sc
                .setName('allocate')
                .setDescription('صرف نقطة مهارة')
                .addStringOption((o) =>
                    o
                        .setName('stat')
                        .setDescription('المهارة')
                        .setRequired(true)
                        .addChoices(
                            { name: 'قوة', value: 'strength' },
                            { name: 'رشاقة', value: 'agility' },
                            { name: 'ذكاء', value: 'intelligence' },
                            { name: 'حظ', value: 'luck' },
                            { name: 'حيوية', value: 'vitality' }
                        )
                )
        )
        .addSubcommand((sc) => sc.setName('zones').setDescription('المناطق المتاحة'))
        .addSubcommand((sc) =>
            sc
                .setName('travel')
                .setDescription('السفر لمنطقة')
                .addStringOption((o) => o.setName('zone').setDescription('معرف المنطقة').setRequired(true))
        )
        .addSubcommand((sc) => sc.setName('rest').setDescription('راحة واستعادة HP'))
        .addSubcommand((sc) => sc.setName('hunt').setDescription('استكشاف وقتال'))
        .addSubcommand((sc) => sc.setName('quest').setDescription('المهمة اليومية'))
        .addSubcommand((sc) => sc.setName('claim').setDescription('استلام مكافأة المهمة')),

    async execute(message, client, args) {
        if (!message.guild) return message.reply('اللعبة شغّالة جوه السيرفرات فقط.');
        const sub = args?.[0] || 'help';
        const rest = (args || []).slice(1);
        return dispatch(makeCtxFromMessage(message), sub, rest);
    },

    async executeSlash(interaction) {
        if (!interaction.guild) {
            return interaction.reply({ content: 'اللعبة شغّالة جوه السيرفرات فقط.', ephemeral: true });
        }
        const sub = interaction.options.getSubcommand();
        const args = [];
        if (sub === 'start') {
            args.push(interaction.options.getString('name'), interaction.options.getString('class'));
        } else if (sub === 'allocate') {
            args.push(interaction.options.getString('stat'));
        } else if (sub === 'travel') {
            args.push(interaction.options.getString('zone'));
        }
        return dispatch(makeCtxFromInteraction(interaction), sub, args);
    },

    // discord.js commandHandler expects `.execute` for slash too in some bots —
    // support both interaction and message.
    async run(interaction) {
        return this.executeSlash(interaction);
    }
};

// Normalize slash entry: commandHandler calls command.execute(interaction)
const _origExecute = module.exports.execute;
module.exports.execute = async function executeCompat(first, second, third) {
    // Slash: (interaction)
    if (first && first.isChatInputCommand && first.isChatInputCommand()) {
        return module.exports.executeSlash(first);
    }
    // Prefix: (message, client, args)
    return _origExecute(first, second, third);
};
