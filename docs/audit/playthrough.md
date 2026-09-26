# Browser playthrough (2026-09-22)

One life played end to end in the browser (Cursor's built-in Chromium, dev server on port 4180, cache disabled,
fresh storage), then a rebirth into the next life. Clicks went through the real buttons, shelves and dialogs; long
stretches of time were advanced with the game's own `step()` (the frame loop's call) because the embedded browser
stops painting when its panel is hidden.

| Step | What happened | Screenshot |
| --- | --- | --- |
| Title screen | Fresh save: English, no Continue; calendar, radio, lamp and cat easter eggs; Update Log dot | `playthrough/01-title.jpg` |
| New game | Wage Slave, Normal, prologue shown ("This time, I will be ready"); planning bar with Planning Points | |
| Before the outbreak | Picked up the wallet (+$70) and took the phone loan (+$500) from the suggestions; City Map → Community Convenience Store (25 min on foot) | |
| Shopping | Clicked the Food Shelf: the survivor walked over and the shelf window opened; bought 5 canned luncheon meat, 5 instant noodles (bulk −10%) and bread; purchase bars | `playthrough/02-shop.jpg` |
| Home, outbreak | "Go home (25 min)", then Finish Preparation → confirm; Day 1 18:00, hoard weighed at 7.75 kg | |
| First night | The First Night event at 20:00 with its countdown; chose "Drag furniture against the door" (Stamina −10, Morale +4) | `playthrough/03-first-night.jpg` |
| Night, weather | 23:00 night tint with the lights on; a storm: rain, the lightning flash with the thunder sound (`sfxLog: thunder`, audio context running, night music `wage:night`) | `playthrough/04-storm-lightning.jpg` |
| Camera | Dragging moved the camera and stopped following (Δ 150, 80); Space recentred on the survivor; holding `,` swivelled −0.32 and it sprang back on release | |
| Eating | Ctrl+click on a tin in the backpack: satiety 58 → 78, a Washed Empty Can in the backpack and a "+1 Washed Empty Can" bar | `playthrough/05-waste-can.jpg` |
| Days 2–8 | Sleep, daily settlements and story events answered with their buttons; autonomy ate and slept; the Day 7 horde was held (36 door-bang sounds); the food ran out | |
| Death | Day 8 13:00, starved: "Loop 1 ends · Day 8 · Starved to death", survival record incl. hordes survived and aid count, 99 Planning Points, Rebirth / I want to persist! / Tear up / Main menu | `playthrough/06-death.jpg` |
| Rebirth | Confirmed the rebirth (Just Once warning); the Loop 2 page carried 99 points, 5 memories, best day 8; learned Efficient Eating (99 → 59) | `playthrough/07-rebirth.jpg` |
| Next life | Loop 2 on the morning before the outbreak: $1000, 59 Planning Points, Efficient Eating active (food satiety ×1.15), the loop history `[1, Day 8, starvation]`, the rebirth taboo set, achievements 1001/1002/2001 kept, 2 runs in the profile | `playthrough/08-loop2.jpg` |
