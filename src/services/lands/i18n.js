const LandsPrefs = require('../../models/LandsPrefs');
const LandsCharacter = require('../../models/LandsCharacter');
const THEME = require('../../utils/theme');

const STAT = {
    ar: {
        strength: 'قوة',
        agility: 'رشاقة',
        intelligence: 'ذكاء',
        luck: 'حظ',
        vitality: 'حيوية'
    },
    en: {
        strength: 'Strength',
        agility: 'Agility',
        intelligence: 'Intelligence',
        luck: 'Luck',
        vitality: 'Vitality'
    }
};

const STRINGS = {
    ar: {
        footer: 'الأرض المنسية • The Forgotten Lands',
        guideFooter: 'الأرض المنسية • صفحة {page}/{total} • دليل المغامر',
        guideNav: 'الدليل',
        notYourGuide: 'الدليل ده مش بتاعك… افتح `.land help` لنفسك.',
        guildOnly: 'اللعبة شغّالة جوه السيرفرات فقط.',
        noCharacter: 'مفيش شخصية. `.land start <اسم> <فئة>`',
        noCharacterShort: 'مفيش شخصية.',
        alreadyHasCharacter: 'عندك شخصية بالفعل. استخدم `.land profile`.',
        badClass: 'الفئة غلط. اختار: محارب / ساحر / قاتل / راعي',
        nameTooShort: 'الاسم لازم يكون حرفين على الأقل.',
        badStat: 'المهارة غلط. استخدم: strength / agility / intelligence / luck / vitality',
        noSkillPoints: 'مفيش نقاط مهارات متاحة.',
        inCombatFinish: 'انت في قتال دلوقتي. خلّصه الأول.',
        cantRestInCombat: 'مش هتقدر ترتاح وانت بتتقاتل.',
        restCost: 'الراحة بتكلف **{cost}** ذهب.',
        zoneMissing: 'منطقة غير موجودة.',
        zoneRare: 'المنطقة دي نادرة وبتتفتح بأحداث خاصة.',
        zoneNeedLevel: 'محتاج مستوى **{level}** على الأقل.',
        zoneNeedRep: 'محتاج سمعة **{rep}** على الأقل.',
        alreadyFighting: 'انت أصلاً في قتال. استخدم أزرار القتال أو `.land flee`.',
        needRest: 'انت ميت/منهك. استخدم `.land rest` عشان تتعافى.',
        zoneUndefined: 'منطقتك مش معرّفة.',
        noMonsters: 'مفيش وحوش هنا دلوقتي.',
        noCombat: 'مفيش قتال شغال. ابدأ بـ `.land hunt`',
        charMissing: 'الشخصية مش موجودة.',
        skillCd: 'المهارة لسه في كولداون (**{cd}** دور).',
        itemNotCombat: 'الصنف ده مش ينفع في القتال.',
        noItem: 'معندكش **{item}**.',
        unknownCombat: 'أمر قتال غير معروف.',
        unknownButton: 'زر غير معروف.',
        actionFailed: 'فشل الإجراء.',
        combatError: 'حصل خطأ في القتال.',
        none: 'لا شيء',
        emptyInv: '_فاضي_',
        bornTitle: '🌅 وُلدت أسطورة جديدة',
        bornBody: '**{name}** انضم للأرض المنسية كـ **{class}**.\n\n{desc}\n\nمهارتك الخاصة: **{skill}** — {skillDesc}\n\nابدأ الاستكشاف: `.land hunt`',
        createTitle: 'إنشاء شخصية',
        createUsage: 'الاستخدام: `.land start <اسم> <فئة>`\n\n{classes}',
        progress: 'التقدّم',
        progressVal: 'مستوى **{level}** | XP **{xp}/{need}**\nذهب **{gold}** | سمعة **{rep}**\nنقاط مهارات **{sp}**',
        life: 'الحياة',
        inFight: ' ⚔️ (في قتال)',
        zone: 'المنطقة',
        skills: 'المهارات',
        gear: 'التجهيز',
        weapon: 'سلاح',
        armor: 'درع',
        record: 'سجل',
        recordVal: 'قتل **{kills}** · بوس **{bosses}** · موت **{deaths}**',
        invTitle: '🎒 مخزون — {name}',
        combatTurn: '⚔️ قتال — الدور {turn}',
        skillLabel: 'مهارة: **{skill}**{cd}',
        skillReady: ' ✓',
        skillCooldown: ' (كولداون {cd})',
        win: '🏆 انتصار',
        lose: '💀 هزيمة',
        fleeTitle: '🏃 انسحاب',
        allocated: 'زودت **{stat}**. متبقي **{left}** نقطة.',
        allocateTitle: '📈 تطوير',
        zonesTitle: '🧭 المناطق المتاحة',
        zonesEmpty: 'مفيش مناطق متاحة… غريب.',
        zoneLine: '• `{id}` — **{name}** (مستوى {level}+ / سمعة {rep}+)',
        travelTitle: 'سفر',
        travelHint: '`.land travel misty_edge`',
        arrived: '🏕️ وصلت',
        arrivedBody: 'انت دلوقتي في **{name}**.\n{desc}',
        restTitle: '😴 راحة',
        restBody: 'تعافت بالكامل. دفعت **{cost}** ذهب.\nHP **{hp}/{max}**',
        questTitle: '📋 مهمة يومية — {title}',
        questClaimed: '✅ تم الاستلام',
        questReady: '🎁 جاهزة للاستلام',
        questProgress: 'تقدّم **{cur}/{max}**',
        questReward: 'مكافأة: **{xp}** XP · **{gold}** ذهب · **{rep}** سمعة',
        questClaimHint: 'استلم بـ `.land claim`',
        claimTitle: '🎁 مكافأة يومية',
        claimBody: '+{xp} XP · +{gold} ذهب · +{rep} سمعة',
        levelUp: '\n🌟 مستوى جديد ×{n}!',
        noDaily: 'مفيش مهمة يومية.',
        dailyAlready: 'استلمت مكافأة المهمة اليومية بالفعل.',
        needCollect: 'محتاج **{need}** من **{item}** (معاك {have}).',
        dailyIncomplete: 'لسه ما خلّصتش المهمة ({cur}/{max}).',
        langTitle: '🌐 لغة اللعبة',
        langCurrent: 'لغتك الحالية: **{lang}**\n\nغيّرها:\n`.land lang ar` — عربي\n`.land lang en` — English',
        langSet: 'تم ضبط اللغة على **{lang}**.',
        langBad: 'اختار: `ar` أو `en`',
        langNameAr: 'العربية',
        langNameEn: 'English',
        btnAtk: 'هجوم',
        btnSkill: 'مهارة',
        btnItem: 'عشبة شفاء',
        btnFlee: 'هروب',
        btnPrev: 'السابق',
        btnNext: 'التالي',
        btnClose: 'إغلاق',
        fxPoison: 'سم',
        fxBurn: 'حرق',
        fxFear: 'خوف',
        fxParalyze: 'شلل',
        appear: 'ظهر **{enemy}** (مستوى {level}) في **{zone}**!',
        poisonTick: '☠️ سم: **-{dmg}** HP',
        burnTick: '🔥 حرق: **-{dmg}** HP',
        cantMove: '💫 **{name}** مش قادر يتحرك!',
        enemySkill: '💥 **{name}** استخدم **{skill}** → **-{dmg}**',
        drainHeal: '🩸 امتص **{heal}** HP',
        enemyMiss: '💨 **{name}** أخطأ الضربة!',
        enemyHit: '🗡️ **{name}** ضربك → **-{dmg}**',
        luckBonus: '🍀 حظك زاد المكافأة!',
        winLog: '✅ انتصرت على **{enemy}**!',
        rewardLog: '+{xp} XP | +{gold} ذهب{drops}',
        dropsPart: ' | سقط: {list}',
        leveledLog: '🌟 ارتفع مستواك ×{n}! (نقاط مهارات: {sp})',
        fledLog: '🏃 هربت من القتال.',
        fleeGoldLoss: 'خسرت **{loss}** ذهب وأنت بتهرب.',
        deathLog: '💀 سقطت أمام **{enemy}**.',
        deathLoss: 'خسرت **{xp}** XP{item}',
        deathItem: ' و **{item}**',
        stunned: '😨 مش قادر تتحرك كويس الدور ده!',
        miss: '💨 ضربة ضايعة!',
        crit: '⚡ ضربة حاسمة!',
        attackLog: '⚔️ هاجمت → **-{dmg}**',
        crushLog: '🔨 **{skill}** → **-{dmg}** (دفاع العدو ↓)',
        fireBurn: '🔥 **{skill}** → **-{dmg}** + حرق!',
        fireLog: '🔥 **{skill}** → **-{dmg}**',
        venomLog: '🗡️ **{skill}** → **-{dmg}** + سم!',
        blessLog: '🌿 **{skill}** → شفاء **+{heal}** وإزالة سموم/خوف',
        unknownSkill: 'مهارة غير معروفة.',
        useItem: '🧪 استخدمت **{item}** → **+{heal}** HP',
        cleansed: 'تم تطهير: {list}',
        fleeOk: '🏃 نجحت في الهروب!',
        fleeFail: '🚫 فشل الهروب!',
        playerLine: '**{name}** HP: **{hp}/{max}** | تأثيرات: {fx}',
        enemyLine: '**{name}** HP: **{hp}/{max}** | تأثيرات: {fx}'
    },
    en: {
        footer: 'The Forgotten Lands • الأرض المنسية',
        guideFooter: 'The Forgotten Lands • Page {page}/{total} • Adventurer Guide',
        guideNav: 'Guide',
        notYourGuide: "This guide isn't yours — open `.land help` yourself.",
        guildOnly: 'This game only works inside servers.',
        noCharacter: 'No character yet. `.land start <name> <class>`',
        noCharacterShort: 'No character.',
        alreadyHasCharacter: 'You already have a character. Use `.land profile`.',
        badClass: 'Invalid class. Choose: warrior / mage / assassin / shepherd',
        nameTooShort: 'Name must be at least 2 characters.',
        badStat: 'Invalid stat. Use: strength / agility / intelligence / luck / vitality',
        noSkillPoints: 'No skill points available.',
        inCombatFinish: "You're in combat. Finish it first.",
        cantRestInCombat: "You can't rest while fighting.",
        restCost: 'Resting costs **{cost}** gold.',
        zoneMissing: 'Zone not found.',
        zoneRare: 'This rare zone only opens during special events.',
        zoneNeedLevel: 'You need level **{level}** or higher.',
        zoneNeedRep: 'You need **{rep}** reputation or higher.',
        alreadyFighting: "You're already in combat. Use the buttons or `.land flee`.",
        needRest: "You're down. Use `.land rest` to recover.",
        zoneUndefined: 'Your current zone is invalid.',
        noMonsters: 'No monsters here right now.',
        noCombat: 'No active combat. Start with `.land hunt`',
        charMissing: 'Character not found.',
        skillCd: 'Skill on cooldown (**{cd}** turns).',
        itemNotCombat: "That item can't be used in combat.",
        noItem: "You don't have **{item}**.",
        unknownCombat: 'Unknown combat action.',
        unknownButton: 'Unknown button.',
        actionFailed: 'Action failed.',
        combatError: 'Combat error.',
        none: 'None',
        emptyInv: '_Empty_',
        bornTitle: '🌅 A New Legend Rises',
        bornBody: '**{name}** entered the Forgotten Lands as a **{class}**.\n\n{desc}\n\nSignature skill: **{skill}** — {skillDesc}\n\nBegin exploring: `.land hunt`',
        createTitle: 'Create Character',
        createUsage: 'Usage: `.land start <name> <class>`\n\n{classes}',
        progress: 'Progress',
        progressVal: 'Level **{level}** | XP **{xp}/{need}**\nGold **{gold}** | Reputation **{rep}**\nSkill points **{sp}**',
        life: 'Vitality',
        inFight: ' ⚔️ (in combat)',
        zone: 'Zone',
        skills: 'Attributes',
        gear: 'Equipment',
        weapon: 'Weapon',
        armor: 'Armor',
        record: 'Record',
        recordVal: 'Kills **{kills}** · Bosses **{bosses}** · Deaths **{deaths}**',
        invTitle: '🎒 Inventory — {name}',
        combatTurn: '⚔️ Combat — Turn {turn}',
        skillLabel: 'Skill: **{skill}**{cd}',
        skillReady: ' ✓',
        skillCooldown: ' (CD {cd})',
        win: '🏆 Victory',
        lose: '💀 Defeat',
        fleeTitle: '🏃 Escaped',
        allocated: 'Increased **{stat}**. **{left}** point(s) left.',
        allocateTitle: '📈 Growth',
        zonesTitle: '🧭 Available Zones',
        zonesEmpty: 'No zones available… odd.',
        zoneLine: '• `{id}` — **{name}** (Lv {level}+ / Rep {rep}+)',
        travelTitle: 'Travel',
        travelHint: '`.land travel misty_edge`',
        arrived: '🏕️ Arrived',
        arrivedBody: "You're now in **{name}**.\n{desc}",
        restTitle: '😴 Rest',
        restBody: 'Fully recovered. Paid **{cost}** gold.\nHP **{hp}/{max}**',
        questTitle: '📋 Daily Quest — {title}',
        questClaimed: '✅ Already claimed',
        questReady: '🎁 Ready to claim',
        questProgress: 'Progress **{cur}/{max}**',
        questReward: 'Reward: **{xp}** XP · **{gold}** gold · **{rep}** reputation',
        questClaimHint: 'Claim with `.land claim`',
        claimTitle: '🎁 Daily Reward',
        claimBody: '+{xp} XP · +{gold} gold · +{rep} reputation',
        levelUp: '\n🌟 Level up ×{n}!',
        noDaily: 'No daily quest.',
        dailyAlready: 'Daily reward already claimed.',
        needCollect: 'Need **{need}** × **{item}** (you have {have}).',
        dailyIncomplete: 'Quest incomplete ({cur}/{max}).',
        langTitle: '🌐 Game Language',
        langCurrent: 'Current language: **{lang}**\n\nSwitch with:\n`.land lang ar` — Arabic\n`.land lang en` — English',
        langSet: 'Language set to **{lang}**.',
        langBad: 'Choose: `ar` or `en`',
        langNameAr: 'Arabic',
        langNameEn: 'English',
        btnAtk: 'Attack',
        btnSkill: 'Skill',
        btnItem: 'Healing Herb',
        btnFlee: 'Flee',
        btnPrev: 'Prev',
        btnNext: 'Next',
        btnClose: 'Close',
        fxPoison: 'poison',
        fxBurn: 'burn',
        fxFear: 'fear',
        fxParalyze: 'paralyze',
        appear: '**{enemy}** (Lv {level}) appears in **{zone}**!',
        poisonTick: '☠️ Poison: **-{dmg}** HP',
        burnTick: '🔥 Burn: **-{dmg}** HP',
        cantMove: "💫 **{name}** can't move!",
        enemySkill: '💥 **{name}** used **{skill}** → **-{dmg}**',
        drainHeal: '🩸 Absorbed **{heal}** HP',
        enemyMiss: '💨 **{name}** missed!',
        enemyHit: '🗡️ **{name}** hits you → **-{dmg}**',
        luckBonus: '🍀 Luck boosted your rewards!',
        winLog: '✅ You defeated **{enemy}**!',
        rewardLog: '+{xp} XP | +{gold} gold{drops}',
        dropsPart: ' | Loot: {list}',
        leveledLog: '🌟 Level up ×{n}! (Skill points: {sp})',
        fledLog: '🏃 You fled the fight.',
        fleeGoldLoss: 'Lost **{loss}** gold while fleeing.',
        deathLog: '💀 You fell to **{enemy}**.',
        deathLoss: 'Lost **{xp}** XP{item}',
        deathItem: ' and **{item}**',
        stunned: "😨 You can't act properly this turn!",
        miss: '💨 Miss!',
        crit: '⚡ Critical hit!',
        attackLog: '⚔️ You attack → **-{dmg}**',
        crushLog: '🔨 **{skill}** → **-{dmg}** (enemy defense ↓)',
        fireBurn: '🔥 **{skill}** → **-{dmg}** + burn!',
        fireLog: '🔥 **{skill}** → **-{dmg}**',
        venomLog: '🗡️ **{skill}** → **-{dmg}** + poison!',
        blessLog: '🌿 **{skill}** → heal **+{heal}** and cleanse poison/fear',
        unknownSkill: 'Unknown skill.',
        useItem: '🧪 Used **{item}** → **+{heal}** HP',
        cleansed: 'Cleansed: {list}',
        fleeOk: '🏃 You escaped!',
        fleeFail: '🚫 Failed to flee!',
        playerLine: '**{name}** HP: **{hp}/{max}** | Effects: {fx}',
        enemyLine: '**{name}** HP: **{hp}/{max}** | Effects: {fx}'
    }
};

const HELP_PAGES = {
    ar: [
        {
            id: 'world',
            label: 'العالم',
            color: THEME.COLORS.ACCENT,
            title: '🌫️ الأرض المنسية',
            description: [
                '*العالم ده مبتخلصش.*',
                'مفيش نهاية سعيدة… وفيه نهاية أسوأ لو ماتّ كتير.',
                '',
                'دي أرض نسيها الزمن. كل لاعب ليه **أسطورة خاصة** بتكبر معاه،',
                'والوحوش بتتعلم من طريقة لعبك، والمناطق بتتفتح لما تستاهلها.',
                '',
                '▸ شخصيتك دائمة',
                '▸ قراراتك ليها ثمن',
                '▸ كل يوم مهمة جديدة',
                '▸ كل قتال قصة قصيرة',
                '',
                'اضغط الأزرار تحت وتعلّم إزاي تدخل العالم.',
                '',
                '🌐 اللغة: `.land lang en` للإنجليزي'
            ].join('\n')
        },
        {
            id: 'birth',
            label: 'الولادة',
            color: '#9B8CFF',
            title: '🌅 أول نفس — إنشاء شخصية',
            description: [
                'قبل أي سيف أو تعويذة… اختار **مين هتكون**.',
                '',
                '```',
                '.land start <اسمك> <فئتك>',
                '```',
                'مثال: `.land start راكان محارب`',
                '',
                '**الفئات الأربع**',
                '⚔️ **محارب** — ضرب ثقيل وصمود. مهارة: *ضربة ساحقة*',
                '🔮 **ساحر** — سحر ناري وحرق. مهارة: *كرة نارية*',
                '🗡️ **قاتل** — سرعة وسم. مهارة: *طعنة السم*',
                '🌿 **راعي** — شفاء وتوازن. مهارة: *بركة الطبيعة*',
                '',
                'هتبدأ في **حافة الضباب** بذهب بسيط، عشبة شفاء، وسلاح فئة.'
            ].join('\n')
        },
        {
            id: 'loop',
            label: 'الإيقاع',
            color: THEME.COLORS.SUCCESS,
            title: '🔁 إيقاع المغامرة',
            description: [
                'اللعبة بتتلعب كحلقة حلوة… وكل لفة بتكبّرك:',
                '',
                '**١)** شوف نفسك → `.land profile`',
                '**٢)** اطلع للضباب → `.land hunt`',
                '**٣)** اقاتل بالأزرار (هجوم / مهارة / غرض / هروب)',
                '**٤)** اجمع XP وذهب وأغراض',
                '**٥)** لو اتصابت → `.land rest`',
                '**٦)** كل يوم → `.land quest` وبعدين `.land claim`',
                '',
                'لما تطلع مستوى هتاخد **٣ نقاط مهارات**.',
                'اصرفهم بحكمة:',
                '`.land allocate قوة` أو `رشاقة` / `ذكاء` / `حظ` / `حيوية`',
                '',
                '*السمعة بتفتح أراضي أخطر. المستوى لوحده مش كفاية.*'
            ].join('\n')
        },
        {
            id: 'combat',
            label: 'القتال',
            color: THEME.COLORS.WARNING,
            title: '⚔️ القتال الدوري',
            description: [
                'القتال **مش زر عشوائي** — كل دور اختيار.',
                '',
                '🔴 **هجوم** — ضرر ثابت حسب فئتك',
                '🔵 **مهارة** — ضربة خاصة (فيها كولداون)',
                '🟢 **عشبة شفاء** — تنقذ حياتك في اللحظة الصح',
                '⚪ **هروب** — مش مضمون… والفضيحة ليها ثمن أحيانًا',
                '',
                'في سمّ، حرق، خوف… ولو اتشللت الدور ممكن يعدّي من غيرك.',
                '',
                '🧠 **الوحوش بتتذكرك.**',
                'لو بتشفي كتير → هتضغط عليك.',
                'لو بتكرّر المهارة → هتتعلم تقاوم.',
                '',
                'تقدر كمان تكتب:',
                '`.land attack` · `.land skill` · `.land item` · `.land flee`'
            ].join('\n')
        },
        {
            id: 'danger',
            label: 'الخطر',
            color: THEME.COLORS.ERROR,
            title: '💀 الموت والعالم',
            description: [
                'الموت هنا **مش ريسبون لطيف**.',
                '',
                '▸ بتخسر خبرة',
                '▸ ممكن تخسر غرض من المخزون',
                '▸ بترجع بحياة ضعيفة… محتاج راحة',
                '',
                '🗺️ **المناطق**',
                '`.land zones` — شوف اللي اتفتح لك',
                '`.land travel misty_edge` — ارجع للحافة',
                '`.land travel bone_hollow` — وادي العظام (مستوى + سمعة)',
                '',
                '📋 **المهمة اليومية** بتتجدد كل يوم.',
                'خلّصها، وبعدين `.land claim` عشان المكافأة.',
                '',
                'اللعبة مستمرة. كل ما تقدّم… العالم يكبر ويتوحّش أكتر.'
            ].join('\n')
        },
        {
            id: 'cmds',
            label: 'الأوامر',
            color: THEME.COLORS.SECONDARY,
            title: '⌨️ مرجع سريع',
            description: [
                'كل الأوامر تشتغل بـ `.land` أو `elora lands` أو `/lands`',
                '',
                '`start` `profile` `inv` `allocate` `rest`',
                '`zones` `travel` `hunt`',
                '`quest` `claim` `lang`',
                '`attack` `skill` `item` `flee` `help`',
                '',
                '**أول ١٠ دقايق المقترحة**',
                '① `.land start اسمك فئتك`',
                '② `.land hunt` → اضغط الأزرار',
                '③ `.land quest`',
                '④ `.land profile` وشوف إنت فين',
                '',
                '🌐 `.land lang en` لتغيير اللغة',
                '',
                '*مرحباً بك في النسيان… خليك أسوأ كابوس للضباب.*'
            ].join('\n')
        }
    ],
    en: [
        {
            id: 'world',
            label: 'World',
            color: THEME.COLORS.ACCENT,
            title: '🌫️ The Forgotten Lands',
            description: [
                '*This world never ends.*',
                'There is no clean finale — only worse ones if you die too often.',
                '',
                'A land time forgot. Every player grows a **personal legend**,',
                'monsters learn your habits, and zones unlock when you earn them.',
                '',
                '▸ Persistent character',
                '▸ Choices have costs',
                '▸ A new daily quest',
                '▸ Every fight is a short story',
                '',
                'Use the buttons below to learn how to enter the world.',
                '',
                '🌐 Language: `.land lang ar` for Arabic'
            ].join('\n')
        },
        {
            id: 'birth',
            label: 'Birth',
            color: '#9B8CFF',
            title: '🌅 First Breath — Create a Character',
            description: [
                'Before any blade or spell… choose **who you become**.',
                '',
                '```',
                '.land start <name> <class>',
                '```',
                'Example: `.land start Rakan warrior`',
                '',
                '**The Four Classes**',
                '⚔️ **Warrior** — heavy hits & endurance. Skill: *Crushing Blow*',
                '🔮 **Mage** — fire magic & burns. Skill: *Fireball*',
                '🗡️ **Assassin** — speed & venom. Skill: *Venom Stab*',
                '🌿 **Shepherd** — healing & balance. Skill: *Nature’s Blessing*',
                '',
                'You begin at **Misty Edge** with some gold, healing herbs, and a class weapon.'
            ].join('\n')
        },
        {
            id: 'loop',
            label: 'Rhythm',
            color: THEME.COLORS.SUCCESS,
            title: '🔁 The Adventure Loop',
            description: [
                'Play in a clean loop — every cycle makes you stronger:',
                '',
                '**1)** Check yourself → `.land profile`',
                '**2)** Enter the mist → `.land hunt`',
                '**3)** Fight with buttons (Attack / Skill / Item / Flee)',
                '**4)** Earn XP, gold, and loot',
                '**5)** If wounded → `.land rest`',
                '**6)** Every day → `.land quest` then `.land claim`',
                '',
                'On level-up you gain **3 skill points**.',
                'Spend them wisely:',
                '`.land allocate strength` or `agility` / `intelligence` / `luck` / `vitality`',
                '',
                '*Reputation opens deadlier lands. Level alone is not enough.*'
            ].join('\n')
        },
        {
            id: 'combat',
            label: 'Combat',
            color: THEME.COLORS.WARNING,
            title: '⚔️ Turn-Based Combat',
            description: [
                'Combat is **not a random mash** — every turn is a choice.',
                '',
                '🔴 **Attack** — reliable damage for your class',
                '🔵 **Skill** — signature move (has cooldown)',
                '🟢 **Healing Herb** — clutch recovery',
                '⚪ **Flee** — not guaranteed… and sometimes costly',
                '',
                'Expect poison, burn, fear… and skipped turns if you’re locked down.',
                '',
                '🧠 **Monsters remember you.**',
                'Heal a lot → they pressure you.',
                'Spam skills → they learn to resist.',
                '',
                'You can also type:',
                '`.land attack` · `.land skill` · `.land item` · `.land flee`'
            ].join('\n')
        },
        {
            id: 'danger',
            label: 'Danger',
            color: THEME.COLORS.ERROR,
            title: '💀 Death & the World',
            description: [
                'Death here is **not a soft respawn**.',
                '',
                '▸ You lose XP',
                '▸ You may lose an inventory item',
                '▸ You return weakened… rest to recover',
                '',
                '🗺️ **Zones**',
                '`.land zones` — see what unlocked',
                '`.land travel misty_edge` — return to the edge',
                '`.land travel bone_hollow` — Bone Hollow (level + reputation)',
                '',
                '📋 **Daily quests** refresh each day.',
                'Finish them, then `.land claim` for the reward.',
                '',
                'The game never ends. The further you go… the wilder it gets.'
            ].join('\n')
        },
        {
            id: 'cmds',
            label: 'Commands',
            color: THEME.COLORS.SECONDARY,
            title: '⌨️ Quick Reference',
            description: [
                'Commands work with `.land`, `elora lands`, or `/lands`',
                '',
                '`start` `profile` `inv` `allocate` `rest`',
                '`zones` `travel` `hunt`',
                '`quest` `claim` `lang`',
                '`attack` `skill` `item` `flee` `help`',
                '',
                '**Suggested first 10 minutes**',
                '① `.land start YourName class`',
                '② `.land hunt` → press the buttons',
                '③ `.land quest`',
                '④ `.land profile` and see where you stand',
                '',
                '🌐 `.land lang ar` to switch language',
                '',
                '*Welcome to oblivion — become the mist’s worst nightmare.*'
            ].join('\n')
        }
    ]
};

function normalizeLang(input) {
    const raw = String(input || '').toLowerCase().trim();
    if (['en', 'english', 'eng', 'انجليزي', 'إنجليزي', 'english'].includes(raw)) return 'en';
    if (['ar', 'arabic', 'عربي', 'العربية', 'ع'].includes(raw)) return 'ar';
    return null;
}

function t(lang, key, vars = {}) {
    const L = lang === 'en' ? 'en' : 'ar';
    let s = STRINGS[L][key] ?? STRINGS.ar[key] ?? key;
    for (const [k, v] of Object.entries(vars)) {
        s = String(s).split(`{${k}}`).join(String(v));
    }
    return s;
}

function localeName(obj, lang, fallback = '?') {
    if (!obj) return fallback;
    if (lang === 'en') return obj.nameEn || obj.nameAr || obj.id || fallback;
    return obj.nameAr || obj.nameEn || obj.id || fallback;
}

function localeDesc(obj, lang) {
    if (!obj) return '';
    if (lang === 'en') return obj.descriptionEn || obj.description || obj.descriptionAr || '';
    return obj.descriptionAr || obj.description || obj.descriptionEn || '';
}

function statLabel(lang, key) {
    const L = lang === 'en' ? 'en' : 'ar';
    return STAT[L][key] || key;
}

function effectLabel(lang, type) {
    const map = {
        poison: 'fxPoison',
        burn: 'fxBurn',
        fear: 'fxFear',
        paralyze: 'fxParalyze'
    };
    return t(lang, map[type] || 'none');
}

async function resolveLang(userId, guildId) {
    try {
        const prefs = await LandsPrefs.findOne({ userId, guildId }).lean().exec();
        if (prefs?.locale === 'en' || prefs?.locale === 'ar') return prefs.locale;
    } catch (_) {}
    try {
        const char = await LandsCharacter.findOne({ userId, guildId }).select('locale').lean().exec();
        if (char?.locale === 'en' || char?.locale === 'ar') return char.locale;
    } catch (_) {}
    return 'ar';
}

async function setLang(userId, guildId, lang) {
    const locale = normalizeLang(lang);
    if (!locale) return { ok: false, errorKey: 'langBad' };

    await LandsPrefs.findOneAndUpdate(
        { userId, guildId },
        { $set: { locale, userId, guildId } },
        { upsert: true, new: true }
    ).exec();

    await LandsCharacter.updateOne({ userId, guildId }, { $set: { locale } }).exec();

    return { ok: true, locale };
}

function helpPages(lang) {
    return HELP_PAGES[lang === 'en' ? 'en' : 'ar'];
}

module.exports = {
    STRINGS,
    STAT,
    HELP_PAGES,
    normalizeLang,
    t,
    localeName,
    localeDesc,
    statLabel,
    effectLabel,
    resolveLang,
    setLang,
    helpPages
};
