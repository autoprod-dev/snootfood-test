# Chef Gerardo art

The app's chef is one **slot** that swaps between six expressions. Each expression is a pair of files
(WebP with alpha, plus a 256-colour PNG fallback), all made from the final art by `tools/prep_chef.py`.

| Expression | Files | When it shows | Move (styles.css) |
|---|---|---|---|
| `judging` | `chef-judging.webp`, `.png` | Idle, home, the wait, 18+ check, scores 5–6 | pop-in from the corner, idle bob, wobble while waiting, tilt |
| `disgust` | `chef-disgust.webp`, `.png` | Scores 3–4 | melting shudder (+ the stamp droops) |
| `faint` | `chef-faint.webp`, `.png` | Scores 0–2 | drops in and fades (+ the stamp droops) |
| `shocked` | `chef-shocked.webp`, `.png` | The surprise beat when the stamp slams; errors, busy-kitchen countdown, kitchen closed | jolt |
| `slow-clap` | `chef-slow-clap.webp`, `.png` | Scores 7–8; menu results (no score) on the reveal | bounce (+ confetti for 7+) |
| `chefs-kiss` | `chef-chefs-kiss.webp`, `.png` | Scores 9–10 | rises, floats, gold glow pulse (+ confetti) |

The mapping lives in `chef.js` (`bandFor`, `exprForScore`); the share cards use the same mapping.
Reduced motion: every animation is off and the end pose is shown.

## Swapping art

1. Put the new transparent PNGs in a folder as `chef-gerardo-<expression>.png`.
2. Run `python3 tools/prep_chef.py /path/to/folder`. It removes white flood-fill fringes (1 px alpha
   erode + un-matte against white), drops stray slivers from the sheet cut, anti-aliases the edge,
   trims, and writes `img/chef-<expression>.webp` + `.png` (keep each under ~80 KB). `chefs-kiss`
   keeps its glow (soft fade instead of an erode).
3. Keep the chef's feet (or the bottom of the pose) at the bottom edge: the slot anchors him there.
4. Bump `VERSION` in `sw.js` so installed copies pick up the new art. Re-run
   `python3 tools/render_assets.py og` for the link preview.

`tests/unit.py` checks that every expression has both files, they're small and transparent, and the
score → expression mapping.
