# Sources

Everything in [`FEATURES.md`](./FEATURES.md) traces back to one of these.

| Key | Source |
| --- | --- |
| `S` | Steam store page, app 4164790 (`store.steampowered.com/api/appdetails?appids=4164790`) |
| `N:MM-DD`, `DL#` | The 62 official posts from the Steam news API (`ISteamNews/GetNewsForApp`, appid 4164790), 2025-11-15 → 2026-09-17: dev logs #1–#6, demo notes, launch notes, and every patch note. Text copy: `https://store.steampowered.com/news/app/4164790` |
| `A:<id>` | The 93 Steam achievements (`steamcommunity.com/stats/4164790/achievements`, copy in `https://steamcommunity.com/stats/4164790/achievements`) cross-referenced with the in-game `Config_Achievement` rows and hand-written conditions from SurvivalLogDataViewer |
| `G1` | Steam guide "100% Achivevements + End GAme" (id 3786657132) |
| `G2` | Steam guide "结局与部分特殊流程成就攻略" (id 3794377867) — all 9 endings, community group-chat schedule, souvenirs |
| `G3` | Steam guide "100天全生存指南" (id 3782585359) |
| `G4` | IndieBunny, "Survival Log: How to Survive the Early Game" (2026-08-15, updated 2026-09-13) |
| `G5` | 18183.com, "生存日志全角色攻略" (2026-09-03) |
| `G6` | 12365.sd.cn, "生存日志生存点天赋加点推荐" (2026-08-17) |
| `D:<table>` | Game config extracted by [tianwaiyan/SurvivalLogDataViewer](https://github.com/tianwaiyan/SurvivalLogDataViewer) (snapshot of game version 1.0.15704): `Config_Item`, `Config_CookingRecipe`, `Config_Plant`, `Config_ProductionList`, `Config_Furniture`, `Config_FurnitureFunc`, `Config_FurnitureCook`, `Config_FurnitureElectrical`, `Config_FurniturePlant`, `Config_FurnitureTag`, `Config_PlantLv`, `Config_ProductionLv`, `Config_Achievement`. `tools/build_data.py` turns it into `src/data/gen/*.js` |

The extracted config and translated names are derived from Midnight Workshop's game. This project is a personal, non-commercial fan recreation; it ships no original art, audio or code from the game.
