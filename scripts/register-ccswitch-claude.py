"""Register the WorkBuddy Claude Code provider in CC Switch, next to the existing
DeepSeek entry (which already points at api.deepseek.com/anthropic).

Run with CC Switch closed. Idempotent: re-running replaces the same id.
The Claude page stores providers as {"env": {...}} — the same block CC Switch
writes into ~/.claude/settings.json on switch.
"""
import json
import os
import pathlib
import sqlite3
import time

DB = pathlib.Path(os.environ.get('CCSWITCH_DB', 'C:/path/to/cc-switch.db'))

SECRET = os.environ.get('WORKBUDDY_LOCAL_SECRET', 'YOUR_LOCAL_SECRET')
MODEL = 'deepseek-v4.1-flash'

ENV = {
    'ANTHROPIC_BASE_URL': 'http://127.0.0.1:18791',
    'ANTHROPIC_AUTH_TOKEN': SECRET,
    'ANTHROPIC_MODEL': MODEL,
    'ANTHROPIC_DEFAULT_HAIKU_MODEL': MODEL,
    'ANTHROPIC_DEFAULT_HAIKU_MODEL_NAME': MODEL,
    'ANTHROPIC_DEFAULT_SONNET_MODEL': MODEL,
    'ANTHROPIC_DEFAULT_SONNET_MODEL_NAME': MODEL,
    'ANTHROPIC_DEFAULT_OPUS_MODEL': MODEL,
    'ANTHROPIC_DEFAULT_OPUS_MODEL_NAME': MODEL,
}

PROVIDER = {
    'id': 'claude-workbuddy-local',
    'name': 'WorkBuddy 本地',
    'settings_config': {'env': ENV},
    'website_url': None,
    'category': 'custom',
    'sort_index': 4,
    'notes': 'Claude Code · 需 127.0.0.1:18791 适配服务',
    'meta': {'commonConfigEnabled': False, 'endpointAutoSelect': True, 'apiFormat': 'anthropic'},
}


def main():
    conn = sqlite3.connect(DB)
    now = int(time.time() * 1000)
    p = PROVIDER
    conn.execute("delete from providers where id = ? and app_type = 'claude'", (p['id'],))
    conn.execute(
        """insert into providers
           (id, app_type, name, settings_config, website_url, category, created_at,
            sort_index, notes, icon, icon_color, meta, is_current, in_failover_queue,
            cost_multiplier, limit_daily_usd, limit_monthly_usd, provider_type)
           values (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
        (
            p['id'], 'claude', p['name'],
            json.dumps(p['settings_config'], ensure_ascii=False),
            p['website_url'], p['category'], now, p['sort_index'], p['notes'],
            None, None,
            json.dumps(p['meta'], ensure_ascii=False),
            0, 0, '1.0', None, None, None,
        ),
    )
    conn.commit()
    rows = conn.execute(
        "select id, name, sort_index, is_current from providers where app_type='claude' order by sort_index"
    ).fetchall()
    print(json.dumps({'claude_providers': rows}, ensure_ascii=False, indent=2))
    conn.close()


if __name__ == '__main__':
    main()
