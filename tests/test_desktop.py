import importlib.util,json,os,pathlib,sqlite3,sys,tempfile,unittest
from unittest.mock import patch
SCRIPTS=pathlib.Path(__file__).resolve().parents[1]/'scripts';sys.path.insert(0,str(SCRIPTS))
from desktop_models import routes_for
def load(name):
    spec=importlib.util.spec_from_file_location(name,SCRIPTS/(name+'.py'));module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module);return module
register=load('register-ccswitch-desktop');setup=load('setup-claude-model-routes')
class DesktopTests(unittest.TestCase):
    def test_models_prefixes_and_latest_id(self):
        for vendor,prefix in [('codebuddy','cb'),('workbuddy','wb')]:
            routes=routes_for(vendor);self.assertEqual(len(routes),5)
            self.assertTrue(all(r['labelOverride'].startswith(prefix+'·')for r in routes.values()))
            self.assertTrue(all(r['labelOverride'].endswith(' · 1M')for r in routes.values()))
            self.assertEqual(routes['claude-haiku-5']['model'],'minimax-m3.1-flash')
            self.assertEqual([r['model'] for r in routes.values()], ['deepseek-v4.1-flash','minimax-m3.1-flash','glm-5.3-flashx','glm-5.3','kimi-k3-2'])
            self.assertEqual(routes['claude-haiku-5-5']['labelOverride'], prefix+'·GLM-5.3-FlashX (0.19x) · 1M')
        self.assertEqual(routes_for('deepseek')['claude-sonnet-5']['model'],'deepseek-flash')
    def test_update_preserves_identity_active_state_and_unrelated_config(self):
        with tempfile.TemporaryDirectory()as tmp:
            db=pathlib.Path(tmp)/'fixture.db';conn=sqlite3.connect(db)
            conn.execute('create table providers(id text,app_type text,name text,settings_config text,meta text,is_current integer,primary key(id,app_type))')
            cfg={'env':{'CUSTOM':'keep','ANTHROPIC_MODEL':'stale'},'permissions':{'allow':['Read']}}
            conn.execute('insert into providers values(?,?,?,?,?,?)',('claude-codebuddy-ck','claude-desktop','CodeBuddy',json.dumps(cfg),json.dumps({'retained':True}),1));conn.commit();conn.close()
            with patch.dict(os.environ,{'CCSWITCH_DB':str(db),'CODEBUDDY_API_KEY':'ck_offline_test'}),patch.object(register,'ensure_stopped'),patch.object(setup,'ensure_stopped'):
                register.main(['--provider','codebuddy']);register.main(['--provider','codebuddy']);setup.main(['--provider','codebuddy'])
            conn=sqlite3.connect(db);rows=conn.execute('select settings_config,meta,is_current from providers').fetchall();conn.close()
            self.assertEqual(len(rows),1);cfg,meta,current=rows[0];cfg=json.loads(cfg);meta=json.loads(meta)
            self.assertEqual(current,1);self.assertTrue(meta['retained']);self.assertEqual(cfg['env']['CUSTOM'],'keep');self.assertEqual(cfg['permissions'],{'allow':['Read']});self.assertNotIn('ANTHROPIC_MODEL',cfg['env'])
            self.assertEqual(len(meta['claudeDesktopModelRoutes']),5);self.assertNotIn('claude_desktop_model_routes',meta)
    def test_examples_match_current_mapping(self):
        for name in ['local-settings.json.example','codebuddy-settings.json.example']:
            doc=json.loads((SCRIPTS/name).read_text(encoding='utf8'));routes=routes_for(doc['mode'])
            self.assertEqual({m['id']for m in doc['models']},{r['model']for r in routes.values()})
            self.assertEqual(doc['exactRoutes']['claude-haiku-5'],'minimax-m3.1-flash');self.assertFalse(doc['followClients'])
            labels={r['model']:r['labelOverride']for r in routes.values()}
            self.assertTrue(all(m['name']==labels[m['id']]for m in doc['models']))
    def test_new_codebuddy_provider_needs_only_key(self):
        with tempfile.TemporaryDirectory()as tmp:
            db=pathlib.Path(tmp)/'new.db';conn=sqlite3.connect(db)
            conn.execute('create table providers(id text,app_type text,name text,settings_config text,website_url text,category text,created_at integer,sort_index integer,notes text,icon text,icon_color text,meta text,is_current integer,in_failover_queue integer,cost_multiplier text,limit_daily_usd text,limit_monthly_usd text,provider_type text,primary key(id,app_type))');conn.close()
            with patch.dict(os.environ,{'CCSWITCH_DB':str(db),'CODEBUDDY_API_KEY':'ck_offline_test'},clear=True),patch.object(register,'ensure_stopped'):
                register.main(['--provider','codebuddy'])
            conn=sqlite3.connect(db);row=conn.execute('select name,settings_config,meta from providers').fetchone();conn.close()
            self.assertEqual(row[0],'CodeBuddy');self.assertEqual(json.loads(row[1])['env']['ANTHROPIC_BASE_URL'],'http://127.0.0.1:18792');self.assertEqual(len(json.loads(row[2])['claudeDesktopModelRoutes']),5)
if __name__=='__main__':unittest.main()
