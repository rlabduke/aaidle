import hashlib
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "tools"))
import sync  # noqa: E402

INDEX = (
    "<html><body>\n<!-- aaidle:game-body:start -->\n"
    "<div id=\"game\">%s</div>\n<!-- aaidle:game-body:end -->\n</body></html>\n"
)


def git(repo, *args):
    subprocess.run(["git", "-C", str(repo), *args], check=True, capture_output=True)


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


class SyncTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        root = Path(self.tmp.name)
        self.src = root / "aaidle"
        (self.src / "web").mkdir(parents=True)
        git(self.src, "init", "-q")
        git(self.src, "config", "user.email", "t@example.com")
        git(self.src, "config", "user.name", "t")
        self.commit("one", "v1.0.0")
        self.commit("two", "v1.1.0")
        self.site = root / "site"
        self.site.mkdir()
        (self.site / "manage.py").write_text("")
        self.app = root / "app"
        (self.app / "AAIDLE.xcodeproj").mkdir(parents=True)

    def tearDown(self):
        self.tmp.cleanup()

    def commit(self, body, tag):
        (self.src / "web" / "index.html").write_text(INDEX % body)
        (self.src / "web" / "a.js").write_text("// " + body + "\n")
        git(self.src, "add", "web")
        git(self.src, "commit", "-q", "-m", body)
        git(self.src, "tag", tag)

    def head(self, tag):
        out = subprocess.run(["git", "-C", str(self.src), "rev-parse", tag + "^{commit}"],
                             check=True, capture_output=True, text=True)
        return out.stdout.strip()

    def test_site_layout(self):
        rec = sync.sync("site", self.site, "v1.1.0", self.src)
        base = self.site / "analysis/static/aaidle"
        self.assertEqual((base / "v1.1.0/a.js").read_text(), "// two\n")
        self.assertEqual((self.site / "templates/aaidle/game_body.html").read_text(),
                         '<div id="game">two</div>\n')
        readme = (base / "README.md").read_text()
        self.assertIn("`v1.1.0` (`%s`)" % self.head("v1.1.0"), readme)
        self.assertIn("`tools/sync.py site`", readme)
        on_disk = json.loads((base / "VERSION.json").read_text())
        self.assertEqual(on_disk, rec)
        self.assertEqual(rec["tag"], "v1.1.0")
        self.assertEqual(rec["commit"], self.head("v1.1.0"))
        self.assertEqual(sorted(rec["files"]), [
            "analysis/static/aaidle/README.md",
            "analysis/static/aaidle/v1.1.0/a.js",
            "analysis/static/aaidle/v1.1.0/index.html",
            "templates/aaidle/game_body.html",
        ])
        for rel, digest in rec["files"].items():
            self.assertEqual(sha(self.site / rel), digest)
        text = (base / "VERSION.json").read_text()
        self.assertEqual(text, json.dumps(rec, indent=2, sort_keys=True) + "\n")

    def test_app_layout(self):
        rec = sync.sync("app", self.app, "v1.0.0", self.src)
        base = self.app / "AAIDLE/Resources/web/aaidle"
        self.assertEqual((base / "a.js").read_text(), "// one\n")
        self.assertIn("`tools/sync.py app`", (base / "README.md").read_text())
        self.assertEqual(json.loads((base / "VERSION.json").read_text()), rec)
        self.assertEqual(sorted(rec["files"]), [
            "AAIDLE/Resources/web/aaidle/README.md",
            "AAIDLE/Resources/web/aaidle/a.js",
            "AAIDLE/Resources/web/aaidle/index.html",
        ])
        for rel, digest in rec["files"].items():
            self.assertEqual(sha(self.app / rel), digest)

    def test_resync_removes_old_version(self):
        sync.sync("site", self.site, "v1.0.0", self.src)
        sync.sync("site", self.site, "v1.1.0", self.src)
        base = self.site / "analysis/static/aaidle"
        self.assertFalse((base / "v1.0.0").exists())
        self.assertTrue((base / "v1.1.0").is_dir())

    def test_app_resync_drops_stale_files(self):
        base = self.app / "AAIDLE/Resources/web/aaidle"
        base.mkdir(parents=True)
        (base / "stale.js").write_text("x")
        sync.sync("app", self.app, "v1.1.0", self.src)
        self.assertFalse((base / "stale.js").exists())

    def test_uncommitted_edit_ignored(self):
        (self.src / "web" / "a.js").write_text("// dirty\n")
        sync.sync("site", self.site, "v1.1.0", self.src)
        self.assertEqual(
            (self.site / "analysis/static/aaidle/v1.1.0/a.js").read_text(), "// two\n")

    def test_check(self):
        sync.sync("site", self.site, "v1.1.0", self.src)
        self.assertEqual(sync.check("site", self.site, self.src),
                         (True, "up to date (v1.1.0)"))
        sync.sync("site", self.site, "v1.0.0", self.src)
        self.assertEqual(sync.check("site", self.site, self.src),
                         (False, "behind: v1.0.0 synced, v1.1.0 available"))

    def test_check_numeric_order(self):
        sync.sync("app", self.app, "v1.0.0", self.src)
        git(self.src, "tag", "v1.9.0")
        git(self.src, "tag", "v1.10.0")
        git(self.src, "tag", "not-a-version")
        self.assertEqual(sync.check("app", self.app, self.src),
                         (False, "behind: v1.0.0 synced, v1.10.0 available"))

    def test_refusals(self):
        with self.assertRaises(sync.SyncError):
            sync.sync("site", self.app, "v1.0.0", self.src)
        with self.assertRaises(sync.SyncError):
            sync.sync("app", self.site, "v1.0.0", self.src)
        for bad in ("main", "1.0.0", "v1.0", "v1.0.0-rc1"):
            with self.assertRaises(sync.SyncError):
                sync.sync("site", self.site, bad, self.src)

    def snapshot(self, root):
        return {str(p.relative_to(root)): p.read_bytes()
                for p in sorted(Path(root).rglob("*")) if p.is_file()}

    def bad_tag(self, tag, index):
        if index is None:
            (self.src / "web" / "index.html").unlink()
        else:
            (self.src / "web" / "index.html").write_text(index)
        (self.src / "web" / "a.js").write_text("// bad\n")
        git(self.src, "add", "-A", "web")
        git(self.src, "commit", "-q", "-m", tag)
        git(self.src, "tag", tag)

    def test_bad_release_leaves_destination_untouched(self):
        self.bad_tag("v2.0.0", "<html>no markers</html>\n")
        self.bad_tag("v2.1.0", "<!-- aaidle:game-body:end --> x <!-- aaidle:game-body:start -->\n")
        self.bad_tag("v2.2.0", None)
        script = str(Path(sync.__file__))
        for target, dest in (("site", self.site), ("app", self.app)):
            sync.sync(target, dest, "v1.0.0", self.src)
            before = self.snapshot(dest)
            tops = sorted(p.name for p in Path(dest).iterdir())
            for bad in ("v2.0.0", "v2.1.0", "v2.2.0"):
                with self.assertRaises(sync.SyncError):
                    sync.sync(target, dest, bad, self.src)
                self.assertEqual(self.snapshot(dest), before)
                self.assertEqual(sorted(p.name for p in Path(dest).iterdir()), tops)
                r = subprocess.run([sys.executable, script, target, str(dest), "--ref", bad,
                                    "--aaidle", str(self.src)], capture_output=True, text=True)
                self.assertEqual(r.returncode, 2, r.stderr)
                self.assertEqual(self.snapshot(dest), before)

    def test_cli_exit_codes(self):
        script = str(Path(sync.__file__))

        def run(*args):
            return subprocess.run([sys.executable, script, *args, "--aaidle", str(self.src)],
                                  capture_output=True, text=True)
        self.assertEqual(run("site", str(self.app), "--ref", "v1.0.0").returncode, 2)
        self.assertEqual(run("site", str(self.site), "--ref", "main").returncode, 2)
        self.assertEqual(run("site", str(self.site), "--ref", "v1.0.0").returncode, 0)
        self.assertEqual(run("site", str(self.site), "--check").returncode, 1)
        self.assertEqual(run("site", str(self.site), "--ref", "v1.1.0").returncode, 0)
        self.assertEqual(run("site", str(self.site), "--check").returncode, 0)


if __name__ == "__main__":
    unittest.main()
