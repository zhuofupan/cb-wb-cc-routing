"""Selected model tiers, effort mapping and compaction budgets (2026-10-21)."""
import os
import subprocess
import copy

MODELS = [
    ('claude-fable-5', 'deepseek-v4.1-flash', 'Deepseek-V4.1-Flash', 1000000, 'max'),
    ('claude-fable-5-1', 'minimax-m3.1-flash', 'MiniMax-M3.1-Flash', 1000000, 'max'),
    ('claude-haiku-5-5', 'glm-5.3-flashx', 'GLM-5.3-FlashX', 1000000, 'max'),
]
MULTIPLIERS = dict(zip((m[1] for m in MODELS), ['0.11', '0.08', '0.19']))
MAX_OUTPUT = {
    'deepseek-v4.1-flash': 128000,
    'minimax-m3.1-flash': 128000,
    'glm-5.3-flashx': 131072,
}

# Effort levels the upstream account catalog declares per model on 2026-10-21.
# DeepSeek and GLM expose low/high/max; MiniMax exposes all five. Both clients
# always offer five levels, so every request is mapped onto this set and the
# gateway never sends a level the model does not declare.
CLIENT_LEVELS = ('low', 'medium', 'high', 'xhigh', 'max')
EFFORTS = {
    'deepseek-v4.1-flash': ('low', 'high', 'max'),
    'minimax-m3.1-flash': CLIENT_LEVELS,
    'glm-5.3-flashx': ('low', 'high', 'max'),
}
# Upstream defaultEffort from the same catalog: what a fresh thread uses.
DEFAULT_EFFORT = {
    'deepseek-v4.1-flash': 'high',
    'minimax-m3.1-flash': 'max',
    'glm-5.3-flashx': 'high',
}

# Adapter policy, not a universal Codex default: 65% of the usable window,
# capped using a chosen 500k reference budget.
CODEX_REFERENCE_WINDOW = 500_000
CODEX_EFFECTIVE_WINDOW = 0.95
CODEX_COMPACT_FRACTION = 0.65


def map_effort(model, level):
    """Nearest declared upstream level; ties go to the cheaper level."""
    declared = EFFORTS.get(model, CLIENT_LEVELS)
    if level not in CLIENT_LEVELS or level in declared:
        return level
    target = CLIENT_LEVELS.index(level)
    return min(declared, key=lambda effort: (abs(CLIENT_LEVELS.index(effort) - target), CLIENT_LEVELS.index(effort)))


def supported_levels(model):
    """Client-facing levels with their real upstream target, in ascending order."""
    return [{'effort': level, 'description': f'Upstream: {map_effort(model, level)}'} for level in CLIENT_LEVELS]


def auto_compact_window(model=None, window=0):
    """Adapter compaction policy, capped by its chosen reference budget."""
    if not window or window <= 0:
        return None
    usable = window * CODEX_EFFECTIVE_WINDOW
    reference = CODEX_REFERENCE_WINDOW * CODEX_EFFECTIVE_WINDOW * CODEX_COMPACT_FRACTION
    return max(1000, int(min(usable * CODEX_COMPACT_FRACTION, reference)))


def native_desktop_settings(settings):
    """Keep picker choices; let the installed Desktop SDK manage compaction."""
    result = copy.deepcopy(settings)
    env = result.setdefault('env', {})
    # An environment effort override defeats saved per-model picker choices.
    env.pop('CLAUDE_CODE_EFFORT_LEVEL', None)
    env.setdefault('ENABLE_TOOL_SEARCH', 'auto')
    models = result.setdefault('modelSettings', {})
    for alias, slug, *_ in MODELS:
        for name in (alias, alias + '[1m]', slug):
            if name != alias and name not in models:
                continue
            row = models.setdefault(name, {})
            row.pop('autoCompactWindow', None)
            row.setdefault('maxEffortLevel', 'max')
    return result


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


def routes_for_settings(vendor):
    """Routes plus per-route effort metadata for the CC Switch Desktop profile."""
    routes = routes_for(vendor)
    for route in routes.values():
        route['defaultEffort'] = DEFAULT_EFFORT.get(route['model'], 'high')
    return routes


def ensure_stopped():
    if os.name == 'nt':
        result = subprocess.run(['tasklist','/FI','IMAGENAME eq cc-switch.exe','/FO','CSV'], capture_output=True, text=True, check=True)
        if 'cc-switch.exe' in result.stdout.lower(): raise SystemExit('Exit CC Switch from the tray before changing its database.')
