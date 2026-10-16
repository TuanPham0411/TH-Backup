#!/usr/bin/env python3
"""Reject competing host blocks, allowing the site managed by this installer."""
import re
import sys

managed = {'/etc/nginx/sites-enabled/th-app', '/etc/nginx/sites-available/th-app'}
current = None
conflicts = []
for line in sys.stdin:
    if line.startswith('# configuration file '):
        current = line[len('# configuration file '):].strip().removesuffix(':')
    match = re.match(r'^\s*server_name\s+([^;]+);', line)
    if match and current not in managed:
        names = match.group(1).split()
        if any(name in {'th.io.vn', 'mes.th.io.vn', '*.th.io.vn', '.th.io.vn'} for name in names):
            conflicts.append(current or '(unknown configuration)')
if conflicts:
    print('Competing Nginx sites: ' + ', '.join(sorted(set(conflicts))), file=sys.stderr)
    sys.exit(1)
