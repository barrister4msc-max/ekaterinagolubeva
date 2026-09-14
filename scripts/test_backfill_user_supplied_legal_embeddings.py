#!/usr/bin/env python3
import unittest

import backfill_user_supplied_legal_embeddings as backfill


GROUPS = [
    "16887b7d-3714-52bd-8138-491a10a22043",
    "5a12d4f2-9b84-545e-be36-c1b63138a73f",
]


def row(group_id: str, *, head: bool = True, content_verified: str = "false") -> dict:
    metadata = {
        **backfill.REQUIRED_METADATA,
        "source_group_id": group_id,
        "is_source_head": "true" if head else "false",
        "content_verified": content_verified,
    }
    return {"id": group_id, "content": "verified extraction text", "metadata": metadata}


class ExactGroupContractTests(unittest.TestCase):
    def test_parse_group_ids_normalizes_and_requires_unique_uuid_values(self) -> None:
        parsed = backfill.parse_group_ids('["16887B7D-3714-52BD-8138-491A10A22043"]')
        self.assertEqual(parsed, ["16887b7d-3714-52bd-8138-491a10a22043"])
        with self.assertRaises(ValueError):
            backfill.parse_group_ids('["16887b7d-3714-52bd-8138-491a10a22043","16887b7d-3714-52bd-8138-491a10a22043"]')

    def test_exact_rows_with_fail_closed_metadata_are_accepted(self) -> None:
        backfill.validate_rows(
            [row(GROUPS[0]), row(GROUPS[1])],
            GROUPS,
            expected_groups=2,
            expected_chunks=2,
        )

    def test_admission_flag_mismatch_is_rejected(self) -> None:
        with self.assertRaisesRegex(ValueError, "content_verified"):
            backfill.validate_rows(
                [row(GROUPS[0], content_verified="true"), row(GROUPS[1])],
                GROUPS,
                expected_groups=2,
                expected_chunks=2,
            )

    def test_missing_source_group_is_rejected(self) -> None:
        with self.assertRaisesRegex(ValueError, "expected 2 pending chunks"):
            backfill.validate_rows(
                [row(GROUPS[0])],
                GROUPS,
                expected_groups=2,
                expected_chunks=2,
            )


    def test_json_boolean_metadata_is_normalized_for_fail_closed_contract(self) -> None:
        boolean_row = row(GROUPS[0])
        for key in (
            "official_origin_verified",
            "content_verified",
            "substantive_use_allowed",
            "use_in_generation",
        ):
            boolean_row["metadata"][key] = False
        backfill.validate_rows(
            [boolean_row, row(GROUPS[1])],
            GROUPS,
            expected_groups=2,
            expected_chunks=2,
        )


if __name__ == "__main__":
    unittest.main()
