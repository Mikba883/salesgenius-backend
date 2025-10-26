# Changelog

All notable changes to SalesGenius will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2025-10-25

### Added
- 🎉 Initial release of SalesGenius
- Real-time screen + audio capture via `getDisplayMedia`
- WebSocket streaming with PCM16 audio at 16kHz
- Deepgram Live integration for speech-to-text
- OpenAI streaming for AI-powered suggestions
- 4 categorized suggestion types:
  - 🎧 Conversational & Discovery
  - 💎 Value & Objection Handling
  - ✅ Closing & Next Steps
  - 🌐 Market & Context Intelligence
- React/Next.js client component with Tailwind CSS
- Node.js/TypeScript WebSocket server
- Comprehensive documentation (README, QUICKSTART, DEPLOYMENT)
- Docker support with health checks
- GitHub Actions CI/CD workflow
- Test client script for backend verification

### Features
- Debounced suggestion generation (180ms)
- Category classification with keyword matching
- Automatic stream interruption on category change
- Real-time status indicators (connected/disconnected)
- Error handling and user-friendly messages
- Support for Chrome/Edge on Windows and macOS
- Graceful shutdown and cleanup

### Documentation
- Complete setup and usage guide
- Deployment instructions for multiple platforms
- Troubleshooting section
- Cost estimates and monitoring setup
- Best practices and security checklist

---

## [Unreleased]

### Planned Features
- JWT authentication with Supabase
- Rate limiting per user/session
- Advanced LLM-based category classification
- Custom prompt templates per industry
- Suggestion history and analytics
- Multi-language support
- Voice activity detection (VAD) for better audio segmentation
- Admin dashboard for monitoring
- A/B testing framework for prompts
- Export suggestions to CRM systems

### Known Issues
- macOS system audio capture limited (Chrome tab audio works)
- Free tier backend services may sleep after inactivity
- No offline mode support

---

## Version History

### Version Numbering
- **Major.Minor.Patch** (e.g., 1.2.3)
- **Major**: Breaking changes
- **Minor**: New features, backwards compatible
- **Patch**: Bug fixes, minor improvements

### Support
- Latest version: Full support
- Previous minor: Security patches only
- Older versions: No support

---

For more details, see the [GitHub Releases](https://github.com/your-username/salesgenius/releases) page.
