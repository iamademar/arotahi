"""Shared code for the NZ Recurring Crash Area Prioritisation Assistant.

Implements the CAS-only pipeline described in spec_v2.md. The notebooks in
``notebooks/`` are thin drivers over these modules.
"""

GRID_VERSION = "nztm-1km-origin0-v1"
FEATURE_SCHEMA_VERSION = "cas-area-features-1.0.0"
MODEL_VERSION = "cas-area-risk-1.0.0"
RANDOM_SEED = 20250831

__all__ = [
    "GRID_VERSION",
    "FEATURE_SCHEMA_VERSION",
    "MODEL_VERSION",
    "RANDOM_SEED",
]
