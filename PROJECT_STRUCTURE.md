# 📁 Project Structure

```
salesgenius/
│
├── 📄 README.md                    # Main documentation
├── 📄 QUICKSTART.md                # Quick setup guide (5 minutes)
├── 📄 DEPLOYMENT.md                # Deployment guides for various platforms
├── 📄 ADVANCED.md                  # Advanced configuration & customization
├── 📄 CHANGELOG.md                 # Version history
├── 📄 LICENSE                      # MIT License
├── 📄 .gitignore                   # Git ignore rules
├── 📄 docker-compose.yml           # Docker Compose configuration
│
├── 📁 .github/
│   └── workflows/
│       └── ci-cd.yml               # GitHub Actions CI/CD pipeline
│
├── 📁 client/                      # Frontend (React/Next.js)
│   ├── salesgenius-stream.tsx     # Main streaming component
│   └── page.tsx                    # Example Next.js page
│
└── 📁 server/                      # Backend (Node.js/TypeScript)
    ├── src/
    │   └── server.ts               # WebSocket server + Deepgram + OpenAI
    ├── package.json                # Node dependencies
    ├── tsconfig.json               # TypeScript configuration
    ├── .env.example                # Environment variables template
    ├── Dockerfile                  # Docker container config
    └── test-client.js              # Test script
```

---

## 🎯 Key Files Description

### Documentation
- **README.md**: Complete project overview, features, architecture
- **QUICKSTART.md**: Get started in 5 minutes
- **DEPLOYMENT.md**: Deploy to Render, Railway, Fly.io, etc.
- **ADVANCED.md**: Custom prompts, multi-lang, auth, monitoring
- **CHANGELOG.md**: Version history and planned features

### Frontend (client/)
- **salesgenius-stream.tsx**: Main React component
  - Screen + audio capture with `getDisplayMedia`
  - WebSocket client
  - Real-time suggestion rendering
  - Error handling and status indicators

- **page.tsx**: Example Next.js page using the component

### Backend (server/)
- **server.ts**: Core WebSocket server
  - Audio streaming handler (PCM16)
  - Deepgram Live integration
  - Category classification
  - OpenAI streaming suggestions
  - Health check endpoint

- **package.json**: Dependencies
  - `@deepgram/sdk` for speech-to-text
  - `openai` for AI suggestions
  - `ws` for WebSocket
  - `uuid` for IDs

- **test-client.js**: Test the backend without frontend

### DevOps
- **Dockerfile**: Container for backend
- **docker-compose.yml**: Full stack setup
- **.github/workflows/ci-cd.yml**: Automated testing and deployment

---

## 🚀 Quick Navigation

| Need | Go to |
|------|-------|
| First time setup | [QUICKSTART.md](QUICKSTART.md) |
| Deploy to production | [DEPLOYMENT.md](DEPLOYMENT.md) |
| Customize prompts | [ADVANCED.md](ADVANCED.md) |
| Understand architecture | [README.md](README.md#-architettura-tecnica) |
| See what's new | [CHANGELOG.md](CHANGELOG.md) |
| Report issues | GitHub Issues |

---

## 📦 What's Included

✅ **Complete working implementation**
- Client + Server fully functional
- Real-time audio streaming
- AI-powered suggestions in 4 categories
- Production-ready with health checks

✅ **Comprehensive documentation**
- Setup guides
- Deployment instructions
- Customization examples
- Troubleshooting tips

✅ **DevOps ready**
- Docker support
- CI/CD pipeline
- Health checks
- Monitoring examples

✅ **Best practices**
- TypeScript for type safety
- Error handling
- Graceful shutdown
- Rate limiting examples
- Security guidelines

---

## 🎓 Learning Path

1. **Beginner**: Start with QUICKSTART.md → Get it running locally
2. **Intermediate**: Read README.md → Understand architecture
3. **Advanced**: Explore ADVANCED.md → Customize for your needs
4. **Production**: Follow DEPLOYMENT.md → Deploy to cloud

---

## 🤝 Contributing

This is a template/starting point. Feel free to:
- Fork and modify for your needs
- Add new categories
- Improve classification logic
- Add new integrations (CRM, analytics, etc.)
- Submit improvements back via PR

---

## 📊 File Sizes (Approximate)

- Total documentation: ~50 KB
- Client code: ~12 KB
- Server code: ~15 KB
- Config files: ~5 KB
- **Total project: ~80 KB** (excluding node_modules)

Lightweight and fast! 🚀

---

**Happy Building! 🎉**
