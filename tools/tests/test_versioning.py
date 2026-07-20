from __future__ import annotations

import pytest

from tools.versioning import (
    Train,
    compute_next_version,
    load_train,
    parse_tag,
    render_train_toml,
    set_train,
)


def test_parse_tag_stable() -> None:
    assert parse_tag("v1.2.3") == (1, 2, 3, None)


def test_parse_tag_rc() -> None:
    assert parse_tag("v1.2.3-rc4") == (1, 2, 3, 4)


@pytest.mark.parametrize(
    "tag",
    ["1.2.3", "v1.2", "v1.2.3-beta1", "v1.2.3.4", "vX.Y.Z", ""],
)
def test_parse_tag_rejects_non_matching(tag: str) -> None:
    assert parse_tag(tag) is None


def test_compute_next_version_no_existing_tags() -> None:
    assert compute_next_version(0, 1, [], rc=False) == "v0.1.0"
    assert compute_next_version(0, 1, [], rc=True) == "v0.1.0-rc1"


def test_compute_next_version_ignores_other_trains() -> None:
    tags = ["v0.2.5", "v1.0.0", "v0.1.0-rc1"]
    assert compute_next_version(0, 1, tags, rc=False) == "v0.1.0"
    assert compute_next_version(0, 1, tags, rc=True) == "v0.1.0-rc2"


def test_compute_next_version_stable_increments_patch() -> None:
    tags = ["v0.1.0", "v0.1.1", "v0.1.0-rc1"]
    assert compute_next_version(0, 1, tags, rc=False) == "v0.1.2"


def test_compute_next_version_rc_continues_sequence_for_next_patch() -> None:
    tags = ["v0.1.0", "v0.1.1-rc1", "v0.1.1-rc2"]
    assert compute_next_version(0, 1, tags, rc=True) == "v0.1.1-rc3"


def test_compute_next_version_rc_restarts_after_stable_release() -> None:
    tags = ["v0.1.0", "v0.1.1-rc1", "v0.1.1"]
    # v0.1.1 already shipped stable, so the next RC targets v0.1.2-rc1.
    assert compute_next_version(0, 1, tags, rc=True) == "v0.1.2-rc1"


def test_compute_next_version_malformed_tags_are_ignored() -> None:
    tags = ["not-a-tag", "v0.1.0", "release-42"]
    assert compute_next_version(0, 1, tags, rc=False) == "v0.1.1"


def test_render_train_toml_round_trips_through_load_train(tmp_path) -> None:
    path = tmp_path / "version.toml"
    path.write_text(render_train_toml(2, 7), encoding="utf-8")
    assert load_train(path) == Train(major=2, minor=7)


def test_load_train_rejects_missing_fields(tmp_path) -> None:
    path = tmp_path / "version.toml"
    path.write_text("[train]\nmajor = 1\n", encoding="utf-8")
    with pytest.raises(ValueError):
        load_train(path)


def test_load_train_rejects_negative_values(tmp_path) -> None:
    path = tmp_path / "version.toml"
    path.write_text("[train]\nmajor = -1\nminor = 0\n", encoding="utf-8")
    with pytest.raises(ValueError):
        load_train(path)


def test_set_train_preserves_rc_settings(tmp_path) -> None:
    path = tmp_path / "version.toml"
    path.write_text(
        render_train_toml(0, 1, pr_binaries=False, image_label="custom-label"),
        encoding="utf-8",
    )
    set_train(path, 0, 2)
    assert load_train(path) == Train(major=0, minor=2)
    assert 'image_label = "custom-label"' in path.read_text(encoding="utf-8")
    assert "pr_binaries = false" in path.read_text(encoding="utf-8")


def test_set_train_creates_file_with_defaults_when_missing(tmp_path) -> None:
    path = tmp_path / "version.toml"
    set_train(path, 3, 0)
    assert load_train(path) == Train(major=3, minor=0)
    assert "pr_binaries = true" in path.read_text(encoding="utf-8")
