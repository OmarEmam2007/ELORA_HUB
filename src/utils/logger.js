const LEVELS = {
    silent: 0,
    error: 1,
    warn: 2,
    info: 3,
    debug: 4,
};

function normalizeLevel(value) {
    const v = String(value || '').toLowerCase().trim();
    if (v in LEVELS) return v;
    return 'info';
}

function shouldLog(currentLevel, msgLevel) {
    return LEVELS[msgLevel] <= LEVELS[currentLevel];
}

function formatArgs(args) {
    const ts = new Date().toISOString();
    return [`[${ts}]`, ...args];
}

function initLogging() {
    const level = normalizeLevel(process.env.LOG_LEVEL);

    const raw = {
        log: console.log.bind(console),
        info: console.info.bind(console),
        warn: console.warn.bind(console),
        error: console.error.bind(console),
        debug: console.debug ? console.debug.bind(console) : console.log.bind(console),
    };

    console.debug = (...args) => {
        if (!shouldLog(level, 'debug')) return;
        raw.debug(...formatArgs(args));
    };

    console.log = (...args) => {
        if (!shouldLog(level, 'info')) return;
        raw.log(...formatArgs(args));
    };

    console.info = (...args) => {
        if (!shouldLog(level, 'info')) return;
        raw.info(...formatArgs(args));
    };

    console.warn = (...args) => {
        if (!shouldLog(level, 'warn')) return;
        raw.warn(...formatArgs(args));
    };

    console.error = (...args) => {
        if (!shouldLog(level, 'error')) return;
        raw.error(...formatArgs(args));
    };

    console.log(`Logging initialized (LOG_LEVEL=${level})`);
}

module.exports = { initLogging };
