#!/usr/bin/env python3
"""Report token usage per skill, from Claude Code session transcripts.

Claude Code stamps each assistant record with `attributionSkill` for the span a
skill is active, so no hooks or instrumentation are needed -- this works
retroactively over every session already on disk.
"""
import json, glob, os, sys, collections

ROOT = os.path.expanduser("~/.claude/projects")


def collect(paths):
    """(skill, model) -> usage totals. Dedupes by message id: one API response
    appears as several transcript records (one per streamed content block) and
    each carries the same cumulative usage."""
    acc = collections.defaultdict(collections.Counter)
    seen = set()
    for path in paths:
        with open(path) as fh:
            for line in fh:
                try:
                    r = json.loads(line)
                except ValueError:
                    continue
                if r.get("type") != "assistant":
                    continue
                msg = r.get("message", {})
                mid = msg.get("id")
                if not mid or mid in seen:
                    continue
                seen.add(mid)
                u = msg.get("usage", {})
                skill = r.get("attributionSkill") or "(no skill)"
                if r.get("isSidechain"):
                    skill += " [subagent]"
                k = (skill, msg.get("model", "?"))
                acc[k]["msgs"] += 1
                acc[k]["out"] += u.get("output_tokens", 0)
                acc[k]["cache_w"] += u.get("cache_creation_input_tokens", 0)
                acc[k]["cache_r"] += u.get("cache_read_input_tokens", 0)
                acc[k]["in"] += u.get("input_tokens", 0)
    return acc


def fmt(n):
    return f"{n/1e6:.1f}M" if n >= 1e6 else f"{n/1e3:.1f}k" if n >= 1e3 else str(n)


def main():
    args = sys.argv[1:]
    as_json = "--json" in args
    args = [a for a in args if a != "--json"]
    if args:
        paths = [p for a in args for p in glob.glob(a)]
    else:
        paths = glob.glob(os.path.join(ROOT, "*", "*.jsonl"))
    if not paths:
        sys.exit("no transcripts found")

    acc = collect(paths)
    rows = sorted(acc.items(), key=lambda kv: -kv[1]["out"])

    if as_json:
        json.dump({"transcripts": len(paths),
                   "rows": [{"skill": s, "model": m, **c} for (s, m), c in rows]},
                  sys.stdout, indent=2)
        print()
        return

    w = max([len(s) for (s, _), _ in rows] + [10])
    print(f"{len(paths)} transcript(s)\n")
    print(f"{'skill':<{w}}  {'model':<14} {'msgs':>5} {'output':>8} "
          f"{'cache_w':>8} {'cache_r':>9} {'input':>7}")
    print("-" * (w + 57))
    tot = collections.Counter()
    for (skill, model), c in rows:
        print(f"{skill:<{w}}  {model:<14} {c['msgs']:>5} {fmt(c['out']):>8} "
              f"{fmt(c['cache_w']):>8} {fmt(c['cache_r']):>9} {fmt(c['in']):>7}")
        tot.update(c)
    print("-" * (w + 57))
    print(f"{'TOTAL':<{w}}  {'':<14} {tot['msgs']:>5} {fmt(tot['out']):>8} "
          f"{fmt(tot['cache_w']):>8} {fmt(tot['cache_r']):>9} {fmt(tot['in']):>7}")
    print("\ncache_w = new tokens written to cache, cache_r = context re-read "
          "(cheap),\ninput = uncached input. Only `output` and `cache_w` are "
          "fresh work; cache_r\ngrows with conversation length, not with what "
          "the skill did.")


if __name__ == "__main__":
    main()
