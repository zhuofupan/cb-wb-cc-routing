import importlib.util,json,os,pathlib,sqlite3,sys,tempfile,unittest
from unittest.mock import patch
SCRIPTS=pathlib.Path(__file__).resolve().parents[1]/'scripts';sys.path.insert(0,str(SCRIPTS))
from desktop_models import auto_compact_window, routes_for, native_desktop_settings
def load(name):
    spec=importlib.util.spec_from_file_location(name,SCRIPTS/(name+'.py'));module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module);return module
register=load('register-ccswitch-desktop');setup=load('setup-claude-model-routes')
optimize=load('optimize-claude-desktop')
class DesktopTests(unittest.TestCase):
    def test_desktop_file_targets_leave_account_selection_and_gateway_credentials_intact(self):
        with tempfile.TemporaryDirectory() as tmp:
            home=pathlib.Path(tmp);root=home/'AppData/Local/Claude-3p'
            profile=root/'configLibrary';profile.mkdir(parents=True)
            (profile/'_meta.json').write_text(json.dumps({'appliedId':'0000-0000'}),encoding='utf8')
            original={'inferenceGatewayBaseUrl':'http://127.0.0.1:15721/claude-desktop','inferenceGatewayApiKey':'test-secret','defaultModelEffort':'max','inferenceModels':[{'name':'claude-fable-5'}]}
            (profile/'0000-0000.json').write_text(json.dumps(original),encoding='utf8')
            settings=home/'.claude/settings.json';settings.parent.mkdir();settings.write_text(json.dumps({'env':{'CLAUDE_CODE_EFFORT_LEVEL':'max'}}),encoding='utf8')
            account=root/'local-agent-mode-sessions/a/b/cowork_account_settings.json';account.parent.mkdir(parents=True)
            account.write_text(json.dumps({'__model_selector_state':{'code':{'model':'claude-fable-5-1','effort':'xhigh'}}}),encoding='utf8')
            saved=account.read_bytes();changes=dict(optimize.targets(home))
            self.assertEqual(len(changes),2);self.assertEqual(account.read_bytes(),saved)
            self.assertEqual(changes[profile/'0000-0000.json']['inferenceGatewayApiKey'],'test-secret')
            self.assertNotIn('defaultModelEffort',changes[profile/'0000-0000.json'])
            self.assertEqual(changes[profile/'0000-0000.json']['inferenceModels'],original['inferenceModels'])
            self.assertEqual(json.loads(settings.read_text(encoding='utf8'))['env']['CLAUDE_CODE_EFFORT_LEVEL'],'max')
    def test_compaction_threshold_reserves_model_output(self):
        # Legacy CLI helper only; native Desktop settings no longer apply it.
        self.assertEqual(auto_compact_window('deepseek-v4.1-flash', 1000000), 308750)
        self.assertEqual(auto_compact_window('minimax-m3.1-flash', 1000000), 308750)
        self.assertEqual(auto_compact_window('glm-5.3-flashx', 1000000), 308750)
        self.assertEqual(auto_compact_window('deepseek-v4.1-flash', 100000), 61750)

    def test_effort_levels_map_onto_declared_upstream_levels(self):
        from desktop_models import EFFORTS, CLIENT_LEVELS
        self.assertEqual(EFFORTS['deepseek-v4.1-flash'], ('low', 'high', 'max'))
        self.assertEqual(EFFORTS['glm-5.3-flashx'], ('low', 'high', 'max'))
        self.assertEqual(EFFORTS['minimax-m3.1-flash'], CLIENT_LEVELS)

    def test_models_prefixes_and_latest_id(self):
        for vendor,prefix in [('codebuddy','cb'),('workbuddy','wb')]:
            routes=routes_for(vendor);self.assertEqual(len(routes),3)
            self.assertTrue(all(r['labelOverride'].startswith(prefix+'/ ')for r in routes.values()))
            self.assertTrue(all(r['labelOverride'].endswith(' · 1M')for r in routes.values()))
            self.assertEqual(routes['claude-fable-5-1']['model'],'minimax-m3.1-flash')
            self.assertEqual(list(routes), sorted(routes))
            self.assertEqual([r['model'] for r in routes.values()], ['deepseek-v4.1-flash','minimax-m3.1-flash','glm-5.3-flashx'])
            self.assertEqual(routes['claude-haiku-5-5']['labelOverride'], prefix+'/ GLM-5.3-FlashX (0.19x) · 1M')
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
            self.assertEqual(len(meta['claudeDesktopModelRoutes']),3);self.assertNotIn('claude_desktop_model_routes',meta)
            # The client picker stays authoritative: no forced max in env.
            self.assertNotIn('CLAUDE_CODE_EFFORT_LEVEL',cfg['env'])
            self.assertEqual(cfg['env']['ENABLE_TOOL_SEARCH'],'auto')
            self.assertTrue(all('autoCompactWindow' not in m for m in cfg['modelSettings'].values()))
            self.assertTrue(all('defaultEffort' in route for route in meta['claudeDesktopModelRoutes'].values()))
    def test_native_settings_preserve_saved_levels_and_unrelated_models(self):
        original={'env':{'CLAUDE_CODE_EFFORT_LEVEL':'max','OTHER':'keep'},'model':'claude-fable-5-1','permissions':{'allow':['Read']},
                  'modelSettings':{'claude-fable-5':{'autoCompactWindow':840000,'effortLevel':'low'},'unrelated':{'autoCompactWindow':123456}}}
        result=native_desktop_settings(original)
        self.assertEqual(result['model'],original['model']);self.assertEqual(result['permissions'],original['permissions'])
        self.assertEqual(result['modelSettings']['claude-fable-5']['effortLevel'],'low')
        self.assertNotIn('autoCompactWindow',result['modelSettings']['claude-fable-5'])
        self.assertEqual(result['modelSettings']['unrelated'],original['modelSettings']['unrelated'])
        self.assertEqual(result['env']['OTHER'],'keep');self.assertNotIn('CLAUDE_CODE_EFFORT_LEVEL',result['env'])
        self.assertEqual(original['env']['CLAUDE_CODE_EFFORT_LEVEL'],'max')
        self.assertEqual(result,native_desktop_settings(result))
    def test_examples_match_current_mapping(self):
        for name in ['local-settings.json.example','codebuddy-settings.json.example']:
            doc=json.loads((SCRIPTS/name).read_text(encoding='utf8'));routes=routes_for(doc['mode'])
            self.assertEqual({m['id']for m in doc['models']},{r['model']for r in routes.values()})
            self.assertEqual(doc['exactRoutes']['claude-fable-5-1'],'minimax-m3.1-flash');self.assertFalse(doc['followClients'])
            labels={r['model']:r['labelOverride']for r in routes.values()}
            self.assertTrue(all(m['name']==labels[m['id']]for m in doc['models']))
    def test_new_codebuddy_provider_needs_only_key(self):
        with tempfile.TemporaryDirectory()as tmp:
            db=pathlib.Path(tmp)/'new.db';conn=sqlite3.connect(db)
            conn.execute('create table providers(id text,app_type text,name text,settings_config text,website_url text,category text,created_at integer,sort_index integer,notes text,icon text,icon_color text,meta text,is_current integer,in_failover_queue integer,cost_multiplier text,limit_daily_usd text,limit_monthly_usd text,provider_type text,primary key(id,app_type))');conn.close()
            with patch.dict(os.environ,{'CCSWITCH_DB':str(db),'CODEBUDDY_API_KEY':'ck_offline_test'},clear=True),patch.object(register,'ensure_stopped'):
                register.main(['--provider','codebuddy'])
            conn=sqlite3.connect(db);row=conn.execute('select name,settings_config,meta from providers').fetchone();conn.close()
            self.assertEqual(row[0],'CodeBuddy');self.assertEqual(json.loads(row[1])['env']['ANTHROPIC_BASE_URL'],'http://127.0.0.1:18792');self.assertEqual(len(json.loads(row[2])['claudeDesktopModelRoutes']),3)
if __name__=='__main__':unittest.main()
