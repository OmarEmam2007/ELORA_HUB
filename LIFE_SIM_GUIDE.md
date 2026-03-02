# 🌙 ELORA LIFE SIM - COMPLETE GUIDE

## 🎮 What Was Built

A **complete, intelligent, prefix-first life simulation economy** integrated into your Discord bot.

---

## 📋 Commands Available

### **Family/Dynasty Commands**
- `elora family create <name>` - Create a dynasty (50k coins)
- `elora family invite <@user>` - Invite member to dynasty
- `elora family bank dep <amount>` - Deposit to dynasty treasury
- `elora family bank with <amount>` - Withdraw from dynasty treasury (head only)
- `elora family info` - View complete dynasty dashboard

### **Shop & Assets**
- `elora shop life` - View all properties and vehicles for sale
- `elora buy property <ID>` - Purchase a property (e.g., PROP-001)
- `elora buy vehicle <ID>` - Purchase a vehicle (e.g., VEH-001)
- `elora assets` - View your complete portfolio

### **Partnerships**
- `elora partner propose <@user>` - Propose economic partnership (100k)
- `elora partner accept <ID>` - Accept partnership proposal
- `elora partner status` - View active partnership buffs
- `elora partner dissolve` - End partnership (50% penalty)

### **Jobs & Work**
- `elora job board` - View all available careers
- `elora job work` - Earn income (3h cooldown, reduced by vehicles)
- `elora job promotion` - Check next career tier

---

## 🏗️ Properties Available

1. **PROP-001** - Modern Loft (50k) - +2k/day, 3% tax
2. **PROP-002** - Suburban House (150k) - +5k/day, 4% tax
3. **PROP-003** - Luxury Villa (500k) - +20k/day, 5% tax
4. **PROP-004** - Grand Mansion (1.5M) - +60k/day, 6% tax
5. **PROP-005** - Royal Estate (5M) - +250k/day, 7% tax

---

## 🚗 Vehicles Available

1. **VEH-001** - Economy Car (30k) - -10% work cooldown, 2% tax
2. **VEH-002** - Sports Car (200k) - -20% work cooldown, 3% tax
3. **VEH-003** - Luxury Vehicle (800k) - -25% work cooldown, 4% tax
4. **VEH-004** - Private Jet (5M) - -30% work cooldown, 5% tax

---

## 💼 Career Tiers

1. **Intern** - 500 coins (Level 1+)
2. **Junior Developer** - 1,500 coins (Level 3+)
3. **Mid-Level Developer** - 4,000 coins (Level 5+)
4. **Senior Developer** - 10,000 coins (Level 8+)
5. **Tech Lead** - 25,000 coins (Level 12+)
6. **CTO** - 60,000 coins (Level 15+)

---

## 🤖 Automatic Features

### **24-Hour Daily Cycle**
- **Passive Income**: All properties pay daily income automatically
- **Tax Collection**: Assets are taxed daily
- **Repossessions**: Assets are repossessed if taxes can't be paid
- **Role Management**: Tax delinquent role assigned automatically

### **Smart Role Assignment**
- **Dynasty Head**: Assigned when creating a family
- **Dynasty Member**: Assigned when joining a family
- **Economic Partner**: Assigned when partnership is active
- **High Net Worth**: Auto-assigned at 500k+ net worth
- **Tax Delinquent**: Auto-assigned when taxes fail

---

## 📊 Intelligent Systems

### **Dynamic Economy**
- Net worth calculations include wallet, bank, properties, vehicles, and family shares
- High Net Worth role updates automatically on major transactions
- Tax rates scale with asset value

### **Partnership Buffs**
- +10% work income bonus
- -15% tax reduction
- Both partners receive buffs

### **Vehicle Benefits**
- Reduces work cooldown by 10-30% depending on vehicle
- Multiple vehicles stack (uses highest reduction)

### **Family Benefits**
- Shared treasury for group investments
- Family-owned assets generate passive income to treasury
- Head can withdraw, all members can deposit

---

## 🎨 UI Features

- **Beautiful embeds** using your theme colors
- **City announcements** for major events
- **Portfolio dashboards** with complete asset breakdowns
- **Smart error messages** with helpful guidance
- **No code blocks** - clean, modern Gen Z UI

---

## 🔧 Technical Details

### **Database Models**
- `Family.js` - Dynasty management
- `Property.js` - Property ownership
- `Vehicle.js` - Vehicle ownership
- `Relationship.js` - Economic partnerships

### **Service Layer**
- `lifeSimService.js` - All intelligent logic and calculations

### **Commands**
- All commands in `src/commands/economy/life-*.js`
- Fully integrated with prefix handler

### **Automation**
- 24h cron job in `bot.js` (runs at midnight UTC)
- Logs to `#life-sim-logs`
- Announcements to `#city-hall`

---

## 🚀 Getting Started

1. **Start the bot** - All commands are ready to use
2. **Create a family**: `elora family create MyDynasty`
3. **Buy assets**: `elora shop life` then `elora buy property PROP-001`
4. **Work**: `elora job work` to earn income
5. **Check portfolio**: `elora assets` to see everything

---

## ⚠️ Important Notes

- **Tax Delinquent role** blocks certain commands (buy, withdraw)
- **Family head** is the only one who can withdraw from treasury
- **Partnerships** require 100k upfront cost
- **Work cooldown** is 3 hours (reduced by vehicles)
- **Daily cycle** runs automatically at midnight UTC

---

**Built with ❤️ for ELORA**
