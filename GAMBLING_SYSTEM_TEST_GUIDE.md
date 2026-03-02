# 🎰 Complete Gambling System Testing Guide

## Prerequisites
1. Make sure the bot is running
2. Ensure you have the required channels:
   - `Gambling-Hall` (ID: 1467465229675003925)
   - `Jackpot` (ID: 1467465840558608385)
   - `Casino-Logs` (ID: 1467466000214655150)
3. Ensure bot has permissions in all channels

---

## 📋 Testing Checklist

### 1. **Economy Commands** (Can be used anywhere)

#### ✅ Balance Check
```
elora bal
elora balance
elora money
elora wallet
```
**Expected:** Shows wallet, bank, and total balance

#### ✅ Deposit
```
elora dep 1000
elora deposit 500
```
**Expected:** Money moves from wallet to bank

#### ✅ Withdraw
```
elora with 500
elora withdraw all
elora with all
```
**Expected:** Money moves from bank to wallet

#### ✅ Daily Reward
```
elora daily
```
**Expected:** 
- First time: Get 500-1000 coins
- Second time (within 24h): Shows cooldown message
- After 24h: Can claim again

#### ✅ Give/Transfer
```
elora give @user 1000
elora pay @user 500
elora transfer @user 2000
```
**Expected:**
- 5% tax applied (total cost = amount + tax)
- Money transferred to target user
- Test with **The Whale** role (💸💸💸💸💸💸💸) - should have 0% tax

#### ✅ Leaderboard
```
elora leaderboard
elora lb
elora top
elora leaderboard xp
elora leaderboard level
```
**Expected:** Shows top 10 users by money or XP

---

### 2. **Gambling Commands** (ONLY in Gambling-Hall channel)

#### ✅ Slots
```
elora slots 1000
elora slot 5000
elora slots 50000
```
**Test Cases:**
- ✅ Normal bet (under 50k)
- ✅ Max bet (50k) - should work
- ✅ Over max bet (60k) - should fail
- ✅ With **High Roller** role (💸💸💸💸) - max bet should be 100k
- ✅ Check for jackpot (3 💎) - should post in Jackpot channel
- ✅ Check casino logs for entries

#### ✅ Blackjack
```
elora blackjack 1000
elora bj 5000
elora 21 10000
```
**Test Cases:**
- ✅ Normal bet
- ✅ Max bet (50k)
- ✅ Over max bet - should fail
- ✅ High Roller role - max bet 100k
- ✅ Test different outcomes:
  - Blackjack (21 with 2 cards) - 2.5x payout
  - Win - 2x payout
  - Dealer bust - 2x payout
  - Push - return bet
  - Lose - lose bet
- ✅ Check casino logs

#### ✅ Crash
```
elora crash 1000
elora crash 5000
```
**Test Cases:**
- ✅ Normal bet
- ✅ Max bet limits
- ✅ High Roller role
- ✅ Check multiplier display
- ✅ Check win/loss outcomes
- ✅ Check casino logs

#### ✅ Coinflip
```
elora coinflip 1000 heads
elora coinflip 5000 tails
elora cf 2000 h
elora flip 3000 t
```
**Test Cases:**
- ✅ Normal bet with heads/tails
- ✅ Short form (h/t)
- ✅ Max bet limits
- ✅ High Roller role
- ✅ Win (2x payout)
- ✅ Loss
- ✅ Check casino logs

#### ❌ Channel Restriction Test
Try using gambling commands in OTHER channels (not Gambling-Hall):
```
elora slots 1000  (in general chat)
elora blackjack 5000  (in general chat)
```
**Expected:** Error message telling you to use Gambling-Hall

---

### 3. **Social Commands**

#### ✅ Work
```
elora work
elora job
```
**Test Cases:**
- ✅ First time: Get 50-600 coins
- ✅ Second time (within 3 hours): Shows cooldown
- ✅ After 3 hours: Can work again

#### ✅ Rob
```
elora rob @user
elora steal @user
```
**Test Cases:**
- ✅ Target has money (100+ coins)
- ✅ Target has less than 100 coins - should fail
- ✅ Success (50% chance) - steal 20-50% of wallet
- ✅ Failure - lose 10% of wallet (max 500 coins)
- ✅ Target with **Safe Keeper** role (✓ Safe Keeper) - should fail with protection message
- ✅ Check casino logs for both success and failure

#### ✅ Shop
```
elora shop
elora store
elora market
```
**Test Cases:**
- ✅ View shop - shows all items
- ✅ Buy item:
  ```
    
  elora shop safe_vault
  elora shop double_daily
  elora shop xp_boost
  ```
- ✅ Insufficient funds - should fail
- ✅ Already owned item - should fail
- ✅ Successful purchase - item added to inventory

---

### 4. **Admin Commands**

#### ✅ Add Money (Admin only)
```
elora addmoney @user 10000
elora add @user 5000
```
**Test Cases:**
- ✅ Without admin role - should fail
- ✅ With admin role (⋮ ᴇʟᴏʀᴀ ᴀᴅᴍɪɴ) - should work
- ✅ Check casino logs

#### ✅ Remove Money (Admin only)
```
elora removemoney @user 5000
elora remove @user 2000
elora rm @user 1000
```
**Test Cases:**
- ✅ Without admin role - should fail
- ✅ With admin role - should work
- ✅ More than user has - should set to 0
- ✅ Check casino logs

#### ✅ Reset (Admin only)
```
elora reset @user
```
**Test Cases:**
- ✅ Without admin role - should fail
- ✅ With admin role - resets wallet, bank, inventory
- ✅ Check casino logs

#### ✅ Jail (Mod/Admin)
```
elora jail @user 2
```
**Test Cases:**
- ✅ Without mod/admin role - should fail
- ✅ With moderator role (⚠︎ ᴇʟᴏʀᴀ ᴍᴏᴅᴇʀᴀᴛᴏʀ) - should work
- ✅ With admin role - should work
- ✅ User gets jailed role (皿 ᴊᴀɪʟᴇᴅ)
- ✅ Jailed user tries commands - should fail with "You are currently Jailed"
- ✅ Check casino logs

#### ✅ Unjail (Mod/Admin)
```
elora unjail @user
```
**Test Cases:**
- ✅ Without mod/admin role - should fail
- ✅ With mod/admin role - removes jailed role
- ✅ User can use commands again
- ✅ Check casino logs

---

### 5. **Role-Based Features**

#### ✅ The Whale Role (💸💸💸💸💸💸💸)
- ✅ Test `elora give @user 1000`
- ✅ Should have **0% tax** (no tax message)
- ✅ Without role: 5% tax applied

#### ✅ High Roller Role (💸💸💸💸)
- ✅ Test `elora slots 60000` - should work (2x max bet)
- ✅ Test `elora blackjack 100000` - should work
- ✅ Test `elora crash 100000` - should work
- ✅ Test `elora coinflip 100000 heads` - should work
- ✅ Without role: Max bet is 50k

#### ✅ Safe Keeper Role (✓ Safe Keeper)
- ✅ User with this role cannot be robbed
- ✅ `elora rob @safekeeper_user` - should fail with protection message

#### ✅ Jailed Role (皿 ᴊᴀɪʟᴇᴅ)
- ✅ User with this role cannot use ANY commands
- ✅ All commands return: "You are currently Jailed and cannot participate"
- ✅ Auto-unjail when time expires

---

### 6. **Cooldown System**

#### ✅ Command Cooldown (7 seconds)
```
elora bal
elora bal  (immediately after)
```
**Expected:** Second command shows cooldown message

#### ✅ Daily Cooldown (24 hours)
- Test claiming daily twice quickly
- Should show hours/minutes remaining

#### ✅ Work Cooldown (3 hours)
- Test working twice quickly
- Should show hours/minutes remaining

---

### 7. **Edge Cases & Error Handling**

#### ✅ Insufficient Funds
- Try betting more than you have
- Try giving more than you have
- Try withdrawing more than in bank

#### ✅ Invalid Inputs
```
elora slots abc
elora dep -100
elora give @user
elora coinflip 1000 invalid
```

#### ✅ Missing Users
- Try commands with invalid user mentions
- Try commands with bot users

#### ✅ Database Edge Cases
- New user (no profile) - should create one
- User with 0 balance
- User with very large balance

---

### 8. **Logging & Announcements**

#### ✅ Casino Logs Channel
- Check that all actions are logged:
  - Slots wins/losses
  - Blackjack games
  - Crash games
  - Coinflip games
  - Robberies (success and failure)
  - Admin actions (addmoney, removemoney, reset, jail, unjail)

#### ✅ Jackpot Channel
- Check for jackpot announcements when:
  - Someone hits 3 💎 in slots
  - Should have nice embed with user info and winnings

---

## 🎯 Quick Test Script

Run these commands in order:

```bash
# 1. Check balance
elora bal

# 2. Get daily
elora daily

# 3. Deposit
elora dep 500

# 4. Withdraw
elora with 200

# 5. Test slots (in Gambling-Hall)
elora slots 100

# 6. Test blackjack
elora blackjack 200

# 7. Test crash
elora crash 150

# 8. Test coinflip
elora coinflip 100 heads

# 9. Test work
elora work

# 10. Test shop
elora shop

# 11. Test leaderboard
elora leaderboard
```

---

## 🐛 Common Issues to Check

1. **Commands not working?**
   - Check bot has permissions
   - Check channel restrictions
   - Check role requirements
   - Check console for errors

2. **Money not saving?**
   - Check MongoDB connection
   - Check console for database errors

3. **Logs not appearing?**
   - Check channel IDs are correct
   - Check bot permissions in log channels
   - Check console for errors

4. **Cooldowns not working?**
   - Check command cooldown system
   - Check database saves

---

## ✅ Success Criteria

All tests pass when:
- ✅ All commands work as expected
- ✅ All role restrictions work
- ✅ All channel restrictions work
- ✅ All cooldowns work
- ✅ All logs are posted
- ✅ All error messages are clear
- ✅ Database saves correctly
- ✅ No console errors

---

**Happy Testing! 🎰**
