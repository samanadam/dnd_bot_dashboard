# D&D Beyond capture notes (spike, 2026-11-22)

Captured on a live logged-in session. Fixtures in `tests/fixtures/ddb/` are small, made-up characters with the real shape (names, ids, art and notes removed).

## Character data
- Auth: `POST https://auth-service.dndbeyond.com/v1/cobalt-token` with the page's cookies returns `{ token, ttl }`. Then `GET https://character-service.dndbeyond.com/character/v5/character/{id}?includeCustomItems=true` with `Authorization: Bearer <token>`. Without the bearer it is 403. The token is held in memory only and never sent to the portal.
- Response `{ id, success, message, data }`. `data.canEdit` is false for a read-only view: do not sync those.
- Fields used: `name`; `stats[{id 1..6 = str,dex,con,int,wis,cha; value}]`, `bonusStats`, `overrideStats`; `baseHitPoints` (excludes CON), `bonusHitPoints`, `overrideHitPoints`, `removedHitPoints` (damage taken), `temporaryHitPoints`; `inspiration`; `currentXp`; `alignmentId` (1 LG, 2 NG, 3 CG, 4 LN, 5 N, 6 CN, 7 LE, 8 NE, 9 CE); `race{fullName,baseRaceName,sizeId,isLegacy}`; `background.definition.name`; `classes[{level,isStartingClass,definition{name,hitDice,canCastSpells,spellCastingAbilityId,isLegacy},subclassDefinition{name}}]`; `deathSaves{failCount,successCount,isStabilized}`; `conditions[{id,level}]`; `spellSlots[{level,used,available}]` (`available` was 0 even for a level 3 wizard: slot totals come from the portal's class tables, only `used` is read); `pactMagic` (same shape); `modifiers{race,class,background,item,feat,condition}` (`{type:"proficiency"|"expertise", subType:"intelligence-saving-throws"|"arcana"|..., isGranted}`); `inventory[{equipped,definition{name,armorClass,armorTypeId,filterType}}]`.
- Ability scores: `stats` holds the base, `bonusStats` a manual bonus, and points from feats or the background (2024 rules) are `modifiers.<group>` entries with `type: "bonus"`, `subType: "<ability>-score"`, `value`. Seen on a level 2 wizard: three feat entries of +1 (DEX 15 to 16, INT 17 to 18, WIS 15 to 16, matching the page).
- Max HP = `overrideHitPoints ?? baseHitPoints + conMod * totalLevel + (bonusHitPoints ?? 0)`; current HP = max minus `removedHitPoints`.
- AC is not stored. Computed from equipped armor (`armorTypeId` 1 light, 2 medium, 3 heavy, 4 shield) or 10 + dex mod, +2 for a shield, plus flat `bonus armor-class` modifiers of worn items (and attuned ones when needed) and unconditional ones from class/feats. Checked on a live character: Plate +3 shows 21 in D&D Beyond (base 18 + modifier `bonus`/`armor-class` value 3 on the item definition id); a level 3 wizard (AC 11, max HP 17) and a level 3 fighter (max HP 28) matched. Conditional bonuses and spells are not counted.
- Ruleset: no clear field. Rule used: 2024 only if `race.isLegacy === false` and no class is legacy, otherwise 2014. Unverified.

## Observing
- The page loads the character through the calls above. The extension fetches it itself (token, then character) on a 15 s poll while the tab is visible. The page-world script also wraps `fetch` and triggers an immediate refresh when the page writes to `character-service.dndbeyond.com/character/v5/character/` with a non-GET method.

## Rolls
- Rolls made in a campaign are broadcast through the game log. Message shape (`tests/fixtures/ddb/rolls.json`): `eventType: "dice/roll/fulfilled"`, `entityId` (character id), `data.action` (label), `data.rolls[]` each with `diceNotationStr`, `rollType`, `diceNotation.set[].dice[{dieType:"d20",dieValue,useInTotal}]`, `diceNotation.constant`, `result{total,text}`. Read from `game-log-rest-live.dndbeyond.com/v1/getmessages`.
- A character that is not in a campaign rolls locally and posts nothing, so v1 relays and animates campaign rolls only. Live capture: wrap `WebSocket` in the page world, parse incoming frames with that `eventType`, keep those whose `entityId` is the page's character.
- Unverified: the exact websocket frame wrapping. The message shape is the REST one.
