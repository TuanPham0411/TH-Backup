TH MES WINDOWS VERIFICATION AGENT

Requirements: trusted Python 3.11+ on Windows 10/11; Chrome or Edge recommended.
The agent checks whether the selected managed username exists as a folder name
under C:\Users (case-insensitive). This is NOT proof of the currently logged-on
Windows identity or enterprise/Active Directory SSO. A trusted registered device
key signs a one-time challenge; no complete profile list is sent to the website.

1. The MES owner registers this computer in Administration > Registered Windows
   devices and downloads its unique device.json. Never share the key in chat.
2. Extract this bundle. Review the source, then run install.ps1 from an elevated
   PowerShell session, passing -DeviceConfig "C:\path\to\device.json".
   Your IT policy may require signing/approving the PowerShell script.
3. The installer uses Python in an interactive scheduled task for the account
   running installation. It does NOT install a SYSTEM service. Install for the
   Windows account that will run the agent; another login session needs its own
   managed installation, or IT must package an appropriate service.
4. Files are installed in C:\ProgramData\THMES. The agent listens only on
   127.0.0.1:8765, accepts only the configured website Origin, and checks Host.
5. On mes.th.io.vn choose your display name and Verify this Windows computer.
   Allow the browser's local-network permission when prompted.
6. The owner can revoke the device in the administration page. Disable user
   records to revoke their workspace access. Windows verification expires after
   12 hours; use Sign out and verify again when required.

Protect device.json with Windows ACLs. A person with access to the device key can
copy the key; this is software-based verification, not hardware attestation.
The installer restricts configuration access to the installer account, SYSTEM
and Administrators. Delete the downloaded extra copy after protected installation.

Uninstall: stop/unregister scheduled task "TH MES Verification Agent", revoke its
device in MES administration, and remove C:\ProgramData\THMES. Coordinate with IT
if other Windows accounts use this installation.

Live Windows installation and browser local-network behavior must be validated on
an actual company workstation. The development environment is Linux.
