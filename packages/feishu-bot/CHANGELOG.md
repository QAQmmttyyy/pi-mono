# Changelog

## [Unreleased]

### Added

- Initial release: Feishu bot for pi-agent-server
- WebSocket-based connection to Feishu (no webhook URL needed)
- Natural language session management (list, create, switch, continue)
- Slash commands (`/list`, `/new`, `/switch`, `/continue`, `/help`)
- Event filtering: only final text responses shown to IM users
- Session mapping: persists Feishu chat ↔ agent session mappings locally
- Session auto-creation on first message
- Support for multiple Feishu chats with independent session contexts
- Seamless cross-device: sessions managed via Feishu visible in agent-ui
