---
title: ELORA
emoji: 🤖
colorFrom: blue
colorTo: green
sdk: docker
pinned: false
---

# ELORA HUB

## Setup

### 1) Install

```bash
npm install
```

### 2) Environment Variables

Create a `.env` file (or set environment variables in your host) with:

- **DISCORD_TOKEN**
- **MONGODB_URI** (or **MONGO_URI**)

### 3) Run

```bash
npm start
```

## Marriage & Divorce System (Prefix Commands)

This bot supports prefix commands using:

- `.` (recommended)
- `!`
- `elora <command>`

### Commands

- **`.marrying @user`**
  - Sends a marriage proposal embed with **Accept / Decline** buttons.
  - Only the mentioned target can interact.
  - Proposal has **no expiration** (persistent in MongoDB).
  - Target can accept/decline later, even after bot restarts.
  - A remarriage cooldown of **1 hour** is applied after divorce.

- **`.divorce`**
  - Unilaterally ends your marriage.
  - Updates both partners atomically (transaction when supported by MongoDB).

- **`.profile [@user]`**
  - Shows a social profile card (marriage status, duration, stats, reliability).

## Windows Notifications (Local Machine)

This project can show **native Windows toast notifications** when the bot is running on Windows.

- **Triggers**
  - Mentioning the owner user id
  - Replying to a message authored by the owner
- **Offline-only behavior**
  - Notifications are **suppressed when the owner is online** (presence status is not `offline`).

**Important:** You must enable the **Presence Intent** in the Discord Developer Portal for your bot, otherwise presence status may be missing.