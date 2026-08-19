# Surf calibration

The deterministic RE:MIND scorer remains the authoritative base. The existing static legacy
experience blend remains its low-weight bootstrap; shared and personal calibration are layered
after that bootstrap. Calibration replays stored conditions through the same base/bootstrap
pipeline and learns bounded rating residuals, never replacement weights.
The server queries at most 250 recent rows for the same spot. Shared rows exclude the current
user; personal rows contain only that user, preventing double counting. Eight qualifying rows
from three users are required for shared calibration and three rows for personal calibration.
Both adjustments are confidence-shrunk and independently capped at 0.75 points.

`waveguide_experience.json` remains the existing low-confidence bootstrap used by the legacy
experience matcher. It is not inserted into shared/user residual counts, so it cannot dominate
real observations. Requests using scoped database observations use residual calibration; old
unscoped callers retain compatibility with the legacy matcher. Final 1–6 conversion happens
once, after continuous bootstrap, shared, and personal scores are combined. Each historical
personal residual uses the shared adjustment calculated for that historical session's conditions,
not the current forecast's shared adjustment.

Historical bootstrap predictions and per-personal-session shared expectations are memoized with
weak references to the request's candidate objects and pool. Repeated forecast/daypart scores reuse
that preparation; the cache has no persistent user-id key and is garbage-collectable with the
request data.

The `surf_model_version` migration must be applied before deploying the updated experience
logging endpoint, because new and updated rows write that column.
