"""Prepare Codex catalogs and register one CC Switch card per vendor.

--prepare-only changes no database or active Codex configuration.
Registration requires CC Switch to be closed; auth.json is never modified.
"""
import argparse, copy, datetime, json, os, pathlib, re, sqlite3, time
from contextlib import closing
from desktop_models import MODELS, ensure_stopped, model_label

VENDORS = {
    'codebuddy': ('codex-codebuddy-ck', 'CodeBuddy', 'http://127.0.0.1:18792/v1', 'CODEBUDDY_API_KEY'),
    'workbuddy': ('codex-workbuddy-local', 'WorkBuddy', 'http://127.0.0.1:18791/v1', 'WORKBUDDY_LOCAL_SECRET'),
    'deepseek': ('codex-deepseek-official', 'DeepSeek', 'https://api.deepseek.com', 'DEEPSEEK_API_KEY'),
}

def catalog(vendor, template):
    rows = MODELS if vendor != 'deepseek' else [
        ('', 'deepseek-flash', 'DeepSeek-V4.1-Flash', 1048576, 'max')]
    models = []
    for priority, (_, slug, label, window, effort) in enumerate(rows):
        client_effort = 'xhigh' if vendor != 'deepseek' and effort == 'max' else effort
        m = copy.deepcopy(template)
        for key in ['model_messages', 'availability_nux', 'upgrade', 'additional_speed_tiers', 'service_tiers', 'available_access_programs', 'multi_agent_reasoning_effort']:
            m.pop(key, None)
        size = '1M' if window in (1000000, 1048576) else f'{window//1000}k'
        prefix = {'codebuddy': 'cb·', 'workbuddy': 'wb·', 'deepseek': ''}[vendor]
        display_name = f'{prefix}{label}·{size}' if vendor == 'deepseek' else model_label(vendor, slug, label, window)
        m.update(slug=slug, display_name=display_name, description=f'{vendor}; declared capacity, not a full-window load test',
                 base_instructions='You are a coding assistant. Use the provided tools to complete the user request. Verify results and report failures honestly.',
                 context_window=window, max_context_window=window, effective_context_window_percent=95,
                 default_reasoning_level=client_effort, supported_reasoning_levels=[{'effort': client_effort, 'description': f'Upstream effort: {effort}'}],
                 input_modalities=['text'] if vendor == 'deepseek' and slug == 'deepseek-v4-pro' else ['text', 'image'],
                 supports_search_tool=False, support_verbosity=False, supports_reasoning_summaries=False,
                 default_reasoning_summary='none', prefer_websockets=False, visibility='list', supported_in_api=True, priority=priority,
                 include_skills_usage_instructions=True, include_plugin_usage_instructions=True, include_apps_usage_instructions=True,
                 use_responses_lite=False, auto_compact_token_limit=None)
        models.append(m)
    return {'models': models}

def common_settings(raw):
    """Keep the user's plugins, MCP, projects and safety settings verbatim."""
    routing={'model','model_provider','model_reasoning_effort','model_reasoning_summary','model_catalog_json','model_context_window','model_auto_compact_token_limit','preferred_auth_method','service_tier','web_search'}
    result=[];section='';skip=False
    for line in raw.splitlines():
        if line.lstrip().startswith('['):
            section=line.strip().strip('[]').strip()
            skip=section=='model_providers.custom' or section.startswith('model_providers.custom.')
        if skip:continue
        match=re.match(r'^([A-Za-z_][A-Za-z0-9_]*)\s*=',line)
        if not section and match and match.group(1)in routing:continue
        result.append(line)
    return '\n'.join(result).strip()

def config(vendor, key, path, base=''):
    _, name, endpoint, _ = VENDORS[vendor]
    quote = lambda value: json.dumps(str(value).replace('\\', '/'), ensure_ascii=False)
    return f'''model_provider = "custom"
model = "{'deepseek-flash' if vendor == 'deepseek' else 'deepseek-v4.1-flash'}"
model_reasoning_effort = "{'max' if vendor == 'deepseek' else 'xhigh'}"
model_reasoning_summary = "none"
model_catalog_json = {quote(path)}
web_search = "disabled"

{common_settings(base)}

[model_providers.custom]
name = {quote(name)}
base_url = {quote(endpoint)}
wire_api = "responses"
requires_openai_auth = false
supports_websockets = false
experimental_bearer_token = {json.dumps(key)}

[model_providers.custom.capabilities]
remote_compaction = "unsupported"
'''

def register(conn, vendor, key, path, base=''):
    pid, name, _, _ = VENDORS[vendor]
    row = conn.execute("select settings_config,meta from providers where id=? and app_type='codex'", (pid,)).fetchone()
    settings = json.loads(row[0]) if row else {'auth': {}}
    settings['config'] = config(vendor, key, path, base)
    meta = json.loads(row[1] or '{}') if row else {}
    meta.update(commonConfigEnabled=False, apiFormat='openai_responses')
    values = (json.dumps(settings, ensure_ascii=False), json.dumps(meta, ensure_ascii=False))
    if row:
        conn.execute("update providers set settings_config=?,meta=? where id=? and app_type='codex'", (*values, pid))
    else:
        conn.execute('''insert into providers(id,app_type,name,settings_config,website_url,category,created_at,sort_index,notes,icon,icon_color,meta,is_current,in_failover_queue,cost_multiplier,limit_daily_usd,limit_monthly_usd,provider_type)
            values(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)''', (pid,'codex',name,values[0],None,'custom',int(time.time()*1000),None,'Codex app: manual acceptance pending',None,None,values[1],0,0,'1.0',None,None,None))

def main(argv=None):
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--provider', choices=[*VENDORS, 'all'], default='all')
    p.add_argument('--prepare-only', action='store_true')
    p.add_argument('--template', type=pathlib.Path, default=pathlib.Path.home()/'.codex/models_cache.json')
    p.add_argument('--base-config', type=pathlib.Path, default=pathlib.Path.home()/'.codex/config.toml')
    p.add_argument('--output-dir', type=pathlib.Path, default=pathlib.Path(os.environ.get('ADAPTER_HOME') or pathlib.Path.home()/'.codex/integrations/deepseek-workbuddy'))
    args = p.parse_args(argv)
    vendors = list(VENDORS) if args.provider == 'all' else [args.provider]
    template = json.loads(args.template.read_text(encoding='utf8'))['models'][0]
    keys = {}
    if not args.prepare_only:
        ensure_stopped()
        for vendor in vendors:
            keys[vendor] = os.environ.get(VENDORS[vendor][3], '')
            if not keys[vendor] or keys[vendor].startswith('YOUR_'): raise SystemExit('Set '+VENDORS[vendor][3])
    args.output_dir.mkdir(parents=True, exist_ok=True)
    paths = {}
    for vendor in vendors:
        paths[vendor] = args.output_dir/f'codex-{vendor}-models.json'
        paths[vendor].write_text(json.dumps(catalog(vendor, template), ensure_ascii=False, indent=2)+'\n', encoding='utf8')
    if not args.prepare_only:
        db = pathlib.Path(os.environ.get('CCSWITCH_DB') or pathlib.Path.home()/'.cc-switch/cc-switch.db')
        if not db.is_file(): raise SystemExit('CC Switch database not found')
        with closing(sqlite3.connect(db)) as conn, conn:
            with closing(sqlite3.connect(str(db)+'.backup-'+datetime.datetime.now().strftime('%Y%m%d-%H%M%S-%f'))) as backup: conn.backup(backup)
            base=args.base_config.read_text(encoding='utf8') if args.base_config.exists() else ''
            for vendor in vendors: register(conn, vendor, keys[vendor], paths[vendor], base)
    print(json.dumps({'prepared': {v: str(path) for v,path in paths.items()}, 'registered': not args.prepare_only}, ensure_ascii=False))

if __name__ == '__main__': main()
