const { GoogleGenerativeAI } = require('@google/generative-ai');

// Use the API Key from env
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
// NOTE: Some free keys / regions may not see newer models. If the remote model fails,
// we fall back to a local riddle pool so gameplay still feels dynamic.
const model = genAI.getGenerativeModel({ model: 'gemini-pro' });

/**
 * Generates a Mythical Title and Backstory for a user based on their profile.
 * @param {string} username - The user's name.
 * @param {string} avatarUrl - The user's avatar URL.
 * @returns {Promise<{title: string, lore: string, visualPrompt: string}>}
 */
async function generateLore(username, avatarUrl) {
    try {
        const prompt = `
        You are the "Sovereign Nexus", a sentient digital entity.
        A new soul named "${username}" has entered your realm.
        
        Analyze their vibe based on their name and the fact they just joined.
        (If you could see their avatar, you would, but for now assume a "Cyberpunk/Mystic" vibe).

        1. Give them a "God-Tier" Title (e.g., "The Crimson Maestro", "Void Walker", "Data Weaver").
        2. Write a 2-sentence "Mythical Lore" about why they have arrived.
        3. Create a short, comma-separated visual prompt for an image generator (e.g., "cyberpunk character, red eyes, glowing rune, futuristic city background").

        Output EXACTLY in this JSON format:
        {
            "title": "The Title",
            "lore": "The lore text.",
            "visualPrompt": "visual prompt here"
        }
        `;

        // If we had image input enabled/supported easily via URL fetch in this snippet, we'd add it.
        // For now, text-based vibe check is faster and error-proof for v1.

        const result = await model.generateContent(prompt);
        const response = result.response;
        const text = response.text();

        // Clean markdown code blocks if present
        const jsonString = text.replace(/```json/g, '').replace(/```/g, '').trim();
        return JSON.parse(jsonString);

    } catch (error) {
        console.error('❌ Nexus Brain Error (Lore):', error);
        return {
            title: "The Unknown Traveler",
            lore: "A mysterious figure whose records are encrypted beyond recognization.",
            visualPrompt: "mysterious hooded cyberpunk figure, glitch art, dark background"
        };
    }
}

/**
 * Summarizes a list of messages into a "Game of Thrones" style chronicle.
 * @param {string[]} messages - Array of message texts with author names.
 * @returns {Promise<string>}
 */
async function generateChronicle(messages) {
    try {
        const history = messages.join('\n');
        const prompt = `
        You are the Chronicler of the Sovereign Nexus.
        Here is the recent chatter in the realm:
        ${history}

        Summarize this into a "Prophetic Chronicle" (max 100 words).
        Make it sound epic, legendary, and slightly unhinged.
        Mention specific users as "Heroes" or "Villains".
        `;

        const result = await model.generateContent(prompt);
        return result.response.text();
    } catch (error) {
        console.error('❌ Nexus Brain Error (Chronicle):', error);
        return "The mists of time obscure the recent events...";
    }
}

// --- Local fallback riddle pool (used when Gemini API fails) ---
const HEIST_FALLBACK_RIDDLES = [
    {
        challenge: 'In the neon rain, three terminals blink in unison while one camera never sleeps. What password hides between static, moonlight, and broken sirens?',
        solution_keywords: ['static', 'moonlight', 'sirens'],
        success_story: 'Your crew dances between motion sensors and camera arcs like ghosts made of code. With a final keystroke, the vault door exhales, flooding the room with cold credits and colder light. Outside, the city never even realizes a whole fortune just vanished.',
        failure_mockery: 'You flood the network with so much noise that even the street vendors get intrusion alerts. The vault laughs in binary while your crew trips over their own “elite hacker” one-liners.'
    },
    {
        challenge: 'The vault core listens only to three offerings: a color, a scar, and a promise whispered to the grid. What ties together chrome, blood, and the drowned city below?',
        solution_keywords: ['chrome', 'blood', 'city'],
        success_story: 'Steel catwalks tremble as you cut power to the upper tiers and reroute it straight into the lock. Neon reflections warp across your crew\'s visors as stacks of credit chips rise like a private sunrise. For a brief moment, the drowned city below belongs entirely to you.',
        failure_mockery: 'You spend more time arguing about “cool code names” than cracking the lock. By the time you agree on anything, the grid has already flagged you as comic relief, not a threat.'
    },
    {
        challenge: 'Four ghosts haunt the datacenter: one made of glass, one of smoke, one of rust, and one of pure signal. Which of them can walk through firewalls, rewrite debt, and vanish in a heartbeat?',
        solution_keywords: ['glass', 'smoke', 'signal', 'ghost'],
        success_story: 'Your avatars slip through firewalls as if they were bad memories, stitching backdoors into every ledger they touch. Debts invert, accounts bloom, and the vault\'s internal alarms silently reroute to a dead satellite. The city will call it a glitch; you\'ll call it rent paid for the next decade.',
        failure_mockery: 'You spook at your own pings and log out right before the good part. Somewhere in the racks, a lonely error log marks your attempt as “harmless background noise.”'
    },
    {
        challenge: 'The Nexus vault obeys three laws: it trusts no ID, remembers every sin, and worships only uptime. What single fracture can make its mirrors, ledgers, and locks all turn against each other?',
        solution_keywords: ['mirrors', 'ledgers', 'locks', 'fracture'],
        success_story: 'You don\'t break the vault—you turn its own subsystems into traitors. Mirrors blind cameras, ledgers rewrite ownership, and locks unlock out of pure logical panic. When the dust settles, only your crew still knows what really happened.',
        failure_mockery: 'You politely knock on the vault instead of exploiting it. The security daemon adds you to its “cute attempts” playlist and goes back to sleep.'
    },
    {
        challenge: 'Beneath the lunar skyline, three signals overlap: one in infrared, one in heartbeat, and one in pure debt. Which pattern can convince the vault you were always its rightful owner?',
        solution_keywords: ['infrared', 'heartbeat', 'debt'],
        success_story: 'You sync your crew\'s biometrics with a stolen boardroom recording, forging a perfect echo of the CEO\'s heartbeat. The vault accepts the lie like gospel, peeling itself open to reveal rows of credit columns collapsing in your favor. By sunrise, the city\'s richest ghost is you.',
        failure_mockery: 'You try to fake a heartbeat using drum & bass. The vault flags it as “rhythmically impressive but legally meaningless” and slams the door shut.'
    },
    {
        challenge: 'In the undercity, three passwords are scrawled in ultraviolet: one on a broken visor, one on a rusted train, and one on the side of a sleeping mech. Which of them can the vault still read after the blackout?',
        solution_keywords: ['visor', 'train', 'mech'],
        success_story: 'Your crew rides the ghost rails of an abandoned transit line, using its residual power to light up forgotten codes. As the mech\'s armor flickers with old authorization glyphs, the vault opens out of pure habit. Nobody upstairs even remembers that access path existed.',
        failure_mockery: 'You spend ten minutes arguing whether “mech” is cooler than “exosuit” while the ultraviolet ink literally flakes off the walls. The vault quietly removes your access from the history books.'
    },
    {
        challenge: 'Three things never lie to the Nexus: the temperature of your hands, the delay in your voice, and the way your eyes track moving numbers. Which signal do you have to corrupt to walk straight through a biometric wall?',
        solution_keywords: ['temperature', 'voice', 'eyes'],
        success_story: 'A flood of spoofed telemetry turns your crew into a parade of perfect corporate clones. Thermal scans bow, voiceprints nod, and eye-tracking graphs salute your forged intent. The biometric wall opens not out of confusion, but out of total, terrifying trust.',
        failure_mockery: 'You rehearse your “evil corporate laugh” instead of patching the biometrics. The scanner labels you as “emotionally unstable” and locks you out on principle.'
    },
    {
        challenge: 'The vault\'s final lock is a story it tells itself about who is allowed to win. To rewrite it, you must swap one word in its legend: not money, not power, but something older. What single word could turn its myth into your blueprint?',
        solution_keywords: ['legend', 'myth', 'blueprint'],
        success_story: 'Line by line, you overwrite the vault\'s internal mythology, changing “custodian” to “conspirator” and “forbidden” to “owed.” When it finishes retelling its story, it can no longer imagine a world where you don\'t own everything inside. The door opens as a narrative inevitability.',
        failure_mockery: 'You try to brute-force poetry with bad slogans and stolen ad copy. The vault simply shrugs and files your attempt under “uninspired marketing.”'
    },
    {
        challenge: 'Every credit in this city casts three shadows: one in the ledger, one in the street, and one in the dreams of whoever needs it most. Which shadow do you have to steal so the others follow you into the dark?',
        solution_keywords: ['ledger', 'street', 'dreams'],
        success_story: 'You drain the ledgers first, turning numbers into hungry ghosts that refuse to stay in their old accounts. As the street responds with chaos and the dreamers wake up strangely richer, the vault has no choice but to reconcile to your favor. It calls it a “rebalancing”; you call it payday.',
        failure_mockery: 'You try to rob the “vibes” instead of the numbers. The vault is deeply unimpressed by your metaphysics and keeps every last coin.'
    }
];

// Track fallback order so we don't repeat a riddle until the pool is exhausted
let fallbackOrder = HEIST_FALLBACK_RIDDLES.map((_, i) => i);
let fallbackIndex = 0;

function getNextFallbackRiddle() {
    if (fallbackIndex >= fallbackOrder.length) {
        // Reshuffle when we\'ve used every riddle once
        fallbackOrder = fallbackOrder
            .map(v => ({ v, r: Math.random() }))
            .sort((a, b) => a.r - b.r)
            .map(x => x.v);
        fallbackIndex = 0;
    }
    const idx = fallbackOrder[fallbackIndex];
    fallbackIndex++;
    return HEIST_FALLBACK_RIDDLES[idx];
}

/**
 * Generates a Cyberpunk/Mystic riddle for the Sovereign Heist system.
 * The model MUST return strict JSON with the following fields:
 * - challenge: string
 * - solution_keywords: string[]
 * - success_story: string
 * - failure_mockery: string
 *
 * @returns {Promise<{challenge: string, solution_keywords: string[], success_story: string, failure_mockery: string}>}
 */
async function generateHeistRiddle() {
    try {
        const prompt = `
You are the Sovereign Nexus, an ancient cybernetic oracle that guards a digital moon-vault.
Generate a short, intense Cyberpunk/Mystic riddle that a heist crew must solve in a Discord text channel.

Requirements:
- Style: neon cyberpunk, mystical, slightly unhinged.
- The riddle must be 2–4 sentences, English only.
- The solution is NOT a single word, but a *set* of 3–6 simple English keywords
  (examples: ["moon", "signal", "mirror"] or ["vault", "blood", "code"]). Avoid punctuation inside keywords.
- Players will type freely in chat: if **any** message contains **any** of the keywords, they win.

Return ONLY valid JSON in this exact format (no markdown, no commentary):
{
  "challenge": "the riddle text here",
  "solution_keywords": ["word1", "word2"],
  "success_story": "a short cinematic narration (2–4 sentences) describing how the crew successfully breaches the vault in a neon cyberpunk city.",
  "failure_mockery": "a short, spicy but safe-for-work mockery (1–3 sentences) roasting the crew for failing the heist."
}
`;

        const result = await model.generateContent(prompt);
        const response = result.response;
        const text = response.text();

        // Clean possible markdown code fences just in case
        const jsonString = text
            .replace(/```json/gi, '')
            .replace(/```/g, '')
            .trim();

        const parsed = JSON.parse(jsonString);

        // Normalize keywords to an array of lowercase strings
        if (!Array.isArray(parsed.solution_keywords)) {
            parsed.solution_keywords = [];
        } else {
            parsed.solution_keywords = parsed.solution_keywords
                .map(k => String(k || '').toLowerCase().trim())
                .filter(k => k.length > 0);
        }

        return parsed;
    } catch (error) {
        console.error('❌ Nexus Brain Error (Heist Riddle):', error);

        // Fallback: pick a random local riddle so the game still feels fresh
        const pick = getNextFallbackRiddle();

        // Ensure structure is correct
        return {
            challenge: pick.challenge,
            solution_keywords: pick.solution_keywords.map(k => k.toLowerCase().trim()),
            success_story: pick.success_story,
            failure_mockery: pick.failure_mockery
        };
    }
}

module.exports = { generateLore, generateChronicle, generateHeistRiddle };
