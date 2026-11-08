"""Check the four delivery vectors using raw UTF-8 SHA-256 and JSON Schema."""

import hashlib
import json
from pathlib import Path

from jsonschema import Draft202012Validator


def main() -> None:
    outcomes = set()
    for path in sorted((Path(__file__).parent / "vectors").glob("*.json")):
        vector = json.loads(path.read_text(encoding="utf-8"))
        assert vector["format"] == "delivery-conformance-vector/v1", path
        assert vector["body_encoding"] == "utf-8", path
        assert vector["criteria"]["content_type"] == "application/json", path
        body = vector["delivered_body"]
        actual_digest = "sha256:" + hashlib.sha256(body.encode("utf-8")).hexdigest()

        schema = vector["criteria"]["schema"]
        Draft202012Validator.check_schema(schema)
        schema_errors = list(Draft202012Validator(schema).iter_errors(json.loads(body)))

        # Both checks finish before findings are assembled or compared.
        checks = {
            "digest": "pass" if actual_digest == vector["expected_digest"] else "fail",
            "schema": "fail" if schema_errors else "pass",
        }
        findings = []
        if checks["digest"] == "fail":
            findings.append("digest_mismatch")
        if checks["schema"] == "fail":
            findings.append("schema_violation")
        assert checks == vector["expected_checks"], (path, checks)
        assert findings == vector["expected_findings"], (path, findings)
        outcomes.add((checks["digest"], checks["schema"]))
        print(f"{vector['id']}: digest={checks['digest']} schema={checks['schema']} findings={findings}")

    assert outcomes == {("pass", "pass"), ("pass", "fail"), ("fail", "pass"), ("fail", "fail")}
    print("verified all four independent digest/schema outcomes")


if __name__ == "__main__":
    main()
