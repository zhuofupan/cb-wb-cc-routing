"""Register Codex providers in CC Switch, using its own third-party template.

CC Switch's proven template for a third-party Codex provider is:
    model_provider = "custom"        # reuse the shared id -> unified session history
    preferred_auth_method = "apikey" # desktop app then stops applying the ChatGPT model allowlist
    [model_providers.custom]
    requires_openai_auth = true
    experimental_bearer_token = "..."   # key lives here, never in auth.json

Run with CC Switch closed. Idempotent: re-running replaces the same ids.
"""
import json
import os
import pathlib
import sqlite3
import time

DB = pathlib.Path(os.environ.get('CCSWITCH_DB', 'C:/path/to/cc-switch.db'))
ROOT = pathlib.Path(os.environ.get(
    'ADAPTER_HOME', pathlib.Path.home() / '.codex' / 'integrations' / 'deepseek-workbuddy'))

CATALOG_DS = str(ROOT / 'deepseek-models.json').replace('\\', '/')
CATALOG_WB = str(ROOT / 'workbuddy-models-flagship.json').replace('\\', '/')

DEEPSEEK_TOKEN = os.environ.get('DEEPSEEK_API_KEY', 'YOUR_DEEPSEEK_API_KEY')
WORKBUDDY_TOKEN = os.environ.get('WORKBUDDY_LOCAL_SECRET', 'YOUR_LOCAL_SECRET')

DEEPSEEK_CONFIG = f'''model_provider = "custom"
model = "deepseek-flash"
disable_response_storage = true
preferred_auth_method = "apikey"
model_reasoning_effort = "high"
model_reasoning_summary = "none"
model_catalog_json = "{CATALOG_DS}"
web_search = "disabled"
windows_wsl_setup_acknowledged = true

[model_providers.custom]
name = "DeepSeek Official"
wire_api = "responses"
requires_openai_auth = true
base_url = "https://api.deepseek.com"
experimental_bearer_token = "{DEEPSEEK_TOKEN}"
'''

WORKBUDDY_CONFIG = f'''model_provider = "custom"
model = "deepseek-v4.1-flash"
disable_response_storage = true
preferred_auth_method = "apikey"
model_reasoning_effort = "high"
model_reasoning_summary = "none"
model_catalog_json = "{CATALOG_WB}"
web_search = "disabled"
windows_wsl_setup_acknowledged = true

[model_providers.custom]
name = "WorkBuddy (local)"
wire_api = "responses"
requires_openai_auth = true
base_url = "http://127.0.0.1:18791/v1"
experimental_bearer_token = "{WORKBUDDY_TOKEN}"
'''

PROVIDERS = [
    {
        'id': 'codex-deepseek-official',
        'name': 'DeepSeek 官方',
        'config': DEEPSEEK_CONFIG,
        'auth': {'OPENAI_API_KEY': DEEPSEEK_TOKEN},
        'website_url': 'https://platform.deepseek.com',
        'category': 'cn_official',
        'sort_index': 20,
        'notes': 'Codex',
    },
    {
        'id': 'codex-workbuddy-local',
        'name': 'WorkBuddy 本地',
        'config': WORKBUDDY_CONFIG,
        'auth': {'OPENAI_API_KEY': WORKBUDDY_TOKEN},
        'website_url': None,
        'category': 'custom',
        'sort_index': 21,
        'notes': 'Codex · 需先启动 127.0.0.1:18791 适配服务',
    },
]


def main():
    conn = sqlite3.connect(DB)
    now = int(time.time() * 1000)
    for p in PROVIDERS:
        conn.execute(
            "delete from providers where id = ? and app_type = 'codex'", (p['id'],))
        conn.execute(
            """insert into providers
               (id, app_type, name, settings_config, website_url, category, created_at,
                sort_index, notes, icon, icon_color, meta, is_current, in_failover_queue,
                cost_multiplier, limit_daily_usd, limit_monthly_usd, provider_type)
               values (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            (
                p['id'], 'codex', p['name'],
                json.dumps({'auth': p['auth'], 'config': p['config']}, ensure_ascii=False),
                p['website_url'], p['category'], now, p['sort_index'], p['notes'],
                None, None,
                json.dumps({'commonConfigEnabled': False, 'endpointAutoSelect': True,
                            'apiFormat': 'openai_responses'}),
                0, 0, '1.0', None, None, None,
            ),
        )
    conn.commit()
    rows = conn.execute(
        "select id, name, sort_index, is_current from providers where app_type='codex' order by sort_index"
    ).fetchall()
    print(json.dumps({'codex_providers': rows}, ensure_ascii=False, indent=2))
    conn.close()


if __name__ == '__main__':
    main()
