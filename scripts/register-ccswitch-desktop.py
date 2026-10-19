"""Register WorkBuddy as a Claude Desktop (Cowork) provider in CC Switch.

Claude Desktop runs in `custom-3p` mode: the desktop app sends inference to
CC Switch's local proxy (127.0.0.1:15721/claude-desktop), and the proxy forwards
to whichever claude-desktop provider is current. The provider only needs the
endpoint + token; the desktop app picks model ids itself, and the adapter maps
any claude-* id onto the WorkBuddy default.

Run with CC Switch closed. Idempotent.
"""
import json
import os
import pathlib
import sqlite3
import time

DB = pathlib.Path(os.environ.get('CCSWITCH_DB', 'C:/path/to/cc-switch.db'))
SECRET = os.environ.get('WORKBUDDY_LOCAL_SECRET', 'YOUR_LOCAL_SECRET')

PROVIDER = {
    'id': 'claude-workbuddy-local',
    'name': 'WorkBuddy 本地',
    'settings_config': {'env': {
        'ANTHROPIC_BASE_URL': 'http://127.0.0.1:18791',
        'ANTHROPIC_AUTH_TOKEN': SECRET,
    }},
    'website_url': None,
    'category': 'custom',
    'sort_index': 4,
    'notes': 'Claude Desktop / Cowork · 需 127.0.0.1:18791 适配服务',
    'meta': {'commonConfigEnabled': False, 'endpointAutoSelect': True, 'apiFormat': 'anthropic'},
}


def main():
    conn = sqlite3.connect(DB)
    p = PROVIDER
    now = int(time.time() * 1000)
    conn.execute("delete from providers where id = ? and app_type = 'claude-desktop'", (p['id'],))
    conn.execute(
        """insert into providers
           (id, app_type, name, settings_config, website_url, category, created_at,
            sort_index, notes, icon, icon_color, meta, is_current, in_failover_queue,
            cost_multiplier, limit_daily_usd, limit_monthly_usd, provider_type)
           values (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
        (
            p['id'], 'claude-desktop', p['name'],
            json.dumps(p['settings_config'], ensure_ascii=False),
            p['website_url'], p['category'], now, p['sort_index'], p['notes'],
            None, None, json.dumps(p['meta'], ensure_ascii=False),
            0, 0, '1.0', None, None, None,
        ),
    )
    conn.commit()
    rows = conn.execute(
        "select id, name, sort_index from providers where app_type='claude-desktop' order by coalesce(sort_index,999)"
    ).fetchall()
    print(json.dumps({'claude_desktop_providers': rows}, ensure_ascii=False, indent=2))
    conn.close()


if __name__ == '__main__':
    main()
