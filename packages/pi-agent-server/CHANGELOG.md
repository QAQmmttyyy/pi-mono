# Changelog

## [Unreleased]

### Added
- Initial release of pi-agent-server: persistent local agent server with multi-session and multi-client support
- REST API for session management (CRUD, list, workspace tree)
- WebSocket protocol for real-time interaction (prompt, abort, model switching, etc.)
- Session pool with lazy loading, idle unloading, and serialized message queue
- Event broadcasting to all attached clients
- Type-safe API built on `@mariozechner/pi-coding-agent` SDK
