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
const { t, localeName, effectLabel } = require('./i18n');

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

function langOf(sessionOrChar) {
    return sessionOrChar?.lang || sessionOrChar?.locale || 'ar';
}

function tickEffects(entity, lang) {
    const logs = [];
    const next = [];
    for (const fx of entity.effects || []) {
        if (fx.type === 'poison') {
            const dmg = fx.power || 4;
            entity.hp = clamp(entity.hp - dmg, 0, entity.maxHp);
            logs.push(t(lang, 'poisonTick', { dmg }));
        } else if (fx.type === 'burn') {
            const dmg = fx.power || 5;
            entity.hp = clamp(entity.hp - dmg, 0, entity.maxHp);
            logs.push(t(lang, 'burnTick', { dmg }));
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
    if (memory) {
        if ((memory.skillUses || 0) > (memory.attacks || 0) + 2) {
            defense += 2;
            attack += 1;
        }
        if ((memory.items || 0) >= 3) agility += 2;
        if ((memory.fights || 0) >= 5) attack += Math.min(5, Math.floor(memory.fights / 5));
    }
    return {
        id: monster.id,
        nameAr: monster.nameAr,
        nameEn: monster.nameEn,
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

function formatFx(effects, lang) {
    const list = (effects || []).map((e) => effectLabel(lang, e.type));
    return list.length ? list.join(', ') : t(lang, 'none');
}

async function startHunt(userId, guildId) {
    const char = await findCharacter(userId, guildId);
    if (!char) return { ok: false, errorKey: 'noCharacter' };

    if (char.inCombat && !activeCombats.has(combatKey(guildId, userId))) {
        char.inCombat = false;
        await char.save();
    }

    if (char.inCombat || activeCombats.has(combatKey(guildId, userId))) {
        return { ok: false, errorKey: 'alreadyFighting' };
    }
    if (char.hp <= 0) return { ok: false, errorKey: 'needRest' };

    const zone = getZone(char.zoneId);
    if (!zone) return { ok: false, errorKey: 'zoneUndefined' };

    const monster = pickZoneMonster(zone, { bossChance: char.level >= 3 ? 0.1 : 0.04 });
    if (!monster) return { ok: false, errorKey: 'noMonsters' };

    const lang = char.locale === 'en' ? 'en' : 'ar';
    rememberMonster(char, monster.id, 'fight_start');
    const memory = getMemory(char, monster.id);
    const enemy = buildEnemyFromMonster(monster, memory);
    const stats = getEffectiveStats(char);
    const cls = getClass(char.classId);

    const session = {
        userId,
        guildId,
        lang,
        turn: 1,
        skillCd: 0,
        enemy,
        classId: char.classId,
        skillId: cls.skill.id,
        logs: [
            t(lang, 'appear', {
                enemy: localeName(enemy, lang),
                level: enemy.level,
                zone: localeName(zone, lang)
            })
        ],
        startedAt: Date.now(),
        player: {
            hp: char.hp,
            maxHp: char.maxHp,
            stats,
            effects: [],
            name: char.name
        }
    };

    char.inCombat = true;
    activeCombats.set(combatKey(guildId, userId), session);
    await char.save();

    return { ok: true, character: char, session, zone, monster };
}

function formatSessionEmbedData(session) {
    const lang = langOf(session);
    return {
        title: t(lang, 'combatTurn', { turn: session.turn }),
        playerLine: t(lang, 'playerLine', {
            name: session.player.name,
            hp: session.player.hp,
            max: session.player.maxHp,
            fx: formatFx(session.player.effects, lang)
        }),
        enemyLine: t(lang, 'enemyLine', {
            name: localeName(session.enemy, lang),
            hp: session.enemy.hp,
            max: session.enemy.maxHp,
            fx: formatFx(session.enemy.effects, lang)
        }),
        logs: session.logs.slice(-6).join('\n')
    };
}

async function enemyTurn(session, char) {
    const lang = langOf(session);
    const logs = [];
    logs.push(...tickEffects(session.enemy, lang));
    if (session.enemy.hp <= 0) return logs;

    if (hasEffect(session.enemy, 'fear') || hasEffect(session.enemy, 'paralyze')) {
        logs.push(t(lang, 'cantMove', { name: localeName(session.enemy, lang) }));
        return logs;
    }

    const memory = getMemory(char, session.enemy.id);
    const skills = session.enemy.skills || [];
    let useSkill = false;
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
        logs.push(
            t(lang, 'enemySkill', {
                name: localeName(session.enemy, lang),
                skill: localeName(sk, lang),
                dmg
            })
        );
        if (sk.effect) applyEffect(session.player, sk.effect, sk.turns || 2, sk.effect === 'poison' ? 4 : 5);
        if (sk.healSelf) {
            const heal = Math.floor(dmg * sk.healSelf);
            session.enemy.hp = clamp(session.enemy.hp + heal, 0, session.enemy.maxHp);
            logs.push(t(lang, 'drainHeal', { heal }));
        }
    } else if (!computeHit(session.enemy.agility, session.player.stats.agility || 1)) {
        logs.push(t(lang, 'enemyMiss', { name: localeName(session.enemy, lang) }));
    } else {
        let dmg = Math.max(1, Math.floor(session.enemy.attack - (session.player.stats.defense || 0) * 0.6 + Math.random() * 3));
        session.player.hp = clamp(session.player.hp - dmg, 0, session.player.maxHp);
        logs.push(t(lang, 'enemyHit', { name: localeName(session.enemy, lang), dmg }));
    }
    return logs;
}

function xpToLose(char) {
    return Math.floor(20 + char.level * 8);
}

async function resolveEnd(session, char, outcome) {
    const lang = langOf(session);
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
        if (chance(clamp((char.stats.luck || 0) * 0.02, 0, 0.25))) {
            xp = Math.floor(xp * 1.25);
            gold += Math.floor(gold * 0.25);
            result.logs.push(t(lang, 'luckBonus'));
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

        const dropNames = drops.map((id) => itemLabel(id, lang));
        result.rewards = { xp, gold, drops: dropNames, reputation: monster.isBoss ? 8 : 1 };
        result.logs.push(t(lang, 'winLog', { enemy: localeName(session.enemy, lang) }));
        result.logs.push(
            t(lang, 'rewardLog', {
                xp,
                gold,
                drops: dropNames.length ? t(lang, 'dropsPart', { list: dropNames.join(', ') }) : ''
            })
        );
        if (result.leveled) {
            result.logs.push(t(lang, 'leveledLog', { n: result.leveled, sp: char.skillPoints }));
        }
    } else if (outcome === 'flee') {
        result.logs.push(t(lang, 'fledLog'));
        if (chance(0.35)) {
            const loss = Math.min(char.gold, 3 + char.level);
            char.gold -= loss;
            result.logs.push(t(lang, 'fleeGoldLoss', { loss }));
        }
    } else if (outcome === 'lose') {
        char.deaths += 1;
        char.hp = Math.max(1, Math.floor(char.maxHp * 0.25));
        const xpLoss = Math.min(char.xp, Math.floor(xpToLose(char)));
        char.xp = Math.max(0, char.xp - xpLoss);

        let lostItem = null;
        const candidates = (char.inventory || []).filter((i) => {
            const def = getItem(i.itemId);
            return (
                def &&
                def.type !== 'weapon' &&
                def.type !== 'armor' &&
                i.itemId !== char.equipped?.weapon &&
                i.itemId !== char.equipped?.armor
            );
        });
        if (candidates.length && chance(0.45)) {
            const pick = candidates[Math.floor(Math.random() * candidates.length)];
            removeFromInventory(char, pick.itemId, 1);
            lostItem = pick.itemId;
        }

        result.death = { xpLoss, lostItem: lostItem ? itemLabel(lostItem, lang) : null };
        result.logs.push(t(lang, 'deathLog', { enemy: localeName(session.enemy, lang) }));
        result.logs.push(
            t(lang, 'deathLoss', {
                xp: xpLoss,
                item: lostItem ? t(lang, 'deathItem', { item: itemLabel(lostItem, lang) }) : ''
            })
        );
    }

    await char.save();
    result.character = char;
    return result;
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
        return { ok: false, errorKey: 'noCombat' };
    }

    const lang = langOf(session);
    const char = await findCharacter(userId, guildId);
    if (!char) return { ok: false, errorKey: 'charMissing' };

    const logs = [];
    logs.push(...tickEffects(session.player, lang));
    if (session.player.hp <= 0) {
        const end = await resolveEnd(session, char, 'lose');
        return { ok: true, ended: true, ...end, session };
    }

    if (hasEffect(session.player, 'paralyze') || (hasEffect(session.player, 'fear') && chance(0.4))) {
        logs.push(t(lang, 'stunned'));
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
            logs.push(t(lang, 'miss'));
        } else {
            let raw = playerAttackPower(stats, char.classId);
            let dmg = Math.max(1, Math.floor(raw - session.enemy.defense * 0.5 + Math.random() * 4));
            if (computeCrit(stats.luck || 0)) {
                dmg = Math.floor(dmg * 1.75);
                logs.push(t(lang, 'crit'));
            }
            session.enemy.hp = clamp(session.enemy.hp - dmg, 0, session.enemy.maxHp);
            logs.push(t(lang, 'attackLog', { dmg }));
        }
    } else if (action === 'skill') {
        if (session.skillCd > 0) {
            return { ok: false, errorKey: 'skillCd', errorVars: { cd: session.skillCd } };
        }
        rememberMonster(char, session.enemy.id, 'skill');
        const sk = cls.skill;
        session.skillCd = sk.cooldown || 3;
        const skillName = localeName(sk, lang);

        if (sk.id === 'crushing_blow') {
            let dmg = Math.max(1, Math.floor(playerAttackPower(stats, 'warrior') * 1.7 - session.enemy.defense * 0.3));
            session.enemy.hp = clamp(session.enemy.hp - dmg, 0, session.enemy.maxHp);
            session.enemy.defense = Math.max(0, session.enemy.defense - 2);
            logs.push(t(lang, 'crushLog', { skill: skillName, dmg }));
        } else if (sk.id === 'fireball') {
            let dmg = Math.max(1, Math.floor(playerAttackPower(stats, 'mage') * 1.55));
            session.enemy.hp = clamp(session.enemy.hp - dmg, 0, session.enemy.maxHp);
            if (chance(0.65)) {
                applyEffect(session.enemy, 'burn', 3, 5);
                logs.push(t(lang, 'fireBurn', { skill: skillName, dmg }));
            } else {
                logs.push(t(lang, 'fireLog', { skill: skillName, dmg }));
            }
        } else if (sk.id === 'venom_stab') {
            let dmg = Math.max(1, Math.floor(playerAttackPower(stats, 'assassin') * 1.4));
            session.enemy.hp = clamp(session.enemy.hp - dmg, 0, session.enemy.maxHp);
            applyEffect(session.enemy, 'poison', 3, 5);
            logs.push(t(lang, 'venomLog', { skill: skillName, dmg }));
        } else if (sk.id === 'natures_blessing') {
            const heal = Math.floor(20 + (stats.intelligence || 1) * 3 + (stats.vitality || 1) * 2);
            session.player.hp = clamp(session.player.hp + heal, 0, session.player.maxHp);
            session.player.effects = (session.player.effects || []).filter((e) => e.type !== 'poison' && e.type !== 'fear');
            logs.push(t(lang, 'blessLog', { skill: skillName, heal }));
        } else {
            logs.push(t(lang, 'unknownSkill'));
        }
    } else if (action === 'item') {
        const itemId = opts.itemId || 'healing_herb';
        const item = getItem(itemId);
        if (!item || !item.combatUsable) return { ok: false, errorKey: 'itemNotCombat' };
        if (countItem(char, itemId) < 1) {
            return { ok: false, errorKey: 'noItem', errorVars: { item: itemLabel(itemId, lang) } };
        }
        removeFromInventory(char, itemId, 1);
        rememberMonster(char, session.enemy.id, 'item');
        if (item.heal) {
            session.player.hp = clamp(session.player.hp + item.heal, 0, session.player.maxHp);
            logs.push(t(lang, 'useItem', { item: itemLabel(itemId, lang), heal: item.heal }));
        }
        if (item.clearEffects) {
            session.player.effects = (session.player.effects || []).filter((e) => !item.clearEffects.includes(e.type));
            logs.push(
                t(lang, 'cleansed', {
                    list: item.clearEffects.map((e) => effectLabel(lang, e)).join(', ')
                })
            );
        }
    } else if (action === 'flee') {
        const fleeChance = clamp(
            0.4 + ((stats.agility || 1) - session.enemy.agility) * 0.04 + (stats.luck || 0) * 0.01,
            0.2,
            0.85
        );
        if (chance(fleeChance)) {
            session.logs.push(...logs, t(lang, 'fleeOk'));
            const end = await resolveEnd(session, char, 'flee');
            return { ok: true, ended: true, ...end, session };
        }
        logs.push(t(lang, 'fleeFail'));
    } else {
        return { ok: false, errorKey: 'unknownCombat' };
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
