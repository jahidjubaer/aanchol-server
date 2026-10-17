# 08 — More categories

_Date: 2026-10-18_

Four product lines added to the defaults in `src/seed/content.js`, all **coming-soon** and **out of the menu** (`inNav: false`):

| slug | Name | Template | Types |
|---|---|---|---|
| `sarees` | Handloom Sarees | saree | muslin, katan, silk, monipuri |
| `three-piece` | Three-Piece | general | unstitched, stitched |
| `orna-shawls` | Orna, Scarves & Shawls | general | orna, scarf, shawl |
| `nakshi-kantha` | Nakshi Kantha & Gifts | general | kantha, gift-set, craft |

## Adding them to a database
```
npm run categories:add
```
Inserts any default category the database doesn't have. Existing categories, including ones the admin changed, are never touched. Run on Atlas on 2026-10-18 (all four added).

Note: `npm run seed` and `npm run sample:add` also add missing defaults, so a default category deleted in the admin would come back if those are run. Hide it instead of deleting it if that matters.

## Tests
`test/content.test.js` checks the six default categories and that only Jamdani and Jewellery are in the menu. 68 passing.
