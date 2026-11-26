#!/usr/bin/env python3
"""Check exact staged contents without altering the user's index/worktree."""
import os
from pathlib import Path
import subprocess
import sys
import tempfile

def git(*args):
    return subprocess.check_output(['git', *args], text=True).strip()

def main():
    root = git('rev-parse', '--show-toplevel')
    os.chdir(root)
    gitdir = git('rev-parse', '--absolute-git-dir')
    index = str(Path(git('rev-parse', '--git-path', 'index')).resolve())
    # Fail closed on unresolved index entries before materializing anything.
    git('write-tree')
    with tempfile.TemporaryDirectory(prefix='repo-layout-') as target:
        subprocess.run(['git', 'checkout-index', '--all', '--force', '--prefix=' + target + os.sep], check=True)
        env = os.environ.copy()
        env['GIT_DIR'] = gitdir
        env['GIT_WORK_TREE'] = target
        env['GIT_INDEX_FILE'] = index
        checker = Path(target) / '.githooks' / 'layout_check.py'
        if not checker.is_file() or checker.is_symlink():
            print('FAIL: staged layout checker is absent or a symlink', file=sys.stderr)
            return 1
        return subprocess.run([sys.executable, str(checker)], cwd=target, env=env).returncode

if __name__ == '__main__':
    try:
        sys.exit(main())
    except (OSError, subprocess.CalledProcessError) as error:
        print('FAIL: cannot check staged layout:', error, file=sys.stderr)
        sys.exit(1)
