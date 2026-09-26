# VEXORA — Sandbox MMORPG Master Blueprint

## Goal

Build VEXORA as an original 2D online sandbox MMORPG inspired by the *systems* of the genre:
- persistent player-owned worlds
- block building and destruction
- collectible/craftable items
- farming and seed discovery
- player economy and trading
- character customization and item modifiers
- social systems
- quests, achievements, roles and progression
- mini-games and competitive activities
- events and rotating content
- world ownership, permissions and moderation

Do NOT copy Growtopia proprietary art, sprites, sounds, exact item assets, source code, or branded content. VEXORA uses its own names, art direction, recipes, economy and content while implementing similar gameplay concepts.

## Current VEXORA baseline

### Already present
- Account registration/login/logout
- Session authentication
- Profile data
- Friends API
- World creation
- Public/private worlds
- Seeded generated terrain
- Persistent world block state
- World chat
- World presence / other players
- 2D movement and camera
- Jumping
- Break/mine blocks
- Place blocks
- Hotbar
- Basic inventory modal
- Save/sync state
- Character hub and world browser

### Current technical reality
- `world.html` runs `world-v15.js`
- `world-v15.js` is the active gameplay baseline
- Player inventory is currently runtime-only and should become persistent
- World persistence currently stores blocks only
- `schema.sql` currently contains only the `users` table
- The project contains many historical `world-v*.js` versions; future development should consolidate into a modular architecture instead of continuing version-file sprawl

---

# 0–10% — Platform foundation

## 1. Persistence layer
Create persistent tables for:
- players/profile progression
- currencies
- inventory
- equipped items
- item durability/charges
- worlds
- world permissions
- world bans
- world locks
- dropped items
- planted trees
- player statistics
- quests
- achievements
- roles
- guilds
- guild membership
- trades
- shop/vending listings
- chat
- reports/moderation
- events
- mail
- favorites
- world ratings

## 2. Server authority
The server becomes the source of truth for:
- inventory changes
- currency changes
- world edits
- item drops/pickups
- trading
- locks/access
- crafting
- rewards
- quest progress

Client-side values become presentation only.

## 3. Data-driven item registry
Create a single item definition format:

- id
- name
- category
- rarity
- stack limit
- tradeable
- droppable
- placeable
- breakable
- seedable
- splicable
- wearable
- equipment slot
- modifiers
- recipe(s)
- acquisition methods
- sell/recycle value
- animation/render metadata

No game system should hard-code hundreds of item rules.

---

# 10–20% — Core sandbox loop

## 4. Better world engine
- fixed world dimensions
- foreground/background layers
- solid/non-solid blocks
- collision types
- break hardness
- block regeneration
- block drop tables
- gem/resource drops
- block hit animation
- item drop entities
- item pickup radius
- player death/respawn
- checkpoints

## 5. World entry
- world browser
- search
- featured worlds
- recent worlds
- favorites
- world categories
- player count
- owner
- public/private
- minimum level
- world description

## 6. Doors and transportation
- default spawn door
- destination-linked doors
- portals
- teleport items
- home world
- recent worlds
- warp/teleport cooldowns

---

# 20–30% — Ownership and anti-grief

## 7. Lock system
Implement:
- small area lock
- medium/large area lock
- world lock
- builder-only lock
- break-only lock
- per-player permissions
- owner/co-owner roles
- access request/accept
- revoke access
- ban from world
- kick
- pull
- kick-all
- lock ownership transfer

The genre's world lock is central because it protects a world and also functions as a trading currency. citeturn794609search0turn351704search11

## 8. World settings
- public/private
- build permission
- music on/off
- background/weather
- minimum level
- max players
- auto-kick timer
- spawn point
- world description
- category
- visibility/discovery settings

## 9. Moderation
- report player
- report world
- mute/ignore
- chat filtering
- rate limits
- anti-spam
- audit logs
- temporary world bans

Growtopia's current chat includes private messaging, ignore, trade, broadcasts, world-management commands, reporting, favorites and status/world commands. citeturn859344search0

---

# 30–40% — Economy

## 10. Currencies
VEXORA should have multiple currencies with different purposes:
- Gems: common activity/store currency
- World Coin: player trading currency
- Crystal Coin: higher denomination
- Event Tokens: seasonal
- Role Tokens: progression rewards

## 11. Safe player trading
Two-sided trade window:
- offer item
- offer quantity
- optional currency
- lock offers
- confirm
- second confirmation
- cancel
- atomic server transaction
- rollback on failure
- trade history

## 12. Player shops
Implement:
- display block
- vending machine
- digital vending
- shop signs
- price history
- item search
- buy/sell
- quantity selector
- restock
- shop owner permissions

The source game uses vending machines and digital vending with world-based shops and price information. citeturn794609search2turn351704search10

## 13. NPC economy
- traveling merchant
- item catalogue
- rotating stock
- buy/sell
- crafting supplies
- mystery boxes
- event merchants

---

# 40–50% — Farming / collection

## 14. Seeds and trees
Core loop:
1. obtain seed
2. plant
3. wait/grow
4. harvest
5. receive item + chance of seed
6. replant

Add:
- grow time
- tree stages
- harvest animation
- gem chance
- seed drop chance
- growth modifiers
- boosted event growth

Growtopia's seed system uses harvestable trees and seed drops; seeds can also be spliced into new trees. citeturn462516search0turn462516search1

## 15. Splicing
Data-driven recipe graph:
- seed A + seed B -> result tree
- invalid recipe feedback
- recipe discovery
- rarity
- special-event recipes

Do not hard-code recipes into rendering code.

## 16. Resource progression
- wood
- stone
- ores
- crystals
- crops
- rare materials
- event resources

---

# 50–60% — Character / items

## 17. Inventory
- expandable backpack
- categories
- search
- sorting
- quantity stack
- favorite item
- item info
- use
- drop
- split stack
- lock item
- recycle

## 18. Equipment
Slots:
- head
- face
- chest
- legs
- feet
- hand
- back
- pet
- mount
- aura/effect
- title

## 19. Item modifiers
Examples:
- double jump
- higher jump
- speed
- glide
- swim
- wall-climb
- punch damage
- build range
- break speed
- extra health
- gravity changes
- luck
- growth speed

Equipment effects must be composable and server-authoritative.

---

# 60–70% — Machines and professions

## 20. Crafting framework
Generic machine system:
- machine placement
- input slots
- output slots
- recipe validation
- timers
- fuel/charges
- owner permissions
- public/locked operation

## 21. Chemistry
Three-input recipes and rare outcomes.

## 22. Sewing
Three-material pattern system:
- material order
- stitching methods
- success/failure
- quality
- clothing rewards

The source game's sewing system uses three Silk Bolts and multiple stitch methods. citeturn467177search0

## 23. Cooking
- oven
- recipe ingredients
- timing
- optional spices
- food quality
- buffs
- burn/failure states

The source game has ovens, recipes, ingredient processing, timing and food buffs. citeturn774331search1

## 24. Clothing compactor / recycling
- consume clothing
- return materials
- gems
- rare outcomes
- garbage/recycle result

The source game uses a Clothing Compactor to recover resources from eligible clothing. citeturn467177search1

## 25. Provider machines
- daily output
- timers
- storage
- collection
- player ownership

---

# 70–80% — Activity systems

## 26. Fishing
- rods
- bait
- fish tables
- splash timing
- catch window
- rare catches
- weight/size
- fishing environments

The current game model uses bait + equipped rod + timing around a water splash, and has special fishing environments. citeturn351704search1

## 27. Surgery
Create an original medical mini-game with:
- patient state
- diagnosis
- tool sequence
- bleeding
- infection
- vital signs
- failure/success
- rewards

The genre's surgery system uses multiple tools with distinct effects, including diagnosis, anesthetic, scalpel, stitches, transfusion and defibrillation. citeturn351704search2

## 28. Detection / exploration
Original VEXORA equivalent of a detector system:
- hidden resource source
- distance signal
- player search
- timed discovery
- random reward

The source game's Geiger system demonstrates a proximity-based discovery loop with multiple signal states and temporary item/status outcomes. citeturn351704search0

## 29. Pet system
- collect pets
- pet stats
- elements/classes
- leveling
- pet abilities
- pet equipment
- pet battles
- NPC trainers
- tournaments

The source game supports player-versus-player pet battles and a large ability system. citeturn812533search1turn812533search11

## 30. Adventure worlds
- puzzle worlds
- parkour
- checkpoints
- keys
- hazards
- boss encounters
- reward completion

---

# 80–90% — MMO progression

## 31. Quests
- tutorial quests
- daily quests
- weekly quests
- event quests
- profession quests
- achievement-linked quests
- epic quest chains

## 32. Achievements
Examples:
- first world
- first harvest
- master builder
- first trade
- rare discovery
- pet champion
- event completion
- social milestones

The source game has a large achievement system; its wiki records more than 160 achievements and ongoing additions/changes. citeturn351704search8

## 33. Roles / professions
Examples:
- Builder
- Farmer
- Merchant
- Chef
- Fisher
- Explorer
- Engineer
- Scientist
- Adventurer

Each gets:
- role XP
- daily task
- level rewards
- passive bonus
- cosmetic identity

The source game uses role progression with daily role quests and activity-based bonuses. citeturn774331search2turn812533search0

## 34. Daily challenges
- rotating objective
- timed competition
- leaderboard
- contribution score
- reward tiers
- guild challenge variant

The source game runs timed Daily Challenges and guild variants with ranking rewards. citeturn351704search7

---

# 90–95% — Guild and social MMO

## 35. Guilds
- create/join guild
- guild name/tag
- roles
- invite/kick
- guild chat
- guild home
- guild bank
- guild quests
- guild level
- guild cosmetics
- guild rankings

## 36. Guild competition
- contribution points
- guild challenges
- seasonal leaderboards
- team rewards
- guild achievements

## 37. Social layer
- friends
- follows
- private messages
- online status
- block/ignore
- profile cards
- emotes
- titles
- badges

---

# 95–100% — Live service

## 38. Seasonal events
Build an event framework instead of one-off code:
- event start/end
- global counter
- event currency
- event quests
- event worlds
- event recipes
- event rewards
- event shop
- event leaderboard

Possible VEXORA seasons:
- Bloom Festival
- Moonfall
- Neon Week
- Frostbound
- Harvest Moon
- Cosmic Week
- Anniversary
- Creator Week

The source game operates recurring seasonal events and rotating store content; current store data includes recurring seasonal packs and passes. citeturn193376search0turn566642search1

## 39. World discovery
- featured world
- world of the day equivalent
- editor picks
- ratings
- tags
- trending worlds
- creator rewards

The source game has a World of the Day system for community-created worlds. citeturn467177search2

## 40. Marketplace intelligence
- median price
- recent sales
- volume
- price history
- item demand
- market alerts
- anti-manipulation controls

## 41. Creator systems
- world templates
- world scripts
- interactive blocks
- switches
- triggers
- timers
- teleport triggers
- scoreboard
- custom mini-games

## 42. Performance / scale
- chunked world loading
- spatial indexing
- delta sync
- websocket presence
- authoritative actions
- optimistic UI with reconciliation
- database transactions
- caching
- rate limits
- abuse detection
- save queue
- autosave snapshots

## 43. Mobile / desktop UX
- virtual joystick
- tap-to-break
- tap-to-place
- long press mining
- drag inventory
- touch trade
- responsive UI
- keyboard shortcuts
- controller support

## 44. Observability
- server logs
- economy logs
- trade audit
- world edit audit
- crash reporting
- performance timings
- player action metrics
- admin dashboard

---

# Recommended VEXORA architecture

## Frontend modules
- `world-engine.js`
- `world-renderer.js`
- `world-input.js`
- `player-controller.js`
- `inventory-ui.js`
- `trade-ui.js`
- `chat-ui.js`
- `shop-ui.js`
- `quest-ui.js`
- `guild-ui.js`
- `event-ui.js`

## Data modules
- `data/items.js`
- `data/blocks.js`
- `data/recipes.js`
- `data/quests.js`
- `data/achievements.js`
- `data/roles.js`
- `data/events.js`

## Server/API modules
- `api/player.js`
- `api/inventory.js`
- `api/items.js`
- `api/trade.js`
- `api/locks.js`
- `api/drops.js`
- `api/shops.js`
- `api/quests.js`
- `api/achievements.js`
- `api/roles.js`
- `api/guilds.js`
- `api/events.js`
- `api/moderation.js`

## Database principle

Never store the entire player state as an opaque JSON blob if the system needs to query it frequently.

Use normalized tables for:
- inventory
- equipped items
- world ownership
- access lists
- trades
- shop listings
- quests
- achievements
- guilds

Use JSON only for flexible per-item/per-machine metadata where it is actually useful.

---

# Implementation order

1. Persistent player state
2. Item registry
3. Inventory
4. Server-authoritative world actions
5. Locks/access
6. Drops/pickups
7. Currency
8. Trade
9. Doors/portals
10. Farming/seeds
11. Splicing
12. Equipment/modifiers
13. Shops/vending
14. Crafting framework
15. Fishing / cooking / surgery / detection
16. Pets
17. Quests + achievements
18. Roles + daily challenges
19. Guilds
20. Events
21. Creator tools
22. Performance + anti-cheat + moderation

# Important product rule

VEXORA should feel familiar as a sandbox MMO, but remain an original game:
- original item names
- original sprites
- original sounds
- original recipes
- original economy
- original world themes
- original quest text
- original UI branding
- original progression balance

Use external research to understand mechanics, not as a source for copying proprietary content.
