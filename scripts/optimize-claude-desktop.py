"""Preview or apply native CB/WB Desktop settings; close CC Switch to apply."""
import argparse
from contextlib import closing
import datetime
import json
import os
from pathlib import Path
import re
import shutil
import sqlite3

from desktop_models import ensure_stopped, native_desktop_settings, routes_for_settings


def targets(home):
    root = home / 'AppData/Local/Claude-3p'
    paths = [home / '.claude/settings.json']
    paths += list((root / 'local-agent-mode-sessions').glob('*/*/*/.claude/settings.json'))
    paths += list((root / 'claude-code-sessions').glob('*/*/.claude/settings.json'))
    changes = []
    for path in dict.fromkeys(paths):
        if not path.is_file(): continue
        before = json.loads(path.read_text(encoding='utf8'))
        after = native_desktop_settings(before)
        if before != after: changes.append((path, after))
    meta = root / 'configLibrary/_meta.json'
    if meta.is_file():
        ident = json.loads(meta.read_text(encoding='utf8')).get('appliedId', '')
        if re.fullmatch(r'[a-fA-F0-9-]+', ident):
            path = meta.parent / (ident + '.json')
            before = json.loads(path.read_text(encoding='utf8'))
            if str(before.get('inferenceGatewayBaseUrl', '')).startswith('http://127.0.0.1:15721/'):
                after = dict(before)
                after.pop('defaultModelEffort', None)
                after['alwaysStartWithDefaultModel'] = False
                if before != after: changes.append((path, after))
    return changes


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--home', type=Path, default=Path.home())
    parser.add_argument('--db', type=Path)
    parser.add_argument('--apply', action='store_true')
    parser.add_argument('--clear-legacy-effort-policy', action='store_true')
    args = parser.parse_args(argv)
    db = args.db or args.home / '.cc-switch/cc-switch.db'
    if args.apply: ensure_stopped()
    changes = targets(args.home)
    backup = None
    if args.apply:
        backup = args.home / '.codex/integrations/deepseek-workbuddy' / ('backup-desktop-native-' + datetime.datetime.now().strftime('%Y%m%d-%H%M%S-%f'))
        backup.mkdir(parents=True)
    cards = []
    if db.is_file():
        with closing(sqlite3.connect(str(db) if args.apply else f'{db.as_uri()}?mode=ro', uri=not args.apply)) as conn:
            if args.apply:
                with closing(sqlite3.connect(backup / 'cc-switch.db')) as dest: conn.backup(dest)
            with conn:
                for vendor in ['codebuddy', 'workbuddy']:
                    ident = 'claude-codebuddy-ck' if vendor == 'codebuddy' else 'claude-workbuddy-local'
                    row = conn.execute("select settings_config,meta from providers where id=? and app_type='claude-desktop'", (ident,)).fetchone()
                    if not row: continue
                    before, meta = json.loads(row[0]), json.loads(row[1] or '{}')
                    after = native_desktop_settings(before)
                    next_meta = {**meta, 'claudeDesktopModelRoutes': routes_for_settings(vendor)}
                    if before == after and meta == next_meta: continue
                    cards.append(ident)
                    if args.apply:
                        conn.execute("update providers set settings_config=?,meta=? where id=? and app_type='claude-desktop'",
                                     (json.dumps(after, ensure_ascii=False), json.dumps(next_meta, ensure_ascii=False), ident))
    manifest = []
    policy_status = 'not_requested'
    if args.apply:
        for index, (path, after) in enumerate(changes):
            saved = f'{index:02d}-{path.name}'
            shutil.copy2(path, backup / saved)
            temp = path.with_suffix('.native.tmp')
            temp.write_text(json.dumps(after, ensure_ascii=False, indent=2) + '\n', encoding='utf8')
            temp.replace(path)
            manifest.append({'path': str(path), 'backup': saved})
        if args.clear_legacy_effort_policy and os.name == 'nt':
            import winreg
            policy_status = 'unchanged'
            try:
                with winreg.OpenKey(winreg.HKEY_CURRENT_USER, r'SOFTWARE\Policies\Claude', 0, winreg.KEY_READ | winreg.KEY_SET_VALUE) as key:
                    value, kind = winreg.QueryValueEx(key, 'effortLevel')
                    if value == 'max':
                        (backup / 'effort-policy.json').write_text(json.dumps({'name': 'effortLevel', 'value': value, 'type': kind}) + '\n', encoding='utf8')
                        winreg.DeleteValue(key, 'effortLevel')
                        policy_status = 'removed_legacy_max'
            except FileNotFoundError: pass
            except PermissionError: policy_status = 'protected_policy_unchanged'
        (backup / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n', encoding='utf8')
    print(json.dumps({'applied': args.apply, 'settings_files': len(changes), 'cards': cards, 'backup': str(backup) if backup else None, 'effort_policy': policy_status}, ensure_ascii=True))


if __name__ == '__main__': main()
