# Independent projects — production deployment paused

The maintained applications are now:

- https://github.com/TuanPham0411/TH-Portfolio — th.io.vn
- https://github.com/TuanPham0411/TH-MES.Ticket — mes.th.io.vn
- https://github.com/TuanPham0411/TH-AI.Agent — ai.th.io.vn

This monorepo is retained as the migration/source reference. Its Pi deployment job is explicitly disabled on this branch. The new projects build and package on GitHub-hosted runners only; no automatic RPI deployment is enabled. Provision and authorize the replacement TH-Server before enabling deployment again.

Code/images do not include the live database, uploaded media, secrets, Drive mappings/credentials or runner registrations. Back up and verify those separately outside the RPI before reinstalling. Each new project includes docs/REINSTALL.md.
