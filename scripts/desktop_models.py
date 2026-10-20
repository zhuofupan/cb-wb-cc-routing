"""Selected model tiers, verified against the upstream catalog on 2026-10-20."""
import os
import subprocess

MODELS = [
    ('claude-opus-5', 'hy4-preview', 'Hy4 preview', 960000, 'high'),
    ('claude-opus-5-5', 'step-5-preview', 'Step-5-Preview', 1000000, 'high'),
    ('claude-sonnet-5', 'deepseek-v4.1-flash', 'Deepseek-V4.1-Flash', 1000000, 'max'),
    ('claude-sonnet-5-5', 'deepseek-v4-pro', 'Deepseek-V4-Pro', 1000000, 'max'),
    ('claude-haiku-5', 'glm-5.3', 'GLM-5.3', 1000000, 'max'),
    ('claude-haiku-5-5', 'kimi-k3-2', 'Kimi-K3', 1000000, 'max'),
    ('claude-opus-4-8', 'minimax-m3.1-flash', 'MiniMax-M3.1-Flash', 1000000, 'max'),
    ('claude-fable-5', 'mimo-v2.6-pro', 'Xiaomi MiMo-V2.6-Pro', 1000000, 'max'),
    ('claude-fable-5-1', 'space-bunny', 'Space-Bunny', 1000000, 'max'),
]

def routes_for(vendor):
    if vendor == 'deepseek':
        return {alias: {'model': model, 'labelOverride': label, 'supports1m': False}
                for alias, model, label in [('claude-sonnet-5','deepseek-flash','DeepSeek-V4.1-Flash·1M'),('claude-sonnet-5-5','deepseek-v4-pro','DeepSeek-V4-Pro·1M')]}
    prefix = {'workbuddy': 'WB', 'codebuddy': 'CB'}[vendor]
    result = {}
    for alias, model, label, window, _ in MODELS:
        size = f'{window//1000000}M' if window % 1000000 == 0 else f'{window//1000}k'
        result[alias] = {'model': model, 'labelOverride': f'{prefix}·{label}·{size}', 'supports1m': False}
    return result

def ensure_stopped():
    if os.name == 'nt':
        result = subprocess.run(['tasklist','/FI','IMAGENAME eq cc-switch.exe','/FO','CSV'], capture_output=True, text=True, check=True)
        if 'cc-switch.exe' in result.stdout.lower(): raise SystemExit('Exit CC Switch from the tray before changing its database.')
