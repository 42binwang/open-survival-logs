"""Merge the coverage audits into docs/FEATURES.md.

Rows come from docs/audit/part-*.md (same columns as FEATURES.md); docs/audit/overrides.json replaces the
Status / Code / Test cells of rows fixed after their audit. Prints the status counts and any row whose
test pointer names a test that does not exist in tests/*.test.js.
"""

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
FEATURES = ROOT / "docs" / "FEATURES.md"
AUDIT = ROOT / "docs" / "audit"
ROW = re.compile(r"^\| ([A-T]\d\d) \|")


def cells(line):
    parts = [p.strip() for p in line.strip().strip("|").split(" | ")]
    return parts


def row(cols):
    return "| " + " | ".join(cols) + " |"


def main():
    audited = {}
    for part in sorted(AUDIT.glob("part-*.md")):
        for line in part.read_text(encoding="utf-8").splitlines():
            m = ROW.match(line)
            if m:
                audited[m.group(1)] = cells(line)
    overrides = json.loads((AUDIT / "overrides.json").read_text(encoding="utf-8"))
    lines = FEATURES.read_text(encoding="utf-8").splitlines()
    out, seen = [], set()
    for line in lines:
        m = ROW.match(line)
        if not m:
            out.append(line)
            continue
        rid = m.group(1)
        base = cells(line)
        cols = audited.get(rid, base)
        if len(cols) != 6:
            sys.exit(f"{rid}: expected 6 columns, got {len(cols)}")
        if cols[0:3] != base[0:3]:
            cols[0:3] = base[0:3]
        ov = overrides.get(rid) if not rid.startswith("_") else None
        if ov:
            cols[3] = ov.get("status", cols[3])
            cols[4] = ov.get("code", cols[4])
            cols[5] = ov.get("test", cols[5])
        seen.add(rid)
        out.append(row(cols))
    FEATURES.write_text("\n".join(out) + "\n", encoding="utf-8")

    counts = {}
    exact, patterns = set(), []
    decl = re.compile(r"^\s*test(?:\.todo)?\(\s*(['\"`])((?:\\.|(?!\1).)*)\1", re.M)
    for t in (ROOT / "tests").glob("*.test.js"):
        for m in decl.finditer(t.read_text(encoding="utf-8")):
            name = re.sub(r"\\(.)", r"\1", m.group(2))
            if m.group(1) == "`" and "${" in name:
                pat = "".join(".+" if part.startswith("${") else re.escape(part) for part in re.split(r"(\$\{[^}]*\})", name))
                patterns.append((t.name, re.compile("^" + pat + "$")))
            else:
                exact.add((t.name, name))
    renames = overrides.get("_renames", {})
    missing = []
    for i, line in enumerate(out):
        m = ROW.match(line)
        if not m:
            continue
        c = cells(line)
        for old, new in renames.items():
            c[5] = c[5].replace(f"'{old}'", f"'{new}'")
        out[i] = row(c)
        counts[c[3]] = counts.get(c[3], 0) + 1
        for piece in c[5].split("; "):
            pm = re.match(r"`tests/([\w.-]+\.test\.js)` › '(.*)'", piece.strip())
            if not pm:
                continue
            f, name = pm.group(1), pm.group(2)
            if (f, name) in exact or any(pf == f and rx.match(name) for pf, rx in patterns):
                continue
            missing.append((m.group(1), f, name))
    FEATURES.write_text("\n".join(out) + "\n", encoding="utf-8")
    print("rows", len(seen), "status", counts)
    for rid, f, name in missing:
        print("missing test", rid, f, name)


if __name__ == "__main__":
    main()
