"""Read local Codex rollout metadata for a user-run test, without UI automation.

Only user messages match the marker. Tool names/counts are evidence, not a claim
that tools succeeded. No prompts, tool outputs, API keys or auth tokens are saved.
"""
import argparse, collections, datetime, json, pathlib

def inspect(path, marker):
    matched=False; models=[]; efforts=[]; tools=collections.Counter(); outputs=0; session={}; completed=0; context={}
    def remember_context(p):
        if p.get('model')and p['model']not in models:models.append(p['model'])
        effort=p.get('effort')or p.get('reasoning_effort')
        if effort and effort not in efforts:efforts.append(effort)
    with path.open(encoding='utf8')as source:
        for line in source:
            try:row=json.loads(line)
            except ValueError:continue
            kind=row.get('type');p=row.get('payload',{})
            if kind=='session_meta':session={k:p.get(k)for k in ['id','model_provider','cwd','cli_version']}
            if kind=='turn_context':context=p
            if kind=='response_item'and p.get('role')=='user'and marker in json.dumps(p.get('content'),ensure_ascii=False):matched=True
            if kind=='event_msg'and p.get('type')=='user_message'and marker in str(p.get('message','')):matched=True
            if not matched:continue
            remember_context(context)
            if kind=='response_item':
                if p.get('type')in ['function_call','custom_tool_call']:tools[(p.get('namespace','')+'.'+p.get('name','')).strip('.')]+=1
                if p.get('type')in ['function_call_output','custom_tool_call_output']:outputs+=1
            if kind=='event_msg'and p.get('type')in ['task_complete','task_completed']:completed+=1
    return {'file':str(path),'session':session,'models':models,'efforts':efforts,'tool_calls':dict(tools),'tool_outputs':outputs,'completion_events':completed}if matched else None

def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--marker',required=True);p.add_argument('--sessions',type=pathlib.Path,default=pathlib.Path.home()/'.codex/sessions');p.add_argument('--output',type=pathlib.Path,required=True);args=p.parse_args()
    results=[]
    for path in sorted(args.sessions.rglob('*.jsonl'),key=lambda f:f.stat().st_mtime,reverse=True)[:100]:
        result=inspect(path,args.marker)
        if result:results.append(result)
    report={'generated_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'marker':args.marker,'sessions':results,'scope':'Local app rollout metadata; tool invocation is not proof of success or full-context capacity.'}
    args.output.parent.mkdir(parents=True,exist_ok=True);args.output.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf8');print(f'Matched {len(results)} sessions; evidence saved to {args.output}')
if __name__=='__main__':main()
