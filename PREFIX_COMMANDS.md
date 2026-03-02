## ELORA Prefix Commands Cheat Sheet

This bot supports **two prefix systems**:

- **Natural prefix**: `elora <command> ...`
- **Classic prefix**: `<configured_prefix><command> ...` (for example: `!ban`, `!kick`, etc.)

Below is a quick reference for the main **economy, gambling, social, admin and moderation** commands.

---

### Economy (ELORA prefix)

- **Balance**
  - **Command**: `elora bal @user?`
  - **Description**: Shows wallet / bank / total balance for you or the mentioned user.

- **Deposit**
  - **Command**: `elora dep <amount|all>`
  - **Description**: Move coins from wallet to bank.

- **Withdraw**
  - **Command**: `elora with <amount|all>`
  - **Description**: Move coins from bank to wallet.

- **Give**
  - **Command**: `elora give @user <amount>`
  - **Description**: Send coins from your wallet to another user.

- **Daily**
  - **Command**: `elora daily`
  - **Description**: Claim your daily coins (24h cooldown).

- **Leaderboard**
  - **Command**: `elora leaderboard <xp|balance>`
  - **Description**: Shows top users by XP or balance.

---

### Gambling (ELORA prefix)

- **Coinflip**
  - **Command**: `elora coinflip <amount> <heads|tails>`
  - **Aliases**: `elora cf`, `elora flip`
  - **Description**: 2x payout if you guess the side correctly.

- **Slots**
  - **Command**: `elora slots <amount>`
  - **Aliases**: `elora slot`
  - **Description**: Classic 3‑reel slot machine with jackpot support.

- **Blackjack**
  - **Command**: `elora blackjack <amount>`
  - **Aliases**: `elora bj`, `elora 21`
  - **Description**: Play 21 vs the dealer.

- **Crash**
  - **Command**: `elora crash <amount>`
  - **Description**: Multiplier climbs until it crashes; win or lose is simulated automatically.

---

### Social (ELORA prefix)

- **Work**
  - **Command**: `elora work`
  - **Aliases**: `elora job`
  - **Description**: Earn coins every few hours with a random job.

- **Shop**
  - **Command**: `elora shop`
  - **Description**: Show buyable items and their prices.

- **Rob**
  - **Command**: `elora rob @user`
  - **Description**: Attempt to steal coins from another user (if implemented in your build).

- **Confess**
  - **Slash**: `/confess`
  - **Note**: This command is **slash-only** in the current codebase; there is no `elora confess` handler yet.

---

### Admin (ELORA prefix)

- **Add Money**
  - **Command**: `elora addmoney @user <amount>`
  - **Aliases**: `elora add`
  - **Description**: Add coins to a user’s wallet (admin only).

- **Remove Money**
  - **Command**: `elora removemoney @user <amount|all>`
  - **Aliases**: `elora remove`, `elora rm`
  - **Description**: Remove coins from a user (admin only).

- **Jail / Unjail / Reset**
  - **Commands**: `elora jail`, `elora unjail`, `elora reset`
  - **Description**: Economy punishment and reset tools (exact usage based on arguments; see command files).

---

### Moderation (classic prefix)

These are **hybrid**: they work as **slash commands** and as **classic prefix** commands using `client.config.prefix` (for example `!`).

- **Ban**
  - **Slash**: `/ban`
  - **Prefix**: `!ban @user [reason]`

- **Kick**
  - **Slash**: `/kick`
  - **Prefix**: `!kick @user [reason]`

- **Warn**
  - **Slash**: `/warn`
  - **Prefix**: `!warn @user [reason]`

- **Timeout**
  - **Slash**: `/timeout`
  - **Prefix**: `!timeout @user <minutes> [reason]`

- **Clear**
  - **Slash**: `/clear`
  - **Prefix**: `!clear <amount> [@user]`

---

### Music & Utility

Most music and utility features are currently **slash-first**, for example:

- `/play`, `/pause`, `/resume`, `/skip`, `/stop`, `/queue`
- `/chat`, `/pic`, `/setup-intro`, `/setup-rules`, `/setup-ticket`, `/setup-welcome`, `/setup-confessions`, `/bumpreminder`

Some moderation commands are already hybrid, but **music and setup commands do not yet have dedicated `elora` prefix wrappers** in this codebase.

If you want, the next step can be:
- Add `elora` prefix versions for music + utility (e.g. `elora play`, `elora chat`, etc.) by wiring them into the `prefixCommandHandler` and adapting their execute functions to support both message and interaction inputs.

