# Kick Talk

An Application for Kick to enhance your experience as a chatter.

Designed & Developed by Dark
Developed by ftk789

## Branch Additions (features-fixes)

This branch adds new in-app commands, moderation tools, and chat quality-of-life improvements.

### Slash Commands

Use these in chat input:

- `/user <username>`: open that user's profile card.
- `/ban <username>`: ban a user.
- `/timeout <username> <duration>`: timeout a user. Duration supports `m`, `h`, `d`, `w` (examples: `10`, `10m`, `1h`, `1d`, `1w`).
- `/timeout <duration> <username>`: alternate timeout order (also supported).
- `/unban <username>`: unban a user.
- `/untimeout <username>`: remove a user's timeout.

### Input and Chat Features

- Slash command autocomplete while typing `/`.
- `@` mention autocomplete for chatters.
- `:` emote autocomplete with keyboard selection.
- Favorite emotes row in input:
  - Click to send immediately.
  - Shift+Click to insert into input.
  - Right-click to remove from favorites.
- Reply context shown in mentions (who was replied to + original text).
- Improved Enter key handling for reliable send behavior.

### Moderation and Navigation Features

- New `Mod Logs` tab with all moderation actions.
- Mentions tab improvements:
  - Filter by chatroom.
  - Clear all mentions (global or per chatroom).
  - Jump directly to the source chatroom.
- Optional display of mod action messages in chat (`Show Mod Actions` setting).

### New/Updated Settings

- Pause chat on mouseover with selectable durations (`Disabled`, `1s`, `2s`, `3s`, `5s`, `10s`, `15s`, `Infinite`).
- Hide emote-only messages.
- Show chat mode info bar above input (followers/subscribers/emote/slow/account-age modes).

### Keyboard Shortcuts

- `Ctrl+T` or `Ctrl+J`: open Add Chatroom dialog.
- `Ctrl+1`..`Ctrl+9`: jump to open tabs (chatrooms, Mentions, Mod Logs).
- `Ctrl+E`: toggle hide emote-only messages.

## Recommended IDE Setup

- [VSCode](https://code.visualstudio.com/) + [ESLint](https://marketplace.visualstudio.com/items?itemName=dbaeumer.vscode-eslint) + [Prettier](https://marketplace.visualstudio.com/items?itemName=esbenp.prettier-vscode)

## Project Setup

### Install

```bash
$ npm install
```

### Development

```bash
$ npm run dev
# or
$ npm run dev-hr  # with watch/hot reload support
```

### Build

```bash
# For windows
$ npm run build:win

# For macOS
$ npm run build:mac

# For Linux
$ npm run build:linux
```

### Other Useful Scripts

```bash
$ npm run start       # run production preview
$ npm run lint        # lint codebase
$ npm run lint:fix    # lint + auto-fix
$ npm run format      # format files with prettier
$ npm run build       # production build (without packaging)
$ npm run build:unpack
```
