"""Shared pytest configuration for tests under scripts/.

Inserts the repo root onto sys.path so test files can `import skill_crawler`
without each one repeating the path manipulation. Replaces the previous
per-file `sys.path.insert` in test_skill_crawler.py.
"""
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).parent.parent
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))
