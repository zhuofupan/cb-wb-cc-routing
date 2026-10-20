"""Selected model tiers, verified against the upstream catalog on 2026-10-21."""
import os
import subprocess

MODELS = [
    ('claude-fable-5', 'deepseek-v4.1-flash', 'Deepseek-V4.1-Flash', 1000000, 'max'),
    ('claude-fable-5-1', 'minimax-m3.1-flash', 'MiniMax-M3.1-Flash', 1000000, 'max'),
    ('claude-haiku-5-5', 'glm-5.3-flashx', 'GLM-5.3-FlashX', 1000000, 'max'),
]
MULTIPLIERS = dict(zip((m[1] for m in MODELS), ['0.11', '0.08', '0.19']))

def model_label(vendor, model, label, window):
    prefix = {'workbuddy': 'wb', 'codebuddy': 'cb'}[vendor]
    size = f'{window//1000000}M' if window % 1000000 == 0 else f'{window//1000}k'
    return f'{prefix}/ {label} ({MULTIPLIERS[model]}x) \u00b7 {size}'

def routes_for(vendor):
    if vendor == 'deepseek':
        return {alias: {'model': model, 'labelOverride': label, 'supports1m': False}
                for alias, model, label in [('claude-sonnet-5','deepseek-flash','DeepSeek-V4.1-Flash·1M')]}
    result = {}
    for alias, model, label, window, _ in MODELS:
        result[alias] = {'model': model, 'labelOverride': model_label(vendor, model, label, window), 'supports1m': False}
    return result

def ensure_stopped():
    if os.name == 'nt':
        result = subprocess.run(['tasklist','/FI','IMAGENAME eq cc-switch.exe','/FO','CSV'], capture_output=True, text=True, check=True)
        if 'cc-switch.exe' in result.stdout.lower(): raise SystemExit('Exit CC Switch from the tray before changing its database.')
