#!/usr/bin/env python3
"""Copy a tagged release of web/ into a consumer repo (site or app)."""
import argparse
import hashlib
import io
import json
import os
import re
import shutil
import subprocess
import sys
import tarfile
import tempfile
from pathlib import Path

TAG_RE = re.compile(r"^v(\d+)\.(\d+)\.(\d+)$")
START = "<!-- aaidle:game-body:start -->"
END = "<!-- aaidle:game-body:end -->"
MARKERS = {"site": "manage.py", "app": "AAIDLE.xcodeproj"}
SITE_BASE = "analysis/static/aaidle"
APP_BASE = "AAIDLE/Resources/web/aaidle"
README = ("Copied from rlabduke/aaidle `{tag}` (`{commit}`). Do not edit here: change "
          "aaidle, tag it, and run `tools/sync.py {target}` from the aaidle clone.\n")


class SyncError(Exception):
    pass


def _git(repo, *args, binary=False):
    try:
        out = subprocess.run(["git", "-C", str(repo), *args], check=True,
                             capture_output=True)
    except subprocess.CalledProcessError as e:
        raise SyncError("git %s failed: %s" % (args[0], e.stderr.decode().strip()))
    return out.stdout if binary else out.stdout.decode().strip()


def _version_path(target, dest):
    base = SITE_BASE if target == "site" else APP_BASE
    return Path(dest) / base / "VERSION.json"


def _check_dest(target, dest):
    if target not in MARKERS:
        raise SyncError("target must be site or app")
    if not (Path(dest) / MARKERS[target]).exists():
        raise SyncError("%s is not a %s checkout (no %s)" % (dest, target, MARKERS[target]))


def _game_body(index_html):
    s = index_html.find(START)
    e = index_html.find(END)
    if s < 0 or e < 0 or e < s:
        raise SyncError("web/index.html lacks the aaidle:game-body markers in order")
    return index_html[s + len(START):e].strip("\n") + "\n"


def _sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _swap(src, dst):
    dst.parent.mkdir(parents=True, exist_ok=True)
    os.replace(src, dst)


def sync(target, dest_repo, ref, aaidle_repo):
    dest = Path(dest_repo)
    _check_dest(target, dest)
    if not TAG_RE.match(ref):
        raise SyncError("ref must be a version tag like v1.2.3, got %r" % ref)
    commit = _git(aaidle_repo, "rev-parse", ref + "^{commit}")
    archive = _git(aaidle_repo, "archive", ref, "web/", binary=True)

    # Build the whole result in a staging dir that mirrors the destination layout,
    # so nothing in dest changes until every check has passed.
    stage = Path(tempfile.mkdtemp(prefix=".aaidle-stage-", dir=dest))
    try:
        with tarfile.open(fileobj=io.BytesIO(archive)) as tar:
            tar.extractall(stage / "src", filter="data") if hasattr(tarfile, "data_filter") \
                else tar.extractall(stage / "src")
        web = stage / "src" / "web"
        if not (web / "index.html").is_file():
            raise SyncError("web/index.html is missing in %s" % ref)
        body = _game_body((web / "index.html").read_text())

        out = stage / "out"
        base = SITE_BASE if target == "site" else APP_BASE
        tree = out / base / ref if target == "site" else out / base
        readme = out / SITE_BASE / "README.md" if target == "site" else tree / "README.md"
        shutil.copytree(web, tree)
        readme.write_text(README.format(tag=ref, commit=commit, target=target))
        if target == "site":
            (out / "templates/aaidle").mkdir(parents=True)
            (out / "templates/aaidle/game_body.html").write_text(body)
        files = {str(p.relative_to(out)): _sha(p)
                 for p in sorted(out.rglob("*")) if p.is_file()}
        record = {"tag": ref, "commit": commit, "files": files}
        version = out / base / "VERSION.json"
        version.write_text(json.dumps(record, indent=2, sort_keys=True) + "\n")

        if target == "site":
            old_base = dest / SITE_BASE
            for old in old_base.glob("v*"):
                if old.is_dir():
                    shutil.rmtree(old)
            _swap(tree, old_base / ref)
            _swap(readme, old_base / "README.md")
            _swap(out / "templates/aaidle/game_body.html",
                  dest / "templates/aaidle/game_body.html")
            _swap(version, old_base / "VERSION.json")
        else:
            live = dest / APP_BASE
            if live.exists():
                os.replace(live, stage / "old")
            _swap(tree, live)
    finally:
        shutil.rmtree(stage, ignore_errors=True)
    return record


def _tag_key(tag):
    return tuple(int(n) for n in TAG_RE.match(tag).groups())


def latest_tag(aaidle_repo):
    tags = [t for t in _git(aaidle_repo, "tag", "--list").split() if TAG_RE.match(t)]
    if not tags:
        raise SyncError("no version tags in %s" % aaidle_repo)
    return max(tags, key=_tag_key)


def check(target, dest_repo, aaidle_repo):
    _check_dest(target, dest_repo)
    vfile = _version_path(target, dest_repo)
    if not vfile.exists():
        raise SyncError("no VERSION.json at %s; run a sync first" % vfile)
    synced = json.loads(vfile.read_text())["tag"]
    newest = latest_tag(aaidle_repo)
    if synced == newest:
        return True, "up to date (%s)" % synced
    if TAG_RE.match(synced) and _tag_key(synced) > _tag_key(newest):
        return False, ("clone is older than the synced copy (%s); run git fetch --tags"
                       % synced)
    return False, "behind: %s synced, %s available" % (synced, newest)


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("target", choices=sorted(MARKERS))
    ap.add_argument("dest")
    mode = ap.add_mutually_exclusive_group(required=True)
    mode.add_argument("--ref", help="version tag to copy, e.g. v1.0.0")
    mode.add_argument("--check", action="store_true")
    ap.add_argument("--aaidle", default=str(Path(__file__).resolve().parent.parent),
                    help="aaidle clone to read tags from (default: this one)")
    args = ap.parse_args(argv)
    aaidle = args.aaidle
    try:
        if args.check:
            ok, msg = check(args.target, args.dest, aaidle)
            print(msg)
            return 0 if ok else 1
        rec = sync(args.target, args.dest, args.ref, aaidle)
        print("synced %s (%s): %d files" % (rec["tag"], rec["commit"], len(rec["files"])))
        return 0
    except SyncError as e:
        print("error: %s" % e, file=sys.stderr)
        return 2


if __name__ == "__main__":
    sys.exit(main())
