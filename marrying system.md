# Marriage & Divorce System (Prefix Commands)

## Prefixes Supported

You can run the commands using any of the following prefixes:

- `.` (recommended)
- `!`
- `elora <command>`

Examples:

- `.marrying @user`
- `!divorce`
- `elora profile @user`

---

## Commands

## 1) `.marrying @user`

**Purpose**

Starts a marriage proposal flow that requires the target user’s consent through buttons.

**Usage**

- `.marrying @user`

**Rules / Validation (runs in order)**

- **Self-marriage blocked**
  - If you mention yourself, the bot rejects: *"You cannot marry yourself!"*
- **Requester already married**
  - If you already have `partnerId`, the bot rejects and shows your current partner.
- **Target already married**
  - If the mentioned user already has `partnerId`, the bot rejects.
- **Remarriage cooldown**
  - If your `lastDivorceDate` is within the last **1 hour**, the bot rejects and shows remaining time.

**Transparency Warning**

- If the requester has `divorceCount > 0`, the proposal embed includes a warning showing how many divorces the requester has.

**Consent Buttons**

- The proposal message includes:
  - **Accept** button
  - **Decline** button
- **Only the mentioned target user can click the buttons**.
  - If anyone else clicks, they receive: *"This button is not for you."* (ephemeral)

**Timeout**

There is **no timeout**.

- The proposal stays active until the target user clicks **Accept** or **Decline**.
- Proposals are stored in MongoDB, so they keep working even if the bot restarts.

**On Accept (Database Updates)**

Updates both users in MongoDB (transaction when supported):

- **Requester**
  - `partnerId = targetUserId`
  - `marriageCount += 1`
  - `marryDate = now`
- **Target**
  - `partnerId = requesterId`
  - `marriageCount += 1`
  - `marryDate = now`

**On Decline**

- No database changes.
- The bot edits the proposal message to a decline embed and disables buttons.

---

## 2) `.divorce`

**Purpose**

Ends your marriage immediately (unilateral divorce; partner consent is not required).

**Usage**

- `.divorce`

**Rules / Validation**

- If you are not married (`partnerId` is null), the bot rejects: *"You are not married to get divorced!"*

**Database Updates**

Updates both users in MongoDB (transaction when supported):

- **Author (the one running the command)**
  - `partnerId = null`
  - `divorceCount += 1`
  - `marryDate = null`
  - `lastDivorceDate = now` (used for the remarriage cooldown)
- **Partner**
  - `partnerId = null`
  - `divorceCount += 1`
  - `marryDate = null`

---

## 3) `.profile [@user]`

**Purpose**

Displays a user’s social profile card: marriage status, relationship age, stats, and reliability.

**Usage**

- `.profile` (shows your profile)
- `.profile @user` (shows the mentioned user)

**What it Displays**

- **Marital Status**
  - Married: `Married to <@partnerId> 💍`
  - Single: `Single 💔`
- **Relationship Age**
  - If married, shows time since `marryDate`
- **Relationship Statistics**
  - `Married X time(s) • Divorced Y time(s)`
- **Reliability Factor**
  - `marriageCount / (marriageCount + divorceCount)` as a percentage

**Not Registered Case**

- If the user doesn’t have a document in the database yet, the bot shows a friendly embed saying the user is not registered.

---

## 4) `.reset @user` (Admin Only)

**Purpose**

Resets (wipes) a user’s saved profile for this server.

**Usage**

- `.reset @user`

**Permissions**

- **Administrator only**

**What it does**

- Deletes the user’s profile document from MongoDB (so it will be recreated with defaults when they use commands again).
- If the user was married, it also clears their partner’s `partnerId` and `marryDate` to avoid broken marriages.
- Cancels any **pending** marriage proposals that involve that user.

---

## Notes (MongoDB Transactions)

- The system uses Mongoose transactions when MongoDB supports it (replica set / mongos).
- If transactions are not supported, the system falls back to best-effort updates.
