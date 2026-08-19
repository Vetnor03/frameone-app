# Surf calibration

The deterministic RE:MIND scorer remains the authoritative base. Calibration replays stored
conditions through that scorer and learns bounded rating residuals, never replacement weights.
The server queries at most 250 recent rows for the same spot. Shared rows exclude the current
user; personal rows contain only that user, preventing double counting. Eight qualifying rows
from three users are required for shared calibration and three rows for personal calibration.
Both adjustments are confidence-shrunk and independently capped at 0.75 points.

`waveguide_experience.json` remains the existing low-confidence bootstrap used by the legacy
experience matcher. It is not inserted into shared/user residual counts, so it cannot dominate
real observations. Requests using scoped database observations use residual calibration; old
unscoped callers retain compatibility with the legacy matcher. Final 1–6 conversion happens
once, after continuous base, shared, and personal scores are combined.
