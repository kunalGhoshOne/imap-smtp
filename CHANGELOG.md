# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased] - 2025-09-29

### Fixed
- **MongoDB Change Stream Stability**: Resolved continuous change stream disconnections that were causing database watcher to restart every 5 seconds. Added fallback to polling mode when change streams are not available or disabled.
- **SSL Configuration for Development**: Disabled SSL certificate generation and usage in development mode to eliminate SSL-related errors and warnings during development.
- **MongoDB Driver Deprecation Warnings**: Removed deprecated `useNewUrlParser` and `useUnifiedTopology` options from MongoDB connection configuration.
- **Environment Variable Integration**: Enhanced docker-compose.yml to include all necessary environment variables from .env file for proper application configuration.

### Added
- **Development Mode Support**: Added `DISABLE_SSL` and `DISABLE_CHANGE_STREAMS` environment variables for development-friendly configuration.
- **Graceful Change Stream Fallback**: Implemented automatic fallback to polling mode when MongoDB change streams fail or are disabled.
- **Enhanced SSL Handling**: Added conditional SSL certificate generation that respects development mode settings.

### Changed
- **Database Watcher**: Modified to use polling instead of change streams when `DISABLE_CHANGE_STREAMS=true` is set.
- **SMTP Server Configuration**: Updated to use plain TCP connections instead of SSL when `DISABLE_SSL=true` is set.
- **IMAP Server Configuration**: Updated to use plain TCP connections instead of SSL when `DISABLE_SSL=true` is set.
- **Docker Compose**: Enhanced with comprehensive environment variable configuration for all application components.

### Technical Details
- MongoDB change streams require replica set configuration which may not be available in development environments
- Polling fallback ensures email processing continues even without change stream support
- SSL is now completely optional for development environments
- All deprecated MongoDB driver options have been removed

---
**Reporter & Fixer**: Kunal Ghosh