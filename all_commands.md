# 🤖 ELORA Bot - Complete Command Guide

---

## 🎯 **Prefix Systems**

The bot uses **two prefix systems**:

### ✨ Natural Prefix
```
elora <command> [arguments]
```

### ⚡ Classic Prefix  
```
!<command> [arguments]
```

---

## 💰 **Economy Commands** *(elora prefix)*

### 💳 **Balance & Money**

| Command | Aliases | Usage | Description |
|---------|---------|-------|-------------|
| `elora bal` | balance, money, wallet | `elora bal @user?` | Check wallet/bank balance |
| `elora dep` | deposit | `elora dep <amount|all>` | Move coins to bank |
| `elora with` | withdraw | `elora with <amount|all>` | Move coins to wallet |
| `elora give` | - | `elora give @user <amount>` | Send coins to user |
| `elora daily` | - | `elora daily` | Claim daily reward |
| `elora leaderboard` | - | `elora leaderboard <xp|balance>` | View top users |

### 🏠 **Life Simulation**

| Command | Description |
|---------|-------------|
| `elora life-assets` | View your properties & assets |
| `elora life-buy` | Buy properties/vehicles |
| `elora life-family` | Manage family members |
| `elora life-job` | Job system & careers |
| `elora life-partner` | Marriage & partnerships |
| `elora life-shop` | Life simulation shop |

---

## 🎲 **Gambling Commands** *(elora prefix)*

| Command | Aliases | Usage | Description |
|---------|---------|-------|-------------|
| `elora coinflip` | cf, flip | `elora cf <amount> <heads|tails>` | 2x payout coin flip |
| `elora slots` | slot | `elora slots <amount>` | 3-reel slot machine |
| `elora blackjack` | bj, 21 | `elora bj <amount>` | Play 21 vs dealer |
| `elora crash` | - | `elora crash <amount>` | Multiplier climbing game |

---

## 👥 **Social Commands** *(elora prefix)*

| Command | Usage | Description |
|---------|-------|-------------|
| `elora work` / `elora job` | `elora work` | Earn coins with jobs |
| `elora shop` | `elora shop` | View item shop |
| `elora rob` | `elora rob @user` | Steal coins (risky) |
| `elora confess` | `/confess <message>` | Anonymous confessions |
| `elora rizz` | `elora rizz` | Social interactions |

---

## ⚙️ **Admin Commands** *(elora prefix)*

### 💸 **Money Management**

| Command | Aliases | Usage | Description |
|---------|---------|-------|-------------|
| `elora addmoney` | add | `elora addmoney @user <amount>` | Add coins to user |
| `elora removemoney` | remove, rm | `elora removemoney @user <amount|all>` | Remove coins from user |

### 👑 **Role Management**

| Command | Aliases | Usage | Description |
|---------|---------|-------|-------------|
| `elora role` | addrole, giverole | `elora role @user <role_name>` | Assign role to user |
| `elora del role` | rem role, remove role | `elora del role @user <role_name>` | Remove role from user |

### 🔧 **Server Management**

| Command | Description |
|---------|-------------|
| `elora jail` | Jail users (economy punishment) |
| `elora unjail` | Release jailed users |
| `elora reset` | Reset user economy data |
| `elora lock` | Lock channels |
| `elora unlock` | Unlock channels |
| `elora nick` | Change nicknames |

---

## 🔨 **Moderation Commands** *(classic prefix: !)*

| Command | Slash Version | Usage | Description |
|---------|---------------|-------|-------------|
| `!ban` | `/ban` | `!ban @user [reason]` | Ban from server |
| `!kick` | `/kick` | `!kick @user [reason]` | Kick from server |
| `!warn` | `/warn` | `!warn @user [reason]` | Warn user |
| `!timeout` | `/timeout` | `!timeout @user <minutes> [reason]` | Timeout user |
| `!clear` | `/clear` | `!clear <amount> [@user]` | Delete messages |
| `!mod-config` | - | `!mod-config` | Configure moderation |
| `!mod-dashboard` | - | `!mod-dashboard` | View moderation stats |

---

## 🎵 **Music Commands** *(elora prefix)*

| Command | Description |
|---------|-------------|
| `elora play` | Play music |
| `elora pause` | Pause music |
| `elora resume` | Resume music |
| `elora skip` | Skip current track |
| `elora stop` | Stop music |
| `elora queue` | View song queue |
| `elora 247` | Enable 24/7 mode |

---

## 🔐 **Security Commands** *(elora prefix)*

| Command | Description |
|---------|-------------|
| `elora blacklist` | Manage user blacklist |
| `elora panic` | Emergency security mode |
| `elora setup-verify` | Setup verification system |
| `elora setup-welcome` | Setup welcome messages |

---

## 🛠️ **Utility Commands** *(elora prefix)*

| Command | Description |
|---------|-------------|
| `elora chat` | AI chat interaction |
| `elora pic` | Generate images |
| `elora setup-intro` | Setup intro channel |
| `elora setup-rules` | Setup server rules |
| `elora setup-ticket` | Setup ticket system |
| `elora setup-welcome` | Setup welcome system |
| `elora setup-confessions` | Setup confession channel |
| `elora bumpreminder` | Server bump reminder |

---

## 📊 **Quick Stats**

| Category | Prefix | Commands | Examples |
|----------|--------|----------|----------|
| 💰 **Economy** | `elora` | 15+ | `bal`, `dep`, `daily`, `give` |
| 🎲 **Gambling** | `elora` | 4 | `coinflip`, `slots`, `blackjack` |
| 👥 **Social** | `elora` | 5+ | `work`, `shop`, `rob`, `confess` |
| ⚙️ **Admin** | `elora` | 10 | `addmoney`, `del`, `role`, `jail` |
| 🔨 **Moderation** | `!` | 7 | `ban`, `kick`, `warn`, `clear` |
| 🎵 **Music** | `elora` | 8 | `play`, `pause`, `skip`, `stop` |
| 🔐 **Security** | `elora` | 4 | `blacklist`, `panic`, `setup-verify` |
| 🛠️ **Utility** | `elora` | 9+ | `chat`, `pic`, `setup-*` |

---

## 🔑 **Important Info**

- **Total Commands**: 62+ prefix commands + slash commands
- **Main Prefixes**: `elora` (natural) and `!` (classic)
- **Permission Levels**: User, Admin, Moderator
- **Special Features**: Life simulation, economy, gambling, role management
- **Channel Restrictions**: Some commands limited to specific channels

---

## 📁 **Command File Locations**

### 📂 Admin Commands
```
src/commands/admin/
├── addmoney.js
├── del.js
├── jail.js
├── lock.js
├── nick.js
├── removemoney.js
├── reset.js
├── role.js
├── unjail.js
└── unlock.js
```

### 📂 Economy Commands
```
src/commands/economy/
├── bal.js
├── balance.js
├── daily-prefix.js
├── daily.js
├── dep.js
├── give.js
├── leaderboard-prefix.js
├── leaderboard.js
├── life-assets.js
├── life-buy.js
├── life-family.js
├── life-job.js
├── life-partner.js
├── life-shop.js
└── with.js
```

### 📂 Gambling Commands
```
src/commands/gambling/
├── blackjack.js
├── coinflip.js
├── crash.js
└── slots.js
```

### 📂 Moderation Commands
```
src/commands/moderation/
├── ban.js
├── clear.js
├── kick.js
├── mod-config.js
├── mod-dashboard.js
├── timeout.js
└── warn.js
```

### 📂 Music Commands
```
src/commands/music/
├── 247.js
├── pause.js
├── play-old.js
├── play.js
├── queue.js
├── resume.js
├── skip.js
└── stop.js
```

### 📂 Security Commands
```
src/commands/security/
├── blacklist.js
├── panic.js
├── setup-verify.js
└── setup-welcome.js
```

---

## 🎯 **Quick Reference Examples**

### 💰 Money Management
```bash
elora bal                    # Check your balance
elora dep 1000              # Deposit 1000 coins
elora give @user 500        # Give 500 coins to user
elora daily                 # Claim daily reward
```

### 🎲 Gambling
```bash
elora cf 100 heads          # Coinflip 100 coins on heads
elora slots 50              # Play slots with 50 coins
elora bj 200                # Blackjack with 200 coins
```

### ⚙️ Admin
```bash
elora addmoney @user 1000   # Add 1000 coins to user
elora role @user VIP        # Give VIP role
elora del role @user VIP    # Remove VIP role
elora jail @user            # Jail user
```

### 🔨 Moderation
```bash
!ban @user Breaking rules   # Ban user with reason
!kick @user Spamming        # Kick user
!clear 50                   # Clear last 50 messages
```

---

**🤖 ELORA Discord Bot - Complete Command Reference**
*Generated: $(date)*
*Version: Latest*
