"""Edge worker: turns camera frames into aggregate counts and ships ONLY counts.

Privacy contract (enforced in code, see counting.Observation.to_payload):
frames live in memory for the duration of one inference call and are never
written to disk, logged, or transmitted. Nothing here identifies a person —
no faces, no tracking IDs, no cross-frame association. The only things that
leave the centre are a head-count and per-item equipment tallies.
"""

__version__ = "0.1.0"
