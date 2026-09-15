# Fixture channel sources

Research date: 2026-09-14. These are manual-based encoding proposals, **not physical verification**. Hardware output remains disabled. Channel numbers below are fixture-relative, one-based. Numeric dimmer/color ranges are 0–255.

## ADJ Mega TriPar Profile Plus

[Official ADJ support page](https://www.adj.com/collections/mega-tripar-profile-plus-parts) links to [ADJ user manual](https://assets.centryngroup.com/dl/files/MEGATRIPARPROFILEPLUSUSERMANUAL.pdf), document 1.3 dated 2026-07-23. Printed page 17, visually checked.

| Mode | Channel map | Proposed neutral encoding |
| --- | --- | --- |
| 4ch | 1 red, 2 green, 3 blue, 4 UV | Scale RGB by intensity; UV zero. No separate master channel. |
| 6ch | 1 red, 2 green, 3 blue, 4 UV, 5 shutter/strobe, 6 master | RGB chroma, UV zero, shutter 32, intensity on master. |

Shutter 0–31 closes the light; 32–63 is steady illumination. Therefore a generic zero-valued “strobe disabled” channel would incorrectly black out this personality. Blackout can zero all channels. No macro channel exists in these two modes. Confidence: high for mapping; device/firmware equivalence untested. Current 4ch `dimmer` capability describes software intensity, not a dedicated DMX master. Source has an apparent typo in its last shutter interval; use the unambiguous 32–63 interval, not that row.

## Stairville Stage TRI LED Bundle Complete

[Thomann manual](https://images.thomann.de/pics/atg/atgdata/document/manual/c_238663_v7_en_online.pdf), ID 238663, V7 dated 2022-07-18. Printed pages 40, 44–45; 14-channel table visually checked.

| Mode | Channel map | Proposed neutral encoding |
| --- | --- | --- |
| 3ch / d.-P1 | 1 red, 2 green, 3 blue, shared by all heads | Scale RGB by aggregate intensity. |
| 14ch / d.-P4 | 1–3 head 1 RGB; 4–6 head 2 RGB; 7–9 head 3 RGB; 10–12 head 4 RGB; 13 strobe; 14 master | Scale each head's RGB by its own intensity; master 255; strobe zero. |

Avoid multiplying the per-head values by their mean intensity again. Blackout zeros everything. Neither selected mode has a macro selector. The table describes strobe as increasing speed across 0–255 without detailed subranges; zero is the proposed non-strobing minimum and must be checked physically. Confidence: high for channel assignments, unverified for hardware behavior and physical head ordering.

## Stairville Hz-200 Compact Hazer DMX

[Thomann manual](https://images.thomann.de/pics/atg/atgdata/document/manual/326263_c_326263_v7_en_online.pdf), ID 326263, V7 dated 2023-12-11. Printed page 24, visually checked: channel 1 haze amount, channel 2 fan speed, both 0–255.

**Discrepancy:** the original Lightlab `1ch` personality is unsupported by this manual. Do not repurpose that saved ID or silently expand existing patches. Add an explicit `2ch` option and require patch overlap review. Until migrated, reject that legacy mode for encoding.

Proposed dry-run defaults: haze zero, fan zero. A nonzero haze request needs an explicit fan policy/control; this research does not invent an operational fan setting. Zero values are not a substitute for the manufacturer's shutdown/cleaning procedure. Confidence: high for the two-channel map, no physical verification.

Implementation decision: inspection displays the requested haze amount on channel 1, with fan 0 and an explicit incomplete-fan-policy warning. These are diagnostic values only, never sent to the machine. Blackout still zeros both channels.

## Varytec LED Theater Spot 100 3000K

[Thomann manual](https://images.thomann.de/pics/atg/atgdata/document/manual/c_414220_427226_v6_en_online.pdf), IDs 414220/427226, V6 dated 2023-11-15. Printed page 24, visually checked: 2ch uses channel 1 white-light dimmer and channel 2 strobe. Proposed encoding is intensity on channel 1 and zero on channel 2. Page 21 describes zero strobe frequency as off. There are no RGB channels: never encode the simulator's warm-white display tint as color control. Page 25 specifies 3000K. Confidence: high for mapping; hardware untested.

## Implementation and acceptance boundary

- Keep `verifiedForLiveOutput` false; documentation confidence and physical verification are separate states.
- Catalog entries should record source URL, manual revision, mode, footprint and per-channel role/default. Unknown modes fail closed.
- Snapshot channel-buffer tests should cover blackouts, half intensity, fixed-white fixtures, all four independently lit heads, UV zero and the ADJ shutter exception.
- Before hardware release, verify each unit's model/personality and head order, then isolated dimmer and no-strobe behavior. Resolve the hazer fan control explicitly. This document authorizes no network output.
