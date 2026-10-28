# Application repositories

Production rollout from this legacy monorepo is paused while TH-Server is rebuilt.

- Portfolio: https://github.com/TuanPham0411/TH-Portfolio
- MES Ticket: https://github.com/TuanPham0411/TH-MES.Ticket
- AI Agent: https://github.com/TuanPham0411/TH-AI.Agent

Each project has independent source, tests, Docker packaging and ARM64 release artifacts, without an enabled self-hosted production deployment job. Preserve live databases, uploaded media, private configuration and Drive mappings outside the old RPI before reinstalling. Source and build artifacts do not include runtime data.
