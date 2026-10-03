#!/usr/bin/env python3
"""
DEPRECATED for the live gallery.

The demo now ships real PCam test-set patches produced by:

    python scripts/export_gallery.py

This script remains only as a fallback if you cannot download PCam and need
synthetic H&E-like placeholders for UI wiring. Prefer export_gallery.py.
"""

from __future__ import annotations

import sys

print(
    "create_sample_images.py is deprecated.\n"
    "Use:  python scripts/export_gallery.py\n"
    "(requires PCam test x/y h5 under ./pcam_data/pcam/)\n",
    file=sys.stderr,
)
sys.exit(1)
