const { getClass } = require('../../data/lands/classes');
const { getItem, itemLabel } = require('../../data/lands/items');
const { pickZoneMonster, rollGold, rollDrops, getMonster } = require('../../data/lands/monsters');
const { getZone } = require('../../data/lands/zones');
const {
    findCharacter,
    getEffectiveStats,
    applyLevelUps,
    addToInventory,
    removeFromInventory,
    countItem
} = require('./characterService');
const { onKillProgress } = require('./questService');

/** In-memory active combats: key = `${guildId}:${userId}` */
const activeCombats = new Map();

function combatKey(guildId, userId) {
    return `${guildId}:${userId}`;
}

function clamp(n, min, max) {
    return Math.max(min, Math.min(max, n));
}

function chance(p) {
    return Math.random() < p;
}

function tickEffects(entity) {
    const logs = [];
    const next = [];
    for (const fx of entity.effects || []) {
        if (fx.type === 'poison') {
            const dmg = fx.power || 4;
            entity.hp = clamp(entity.hp - dmg, 0, entity.maxHp);
            logs.push(`☠️ سم: **-${dmg}** HP`);
        } else if (fx.type === 'burn') {
            const dmg = fx.power || 5;
            entity.hp = clamp(entity.hp - dmg, 0, entity.maxHp);
            logs.push(`🔥 حرق: **-${dmg}** HP`);
        }
        const turns = (fx.turns || 1) - 1;
        if (turns > 0) next.push({ ...fx, turns });
    }
    entity.effects = next;
    return logs;
}

function hasEffect(entity, type) {
    return (entity.effects || []).some((e) => e.type === type);
}

function applyEffect(entity, type, turns, power) {
    const existing = (entity.effects || []).find((e) => e.type === type);
    if (existing) {
        existing.turns = Math.max(existing.turns, turns);
        existing.power = Math.max(existing.power || 0, power || 0);
    } else {
        entity.effects = entity.effects || [];
        entity.effects.push({ type, turns, power });
    }
}

function playerAttackPower(stats, classId) {
    if (classId === 'mage') return (stats.intelligence || 1) * 2.2 + (stats.luck || 0) * 0.3;
    if (classId === 'assassin') return (stats.agility || 1) * 1.8 + (stats.luck || 0) * 0.8 + (stats.strength || 0) * 0.4;
    if (classId === 'shepherd') return (stats.intelligence || 1) * 1.2 + (stats.strength || 1) * 1.1;
    return (stats.strength || 1) * 2.0 + (stats.agility || 0) * 0.3;
}

function computeHit(attackerAgi, defenderAgi, luck = 0) {
    const base = 0.78 + (attackerAgi - defenderAgi) * 0.02 + luck * 0.005;
    return chance(clamp(base, 0.45, 0.95));
}

function computeCrit(luck) {
    return chance(clamp(0.05 + luck * 0.012, 0.05, 0.35));
}

function rememberMonster(char, monsterId, action) {
    if (!char.monsterMemory || typeof char.monsterMemory.get !== 'function') {
        char.monsterMemory = new Map();
    }
    const raw = char.monsterMemory.get(monsterId) || { fights: 0, skillUses: 0, attacks: 0, items: 0 };
    raw.fights = (raw.fights || 0) + (action === 'fight_start' ? 1 : 0);
    if (action === 'skill') raw.skillUses = (raw.skillUses || 0) + 1;
    if (action === 'attack') raw.attacks = (raw.attacks || 0) + 1;
    if (action === 'item') raw.items = (raw.items || 0) + 1;
    char.monsterMemory.set(monsterId, raw);
    char.markModified?.('monsterMemory');
    return raw;
}

function getMemory(char, monsterId) {
    if (!char.monsterMemory || typeof char.monsterMemory.get !== 'function') return null;
    return char.monsterMemory.get(monsterId) || null;
}

function buildEnemyFromMonster(monster, memory) {
    let attack = monster.attack;
    let defense = monster.defense;
    let agility = monster.agility;
    // Monsters learn: if player spam skills, they raise resistance / aggression
    if (memory) {
        if ((memory.skillUses || 0) > (memory.attacks || 0) + 2) {
            defense += 2;
            attack += 1;
        }
        if ((memory.items || 0) >= 3) {
            agility += 2; // interrupt / pressure healers
        }
        if ((memory.fights || 0) >= 5) {
            attack += Math.min(5, Math.floor(memory.fights / 5));
        }
    }
    return {
        id: monster.id,
        nameAr: monster.nameAr,
        level: monster.level,
        hp: monster.hp,
        maxHp: monster.hp,
        attack,
        defense,
        agility,
        isBoss: Boolean(monster.isBoss),
        skills: monster.skills || [],
        effects: [],
        skillCd: 0
    };
}

async function startHunt(userId, guildId) {
    const char = await findCharacter(userId, guildId);
    if (!char) return { ok: false, error: 'مفيش شخصية. `.lands start <اسم> <فئة>`' };

    // Recover stale combat flag after bot restart
    if (char.inCombat && !activeCombats.has(combatKey(guildId, userId))) {
        char.inCombat = false;
        await char.save();
    }

    if (char.inCombat || activeCombats.has(combatKey(guildId, userId))) {
        return { ok: false, error: 'انت أصلاً في قتال. استخدم أزرار القتال أو `.lands flee`.' };
    }
    if (char.hp <= 0) {
        return { ok: false, error: 'انت ميت/منهك. استخدم `.lands rest` عشان تتعافى.' };
    }

    const zone = getZone(char.zoneId);
    if (!zone) return { ok: false, error: 'منطقتك مش معرّفة.' };

    const monster = pickZoneMonster(zone, { bossChance: char.level >= 3 ? 0.1 : 0.04 });
    if (!monster) return { ok: false, error: 'مفيش وحوش هنا دلوقتي.' };

    rememberMonster(char, monster.id, 'fight_start');
    const memory = getMemory(char, monster.id);
    const enemy = buildEnemyFromMonster(monster, memory);
    const stats = getEffectiveStats(char);
    const cls = getClass(char.classId);

    const session = {
        userId,
        guildId,
        turn: 1,
        skillCd: 0,
        playerEffects: [],
        enemy,
        classId: char.classId,
        skillId: cls.skill.id,
        logs: [`ظهر **${enemy.nameAr}** (مستوى ${enemy.level}) في **${zone.nameAr}**!`],
        startedAt: Date.now()
    };

    char.inCombat = true;
    // Sync runtime effects onto a lightweight player snapshot
    session.player = {
        hp: char.hp,
        maxHp: char.maxHp,
        stats,
        effects: [],
        name: char.name
    };

    activeCombats.set(combatKey(guildId, userId), session);
    await char.save();

    return { ok: true, character: char, session, zone, monster };
}

function formatSessionEmbedData(session) {
    const pFx = (session.player.effects || []).map((e) => e.type).join(', ') || 'لا شيء';
    const eFx = (session.enemy.effects || []).map((e) => e.type).join(', ') || 'لا شيء';
    return {
        title: `⚔️ قتال — الدور ${session.turn}`,
        playerLine: `**${session.player.name}** HP: **${session.player.hp}/${session.player.maxHp}** | تأثيرات: ${pFx}`,
        enemyLine: `**${session.enemy.nameAr}** HP: **${session.enemy.hp}/${session.enemy.maxHp}** | تأثيرات: ${eFx}`,
        logs: session.logs.slice(-6).join('\n')
    };
}

async function enemyTurn(session, char) {
    const logs = [];
    logs.push(...tickEffects(session.enemy));
    if (session.enemy.hp <= 0) return logs;

    if (hasEffect(session.enemy, 'fear') || hasEffect(session.enemy, 'paralyze')) {
        logs.push(`💫 **${session.enemy.nameAr}** مش قادر يتحرك!`);
        return logs;
    }

    // Learned behavior: prefer skills if player heals a lot
    const memory = getMemory(char, session.enemy.id);
    let useSkill = false;
    const skills = session.enemy.skills || [];
    if (skills.length) {
        let skillChance = skills[0].chance || 0.25;
        if (memory && (memory.items || 0) > 2) skillChance += 0.15;
        useSkill = chance(skillChance);
    }

    if (useSkill) {
        const sk = skills[Math.floor(Math.random() * skills.length)];
        const mult = sk.mult || 1.3;
        let dmg = Math.max(1, Math.floor(session.enemy.attack * mult - (session.player.stats.defense || 0) * 0.5));
        if (hasEffect(session.player, 'fear')) dmg = Math.floor(dmg * 1.15);
        session.player.hp = clamp(session.player.hp - dmg, 0, session.player.maxHp);
        logs.push(`💥 **${session.enemy.nameAr}** استخدم **${sk.nameAr}** → **-${dmg}**`);
        if (sk.effect) applyEffect(session.player, sk.effect, sk.turns || 2, sk.effect === 'poison' ? 4 : 5);
        if (sk.healSelf) {
            const heal = Math.floor(dmg * sk.healSelf);
            session.enemy.hp = clamp(session.enemy.hp + heal, 0, session.enemy.maxHp);
            logs.push(`🩸 امتص **${heal}** HP`);
        }
    } else {
        if (!computeHit(session.enemy.agility, session.player.stats.agility || 1)) {
            logs.push(`💨 **${session.enemy.nameAr}** أخطأ الضربة!`);
        } else {
            let dmg = Math.max(1, Math.floor(session.enemy.attack - (session.player.stats.defense || 0) * 0.6 + Math.random() * 3));
            session.player.hp = clamp(session.player.hp - dmg, 0, session.player.maxHp);
            logs.push(`🗡️ **${session.enemy.nameAr}** ضربك → **-${dmg}**`);
        }
    }
    return logs;
}

async function resolveEnd(session, char, outcome) {
    const key = combatKey(session.guildId, session.userId);
    activeCombats.delete(key);
    char.inCombat = false;
    char.hp = session.player.hp;

    const result = { outcome, logs: [], rewards: null, death: null, leveled: 0 };

    if (outcome === 'win') {
        const monster = getMonster(session.enemy.id);
        const gold = rollGold(monster);
        const drops = rollDrops(monster);
        let xp = monster.xp || 20;
        // Luck bonus
        if (chance(clamp((char.stats.luck || 0) * 0.02, 0, 0.25))) {
            xp = Math.floor(xp * 1.25);
            gold += Math.floor(gold * 0.25);
            result.logs.push('🍀 حظك زاد المكافأة!');
        }

        char.xp += xp;
        char.gold += gold;
        char.kills += 1;
        if (monster.isBoss) {
            char.bossKills += 1;
            char.reputation += 8;
        } else {
            char.reputation += 1;
        }
        for (const d of drops) addToInventory(char, d, 1);

        result.leveled = applyLevelUps(char);
        await onKillProgress(char, monster.id);

        result.rewards = { xp, gold, drops: drops.map(itemLabel), reputation: monster.isBoss ? 8 : 1 };
        result.logs.push(`✅ انتصرت على **${session.enemy.nameAr}**!`);
        result.logs.push(`+${xp} XP | +${gold} ذهب${drops.length ? ` | سقط: ${drops.map(itemLabel).join(', ')}` : ''}`);
        if (result.leveled) result.logs.push(`🌟 ارتفع مستواك ×${result.leveled}! (نقاط مهارات: ${char.skillPoints})`);
    } else if (outcome === 'flee') {
        result.logs.push('🏃 هربت من القتال.');
        if (chance(0.35)) {
            const loss = Math.min(char.gold, 3 + char.level);
            char.gold -= loss;
            result.logs.push(`خسرت **${loss}** ذهب وأنت بتهرب.`);
        }
    } else if (outcome === 'lose') {
        char.deaths += 1;
        char.hp = Math.max(1, Math.floor(char.maxHp * 0.25));
        const xpLoss = Math.min(char.xp, Math.floor(xpToLose(char)));
        char.xp = Math.max(0, char.xp - xpLoss);

        let lostItem = null;
        const candidates = (char.inventory || []).filter((i) => {
            const def = getItem(i.itemId);
            return def && def.type !== 'weapon' && def.type !== 'armor' && i.itemId !== char.equipped?.weapon && i.itemId !== char.equipped?.armor;
        });
        if (candidates.length && chance(0.45)) {
            const pick = candidates[Math.floor(Math.random() * candidates.length)];
            removeFromInventory(char, pick.itemId, 1);
            lostItem = pick.itemId;
        }

        result.death = { xpLoss, lostItem: lostItem ? itemLabel(lostItem) : null };
        result.logs.push(`💀 سقطت أمام **${session.enemy.nameAr}**.`);
        result.logs.push(`خسرت **${xpLoss}** XP${lostItem ? ` و **${itemLabel(lostItem)}**` : ''}.`);
    }

    await char.save();
    result.character = char;
    return result;
}

function xpToLose(char) {
    return Math.floor(20 + char.level * 8);
}

async function playerAction(userId, guildId, action, opts = {}) {
    const key = combatKey(guildId, userId);
    const session = activeCombats.get(key);
    if (!session) {
        const char = await findCharacter(userId, guildId);
        if (char?.inCombat) {
            char.inCombat = false;
            await char.save();
        }
        return { ok: false, error: 'مفيش قتال شغال. ابدأ بـ `elora lands hunt`' };
    }

    const char = await findCharacter(userId, guildId);
    if (!char) return { ok: false, error: 'الشخصية مش موجودة.' };

    const logs = [];
    logs.push(...tickEffects(session.player));
    if (session.player.hp <= 0) {
        const end = await resolveEnd(session, char, 'lose');
        return { ok: true, ended: true, ...end, session };
    }

    if (hasEffect(session.player, 'paralyze') || (hasEffect(session.player, 'fear') && chance(0.4))) {
        logs.push('😨 مش قادر تتحرك كويس الدور ده!');
        session.logs.push(...logs);
        const eLogs = await enemyTurn(session, char);
        session.logs.push(...eLogs);
        session.turn += 1;
        if (session.skillCd > 0) session.skillCd -= 1;
        if (session.player.hp <= 0) {
            const end = await resolveEnd(session, char, 'lose');
            return { ok: true, ended: true, ...end, session };
        }
        char.hp = session.player.hp;
        await char.save();
        return { ok: true, ended: false, session, logs: session.logs.slice(-8) };
    }

    const cls = getClass(char.classId);
    const stats = session.player.stats;

    if (action === 'attack') {
        rememberMonster(char, session.enemy.id, 'attack');
        if (!computeHit(stats.agility || 1, session.enemy.agility, stats.luck || 0)) {
            logs.push('💨 ضربة ضايعة!');
        } else {
            let raw = playerAttackPower(stats, char.classId);
            let dmg = Math.max(1, Math.floor(raw - session.enemy.defense * 0.5 + Math.random() * 4));
            const crit = computeCrit(stats.luck || 0);
            if (crit) {
                dmg = Math.floor(dmg * 1.75);
                logs.push('⚡ ضربة حاسمة!');
            }
            session.enemy.hp = clamp(session.enemy.hp - dmg, 0, session.enemy.maxHp);
            logs.push(`⚔️ هاجمت → **-${dmg}**`);
        }
    } else if (action === 'skill') {
        if (session.skillCd > 0) {
            return { ok: false, error: `المهارة لسه في كولداون (**${session.skillCd}** دور).` };
        }
        rememberMonster(char, session.enemy.id, 'skill');
        const sk = cls.skill;
        session.skillCd = sk.cooldown || 3;

        if (sk.id === 'crushing_blow') {
            let dmg = Math.max(1, Math.floor(playerAttackPower(stats, 'warrior') * 1.7 - session.enemy.defense * 0.3));
            session.enemy.hp = clamp(session.enemy.hp - dmg, 0, session.enemy.maxHp);
            session.enemy.defense = Math.max(0, session.enemy.defense - 2);
            logs.push(`🔨 **${sk.nameAr}** → **-${dmg}** (دفاع العدو ↓)`);
        } else if (sk.id === 'fireball') {
            let dmg = Math.max(1, Math.floor(playerAttackPower(stats, 'mage') * 1.55));
            session.enemy.hp = clamp(session.enemy.hp - dmg, 0, session.enemy.maxHp);
            if (chance(0.65)) {
                applyEffect(session.enemy, 'burn', 3, 5);
                logs.push(`🔥 **${sk.nameAr}** → **-${dmg}** + حرق!`);
            } else {
                logs.push(`🔥 **${sk.nameAr}** → **-${dmg}**`);
            }
        } else if (sk.id === 'venom_stab') {
            let dmg = Math.max(1, Math.floor(playerAttackPower(stats, 'assassin') * 1.4));
            session.enemy.hp = clamp(session.enemy.hp - dmg, 0, session.enemy.maxHp);
            applyEffect(session.enemy, 'poison', 3, 5);
            logs.push(`🗡️ **${sk.nameAr}** → **-${dmg}** + سم!`);
        } else if (sk.id === 'natures_blessing') {
            const heal = Math.floor(20 + (stats.intelligence || 1) * 3 + (stats.vitality || 1) * 2);
            session.player.hp = clamp(session.player.hp + heal, 0, session.player.maxHp);
            session.player.effects = (session.player.effects || []).filter((e) => e.type !== 'poison' && e.type !== 'fear');
            logs.push(`🌿 **${sk.nameAr}** → شفاء **+${heal}** وإزالة سموم/خوف`);
        } else {
            logs.push('مهارة غير معروفة.');
        }
    } else if (action === 'item') {
        const itemId = opts.itemId || 'healing_herb';
        const item = getItem(itemId);
        if (!item || !item.combatUsable) return { ok: false, error: 'الصنف ده مش ينفع في القتال.' };
        if (countItem(char, itemId) < 1) return { ok: false, error: `معندكش **${item.nameAr}**.` };
        removeFromInventory(char, itemId, 1);
        rememberMonster(char, session.enemy.id, 'item');
        if (item.heal) {
            session.player.hp = clamp(session.player.hp + item.heal, 0, session.player.maxHp);
            logs.push(`🧪 استخدمت **${item.nameAr}** → **+${item.heal}** HP`);
        }
        if (item.clearEffects) {
            session.player.effects = (session.player.effects || []).filter((e) => !item.clearEffects.includes(e.type));
            logs.push(`تم تطهير: ${item.clearEffects.join(', ')}`);
        }
    } else if (action === 'flee') {
        const fleeChance = clamp(0.4 + ((stats.agility || 1) - session.enemy.agility) * 0.04 + (stats.luck || 0) * 0.01, 0.2, 0.85);
        if (chance(fleeChance)) {
            session.logs.push(...logs, '🏃 نجحت في الهروب!');
            const end = await resolveEnd(session, char, 'flee');
            return { ok: true, ended: true, ...end, session };
        }
        logs.push('🚫 فشل الهروب!');
    } else {
        return { ok: false, error: 'أمر قتال غير معروف.' };
    }

    session.logs.push(...logs);

    if (session.enemy.hp <= 0) {
        const end = await resolveEnd(session, char, 'win');
        return { ok: true, ended: true, ...end, session };
    }

    const eLogs = await enemyTurn(session, char);
    session.logs.push(...eLogs);
    session.turn += 1;
    if (session.skillCd > 0) session.skillCd -= 1;

    if (session.player.hp <= 0) {
        const end = await resolveEnd(session, char, 'lose');
        return { ok: true, ended: true, ...end, session };
    }

    char.hp = session.player.hp;
    await char.save();
    return { ok: true, ended: false, session, character: char };
}

function getSession(userId, guildId) {
    return activeCombats.get(combatKey(guildId, userId)) || null;
}

module.exports = {
    startHunt,
    playerAction,
    getSession,
    formatSessionEmbedData,
    activeCombats
};
