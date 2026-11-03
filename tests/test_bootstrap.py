import subprocess
import unittest
from pathlib import Path


ROOT = Path(__file__).parents[1]
BOOTSTRAP = ROOT / "deploy" / "bootstrap"


class BootstrapTests(unittest.TestCase):
    def test_bootstrap_has_valid_shell_syntax(self):
        self.assertEqual(subprocess.run(["/bin/sh", "-n", str(BOOTSTRAP)]).returncode, 0)

    def test_bootstrap_is_dry_run_by_default_and_requires_apply_for_mutations(self):
        text = BOOTSTRAP.read_text()
        self.assertIn("APPLY=0", text)
        self.assertIn('run() { if [ "$APPLY" -eq 1 ]; then "$@"; else plan "$*"; fi; }', text)
        self.assertIn("--apply                      perform changes", text)

    def test_bootstrap_keeps_privileged_steps_explicit(self):
        text = BOOTSTRAP.read_text()
        self.assertIn("--enable-timers", text)
        self.assertIn("--authorize-root", text)
        self.assertIn("--install-packet-bridge", text)
        self.assertIn("visudo -cf", text)
        self.assertIn("systemd-analyze verify", text)
        self.assertIn("timers installed but left disabled", text)

    def test_bootstrap_preserves_local_and_fixed_path_guards(self):
        text = BOOTSTRAP.read_text()
        self.assertIn('cd "$SOURCE"\nrun "$VENV/bin/python" setup.py install', text)
        self.assertIn("Debian's minimal venv omits wheel", text)
        self.assertIn("refusing nonlocal SQLite path", text)
        self.assertIn("refusing symlinked managed path", text)
        self.assertIn("--adopt-existing", text)
        self.assertIn("database already exists; inspect it", text)
        self.assertIn("runuser -u", text)
        self.assertNotIn("curl ", text)
        self.assertNotIn("git clone", text)


if __name__ == "__main__":
    unittest.main()
