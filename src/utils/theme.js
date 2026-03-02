// 🌑 MOON NEXUS THEME DEFINITION
module.exports = {
    // 🎨 Color Palette
    COLORS: {
        PRIMARY: '#0F1115',   // Modern Dark Base (Readable)
        SECONDARY: '#141821', // Dark Surface
        ACCENT: '#6AE4FF',    // Icy Cyan
        ERROR: '#FF4D6D',     // Modern Red
        SUCCESS: '#2DFFB3',   // Neon Mint
        WARNING: '#FFD36A',   // Warm Amber
        GRAVITY: '#090A0D'    // Ultra Dark (Footers/Borders)
    },

    // 🖼️ Icons & Assets
    ICONS: {
        MOON_FULL: 'https://cdn-icons-png.flaticon.com/512/11529/11529141.png', // HD Moon Render
        MOON_CRESCENT: 'https://cdn-icons-png.flaticon.com/512/3594/3594273.png',
        SATELLITE: '🛰️',
        HAMMER: '🔨',
        SHIELD: '🛡️',
        CHECK: '✅',
        CROSS: '❌'
    },

    // 🎞️ Animation Frames (Moon Phases)
    // Used for "Thinking" or "Loading" states
    ANIMATIONS: {
        LOADING: [
            '🌑 Initiating Sequence...',
            '🌒 Calibrating Sensors...',
            '🌓 Synchronizing Orbit...',
            '🌔 Receiving Transmission...',
            '🌕 Data Acquired.'
        ],
        SEARCHING: [
            '🔍 Scanning Sector 1...',
            '📡 Pinging Satellites...',
            '🔭 Locking Target...'
        ],
        EXECUTING_BAN: [
            '⚖️ Judging Soul...',
            '🔨 Charging Heavy Cannon...',
            '💥 Ejecting from Atmosphere...'
        ]
    },

    // 📝 Standardized Footers
    FOOTER: {
        text: 'Sovereign Nexus • Lunar Operations',
        iconURL: 'https://cdn-icons-png.flaticon.com/512/11529/11529141.png'
    },

    makeEmbed(EmbedBuilder, variant = 'PRIMARY') {
        const color = this.COLORS[variant] || this.COLORS.PRIMARY;
        return new EmbedBuilder()
            .setColor(color)
            .setFooter({ text: this.FOOTER.text, iconURL: this.FOOTER.iconURL })
            .setTimestamp();
    }
};
