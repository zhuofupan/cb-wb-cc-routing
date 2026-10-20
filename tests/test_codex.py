import importlib.util, json, pathlib, sqlite3, sys, tempfile, tomllib, unittest
ROOT=pathlib.Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT/'scripts'))
spec=importlib.util.spec_from_file_location('codex_register',ROOT/'scripts/register-ccswitch-providers.py');module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)

class CodexTests(unittest.TestCase):
    def test_evidence_uses_context_before_user_marker_and_omits_outputs(self):
        spec=importlib.util.spec_from_file_location('evidence',ROOT/'scripts/collect-codex-evidence.py');evidence=importlib.util.module_from_spec(spec);spec.loader.exec_module(evidence)
        with tempfile.TemporaryDirectory()as tmp:
            p=pathlib.Path(tmp)/'rollout.jsonl';rows=[{'type':'turn_context','payload':{'model':'minimax-m3.1-flash','effort':'max'}},{'type':'response_item','payload':{'role':'user','content':'TEST-MARKER'}},{'type':'response_item','payload':{'type':'function_call_output','output':'private output'}}];p.write_text('\n'.join(json.dumps(row)for row in rows),encoding='utf8')
            result=evidence.inspect(p,'TEST-MARKER');self.assertEqual(result['models'],['minimax-m3.1-flash']);self.assertEqual(result['efforts'],['max']);self.assertNotIn('private output',json.dumps(result));self.assertIsNone(evidence.inspect(p,'NOT-THERE'))
    def test_catalog_capacity_effort_and_vision(self):
        template={'model_messages':{'instructions':'official prompt'},'shell_type':'unified_exec','supports_search_tool':True}
        for vendor,count in [('codebuddy',9),('workbuddy',9),('deepseek',2)]:
            models=module.catalog(vendor,template)['models'];self.assertEqual(len(models),count)
            for m in models:
                self.assertNotIn('model_messages',m);self.assertEqual(m['context_window'],m['max_context_window']);self.assertFalse(m['supports_search_tool'])
                self.assertEqual(m['default_reasoning_level'],'high' if m['slug']in ['hy4-preview','step-5-preview']else'max')
            if vendor=='deepseek':self.assertEqual(models[1]['input_modalities'],['text']);self.assertEqual(models[0]['context_window'],1048576)
            else:self.assertTrue(all(m['display_name'].startswith('CB·'if vendor=='codebuddy'else'WB·')for m in models))
    def test_registration_preserves_selection_and_other_settings(self):
        with sqlite3.connect(':memory:')as conn:
            conn.execute('create table providers(id text,app_type text,settings_config text,meta text,is_current integer)')
            conn.execute('insert into providers values(?,?,?,?,?)',('codex-codebuddy-ck','codex',json.dumps({'auth':{'keep':'official-login-policy'},'other':'keep'}),json.dumps({'custom':'keep'}),1))
            module.register(conn,'codebuddy','ck_test_with_"quotes','D:/folder with spaces/catalog.json')
            cfg,meta,current=conn.execute('select settings_config,meta,is_current from providers').fetchone();cfg=json.loads(cfg);t=tomllib.loads(cfg['config'])
            self.assertEqual(current,1);self.assertEqual(cfg['other'],'keep');self.assertEqual(cfg['auth']['keep'],'official-login-policy');self.assertEqual(json.loads(meta)['custom'],'keep')
            self.assertFalse(t['model_providers']['custom']['requires_openai_auth']);self.assertEqual(t['model_reasoning_effort'],'max');self.assertNotIn('preferred_auth_method',t)
            self.assertEqual(t['model_providers']['custom']['experimental_bearer_token'],'ck_test_with_"quotes')
    def test_common_plugins_and_safety_settings_survive(self):
        base='model = "gpt-example"\nservice_tier = "fast"\napproval_policy = "on-request"\n[plugins.example]\nenabled = true\n[mcp_servers.example]\ncommand = "node"\n[model_providers.custom]\nrequires_openai_auth = true\n'
        parsed=tomllib.loads(module.config('workbuddy','test','D:/models.json',base))
        self.assertEqual(parsed['approval_policy'],'on-request');self.assertTrue(parsed['plugins']['example']['enabled']);self.assertEqual(parsed['mcp_servers']['example']['command'],'node');self.assertNotIn('service_tier',parsed)
if __name__=='__main__':unittest.main()
