const { getMonster } = require('../../data/lands/monsters');
const { getItem } = require('../../data/lands/items');

function startOfUtcDay(d = new Date()) {
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function endOfUtcDay(d = new Date()) {
    const s = startOfUtcDay(d);
    return new Date(s.getTime() + 24 * 60 * 60 * 1000);
}

const DAILY_TEMPLATES = [
    {
        id: 'daily_kill_rats',
        titleAr: 'تنظيف الضباب',
        descriptionAr: 'اقتل 3 من فئران الضباب.',
        target: { kind: 'kill', monsterId: 'fog_rat', count: 3 },
        rewardXp: 45,
        rewardGold: 30,
        rewardReputation: 5
    },
    {
        id: 'daily_kill_wolves',
        titleAr: 'صوت العواء',
        descriptionAr: 'اقتل ذئبين من ذئاب الطحالب.',
        target: { kind: 'kill', monsterId: 'moss_wolf', count: 2 },
        rewardXp: 55,
        rewardGold: 35,
        rewardReputation: 6
    },
    {
        id: 'daily_kill_slime',
        titleAr: 'الرماد اللزج',
        descriptionAr: 'اقضِ على 2 هلام رماد.',
        target: { kind: 'kill', monsterId: 'ash_slime', count: 2 },
        rewardXp: 50,
        rewardGold: 32,
        rewardReputation: 5
    },
    {
        id: 'daily_collect_herb',
        titleAr: 'جمع الأعشاب',
        descriptionAr: 'اجمع 2 عشبة شفاء (من القتال أو المخزون الحالي يُحتسب عند التسليم).',
        target: { kind: 'collect', itemId: 'healing_herb', count: 2 },
        rewardXp: 40,
        rewardGold: 28,
        rewardReputation: 4
    }
];

function pickDailyTemplate(level) {
    const pool = DAILY_TEMPLATES.filter((t) => {
        if (!t.target.monsterId) return true;
        const m = getMonster(t.target.monsterId);
        return !m || m.level <= level + 2;
    });
    return pool[Math.floor(Math.random() * pool.length)] || DAILY_TEMPLATES[0];
}

function ensureDailyQuest(char) {
    const now = new Date();
    const expires = endOfUtcDay(now);
    const q = char.dailyQuest;

    if (q && q.expiresAt && new Date(q.expiresAt) > now && !q.claimed) {
        return { refreshed: false, quest: q };
    }

    const tpl = pickDailyTemplate(char.level || 1);
    char.dailyQuest = {
        id: tpl.id,
        type: 'daily',
        titleAr: tpl.titleAr,
        descriptionAr: tpl.descriptionAr,
        target: { ...tpl.target },
        progress: 0,
        rewardXp: tpl.rewardXp,
        rewardGold: tpl.rewardGold,
        rewardReputation: tpl.rewardReputation,
        completed: false,
        claimed: false,
        expiresAt: expires
    };
    char.lastDailyAt = now;
    return { refreshed: true, quest: char.dailyQuest };
}

async function onKillProgress(char, monsterId) {
    ensureDailyQuest(char);
    const q = char.dailyQuest;
    if (!q || q.completed || q.claimed) return;
    if (q.target?.kind === 'kill' && q.target.monsterId === monsterId) {
        q.progress = Math.min((q.progress || 0) + 1, q.target.count || 1);
        if (q.progress >= q.target.count) q.completed = true;
    }
}

function claimDaily(char) {
    ensureDailyQuest(char);
    const q = char.dailyQuest;
    if (!q) return { ok: false, error: 'مفيش مهمة يومية.' };
    if (q.claimed) return { ok: false, error: 'استلمت مكافأة المهمة اليومية بالفعل.' };

    if (q.target?.kind === 'collect') {
        const itemId = q.target.itemId;
        const need = q.target.count || 1;
        const have = (char.inventory || []).find((i) => i.itemId === itemId)?.qty || 0;
        if (have < need) {
            const name = getItem(itemId)?.nameAr || itemId;
            return { ok: false, error: `محتاج **${need}** من **${name}** (معاك ${have}).` };
        }
        // consume
        const inv = char.inventory.find((i) => i.itemId === itemId);
        inv.qty -= need;
        if (inv.qty <= 0) char.inventory = char.inventory.filter((i) => i.itemId !== itemId);
        q.progress = need;
        q.completed = true;
    }

    if (!q.completed) {
        return { ok: false, error: `لسه ما خلّصتش المهمة (${q.progress}/${q.target.count}).` };
    }

    char.xp += q.rewardXp || 0;
    char.gold += q.rewardGold || 0;
    char.reputation += q.rewardReputation || 0;
    q.claimed = true;

    return {
        ok: true,
        rewards: {
            xp: q.rewardXp,
            gold: q.rewardGold,
            reputation: q.rewardReputation
        }
    };
}

module.exports = {
    ensureDailyQuest,
    onKillProgress,
    claimDaily,
    DAILY_TEMPLATES
};
