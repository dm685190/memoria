import subprocess
import unittest
from pathlib import Path


HELPER = Path(__file__).parents[1] / "deploy" / "helpers" / "memoria-packet"


class PacketHelperTests(unittest.TestCase):
    def invoke(self, *args):
        return subprocess.run(["/bin/sh", str(HELPER), *args], text=True, capture_output=True)

    def test_helper_has_valid_shell_syntax(self):
        self.assertEqual(subprocess.run(["/bin/sh", "-n", str(HELPER)]).returncode, 0)

    def test_helper_rejects_empty_or_unknown_arguments_before_privilege_use(self):
        for args in ((), ("--db", "/tmp/x"), ("--task", "x"), ("--task", "x", "--query", "q", "--limit", "6")):
            result = self.invoke(*args)
            self.assertEqual(result.returncode, 64, result.stderr)
            self.assertIn("usage: memoria-packet", result.stderr)

    def test_helper_accepts_valid_packet_arguments_before_execution(self):
        result = self.invoke("--task", "safe task", "--query", "safe query", "--limit", "1", "--max-chars", "822")
        self.assertNotEqual(result.returncode, 64, result.stderr)
        self.assertNotIn("usage: memoria-packet", result.stderr)

    def test_helper_uses_fixed_unprivileged_execution_path(self):
        text = HELPER.read_text()
        self.assertIn('CLI=/opt/memoria/.venv/bin/memoria', text)
        self.assertIn('DB=/var/lib/memoria/memoria.db', text)
        self.assertIn('exec /usr/sbin/runuser -u memoria -- "$CLI" packet --db "$DB"', text)
        self.assertNotIn('eval ', text)


if __name__ == "__main__":
    unittest.main()
