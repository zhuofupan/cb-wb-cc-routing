"""Map Claude Desktop's model picker onto the WorkBuddy models Codex uses.

CC Switch stores this in the provider's meta under `claude_desktop_model_routes`
(route id -> {model, label_override, supports_1m}) and renders it into the 3P
profile's `inferenceModels`. `label_override` is what the desktop menu shows, so
this is how the picker gets WorkBuddy names instead of Claude names.

Run with CC Switch stopped.
"""
import json
import os
import pathlib
import sqlite3
import time

DB = pathlib.Path(os.environ.get("CCSWITCH_DB", "C:/path/to/cc-switch.db"))
PROVIDER_ID = "claude-workbuddy-local"

# Same nine models the Codex picker shows, keyed by role-valid route ids
# (Claude Desktop only accepts claude-{opus,sonnet,haiku,fable}-* shapes).
ROUTES = [
    ("claude-opus-5",      "Hy4 preview",        "hy4-preview"),
    ("claude-opus-5-5",    "Step-5-Preview",     "step-5-preview"),
    ("claude-sonnet-5",    "Deepseek-V4.1-Flash", "deepseek-v4.1-flash"),
    ("claude-sonnet-5-5",  "Deepseek-V4-Pro",    "deepseek-v4-pro"),
    ("claude-haiku-5",     "GLM-5.3",            "glm-5.3"),
    ("claude-haiku-5-5",   "Kimi-K3",            "kimi-k3-2"),
    ("claude-haiku-4-5",   "MiniMax-M3",         "minimax-m3-pay"),
    ("claude-fable-5",     "MiMo-V2.6-Pro",      "mimo-v2.6-pro"),
    ("claude-fable-5-1",   "Space-Bunny",        "space-bunny"),
]


def main():
    conn = sqlite3.connect(DB)
    row = conn.execute(
        "select meta, settings_config from providers where id=? and app_type='claude-desktop'",
        (PROVIDER_ID,)).fetchone()
    if not row:
        raise SystemExit("provider not found")

    meta = json.loads(row[0]) if row[0] else {}
    meta["claude_desktop_model_routes"] = {
        route_id: {"model": model, "label_override": label, "supports_1m": True}
        for route_id, label, model in ROUTES
    }
    conn.execute("update providers set meta=? where id=? and app_type='claude-desktop'",
                 (json.dumps(meta, ensure_ascii=False), PROVIDER_ID))
    conn.commit()
    conn.close()
    print(json.dumps({"routes": len(ROUTES), "stored": True}, ensure_ascii=False))

    # Also write the profile directly, so a desktop restart shows the change even
    # before CC Switch re-applies the provider.
    profile = pathlib.Path(
        os.environ.get(
            "CLAUDE_3P_PROFILE",
            str(pathlib.Path(os.environ.get("LOCALAPPDATA", "")) / "Claude-3p"
                / "configLibrary" / "00000000-0000-4000-8000-000000157210.json")))
    doc = json.loads(profile.read_text(encoding="utf-8"))
    # `supports1m: true` makes the picker render a second "1M context window"
    # row for every entry, so it is deliberately omitted: name + labelOverride
    # is enough and yields exactly one row per model.
    doc["inferenceModels"] = [
        {"name": route_id, "labelOverride": label}
        for route_id, label, _ in ROUTES
    ]
    profile.write_text(json.dumps(doc, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({"profile_models": len(doc["inferenceModels"])}, ensure_ascii=False))


if __name__ == "__main__":
    main()
