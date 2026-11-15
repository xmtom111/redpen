"""Frozen-app entry point: serve bundled assets and open a loopback browser."""
from __future__ import annotations

import argparse
import multiprocessing
import sys
from pathlib import Path


def main() -> None:
    multiprocessing.freeze_support()
    parser = argparse.ArgumentParser(description='RedPen local web app')
    parser.add_argument('--self-test', action='store_true', help='Verify bundled assets and SymPy, then exit')
    args = parser.parse_args()
    # PyInstaller expands bundled resources alongside the imported modules.
    bundle = Path(getattr(sys, '_MEIPASS', Path(__file__).resolve().parent))
    import redpen
    from demo import server
    redpen.ROOT = bundle
    server.ROOT = bundle
    server.BANK = bundle / 'demo' / 'bank'
    server.STATIC = bundle / 'demo' / 'static'
    if args.self_test:
        import sympy
        banks = server.load_banks()
        assert len(banks['en']) and len(banks['zh'])
        checks = redpen.run_checks(['diff(x**3,x) == 3*x**2'])
        assert all(c['status'] == 'pass' for c in checks), checks
        assert (bundle / 'AGENTS.md').is_file()
        assert (server.STATIC / 'browser-ai.js').is_file()
        print('RedPen self-test passed: bilingual banks, bundled assets, SymPy ' + sympy.__version__)
        return
    # OS-assigned port avoids conflicts and permits multiple app launches.
    server.serve('127.0.0.1', 0, open_browser=True)


if __name__ == '__main__':
    main()
