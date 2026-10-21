"""Register one Desktop provider per vendor. Credentials come from env; close CC Switch first."""
from contextlib import closing
import argparse, datetime, json, os, pathlib, sqlite3, time
from desktop_models import routes_for, routes_for_settings, ensure_stopped, native_desktop_settings
VENDORS={
    'workbuddy':('claude-workbuddy-local','WorkBuddy','http://127.0.0.1:18791','WORKBUDDY_LOCAL_SECRET'),
    'codebuddy':('claude-codebuddy-ck','CodeBuddy','http://127.0.0.1:18792','CODEBUDDY_API_KEY'),
    'deepseek':('claude-deepseek-official','DeepSeek','https://api.deepseek.com/anthropic','DEEPSEEK_API_KEY'),
}
def main(argv=None):
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--provider',choices=VENDORS,default='workbuddy');args=p.parse_args(argv)
    pid,name,endpoint,env_key=VENDORS[args.provider];key=os.environ.get(env_key,'')
    if not key or key.startswith('YOUR_'): raise SystemExit(f'Set {env_key}; placeholder credentials are not registered')
    ensure_stopped()
    db=pathlib.Path(os.environ.get('CCSWITCH_DB') or pathlib.Path.home()/'.cc-switch/cc-switch.db')
    if not db.is_file(): raise SystemExit('CC Switch database not found')
    with closing(sqlite3.connect(db)) as conn, conn:
        with closing(sqlite3.connect(str(db)+'.backup-'+datetime.datetime.now().strftime('%Y%m%d-%H%M%S-%f'))) as dest: conn.backup(dest)
        row=conn.execute("select settings_config,meta from providers where id=? and app_type='claude-desktop'",(pid,)).fetchone()
        cfg=json.loads(row[0])if row else {'env':{}};cfg.setdefault('env',{}).update(ANTHROPIC_BASE_URL=endpoint,ANTHROPIC_AUTH_TOKEN=key);cfg['env'].pop('ANTHROPIC_MODEL',None)
        if args.provider in ('workbuddy','codebuddy'):
            cfg=native_desktop_settings(cfg)
        meta=json.loads(row[1]or'{}')if row else {};meta.pop('claude_desktop_model_routes',None)
        meta.update(commonConfigEnabled=False,claudeDesktopMode='proxy',apiFormat='anthropic',claudeDesktopModelRoutes=routes_for_settings(args.provider))
        values=(json.dumps(cfg,ensure_ascii=False),json.dumps(meta,ensure_ascii=False))
        if row: conn.execute("update providers set settings_config=?,meta=? where id=? and app_type='claude-desktop'",(*values,pid))
        else:
            conn.execute("""insert into providers(id,app_type,name,settings_config,website_url,category,created_at,sort_index,notes,icon,icon_color,meta,is_current,in_failover_queue,cost_multiplier,limit_daily_usd,limit_monthly_usd,provider_type)
                values(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",(pid,'claude-desktop',name,values[0],None,'custom',int(time.time()*1000),None,'Desktop Code / Cowork',None,None,values[1],0,0,'1.0',None,None,None))
    print(f'{name}: registered {len(routes_for(args.provider))} models; activate in CC Switch Desktop UI, then reopen Desktop.')
if __name__=='__main__': main()
