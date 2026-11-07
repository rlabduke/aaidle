#!/usr/bin/env python3
"""Copy a tagged release of web/ into a consumer repo (site or app)."""
import argparse
import hashlib
import io
import json
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
    s = index_html.index(START) + len(START)
    e = index_html.index(END)
    return index_html[s:e].strip("\n") + "\n"


def _sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def sync(target, dest_repo, ref, aaidle_repo):
    dest = Path(dest_repo)
    _check_dest(target, dest)
    if not TAG_RE.match(ref):
        raise SyncError("ref must be a version tag like v1.2.3, got %r" % ref)
    commit = _git(aaidle_repo, "rev-parse", ref + "^{commit}")
    archive = _git(aaidle_repo, "archive", ref, "web/", binary=True)

    with tempfile.TemporaryDirectory() as tmp:
        with tarfile.open(fileobj=io.BytesIO(archive)) as tar:
            tar.extractall(tmp, filter="data") if hasattr(tarfile, "data_filter") \
                else tar.extractall(tmp)
        web = Path(tmp) / "web"
        index = (web / "index.html").read_text()

        if target == "site":
            base = dest / SITE_BASE
            for old in base.glob("v*"):
                if old.is_dir():
                    shutil.rmtree(old)
            tree = base / ref
            readme = base / "README.md"
            body = dest / "templates/aaidle/game_body.html"
        else:
            tree = dest / APP_BASE
            if tree.exists():
                shutil.rmtree(tree)
            readme = tree / "README.md"
            body = None

        shutil.copytree(web, tree)
        readme.parent.mkdir(parents=True, exist_ok=True)
        readme.write_text(README.format(tag=ref, commit=commit, target=target))
        copied = [p for p in tree.rglob("*") if p.is_file()] + [readme]
        if body is not None:
            body.parent.mkdir(parents=True, exist_ok=True)
            body.write_text(_game_body(index))
            copied.append(body)

    record = {
        "tag": ref,
        "commit": commit,
        "files": {str(p.relative_to(dest)): _sha(p) for p in sorted(copied)},
    }
    _version_path(target, dest).write_text(
        json.dumps(record, indent=2, sort_keys=True) + "\n")
    return record


def latest_tag(aaidle_repo):
    tags = [t for t in _git(aaidle_repo, "tag", "--list").split() if TAG_RE.match(t)]
    if not tags:
        raise SyncError("no version tags in %s" % aaidle_repo)
    return max(tags, key=lambda t: tuple(int(n) for n in TAG_RE.match(t).groups()))


def check(target, dest_repo, aaidle_repo):
    _check_dest(target, dest_repo)
    vfile = _version_path(target, dest_repo)
    if not vfile.exists():
        raise SyncError("no VERSION.json at %s; run a sync first" % vfile)
    synced = json.loads(vfile.read_text())["tag"]
    newest = latest_tag(aaidle_repo)
    if synced == newest:
        return True, "up to date (%s)" % synced
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
