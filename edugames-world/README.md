# EduGames World — Junior School Learning Hub
## Grades 1–12
A new, self-contained learner experience at /edugames-world/ with 12 playable learning worlds:
WordQuest, Science Lab 360, GeoExplorer, CodeMasters, Farm Tycoon, Money Masters,
History Heroes, Eco Warriors 360, Human Body Quest, Creative Studio, Quiz Arena 360,
and Inventor's World.

### Integration
- Uses the existing JSLH Supabase Auth project and the same /access/ sign-in flow as MATHQUEST+.
- Preserves the existing MATHQUEST+ route and data. It reads the existing local MATHQUEST XP value as an initial local progress seed when available.
- Stores local learner progress per user/browser. It attempts to sync individual attempts to the additive edugames_attempts table when that table exists.
- Includes an additive SQL migration for learner-owned progress/attempt records. This migration is a file only; it is NOT automatically applied to production.
- Does not change M-Pesa, premium content, learner library, Teacher Centre or school operations tables.
- No public leaderboard or school ranking is enabled in this first release. Those require verified school membership, teacher permissions and privacy review.

### Release and content notes
The first playable release includes one grade-band sample question per world (Grades 1–3, 4–6, 7–9, 10–12), a daily mission, mixed Quiz Arena, hints, explanations, XP, stars, badges and mission history. This is a functioning starter bank, not a complete official curriculum question bank. Teachers should review and expand content against the applicable national curriculum and approved school schemes before formal assessment use.

### Database
Review and apply supabase/migrations/edugames_world_foundation.sql only through the approved Supabase migration process after checking the target project. Do not apply to production without approval and backup.
