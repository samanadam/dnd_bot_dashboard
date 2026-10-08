import type { FeatBlock } from "@/lib/dm/feats";
import type { SpellBlock } from "@/lib/dm/spells";
import type { DemoEdition } from "./srdSample";

// A handful of SRD 5.1 / 5.2 spells and feats (CC-BY-4.0, see data/srd/NOTICE.md)
// for the demo, copied from the bundled files so the demo never imports them.

export const DEMO_SRD_SPELLS: Array<{ edition: DemoEdition; slug: string; spell: SpellBlock }> = [
  {
    "edition": "2024",
    "slug": "fire-bolt",
    "spell": {
      "name": "Fire Bolt",
      "level": 0,
      "school": "evocation",
      "castingTime": "1 action",
      "ritual": false,
      "range": "120 feet",
      "components": {
        "verbal": true,
        "somatic": true,
        "material": false,
        "materialText": "",
        "materialCostGp": null,
        "materialConsumed": false
      },
      "duration": "Instantaneous",
      "concentration": false,
      "classes": [
        "Sorcerer",
        "Wizard"
      ],
      "attack": "ranged",
      "save": null,
      "effect": {
        "kind": "damage",
        "roll": "1d10",
        "types": [
          "fire"
        ]
      },
      "scaling": {
        "by": "character",
        "steps": [
          {
            "at": 5,
            "roll": "2d10"
          },
          {
            "at": 11,
            "roll": "3d10"
          },
          {
            "at": 17,
            "roll": "4d10"
          }
        ]
      },
      "description": "You hurl a mote of fire at a creature or an object within range. Make a ranged spell attack against the target. On a hit, the target takes 1d10 Fire damage. A flammable object hit by this spell starts burning if it isn't being worn or carried.",
      "higherLevel": "The damage increases by 1d10 when you reach levels 5 (2d10), 11 (3d10), and 17 (4d10)."
    }
  },
  {
    "edition": "2024",
    "slug": "eldritch-blast",
    "spell": {
      "name": "Eldritch Blast",
      "level": 0,
      "school": "evocation",
      "castingTime": "1 action",
      "ritual": false,
      "range": "120 feet",
      "components": {
        "verbal": true,
        "somatic": true,
        "material": false,
        "materialText": "",
        "materialCostGp": null,
        "materialConsumed": false
      },
      "duration": "Instantaneous",
      "concentration": false,
      "classes": [
        "Warlock"
      ],
      "attack": "ranged",
      "save": null,
      "effect": {
        "kind": "damage",
        "roll": "1d10",
        "types": [
          "force"
        ]
      },
      "scaling": null,
      "description": "You hurl a beam of crackling energy. Make a ranged spell attack against one creature or object in range. On a hit, the target takes 1d10 Force damage.",
      "higherLevel": "The spell creates two beams at level 5, three beams at level 11, and four beams at level 17. You can direct the beams at the same target or at different ones. Make a separate attack roll for each beam."
    }
  },
  {
    "edition": "2024",
    "slug": "guidance",
    "spell": {
      "name": "Guidance",
      "level": 0,
      "school": "divination",
      "castingTime": "1 action",
      "ritual": false,
      "range": "Touch",
      "components": {
        "verbal": true,
        "somatic": true,
        "material": false,
        "materialText": "",
        "materialCostGp": null,
        "materialConsumed": false
      },
      "duration": "1 minute",
      "concentration": true,
      "classes": [
        "Cleric",
        "Druid"
      ],
      "attack": null,
      "save": null,
      "effect": null,
      "scaling": null,
      "description": "You touch a willing creature and choose a skill. Until the spell ends, the creature adds 1d4 to any ability check using the chosen skill.",
      "higherLevel": ""
    }
  },
  {
    "edition": "2024",
    "slug": "cure-wounds",
    "spell": {
      "name": "Cure Wounds",
      "level": 1,
      "school": "abjuration",
      "castingTime": "1 action",
      "ritual": false,
      "range": "Touch",
      "components": {
        "verbal": true,
        "somatic": true,
        "material": false,
        "materialText": "",
        "materialCostGp": null,
        "materialConsumed": false
      },
      "duration": "Instantaneous",
      "concentration": false,
      "classes": [
        "Bard",
        "Cleric",
        "Druid",
        "Paladin",
        "Ranger"
      ],
      "attack": null,
      "save": null,
      "effect": {
        "kind": "healing",
        "roll": "2d8",
        "types": []
      },
      "scaling": {
        "by": "slot",
        "steps": [
          {
            "at": 2,
            "roll": "4d8"
          },
          {
            "at": 3,
            "roll": "6d8"
          },
          {
            "at": 4,
            "roll": "8d8"
          },
          {
            "at": 5,
            "roll": "10d8"
          },
          {
            "at": 6,
            "roll": "12d8"
          },
          {
            "at": 7,
            "roll": "14d8"
          },
          {
            "at": 8,
            "roll": "16d8"
          },
          {
            "at": 9,
            "roll": "18d8"
          }
        ]
      },
      "description": "A creature you touch regains a number of Hit Points equal to 2d8 plus your spellcasting ability modifier.",
      "higherLevel": "The healing increases by 2d8 for each spell slot level above 1."
    }
  },
  {
    "edition": "2024",
    "slug": "healing-word",
    "spell": {
      "name": "Healing Word",
      "level": 1,
      "school": "abjuration",
      "castingTime": "1 bonus action",
      "ritual": false,
      "range": "60 feet",
      "components": {
        "verbal": true,
        "somatic": false,
        "material": false,
        "materialText": "",
        "materialCostGp": null,
        "materialConsumed": false
      },
      "duration": "Instantaneous",
      "concentration": false,
      "classes": [
        "Bard",
        "Cleric",
        "Druid"
      ],
      "attack": null,
      "save": null,
      "effect": {
        "kind": "healing",
        "roll": "2d4",
        "types": []
      },
      "scaling": {
        "by": "slot",
        "steps": [
          {
            "at": 2,
            "roll": "4d4"
          },
          {
            "at": 3,
            "roll": "6d4"
          },
          {
            "at": 4,
            "roll": "8d4"
          },
          {
            "at": 5,
            "roll": "10d4"
          },
          {
            "at": 6,
            "roll": "12d4"
          },
          {
            "at": 7,
            "roll": "14d4"
          },
          {
            "at": 8,
            "roll": "16d4"
          },
          {
            "at": 9,
            "roll": "18d4"
          }
        ]
      },
      "description": "A creature of your choice that you can see within range regains Hit Points equal to 2d4 plus your spellcasting ability modifier.",
      "higherLevel": "The healing increases by 2d4 for each spell slot level above 1."
    }
  },
  {
    "edition": "2024",
    "slug": "bless",
    "spell": {
      "name": "Bless",
      "level": 1,
      "school": "enchantment",
      "castingTime": "1 action",
      "ritual": false,
      "range": "30 feet",
      "components": {
        "verbal": true,
        "somatic": true,
        "material": true,
        "materialText": "a Holy Symbol worth 5+ GP",
        "materialCostGp": null,
        "materialConsumed": true
      },
      "duration": "1 minute",
      "concentration": true,
      "classes": [
        "Cleric",
        "Paladin"
      ],
      "attack": "ranged",
      "save": null,
      "effect": null,
      "scaling": null,
      "description": "You bless up to three creatures within range. Whenever a target makes an attack roll or a saving throw before the spell ends, the target adds 1d4 to the attack roll or save.",
      "higherLevel": "You can target one additional creature for each spell slot level above 1."
    }
  },
  {
    "edition": "2024",
    "slug": "shield",
    "spell": {
      "name": "Shield",
      "level": 1,
      "school": "abjuration",
      "castingTime": "1 reaction, which you take when you are hit by an attack roll or targeted by the Magic Missile spell",
      "ritual": false,
      "range": "Self",
      "components": {
        "verbal": true,
        "somatic": true,
        "material": false,
        "materialText": "",
        "materialCostGp": null,
        "materialConsumed": false
      },
      "duration": "1 round",
      "concentration": false,
      "classes": [
        "Sorcerer",
        "Wizard"
      ],
      "attack": null,
      "save": null,
      "effect": null,
      "scaling": null,
      "description": "An imperceptible barrier of magical force protects you. Until the start of your next turn, you have a +5 bonus to AC, including against the triggering attack, and you take no damage from Magic Missile.",
      "higherLevel": ""
    }
  },
  {
    "edition": "2024",
    "slug": "magic-missile",
    "spell": {
      "name": "Magic Missile",
      "level": 1,
      "school": "evocation",
      "castingTime": "1 action",
      "ritual": false,
      "range": "120 feet",
      "components": {
        "verbal": true,
        "somatic": true,
        "material": false,
        "materialText": "",
        "materialCostGp": null,
        "materialConsumed": false
      },
      "duration": "Instantaneous",
      "concentration": false,
      "classes": [
        "Sorcerer",
        "Wizard"
      ],
      "attack": null,
      "save": null,
      "effect": {
        "kind": "damage",
        "roll": "1d4 + 1",
        "types": [
          "force"
        ]
      },
      "scaling": null,
      "description": "You create three glowing darts of magical force. Each dart strikes a creature of your choice that you can see within range. A dart deals 1d4 + 1 Force damage to its target. The darts all strike simultaneously, and you can direct them to hit one creature or several.",
      "higherLevel": "The spell creates one more dart for each spell slot level above 1."
    }
  },
  {
    "edition": "2024",
    "slug": "detect-magic",
    "spell": {
      "name": "Detect Magic",
      "level": 1,
      "school": "divination",
      "castingTime": "1 action",
      "ritual": true,
      "range": "Self",
      "components": {
        "verbal": true,
        "somatic": true,
        "material": false,
        "materialText": "",
        "materialCostGp": null,
        "materialConsumed": false
      },
      "duration": "10 minutes",
      "concentration": true,
      "classes": [
        "Bard",
        "Cleric",
        "Druid",
        "Paladin",
        "Ranger",
        "Sorcerer",
        "Warlock",
        "Wizard"
      ],
      "attack": null,
      "save": null,
      "effect": null,
      "scaling": null,
      "description": "For the duration, you sense the presence of magical effects within 30 feet of yourself. If you sense such effects, you can take the Magic action to see a faint aura around any visible creature or object in the area that bears the magic, and if an effect was created by a spell, you learn the spell's school of magic. The spell is blocked by 1 foot of stone, dirt, or wood; 1 inch of metal; or a thin sheet of lead.",
      "higherLevel": ""
    }
  },
  {
    "edition": "2024",
    "slug": "hold-person",
    "spell": {
      "name": "Hold Person",
      "level": 2,
      "school": "enchantment",
      "castingTime": "1 action",
      "ritual": false,
      "range": "60 feet",
      "components": {
        "verbal": true,
        "somatic": true,
        "material": true,
        "materialText": "a straight piece of iron",
        "materialCostGp": null,
        "materialConsumed": false
      },
      "duration": "1 minute",
      "concentration": true,
      "classes": [
        "Bard",
        "Cleric",
        "Druid",
        "Sorcerer",
        "Warlock",
        "Wizard"
      ],
      "attack": null,
      "save": "wis",
      "effect": null,
      "scaling": null,
      "description": "Choose a Humanoid that you can see within range. The target must succeed on a Wisdom saving throw or have the Paralyzed condition for the duration. At the end of each of its turns, the target repeats the save, ending the spell on itself on a success.",
      "higherLevel": "You can target one additional Humanoid for each spell slot level above 2."
    }
  },
  {
    "edition": "2024",
    "slug": "misty-step",
    "spell": {
      "name": "Misty Step",
      "level": 2,
      "school": "conjuration",
      "castingTime": "1 bonus action",
      "ritual": false,
      "range": "Self",
      "components": {
        "verbal": true,
        "somatic": false,
        "material": false,
        "materialText": "",
        "materialCostGp": null,
        "materialConsumed": false
      },
      "duration": "Instantaneous",
      "concentration": false,
      "classes": [
        "Sorcerer",
        "Warlock",
        "Wizard"
      ],
      "attack": null,
      "save": null,
      "effect": null,
      "scaling": null,
      "description": "Briefly surrounded by silvery mist, you teleport up to 30 feet to an unoccupied space you can see.",
      "higherLevel": ""
    }
  },
  {
    "edition": "2024",
    "slug": "spiritual-weapon",
    "spell": {
      "name": "Spiritual Weapon",
      "level": 2,
      "school": "evocation",
      "castingTime": "1 bonus action",
      "ritual": false,
      "range": "60 feet",
      "components": {
        "verbal": true,
        "somatic": true,
        "material": false,
        "materialText": "",
        "materialCostGp": null,
        "materialConsumed": false
      },
      "duration": "1 minute",
      "concentration": true,
      "classes": [
        "Cleric"
      ],
      "attack": null,
      "save": null,
      "effect": {
        "kind": "damage",
        "roll": "1d8",
        "types": [
          "force"
        ]
      },
      "scaling": {
        "by": "slot",
        "steps": [
          {
            "at": 3,
            "roll": "2d8"
          },
          {
            "at": 4,
            "roll": "3d8"
          },
          {
            "at": 5,
            "roll": "4d8"
          },
          {
            "at": 6,
            "roll": "5d8"
          },
          {
            "at": 7,
            "roll": "6d8"
          },
          {
            "at": 8,
            "roll": "7d8"
          },
          {
            "at": 9,
            "roll": "8d8"
          }
        ]
      },
      "description": "You create a floating, spectral force that resembles a weapon of your choice and lasts for the duration. The force appears within range in a space of your choice, and you can immediately make one melee spell attack against one creature within 5 feet of the force. On a hit, the target takes Force damage equal to 1d8 plus your spellcasting ability modifier. As a Bonus Action on your later turns, you can move the force up to 20 feet and repeat the attack against a creature within 5 feet of it.",
      "higherLevel": "The damage increases by 1d8 for every slot level above 2."
    }
  },
  {
    "edition": "2024",
    "slug": "fireball",
    "spell": {
      "name": "Fireball",
      "level": 3,
      "school": "evocation",
      "castingTime": "1 action",
      "ritual": false,
      "range": "150 feet",
      "components": {
        "verbal": true,
        "somatic": true,
        "material": true,
        "materialText": "a ball of bat guano and sulfur",
        "materialCostGp": null,
        "materialConsumed": false
      },
      "duration": "Instantaneous",
      "concentration": false,
      "classes": [
        "Sorcerer",
        "Wizard"
      ],
      "attack": null,
      "save": "dex",
      "effect": {
        "kind": "damage",
        "roll": "8d6",
        "types": [
          "fire"
        ]
      },
      "scaling": {
        "by": "slot",
        "steps": [
          {
            "at": 4,
            "roll": "9d6"
          },
          {
            "at": 5,
            "roll": "10d6"
          },
          {
            "at": 6,
            "roll": "11d6"
          },
          {
            "at": 7,
            "roll": "12d6"
          },
          {
            "at": 8,
            "roll": "13d6"
          },
          {
            "at": 9,
            "roll": "14d6"
          }
        ]
      },
      "description": "A bright streak flashes from you to a point you choose within range and then blossoms with a low roar into a fiery explosion. Each creature in a 20-foot-radius Sphere centered on that point makes a Dexterity saving throw, taking 8d6 Fire damage on a failed save or half as much damage on a successful one. Flammable objects in the area that aren't being worn or carried start burning.",
      "higherLevel": "The damage increases by 1d6 for each spell slot level above 3."
    }
  },
  {
    "edition": "2024",
    "slug": "counterspell",
    "spell": {
      "name": "Counterspell",
      "level": 3,
      "school": "abjuration",
      "castingTime": "1 reaction, which you take when you see a creature within 60 feet of yourself casting a spell with Verbal, Somatic, or Material components",
      "ritual": false,
      "range": "60 feet",
      "components": {
        "verbal": false,
        "somatic": true,
        "material": false,
        "materialText": "",
        "materialCostGp": null,
        "materialConsumed": false
      },
      "duration": "Instantaneous",
      "concentration": false,
      "classes": [
        "Sorcerer",
        "Warlock",
        "Wizard"
      ],
      "attack": null,
      "save": "con",
      "effect": null,
      "scaling": null,
      "description": "You attempt to interrupt a creature in the process of casting a spell. The creature makes a Constitution saving throw. On a failed save, the spell dissipates with no effect, and the action, Bonus Action, or Reaction used to cast it is wasted. If that spell was cast with a spell slot, the slot isn't expended.",
      "higherLevel": ""
    }
  },
  {
    "edition": "2024",
    "slug": "revivify",
    "spell": {
      "name": "Revivify",
      "level": 3,
      "school": "necromancy",
      "castingTime": "1 action",
      "ritual": false,
      "range": "Touch",
      "components": {
        "verbal": true,
        "somatic": true,
        "material": true,
        "materialText": "a diamond worth 300+ GP, which the spell consumes",
        "materialCostGp": null,
        "materialConsumed": true
      },
      "duration": "Instantaneous",
      "concentration": false,
      "classes": [
        "Cleric",
        "Druid",
        "Paladin",
        "Ranger"
      ],
      "attack": null,
      "save": null,
      "effect": null,
      "scaling": null,
      "description": "You touch a creature that has died within the last minute. That creature revives with 1 Hit Point. This spell can't revive a creature that has died of old age, nor does it restore any missing body parts.",
      "higherLevel": ""
    }
  },
  {
    "edition": "2024",
    "slug": "polymorph",
    "spell": {
      "name": "Polymorph",
      "level": 4,
      "school": "transmutation",
      "castingTime": "1 action",
      "ritual": false,
      "range": "60 feet",
      "components": {
        "verbal": true,
        "somatic": true,
        "material": true,
        "materialText": "a caterpillar cocoon",
        "materialCostGp": null,
        "materialConsumed": false
      },
      "duration": "1 hour",
      "concentration": true,
      "classes": [
        "Bard",
        "Druid",
        "Sorcerer",
        "Wizard"
      ],
      "attack": null,
      "save": "wis",
      "effect": null,
      "scaling": null,
      "description": "You attempt to transform a creature that you can see within range into a Beast. The target must succeed on a Wisdom saving throw or shape-shift into a Beast form for the duration. That form can be any Beast you choose that has a Challenge Rating equal to or less than the target's (or the target's level if it doesn't have a Challenge Rating). The target's game statistics are replaced by the stat block of the chosen Beast, but the target retains its alignment, personality, creature type, Hit Points, and Hit Point Dice. See the \"Animals\" section of \"Monsters\" for a sample of Beast stat blocks. The target gains a number of Temporary Hit Points equal to the Hit Points of the Beast form. These Temporary Hit Points vanish if any remain when the spell ends. The spell ends early on the target if it has no Temporary Hit Points left. The target is limited in the actions it can perform by the anatomy of its new form, and it can't speak or cast spells. The target's gear melds into the new form. The creature can't use or otherwise benefit from any of that equipment.",
      "higherLevel": ""
    }
  },
  {
    "edition": "2024",
    "slug": "cone-of-cold",
    "spell": {
      "name": "Cone of Cold",
      "level": 5,
      "school": "evocation",
      "castingTime": "1 action",
      "ritual": false,
      "range": "Self (60-foot cone)",
      "components": {
        "verbal": true,
        "somatic": true,
        "material": true,
        "materialText": "a small crystal or glass cone",
        "materialCostGp": null,
        "materialConsumed": false
      },
      "duration": "Instantaneous",
      "concentration": false,
      "classes": [
        "Druid",
        "Sorcerer",
        "Wizard"
      ],
      "attack": null,
      "save": "con",
      "effect": {
        "kind": "damage",
        "roll": "8d8",
        "types": [
          "cold"
        ]
      },
      "scaling": {
        "by": "slot",
        "steps": [
          {
            "at": 6,
            "roll": "9d8"
          },
          {
            "at": 7,
            "roll": "10d8"
          },
          {
            "at": 8,
            "roll": "11d8"
          },
          {
            "at": 9,
            "roll": "12d8"
          }
        ]
      },
      "description": "You unleash a blast of cold air. Each creature in a 60-foot Cone originating from you makes a Constitution saving throw, taking 8d8 Cold damage on a failed save or half as much damage on a successful one. A creature killed by this spell becomes a frozen statue until it thaws.",
      "higherLevel": "The damage increases by 1d8 for each spell slot level above 5."
    }
  },
  {
    "edition": "2014",
    "slug": "fireball",
    "spell": {
      "name": "Fireball",
      "level": 3,
      "school": "evocation",
      "castingTime": "1 action",
      "ritual": false,
      "range": "150 feet",
      "components": {
        "verbal": true,
        "somatic": true,
        "material": true,
        "materialText": "A tiny ball of bat guano and sulfur.",
        "materialCostGp": null,
        "materialConsumed": false
      },
      "duration": "Instantaneous",
      "concentration": false,
      "classes": [
        "Sorcerer",
        "Wizard"
      ],
      "attack": null,
      "save": "dex",
      "effect": {
        "kind": "damage",
        "roll": "8d6",
        "types": [
          "fire"
        ]
      },
      "scaling": {
        "by": "slot",
        "steps": [
          {
            "at": 4,
            "roll": "9d6"
          },
          {
            "at": 5,
            "roll": "10d6"
          },
          {
            "at": 6,
            "roll": "11d6"
          },
          {
            "at": 7,
            "roll": "12d6"
          },
          {
            "at": 8,
            "roll": "13d6"
          },
          {
            "at": 9,
            "roll": "14d6"
          }
        ]
      },
      "description": "A bright streak flashes from your pointing finger to a point you choose within range and then blossoms with a low roar into an explosion of flame. Each creature in a 20-foot-radius sphere centered on that point must make a dexterity saving throw. A target takes 8d6 fire damage on a failed save, or half as much damage on a successful one. The fire spreads around corners. It ignites flammable objects in the area that aren't being worn or carried.",
      "higherLevel": "When you cast this spell using a spell slot of 4th level or higher, the damage increases by 1d6 for each slot level above 3rd."
    }
  },
  {
    "edition": "2014",
    "slug": "cure-wounds",
    "spell": {
      "name": "Cure Wounds",
      "level": 1,
      "school": "evocation",
      "castingTime": "1 action",
      "ritual": false,
      "range": "Touch",
      "components": {
        "verbal": true,
        "somatic": true,
        "material": false,
        "materialText": "",
        "materialCostGp": null,
        "materialConsumed": false
      },
      "duration": "Instantaneous",
      "concentration": false,
      "classes": [
        "Bard",
        "Cleric",
        "Druid",
        "Ranger"
      ],
      "attack": null,
      "save": null,
      "effect": null,
      "scaling": null,
      "description": "A creature you touch regains a number of hit points equal to 1d8 + your spellcasting ability modifier. This spell has no effect on undead or constructs.",
      "higherLevel": "When you cast this spell using a spell slot of 2nd level or higher, the healing increases by 1d8 for each slot level above 1st."
    }
  },
  {
    "edition": "2014",
    "slug": "sacred-flame",
    "spell": {
      "name": "Sacred Flame",
      "level": 0,
      "school": "evocation",
      "castingTime": "1 action",
      "ritual": false,
      "range": "60 feet",
      "components": {
        "verbal": true,
        "somatic": true,
        "material": false,
        "materialText": "",
        "materialCostGp": null,
        "materialConsumed": false
      },
      "duration": "Instantaneous",
      "concentration": false,
      "classes": [
        "Cleric"
      ],
      "attack": null,
      "save": "dex",
      "effect": null,
      "scaling": {
        "by": "character",
        "steps": [
          {
            "at": 5,
            "roll": "2d8"
          },
          {
            "at": 6,
            "roll": "2d8"
          },
          {
            "at": 7,
            "roll": "2d8"
          },
          {
            "at": 8,
            "roll": "2d8"
          },
          {
            "at": 9,
            "roll": "2d8"
          },
          {
            "at": 10,
            "roll": "2d8"
          },
          {
            "at": 11,
            "roll": "3d8"
          },
          {
            "at": 12,
            "roll": "3d8"
          },
          {
            "at": 13,
            "roll": "3d8"
          },
          {
            "at": 14,
            "roll": "3d8"
          },
          {
            "at": 15,
            "roll": "3d8"
          },
          {
            "at": 16,
            "roll": "3d8"
          },
          {
            "at": 17,
            "roll": "4d8"
          },
          {
            "at": 18,
            "roll": "4d8"
          },
          {
            "at": 19,
            "roll": "4d8"
          },
          {
            "at": 20,
            "roll": "4d8"
          }
        ]
      },
      "description": "Flame-like radiance descends on a creature that you can see within range. The target must succeed on a dexterity saving throw or take 1d8 radiant damage. The target gains no benefit from cover for this saving throw.",
      "higherLevel": "The spell's damage increases by 1d8 when you reach 5th level (2d8), 11th level (3d8), and 17th level (4d8)."
    }
  },
  {
    "edition": "2014",
    "slug": "hunters-mark",
    "spell": {
      "name": "Hunter's Mark",
      "level": 1,
      "school": "divination",
      "castingTime": "1 bonus action",
      "ritual": false,
      "range": "90 feet",
      "components": {
        "verbal": true,
        "somatic": false,
        "material": false,
        "materialText": "",
        "materialCostGp": null,
        "materialConsumed": false
      },
      "duration": "1 hour",
      "concentration": true,
      "classes": [
        "Ranger"
      ],
      "attack": null,
      "save": null,
      "effect": null,
      "scaling": null,
      "description": "You choose a creature you can see within range and mystically mark it as your quarry. Until the spell ends, you deal an extra 1d6 damage to the target whenever you hit it with a weapon attack, and you have advantage on any Wisdom (Perception) or Wisdom (Survival) check you make to find it. If the target drops to 0 hit points before this spell ends, you can use a bonus action on a subsequent turn of yours to mark a new creature.",
      "higherLevel": " When you cast this spell using a spell slot of 3rd or 4th level, you can maintain your concentration on the spell for up to 8 hours. When you use a spell slot of 5th level or higher, you can maintain your concentration on the spell for up to 24 hours."
    }
  }
];

export const DEMO_SRD_FEATS: Array<{ edition: DemoEdition; slug: string; feat: FeatBlock }> = [
  {
    "edition": "2024",
    "slug": "ability-score-improvement",
    "feat": {
      "name": "Ability Score Improvement",
      "category": "General",
      "prerequisite": "Level 4+",
      "repeatable": true,
      "description": "Increase one ability score of your choice by 2, or increase two ability scores of your choice by 1. This feat can't increase an ability score above 20.\n\nYou can take this feat more than once."
    }
  },
  {
    "edition": "2024",
    "slug": "alert",
    "feat": {
      "name": "Alert",
      "category": "Origin",
      "prerequisite": "",
      "repeatable": false,
      "description": "You gain the following benefits.\n\nWhen you roll Initiative, you can add your Proficiency Bonus to the roll.\n\nImmediately after you roll Initiative, you can swap your Initiative with the Initiative of one willing ally in the same combat. You can't make this swap if you or the ally has the Incapacitated condition."
    }
  },
  {
    "edition": "2024",
    "slug": "archery",
    "feat": {
      "name": "Archery",
      "category": "Fighting Style",
      "prerequisite": "Fighting Style Feature",
      "repeatable": false,
      "description": "You gain a +2 bonus to attack rolls you make with Ranged weapons."
    }
  },
  {
    "edition": "2024",
    "slug": "grappler",
    "feat": {
      "name": "Grappler",
      "category": "General",
      "prerequisite": "Level 4+, Strength or Dexterity 13+",
      "repeatable": false,
      "description": "You gain the following benefits.\n\nIncrease your Strength or Dexterity score by 1, to a maximum of 20.\n\nWhen you hit a creature with an Unarmed Strike as part of the Attack action on your turn, you can use both the Damage and the Grapple option. You can use this benefit only once per turn.\n\nYou have Advantage on attack rolls against a creature Grappled by you.\n\nYou don't have to spend extra movement to move a creature Grappled by you if the creature is your size or smaller."
    }
  },
  {
    "edition": "2024",
    "slug": "magic-initiate",
    "feat": {
      "name": "Magic Initiate",
      "category": "Origin",
      "prerequisite": "",
      "repeatable": true,
      "description": "You gain the following benefits.\n\nYou learn two cantrips of your choice from the Cleric, Druid, or Wizard spell list. Intelligence, Wisdom, or Charisma is your spellcasting ability for this feat's spells (choose when you select this feat).\n\nChoose a level 1 spell from the same list you selected for this feat's cantrips. You always have that spell prepared. You can cast it once without a spell slot, and you regain the ability to cast it in that way when you finish a Long Rest. You can also cast the spell using any spell slots you have.\n\nWhenever you gain a new level, you can replace one of the spells you chose for this feat with a different spell of the same level from the chosen spell list.\n\nYou can take this feat more than once, but you must choose a different spell list each time."
    }
  }
];
