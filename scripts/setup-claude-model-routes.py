"""Update existing Desktop provider mappings; CC Switch must be closed."""
from contextlib import closing
import argparse, datetime, json, os, pathlib, sqlite3
from desktop_models import routes_for, ensure_stopped
IDS={'workbuddy':'claude-workbuddy-local','codebuddy':'claude-codebuddy-ck'}
def main(argv=None):
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--provider',choices=[*IDS,'all'],default='workbuddy');args=p.parse_args(argv)
    ensure_stopped()
    db=pathlib.Path(os.environ.get('CCSWITCH_DB') or pathlib.Path.home()/'.cc-switch/cc-switch.db')
    if not db.is_file(): raise SystemExit('CC Switch database not found')
    with closing(sqlite3.connect(db)) as conn, conn:
        with closing(sqlite3.connect(str(db)+'.backup-'+datetime.datetime.now().strftime('%Y%m%d-%H%M%S-%f'))) as dest: conn.backup(dest)
        for vendor in IDS if args.provider=='all' else [args.provider]:
            pid=IDS[vendor];row=conn.execute("select meta from providers where id=? and app_type='claude-desktop'",(pid,)).fetchone()
            if not row: raise SystemExit(f'{vendor} Desktop provider not found; register it first')
            meta=json.loads(row[0]or'{}');meta.pop('claude_desktop_model_routes',None)
            meta.update(commonConfigEnabled=False,claudeDesktopMode='proxy',apiFormat='anthropic',claudeDesktopModelRoutes=routes_for(vendor))
            conn.execute("update providers set meta=? where id=? and app_type='claude-desktop'",(json.dumps(meta,ensure_ascii=False),pid))
            print(f'{vendor}: stored {len(routes_for(vendor))} routes')
    print('Restart CC Switch, activate the Desktop provider, and reopen Desktop. Keep its profile writable.')
if __name__=='__main__': main()
