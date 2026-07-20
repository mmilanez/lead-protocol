"""Regression checks for vendor-neutral branch naming examples."""

from pathlib import Path

import pytest


REPOSITORY_ROOT = Path(__file__).resolve().parents[2]
GENERIC_BRANCH_RULES = (
    REPOSITORY_ROOT / ".agents" / "PROJECT_RULES.md",
    REPOSITORY_ROOT / ".agents" / "modules" / "git-substrate.md",
)
VENDOR_SPECIFIC_DEFAULTS = ("`claude/*`", "`claude/<description>`")


@pytest.mark.parametrize("rules_path", GENERIC_BRANCH_RULES)
def test_generic_branch_examples_use_mapped_agent_slug(rules_path: Path) -> None:
    content = rules_path.read_text(encoding="utf-8")

    assert "`<agent-slug>/<description>`" in content
    for vendor_default in VENDOR_SPECIFIC_DEFAULTS:
        assert vendor_default not in content
