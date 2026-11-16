import os
import tempfile

import pytest

TEST_DB = os.environ.get("TEST_DATABASE_URL")
if TEST_DB:
    os.environ["DATABASE_URL"] = TEST_DB
os.environ.setdefault("COOKIE_SECURE", "false")
os.environ.setdefault("MEDIA_DIR", tempfile.mkdtemp(prefix="giapha-media-"))
os.environ.setdefault("PUBLIC_RATE_LIMIT_PER_MIN", "100000")
os.environ.setdefault("AUTH_RATE_LIMIT_PER_MIN", "100000")


def pytest_collection_modifyitems(config, items):
    if TEST_DB:
        return
    skip = pytest.mark.skip(reason="Cần TEST_DATABASE_URL để chạy kiểm thử tích hợp")
    for item in items:
        if "integration" in item.keywords:
            item.add_marker(skip)
