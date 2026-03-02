const { SpotifyPlugin } = require('@distube/spotify');

class SmartSpotifyPlugin extends SpotifyPlugin {
    constructor(options = {}) {
        super(options);
    }

    init(distube) {
        this.distube = distube;
        // Call super.init if it exists (it might not, but good practice to check)
        if (super.init) super.init(distube);
    }

    async resolve(url, options) {
        console.log(`🧠 SmartSpotifyPlugin.resolve called for: ${url}`);
        // 1. Resolve using original Spotify logic to get metadata
        const result = await super.resolve(url, options);

        // 2. If it's a Playlist, return as is (too expensive to resolve all now)
        // DisTube will handle searching for each track later.
        if (result.type === 'playlist') {
            return result;
        }

        // 3. For single tracks, perform strict search on SoundCloud
        try {
            const query = `${result.name} ${result.uploader.name}`;
            console.log(`🔎 Smart Search for: "${query}" (Duration: ${result.duration}s)`);

            // Search explicitly on SoundCloud
            // We use the 'track' filter and limit to 5 results
            // Note: We need to access the SoundCloud plugin or generic search. 
            // DisTube.search uses all plugins. If we disabled YtDlp, it uses SoundCloud.
            const searchResults = await this.distube.search(query, {
                limit: 10,
                type: 'video', // DisTube terminology for track
                safeSearch: false
            });

            // 4. Find best match based on duration (tolerance +/- 5 seconds)
            if (!searchResults || searchResults.length === 0) {
                console.log('⚠️ Smart Search: No results found on SoundCloud.');
                return result; // Fallback to Spotify (will likely fail to play)
            }

            const bestMatch = searchResults.find(track => {
                const diff = Math.abs(track.duration - result.duration);
                return diff < 10; // Increased tolerance to 10s
            });

            if (bestMatch) {
                console.log(`✅ Smart Search: Match Found! "${bestMatch.name}" (Diff: ${Math.abs(bestMatch.duration - result.duration)}s) URL: ${bestMatch.url}`);
                return bestMatch;
            } else {
                console.log(`⚠️ Smart Search: No exact duration match. Falling back to first result: "${searchResults[0].name}" URL: ${searchResults[0].url}`);
                return searchResults[0]; // FORCE Fallback to the first result so it PLAYS
            }
        } catch (e) {
            console.error('❌ Smart Search Error:', e);
        }

        return result;
    }
}

module.exports = SmartSpotifyPlugin;
