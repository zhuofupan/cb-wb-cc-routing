"""Register a Claude Code (CLI) provider in CC Switch.

Claude Code is a separate CC Switch app (`app_type='claude'`); the Desktop
provider is `claude-desktop`. Only run this when the user asked for the CLI.
Credentials come from the environment; CC Switch must be closed.
"""
from contextlib import closing
import argparse, datetime, json, os, pathlib, sqlite3, time

from desktop_models import auto_compact_window, ensure_stopped, routes_for

VENDORS = {
    'codebuddy': ('claude-codebuddy-ck', 'CodeBuddy', 'http://127.0.0.1:18792', 'CODEBUDDY_API_KEY'),
    'workbuddy': ('claude-workbuddy-local', 'WorkBuddy', 'http://127.0.0.1:18791', 'WORKBUDDY_LOCAL_SECRET'),
}


def picker(vendor):
    return [{'model': route['model'], 'label': route['labelOverride'], 'behavesAs': alias}
            for alias, route in routes_for(vendor).items()]


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--provider', choices=VENDORS, required=True)
    args = parser.parse_args(argv)
    pid, name, endpoint, env_key = VENDORS[args.provider]
    key = os.environ.get(env_key, '')
    if not key or key.startswith('YOUR_'):
        raise SystemExit(f'Set {env_key}; placeholder credentials are not registered')
    ensure_stopped()

    db = pathlib.Path(os.environ.get('CCSWITCH_DB') or pathlib.Path.home() / '.cc-switch' / 'cc-switch.db')
    if not db.is_file():
        raise SystemExit('CC Switch database not found')

    routes = routes_for(args.provider)
    # CLI sends a real model id. Fallback aliases still matter for subagents
    # and callers that request sonnet/opus/haiku by name.
    fallbacks = {
        'ANTHROPIC_DEFAULT_MODEL': routes['claude-fable-5'],
        'ANTHROPIC_DEFAULT_SONNET_MODEL': routes['claude-fable-5'],
        'ANTHROPIC_DEFAULT_OPUS_MODEL': routes['claude-fable-5-1'],
        'ANTHROPIC_DEFAULT_HAIKU_MODEL': routes['claude-haiku-5-5'],
    }
    env = {
        'ANTHROPIC_BASE_URL': endpoint,
        'ANTHROPIC_AUTH_TOKEN': key,
        'ANTHROPIC_MODEL': routes['claude-fable-5']['model'],
        'CLAUDE_CODE_MAX_CONTEXT_TOKENS': '1000000',
        'CLAUDE_CODE_EFFORT_LEVEL': 'max',
    }
    for var, route in fallbacks.items():
        env[var] = route['model']
        env[var + '_NAME'] = route['labelOverride']

    settings = {
        'env': env,
        'model': env['ANTHROPIC_MODEL'],
        'modelPicker': {'replaceBuiltInOptions': True, 'options': picker(args.provider)},
        'modelSettings': {alias: {'autoCompactWindow': auto_compact_window(route['model'], 1000000),
                                  'maxEffortLevel': 'max'}
                          for alias, route in routes.items()},
    }
    meta = {'commonConfigEnabled': False, 'endpointAutoSelect': True, 'apiFormat': 'anthropic'}

    with closing(sqlite3.connect(db)) as conn, conn:
        with closing(sqlite3.connect(str(db) + '.backup-' + datetime.datetime.now().strftime('%Y%m%d-%H%M%S-%f'))) as dest:
            conn.backup(dest)
        row = conn.execute("select settings_config,meta from providers where id=? and app_type='claude'", (pid,)).fetchone()
        old = json.loads(row[0] or '{}') if row else {}
        # Keep unrelated user keys, but never keep stale model ids.
        merged = {**old, **settings}
        values = (json.dumps(merged, ensure_ascii=False),
                  json.dumps({**meta, **(json.loads(row[1] or '{}') if row else {})}, ensure_ascii=False))
        if row:
            conn.execute("update providers set settings_config=?,meta=? where id=? and app_type='claude'", (*values, pid))
        else:
            conn.execute("""insert into providers(id,app_type,name,settings_config,website_url,category,created_at,sort_index,notes,icon,icon_color,meta,is_current,in_failover_queue,cost_multiplier,limit_daily_usd,limit_monthly_usd,provider_type)
                values(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                         (pid, 'claude', name, values[0], None, 'custom', int(time.time() * 1000), None,
                          'Claude Code CLI', None, None, values[1], 0, 0, '1.0', None, None, None))
    print(f'{name}: Claude Code card registered with {len(routes)} models; activate it on the Claude page.')


if __name__ == '__main__':
    main()
