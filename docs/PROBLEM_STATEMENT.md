# Problem statement — AI video analytics for skilling-centre integrity

The target this app is being adapted to. Treat every item as a requirement and
check new work against it. Build status is tracked in `CLAUDE.md` (M1–M5).

## Background
Government-funded skilling schemes rely on a large, geographically dispersed
network of empaneled training centres, many of which are physically inspected
only periodically. This creates two recurring integrity risks:

1. attendance records that do not reflect actual physical presence of trainees;
2. centres whose approved infrastructure (equipment, seating capacity,
   workshop facilities) is not consistently available or maintained between
   inspection cycles.

Manual, periodic inspection is resource-intensive and cannot catch issues that
arise between visits, and existing camera infrastructure at many centres is
used only for passive recording rather than active compliance monitoring. An
AI-based system that processes centre camera feeds in near real time — flagging
attendance discrepancies and infrastructure gaps as they occur rather than at
the next scheduled audit — would materially reduce leakage and improve the
credibility of scheme delivery data reported up to the ministry.

## The system must
1. Process live or periodic camera feeds from training centres to estimate
   actual attendance and cross-check it against records submitted by the centre.
2. Detect the presence/absence and apparent operability of approved
   infrastructure items (workbenches, machinery, seating) against the centre's
   sanctioned inventory.
3. Flag discrepancies (attendance mismatches, missing/non-functional equipment)
   to a monitoring dashboard for follow-up, rather than requiring manual review
   of raw footage.
4. Operate within realistic bandwidth and camera-quality constraints found at
   rural and semi-urban training centres.
5. Preserve trainee privacy using aggregate presence-detection rather than
   facial identification wherever a compliance check does not require
   individual identification.

## Expected outcomes (the deliverables)
- A working video-analytics pipeline demonstrated on sample/simulated centre footage.
- An attendance-discrepancy and infrastructure-compliance dashboard for scheme monitoring units.
- A privacy-preserving design note explaining what is and isn't identified from footage.
- A false-positive/false-negative accuracy assessment on the demonstration dataset.
- A low-bandwidth deployment mode suitable for centres with limited connectivity.

## Coverage map (as of 2026-10-02)

| Requirement | Status |
|---|---|
| 1. Attendance cross-check | Done in code (M2 SQL engine: peak head-count minus 1 instructor vs claimed present+late; re-runs on late marking and corrections). Not yet verified on a live database. |
| 2. Infrastructure vs sanctioned inventory | Done in code (M1 `centre_inventory`; M2 `equipment_missing`, `equipment_nonfunctional`, `capacity_exceeded`). "Operability" is only a pixel heuristic (`display_on`, `motion`) — the weakest link; report its error rate honestly. COCO cannot detect workbenches/machinery; a fine-tuned model is needed. |
| 3. Monitoring dashboard | **Not built — M4.** Must flag, rank centres, and support follow-up status (open / acknowledged / resolved / dismissed are already in the schema). |
| 4. Bandwidth / camera quality | Done in the worker (edge inference, ~250 B per observation, SQLite offline outbox, batching, ROI, smaller input size). Not yet benchmarked on low-end hardware or degraded video (low resolution, heavy compression, low light) — M5. |
| 5. Privacy | Done by design (counts only; allow-listed payload pinned by tests; no tracking or re-identification; monitors have no row access to trainee attendance). **The written design note is not done — M5.** |
| Deliverable: working pipeline on sample footage | Worker runs on synthetic data only. Needs real or public clips and a real model. |
| Deliverable: false-positive / false-negative assessment | **Not done — M5.** Needs labelled frames and ground-truth counts, per-class precision/recall, and engine-level FP/FN on injected discrepancies. |

## Ideas that keep us close to the statement
- Per-centre "last observed" freshness, and a flag for centres whose cameras go
  silent (the statement stresses near-real-time between inspections).
- Roll-ups suited to a ministry / monitoring unit: by state, district and area
  type (rural vs semi-urban), severity trend, repeat offenders.
- A demo mode that seeds a few centres with injected discrepancies so the
  dashboard can be shown without live cameras.
- Keep a per-`model_version` accuracy record (observations already store it).
