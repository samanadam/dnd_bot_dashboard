// A few monsters and items copied from the bundled SRD files (data/srd), so the
// demo shows real stat blocks without shipping the whole data set to every
// visitor. System Reference Document 5.1 and 5.2 by Wizards of the Coast LLC,
// licensed under CC-BY-4.0; see data/srd/NOTICE.md.
//
// Regenerate by picking slugs from data/srd/*.json; the shapes match lib/dm/srd.ts
// and lib/dm/srdItems.ts.

import type { ItemBlock } from "@/lib/dm/items";
import type { StatBlock } from "@/lib/dm/statblock";

export type DemoEdition = "2014" | "2024";

export const DEMO_SRD_MONSTERS: Array<{ edition: DemoEdition; slug: string; statBlock: StatBlock }> = [
  {
    "edition": "2014",
    "slug": "goblin",
    "statBlock": {
      "name": "Goblin",
      "size": "Small",
      "type": "Humanoid",
      "alignment": "neutral evil",
      "ac": 15,
      "acNote": "leather armor, shield",
      "hp": 7,
      "hitDice": "2d6",
      "speed": "30 ft.",
      "abilities": {
        "str": 8,
        "dex": 14,
        "con": 10,
        "int": 10,
        "wis": 8,
        "cha": 8
      },
      "saves": {},
      "skills": {
        "stealth": 6
      },
      "senses": "darkvision 60 ft., passive Perception 9",
      "languages": "Common, Goblin",
      "cr": "1/4",
      "xp": 50,
      "initiativeBonus": 2,
      "damageVulnerabilities": "",
      "damageResistances": "",
      "damageImmunities": "",
      "conditionImmunities": "",
      "traits": [
        {
          "name": "Nimble Escape",
          "desc": "The goblin can take the Disengage or Hide action as a bonus action on each of its turns."
        }
      ],
      "actions": [
        {
          "name": "Scimitar",
          "desc": "Melee Weapon Attack: +4 to hit, reach 5 ft., one target. Hit: 5 (1d6 + 2) slashing damage.",
          "attack": {
            "toHit": 4,
            "damage": "1d6+2",
            "damageType": "Slashing"
          }
        },
        {
          "name": "Shortbow",
          "desc": "Ranged Weapon Attack: +4 to hit, range 80/320 ft., one target. Hit: 5 (1d6 + 2) piercing damage.",
          "attack": {
            "toHit": 4,
            "damage": "1d6+2",
            "damageType": "Piercing"
          }
        }
      ],
      "bonusActions": [],
      "reactions": [],
      "legendaryActions": [],
      "legendaryDescription": ""
    }
  },
  {
    "edition": "2014",
    "slug": "wolf",
    "statBlock": {
      "name": "Wolf",
      "size": "Medium",
      "type": "Beast",
      "alignment": "unaligned",
      "ac": 13,
      "acNote": "natural armor",
      "hp": 11,
      "hitDice": "2d8+2",
      "speed": "40 ft.",
      "abilities": {
        "str": 12,
        "dex": 15,
        "con": 12,
        "int": 3,
        "wis": 12,
        "cha": 6
      },
      "saves": {},
      "skills": {
        "perception": 3,
        "stealth": 4
      },
      "senses": "passive Perception 13",
      "languages": "",
      "cr": "1/4",
      "xp": 50,
      "initiativeBonus": 2,
      "damageVulnerabilities": "",
      "damageResistances": "",
      "damageImmunities": "",
      "conditionImmunities": "",
      "traits": [
        {
          "name": "Keen Hearing and Smell",
          "desc": "The wolf has advantage on Wisdom (Perception) checks that rely on hearing or smell."
        },
        {
          "name": "Pack Tactics",
          "desc": "The wolf has advantage on an attack roll against a creature if at least one of the wolf's allies is within 5 ft. of the creature and the ally isn't incapacitated."
        }
      ],
      "actions": [
        {
          "name": "Bite",
          "desc": "Melee Weapon Attack: +4 to hit, reach 5 ft., one target. Hit: 7 (2d4 + 2) piercing damage. If the target is a creature, it must succeed on a DC 11 Strength saving throw or be knocked prone.",
          "attack": {
            "toHit": 4,
            "damage": "2d4+2",
            "damageType": "Piercing"
          }
        }
      ],
      "bonusActions": [],
      "reactions": [],
      "legendaryActions": [],
      "legendaryDescription": ""
    }
  },
  {
    "edition": "2014",
    "slug": "orc",
    "statBlock": {
      "name": "Orc",
      "size": "Medium",
      "type": "Humanoid",
      "alignment": "chaotic evil",
      "ac": 13,
      "acNote": "hide armor",
      "hp": 15,
      "hitDice": "2d8+6",
      "speed": "30 ft.",
      "abilities": {
        "str": 16,
        "dex": 12,
        "con": 16,
        "int": 7,
        "wis": 11,
        "cha": 10
      },
      "saves": {},
      "skills": {
        "intimidation": 2
      },
      "senses": "darkvision 60 ft., passive Perception 10",
      "languages": "Common, Orc",
      "cr": "1/2",
      "xp": 100,
      "initiativeBonus": 1,
      "damageVulnerabilities": "",
      "damageResistances": "",
      "damageImmunities": "",
      "conditionImmunities": "",
      "traits": [
        {
          "name": "Aggressive",
          "desc": "As a bonus action, the orc can move up to its speed toward a hostile creature that it can see."
        }
      ],
      "actions": [
        {
          "name": "Greataxe",
          "desc": "Melee Weapon Attack: +5 to hit, reach 5 ft., one target. Hit: 9 (1d12 + 3) slashing damage.",
          "attack": {
            "toHit": 5,
            "damage": "1d12+3",
            "damageType": "Slashing"
          }
        },
        {
          "name": "Javelin",
          "desc": "Melee or Ranged Weapon Attack: +5 to hit, reach 5 ft. or range 30/120 ft., one target. Hit: 6 (1d6 + 3) piercing damage.",
          "attack": {
            "toHit": 5,
            "damage": "1d6+3",
            "damageType": "Piercing"
          }
        }
      ],
      "bonusActions": [],
      "reactions": [],
      "legendaryActions": [],
      "legendaryDescription": ""
    }
  },
  {
    "edition": "2014",
    "slug": "skeleton",
    "statBlock": {
      "name": "Skeleton",
      "size": "Medium",
      "type": "Undead (Skeletons)",
      "alignment": "lawful evil",
      "ac": 13,
      "acNote": "armor scraps",
      "hp": 13,
      "hitDice": "2d8+4",
      "speed": "30 ft.",
      "abilities": {
        "str": 10,
        "dex": 14,
        "con": 15,
        "int": 6,
        "wis": 8,
        "cha": 5
      },
      "saves": {},
      "skills": {},
      "senses": "darkvision 60 ft., passive Perception 9",
      "languages": "understands the languages it knew in life but can't speak",
      "cr": "1/4",
      "xp": 50,
      "initiativeBonus": 2,
      "damageVulnerabilities": "bludgeoning",
      "damageResistances": "",
      "damageImmunities": "poison",
      "conditionImmunities": "exhaustion, poisoned",
      "traits": [],
      "actions": [
        {
          "name": "Shortsword",
          "desc": "Melee Weapon Attack: +4 to hit, reach 5 ft., one target. Hit: 5 (1d6 + 2) piercing damage.",
          "attack": {
            "toHit": 4,
            "damage": "1d6+2",
            "damageType": "Piercing"
          }
        },
        {
          "name": "Shortbow",
          "desc": "Ranged Weapon Attack: +4 to hit, range 80/320 ft., one target. Hit: 5 (1d6 + 2) piercing damage.",
          "attack": {
            "toHit": 4,
            "damage": "1d6+2",
            "damageType": "Piercing"
          }
        }
      ],
      "bonusActions": [],
      "reactions": [],
      "legendaryActions": [],
      "legendaryDescription": ""
    }
  },
  {
    "edition": "2014",
    "slug": "zombie",
    "statBlock": {
      "name": "Zombie",
      "size": "Medium",
      "type": "Undead (Zombies)",
      "alignment": "neutral evil",
      "ac": 8,
      "acNote": "",
      "hp": 22,
      "hitDice": "3d8+9",
      "speed": "20 ft.",
      "abilities": {
        "str": 13,
        "dex": 6,
        "con": 16,
        "int": 3,
        "wis": 6,
        "cha": 5
      },
      "saves": {
        "wis": 0
      },
      "skills": {},
      "senses": "darkvision 60 ft., passive Perception 8",
      "languages": "understands the languages it knew in life but can't speak",
      "cr": "1/4",
      "xp": 50,
      "initiativeBonus": -2,
      "damageVulnerabilities": "",
      "damageResistances": "",
      "damageImmunities": "",
      "conditionImmunities": "poisoned",
      "traits": [
        {
          "name": "Undead Fortitude",
          "desc": "If damage reduces the zombie to 0 hit points, it must make a Constitution saving throw with a DC of 5+the damage taken, unless the damage is radiant or from a critical hit. On a success, the zombie drops to 1 hit point instead."
        }
      ],
      "actions": [
        {
          "name": "Slam",
          "desc": "Melee Weapon Attack: +3 to hit, reach 5 ft., one target. Hit: 4 (1d6 + 1) bludgeoning damage.",
          "attack": {
            "toHit": 3,
            "damage": "1d6+1",
            "damageType": "Bludgeoning"
          }
        }
      ],
      "bonusActions": [],
      "reactions": [],
      "legendaryActions": [],
      "legendaryDescription": ""
    }
  },
  {
    "edition": "2014",
    "slug": "bandit-captain",
    "statBlock": {
      "name": "Bandit Captain",
      "size": "Medium",
      "type": "Humanoid",
      "alignment": "any non-lawful alignment",
      "ac": 15,
      "acNote": "studded leather",
      "hp": 65,
      "hitDice": "10d8+20",
      "speed": "30 ft.",
      "abilities": {
        "str": 15,
        "dex": 16,
        "con": 14,
        "int": 14,
        "wis": 11,
        "cha": 14
      },
      "saves": {
        "str": 4,
        "dex": 5,
        "wis": 2
      },
      "skills": {
        "athletics": 4,
        "deception": 4
      },
      "senses": "passive Perception 10",
      "languages": "any two languages",
      "cr": "2",
      "xp": 450,
      "initiativeBonus": 3,
      "damageVulnerabilities": "",
      "damageResistances": "",
      "damageImmunities": "",
      "conditionImmunities": "",
      "traits": [],
      "actions": [
        {
          "name": "Multiattack",
          "desc": "The captain makes three melee attacks: two with its scimitar and one with its dagger. Or the captain makes two ranged attacks with its daggers."
        },
        {
          "name": "Scimitar",
          "desc": "Melee Weapon Attack: +5 to hit, reach 5 ft., one target. Hit: 6 (1d6 + 3) slashing damage.",
          "attack": {
            "toHit": 5,
            "damage": "1d6+3",
            "damageType": "Slashing"
          }
        },
        {
          "name": "Dagger",
          "desc": "Melee or Ranged Weapon Attack: +5 to hit, reach 5 ft. or range 20/60 ft., one target. Hit: 5 (1d4 + 3) piercing damage.",
          "attack": {
            "toHit": 5,
            "damage": "1d4+3",
            "damageType": "Piercing"
          }
        }
      ],
      "bonusActions": [],
      "reactions": [
        {
          "name": "Parry",
          "desc": "The captain adds 2 to its AC against one melee attack that would hit it. To do so, the captain must see the attacker and be wielding a melee weapon."
        }
      ],
      "legendaryActions": [],
      "legendaryDescription": ""
    }
  },
  {
    "edition": "2014",
    "slug": "owlbear",
    "statBlock": {
      "name": "Owlbear",
      "size": "Large",
      "type": "Monstrosity",
      "alignment": "unaligned",
      "ac": 13,
      "acNote": "natural armor",
      "hp": 59,
      "hitDice": "7d10+21",
      "speed": "40 ft.",
      "abilities": {
        "str": 20,
        "dex": 12,
        "con": 17,
        "int": 3,
        "wis": 12,
        "cha": 7
      },
      "saves": {},
      "skills": {
        "perception": 3
      },
      "senses": "darkvision 60 ft., passive Perception 13",
      "languages": "",
      "cr": "3",
      "xp": 700,
      "initiativeBonus": 1,
      "damageVulnerabilities": "",
      "damageResistances": "",
      "damageImmunities": "",
      "conditionImmunities": "",
      "traits": [
        {
          "name": "Keen Sight and Smell",
          "desc": "The owlbear has advantage on Wisdom (Perception) checks that rely on sight or smell."
        }
      ],
      "actions": [
        {
          "name": "Multiattack",
          "desc": "The owlbear makes two attacks: one with its beak and one with its claws."
        },
        {
          "name": "Beak",
          "desc": "Melee Weapon Attack: +7 to hit, reach 5 ft., one creature. Hit: 10 (1d10 + 5) piercing damage.",
          "attack": {
            "toHit": 7,
            "damage": "1d10+5",
            "damageType": "Piercing"
          }
        },
        {
          "name": "Claws",
          "desc": "Melee Weapon Attack: +7 to hit, reach 5 ft., one target. Hit: 14 (2d8 + 5) slashing damage.",
          "attack": {
            "toHit": 7,
            "damage": "2d8+5",
            "damageType": "Slashing"
          }
        }
      ],
      "bonusActions": [],
      "reactions": [],
      "legendaryActions": [],
      "legendaryDescription": ""
    }
  },
  {
    "edition": "2014",
    "slug": "ogre",
    "statBlock": {
      "name": "Ogre",
      "size": "Large",
      "type": "Giant",
      "alignment": "chaotic evil",
      "ac": 11,
      "acNote": "hide armor",
      "hp": 59,
      "hitDice": "7d10+21",
      "speed": "40 ft.",
      "abilities": {
        "str": 19,
        "dex": 8,
        "con": 16,
        "int": 5,
        "wis": 7,
        "cha": 7
      },
      "saves": {},
      "skills": {},
      "senses": "darkvision 60 ft., passive Perception 8",
      "languages": "Common, Giant",
      "cr": "2",
      "xp": 450,
      "initiativeBonus": -1,
      "damageVulnerabilities": "",
      "damageResistances": "",
      "damageImmunities": "",
      "conditionImmunities": "",
      "traits": [],
      "actions": [
        {
          "name": "Greatclub",
          "desc": "Melee Weapon Attack: +6 to hit, reach 5 ft., one target. Hit: 13 (2d8 + 4) bludgeoning damage.",
          "attack": {
            "toHit": 6,
            "damage": "2d8+4",
            "damageType": "Bludgeoning"
          }
        },
        {
          "name": "Javelin",
          "desc": "Melee or Ranged Weapon Attack: +6 to hit, reach 5 ft. or range 30/120 ft., one target. Hit: 11 (2d6 + 4) piercing damage.",
          "attack": {
            "toHit": 6,
            "damage": "2d6+4",
            "damageType": "Piercing"
          }
        }
      ],
      "bonusActions": [],
      "reactions": [],
      "legendaryActions": [],
      "legendaryDescription": ""
    }
  },
  {
    "edition": "2014",
    "slug": "young-red-dragon",
    "statBlock": {
      "name": "Young Red Dragon",
      "size": "Large",
      "type": "Dragon (Dragons, Chromatic)",
      "alignment": "chaotic evil",
      "ac": 18,
      "acNote": "natural armor",
      "hp": 178,
      "hitDice": "17d10+85",
      "speed": "40 ft., climb 40 ft., fly 80 ft.",
      "abilities": {
        "str": 23,
        "dex": 10,
        "con": 21,
        "int": 14,
        "wis": 11,
        "cha": 19
      },
      "saves": {
        "dex": 4,
        "con": 9,
        "wis": 4,
        "cha": 8
      },
      "skills": {
        "perception": 8,
        "stealth": 4
      },
      "senses": "blindsight 30 ft., darkvision 120 ft., passive Perception 18",
      "languages": "Common, Draconic",
      "cr": "10",
      "xp": 5900,
      "initiativeBonus": 0,
      "damageVulnerabilities": "",
      "damageResistances": "",
      "damageImmunities": "fire",
      "conditionImmunities": "",
      "traits": [],
      "actions": [
        {
          "name": "Multiattack",
          "desc": "The dragon makes three attacks: one with its bite and two with its claws."
        },
        {
          "name": "Bite",
          "desc": "Melee Weapon Attack: +10 to hit, reach 10 ft., one target. Hit: 17 (2d10 + 6) piercing damage plus 3 (1d6) fire damage.",
          "attack": {
            "toHit": 10,
            "damage": "2d10+6",
            "damageType": "Piercing",
            "extraDamage": "1d6",
            "extraDamageType": "Fire"
          }
        },
        {
          "name": "Claw",
          "desc": "Melee Weapon Attack: +10 to hit, reach 5 ft., one target. Hit: 13 (2d6 + 6) slashing damage.",
          "attack": {
            "toHit": 10,
            "damage": "2d6+6",
            "damageType": "Slashing"
          }
        },
        {
          "name": "Fire Breath",
          "desc": "The dragon exhales fire in a 30-foot cone. Each creature in that area must make a DC 17 Dexterity saving throw, taking 56 (16d6) fire damage on a failed save, or half as much damage on a successful one."
        }
      ],
      "bonusActions": [],
      "reactions": [],
      "legendaryActions": [],
      "legendaryDescription": ""
    }
  },
  {
    "edition": "2024",
    "slug": "goblin-warrior",
    "statBlock": {
      "name": "Goblin Warrior",
      "size": "Small",
      "type": "Fey",
      "alignment": "chaotic neutral",
      "ac": 15,
      "acNote": "natural armor",
      "hp": 10,
      "hitDice": "3d6",
      "speed": "30 ft.",
      "abilities": {
        "str": 8,
        "dex": 15,
        "con": 10,
        "int": 10,
        "wis": 8,
        "cha": 8
      },
      "saves": {
        "str": -1,
        "dex": 2,
        "con": 0,
        "int": 0,
        "wis": -1,
        "cha": -1
      },
      "skills": {
        "stealth": 6
      },
      "senses": "darkvision 60 ft., passive Perception 9",
      "languages": "Common, Goblin",
      "cr": "1/4",
      "xp": 50,
      "initiativeBonus": 2,
      "damageVulnerabilities": "",
      "damageResistances": "",
      "damageImmunities": "",
      "conditionImmunities": "",
      "traits": [],
      "actions": [
        {
          "name": "Scimitar",
          "desc": "Melee Attack Roll: +4, reach 5 ft. 5 (1d6 + 2) Slashing damage, plus 2 (1d4) Slashing damage if the attack roll had Advantage.",
          "attack": {
            "toHit": 4,
            "damage": "1d6+2",
            "damageType": "Slashing"
          }
        },
        {
          "name": "Shortbow",
          "desc": "Ranged Attack Roll: +4, range 80/320 ft. 5 (1d6 + 2) Piercing damage, plus 2 (1d4) Piercing damage if the attack roll had Advantage.",
          "attack": {
            "toHit": 4,
            "damage": "1d6+2",
            "damageType": "Piercing"
          }
        }
      ],
      "bonusActions": [
        {
          "name": "Nimble Escape",
          "desc": "The goblin takes the Disengage or Hide action."
        }
      ],
      "reactions": [],
      "legendaryActions": [],
      "legendaryDescription": ""
    }
  },
  {
    "edition": "2024",
    "slug": "goblin-boss",
    "statBlock": {
      "name": "Goblin Boss",
      "size": "Small",
      "type": "Fey",
      "alignment": "chaotic neutral",
      "ac": 17,
      "acNote": "natural armor",
      "hp": 21,
      "hitDice": "6d6",
      "speed": "30 ft.",
      "abilities": {
        "str": 10,
        "dex": 15,
        "con": 10,
        "int": 10,
        "wis": 8,
        "cha": 10
      },
      "saves": {
        "str": 0,
        "dex": 2,
        "con": 0,
        "int": 0,
        "wis": -1,
        "cha": 0
      },
      "skills": {
        "stealth": 6
      },
      "senses": "darkvision 60 ft., passive Perception 9",
      "languages": "Common, Goblin",
      "cr": "1",
      "xp": 200,
      "initiativeBonus": 2,
      "damageVulnerabilities": "",
      "damageResistances": "",
      "damageImmunities": "",
      "conditionImmunities": "",
      "traits": [],
      "actions": [
        {
          "name": "Multiattack",
          "desc": "The goblin makes two attacks, using Scimitar or Shortbow in any combination."
        },
        {
          "name": "Scimitar",
          "desc": "Melee Attack Roll: +4, reach 5 ft. 5 (1d6 + 2) Slashing damage, plus 2 (1d4) Slashing damage if the attack roll had Advantage.",
          "attack": {
            "toHit": 4,
            "damage": "1d6+2",
            "damageType": "Slashing"
          }
        },
        {
          "name": "Shortbow",
          "desc": "Ranged Attack Roll: +4, range 80/320 ft. 5 (1d6 + 2) Piercing damage, plus 2 (1d4) Piercing damage if the attack roll had Advantage.",
          "attack": {
            "toHit": 4,
            "damage": "1d6+2",
            "damageType": "Piercing"
          }
        }
      ],
      "bonusActions": [
        {
          "name": "Nimble Escape",
          "desc": "The goblin takes the Disengage or Hide action."
        }
      ],
      "reactions": [
        {
          "name": "Redirect Attack",
          "desc": "_Trigger:_ A creature the goblin can see makes an attack roll against it. _Response:_ The goblin chooses a Small or Medium ally within 5 feet of itself. The goblin and that ally swap places, and the ally becomes the target of the attack instead."
        }
      ],
      "legendaryActions": [],
      "legendaryDescription": ""
    }
  },
  {
    "edition": "2024",
    "slug": "giant-spider",
    "statBlock": {
      "name": "Giant Spider",
      "size": "Large",
      "type": "Beast",
      "alignment": "unaligned",
      "ac": 14,
      "acNote": "natural armor",
      "hp": 26,
      "hitDice": "4d10+4",
      "speed": "30 ft., climb 30 ft.",
      "abilities": {
        "str": 14,
        "dex": 16,
        "con": 12,
        "int": 2,
        "wis": 11,
        "cha": 4
      },
      "saves": {
        "str": 2,
        "dex": 3,
        "con": 1,
        "int": -4,
        "wis": 0,
        "cha": -3
      },
      "skills": {
        "perception": 4,
        "stealth": 7
      },
      "senses": "darkvision 60 ft., passive Perception 14",
      "languages": "",
      "cr": "1",
      "xp": 200,
      "initiativeBonus": 3,
      "damageVulnerabilities": "",
      "damageResistances": "",
      "damageImmunities": "",
      "conditionImmunities": "",
      "traits": [
        {
          "name": "Spider Climb",
          "desc": "The spider can climb difficult surfaces, including along ceilings, without needing to make an ability check."
        },
        {
          "name": "Web Walker",
          "desc": "The spider ignores movement restrictions caused by webs, and it knows the location of any other creature in contact with the same web."
        }
      ],
      "actions": [
        {
          "name": "Bite",
          "desc": "Melee Attack Roll: +5, reach 5 ft. 7 (1d8 + 3) Piercing damage plus 7 (2d6) Poison damage.",
          "attack": {
            "toHit": 5,
            "damage": "1d8+3",
            "damageType": "Piercing",
            "extraDamage": "2d6",
            "extraDamageType": "Poison"
          }
        },
        {
          "name": "Web",
          "desc": "Dexterity Saving Throw: DC 13, one creature the spider can see within 60 feet. Failure: The target has the Restrained condition until the web is destroyed (AC 10; HP 5; Vulnerability to Fire damage; Immunity to Poison and Psychic damage)."
        }
      ],
      "bonusActions": [],
      "reactions": [],
      "legendaryActions": [],
      "legendaryDescription": ""
    }
  },
  {
    "edition": "2024",
    "slug": "mimic",
    "statBlock": {
      "name": "Mimic",
      "size": "Medium",
      "type": "Monstrosity",
      "alignment": "neutral",
      "ac": 12,
      "acNote": "natural armor",
      "hp": 58,
      "hitDice": "9d8+18",
      "speed": "20 ft.",
      "abilities": {
        "str": 17,
        "dex": 12,
        "con": 15,
        "int": 5,
        "wis": 13,
        "cha": 8
      },
      "saves": {
        "str": 3,
        "dex": 1,
        "con": 2,
        "int": -3,
        "wis": 1,
        "cha": -1
      },
      "skills": {
        "stealth": 5
      },
      "senses": "darkvision 60 ft., passive Perception 11",
      "languages": "",
      "cr": "2",
      "xp": 450,
      "initiativeBonus": 3,
      "damageVulnerabilities": "",
      "damageResistances": "",
      "damageImmunities": "acid",
      "conditionImmunities": "prone",
      "traits": [
        {
          "name": "Adhesive (Object Form Only)",
          "desc": "The mimic adheres to anything that touches it. A Huge or smaller creature adhered to the mimic has the Grappled condition (escape DC 13). Ability checks made to escape this grapple have Disadvantage."
        }
      ],
      "actions": [
        {
          "name": "Bite",
          "desc": "Melee Attack Roll: +5 (with Advantage if the target is Grappled by the mimic), reach 5 ft. 7 (1d8 + 3) Piercing damage—or 12 (2d8 + 3) Piercing damage if the target is Grappled by the mimic—plus 4 (1d8) Acid damage.",
          "attack": {
            "toHit": 5,
            "damage": "1d8+3",
            "damageType": "Piercing",
            "extraDamage": "1d8",
            "extraDamageType": "Acid"
          }
        },
        {
          "name": "Pseudopod",
          "desc": "Melee Attack Roll: +5, reach 5 ft. 7 (1d8 + 3) Bludgeoning damage plus 4 (1d8) Acid damage. If the target is a Large or smaller creature, it has the Grappled condition (escape DC 13). Ability checks made to escape this grapple have Disadvantage.",
          "attack": {
            "toHit": 5,
            "damage": "1d8+3",
            "damageType": "Bludgeoning",
            "extraDamage": "1d8",
            "extraDamageType": "Acid"
          }
        }
      ],
      "bonusActions": [
        {
          "name": "Shape-Shift",
          "desc": "The mimic shape-shifts to resemble a Medium or Small object while retaining its game statistics, or it returns to its true blob form. Any equipment it is wearing or carrying isn't transformed."
        }
      ],
      "reactions": [],
      "legendaryActions": [],
      "legendaryDescription": ""
    }
  },
  {
    "edition": "2024",
    "slug": "troll",
    "statBlock": {
      "name": "Troll",
      "size": "Large",
      "type": "Giant",
      "alignment": "chaotic evil",
      "ac": 15,
      "acNote": "natural armor",
      "hp": 94,
      "hitDice": "9d10+45",
      "speed": "30 ft.",
      "abilities": {
        "str": 18,
        "dex": 13,
        "con": 20,
        "int": 7,
        "wis": 9,
        "cha": 7
      },
      "saves": {
        "str": 4,
        "dex": 1,
        "con": 5,
        "int": -2,
        "wis": -1,
        "cha": -2
      },
      "skills": {
        "perception": 5
      },
      "senses": "darkvision 60 ft., passive Perception 15",
      "languages": "Giant",
      "cr": "5",
      "xp": 1800,
      "initiativeBonus": 1,
      "damageVulnerabilities": "",
      "damageResistances": "",
      "damageImmunities": "",
      "conditionImmunities": "",
      "traits": [
        {
          "name": "Loathsome Limbs (4/Day)",
          "desc": "If the troll ends any turn Bloodied and took 15+ Slashing damage during that turn, one of the troll's limbs is severed, falls into the troll's space, and becomes a Troll Limb. The limb acts immediately after the troll's turn. The troll has 1 Exhaustion level for each missing limb, and it grows replacement limbs the next time it regains Hit Points."
        },
        {
          "name": "Regeneration",
          "desc": "The troll regains 15 Hit Points at the start of each of its turns. If the troll takes Acid or Fire damage, this trait doesn't function on the troll's next turn. The troll dies only if it starts its turn with 0 Hit Points and doesn't regenerate."
        }
      ],
      "actions": [
        {
          "name": "Multiattack",
          "desc": "The troll makes three Rend attacks."
        },
        {
          "name": "Rend",
          "desc": "Melee Attack Roll: +7, reach 10 ft. 11 (2d6 + 4) Slashing damage.",
          "attack": {
            "toHit": 7,
            "damage": "2d6+4",
            "damageType": "Slashing"
          }
        }
      ],
      "bonusActions": [
        {
          "name": "Charge",
          "desc": "The troll moves up to half its Speed straight toward an enemy it can see."
        }
      ],
      "reactions": [],
      "legendaryActions": [],
      "legendaryDescription": ""
    }
  }
];

export const DEMO_SRD_ITEMS: Array<{ edition: DemoEdition; slug: string; item: ItemBlock }> = [
  {
    "edition": "2014",
    "slug": "longsword",
    "item": {
      "name": "Longsword",
      "category": "Weapon",
      "rarity": "",
      "attunement": "",
      "costGp": 15,
      "weightLb": 3,
      "detail": "1d8 slashing · Versatile (1d10)",
      "description": "A longsword"
    }
  },
  {
    "edition": "2014",
    "slug": "shield",
    "item": {
      "name": "Shield",
      "category": "Shield",
      "rarity": "",
      "attunement": "",
      "costGp": 10,
      "weightLb": 6,
      "detail": "",
      "description": "A shield is made from wood or metal and is carried in one hand. Wielding a shield increases your Armor Class by 2. You can benefit from only one shield at a time."
    }
  },
  {
    "edition": "2014",
    "slug": "potion-of-healing",
    "item": {
      "name": "Potion of Healing",
      "category": "Potion",
      "rarity": "Common",
      "attunement": "",
      "costGp": 50,
      "weightLb": 0.5,
      "detail": "",
      "description": "You regain hit points when you drink this potion. The number of hit points depends on the potion's rarity, as shown in the Potions of Healing table. Whatever its potency, the potion's red liquid glimmers when agitated.\\n\\n**Potions of Healing (table)**\\n\\n| Potion of ...    | Rarity    | HP Regained |\\n|------------------|-----------|-------------|\\n| Healing          | Common    | 2d4 + 2     |\\n| Greater healing  | Uncommon  | 4d4 + 4     |\\n| Superior healing | Rare      | 8d4 + 8     |\\n| Supreme healing  | Very rare | 10d4 + 20   |"
    }
  },
  {
    "edition": "2014",
    "slug": "bag-of-holding",
    "item": {
      "name": "Bag of Holding",
      "category": "Wondrous Item",
      "rarity": "Uncommon",
      "attunement": "",
      "costGp": 0,
      "weightLb": 0,
      "detail": "",
      "description": "This bag has an interior space considerably larger than its outside dimensions, roughly 2 feet in diameter at the mouth and 4 feet deep. The bag can hold up to 500 pounds, not exceeding a volume of 64 cubic feet. The bag weighs 15 pounds, regardless of its contents. Retrieving an item from the bag requires an action.\r\n\r\nIf the bag is overloaded, pierced, or torn, it ruptures and is destroyed, and its contents are scattered in the Astral Plane. If the bag is turned inside out, its contents spill forth, unharmed, but the bag must be put right before it can be used again. Breathing creatures inside the bag can survive up to a number of minutes equal to 10 divided by the number of creatures (minimum 1 minute), after which time they begin to suffocate.\r\n\r\nPlacing a _bag of holding_ inside an extradimensional space created by a _handy haversack_, _portable hole_, or similar item instantly destroys both items and opens a gate to the Astral Plane. The gate originates where the one item was placed inside the other. Any creature within 10 feet of the gate is sucked through it to a random location on the Astral Plane. The gate then closes. The gate is one-way only and can't be reopened."
    }
  },
  {
    "edition": "2014",
    "slug": "cloak-of-elvenkind",
    "item": {
      "name": "Cloak of Elvenkind",
      "category": "Wondrous Item",
      "rarity": "Uncommon",
      "attunement": "Required",
      "costGp": 0,
      "weightLb": 0,
      "detail": "",
      "description": "While you wear this cloak with its hood up, Wisdom (Perception) checks made to see you have disadvantage, and you have advantage on Dexterity (Stealth) checks made to hide, as the cloak's color shifts to camouflage you. Pulling the hood up or down requires an action."
    }
  },
  {
    "edition": "2014",
    "slug": "flame-tongue-longsword",
    "item": {
      "name": "Flame Tongue (Longsword)",
      "category": "Weapon",
      "rarity": "Rare",
      "attunement": "Required",
      "costGp": 0,
      "weightLb": 3,
      "detail": "1d8 slashing · Versatile (1d10)",
      "description": "You can use a bonus action to speak this magic sword's command word, causing flames to erupt from the blade. These flames shed bright light in a 40-foot radius and dim light for an additional 40 feet. While the sword is ablaze, it deals an extra 2d6 fire damage to any target it hits. The flames last until you use a bonus action to speak the command word again or until you drop or sheathe the sword."
    }
  },
  {
    "edition": "2014",
    "slug": "wand-of-magic-missiles",
    "item": {
      "name": "Wand of Magic Missiles",
      "category": "Wand",
      "rarity": "Uncommon",
      "attunement": "",
      "costGp": 0,
      "weightLb": 0,
      "detail": "",
      "description": "This wand has 7 charges. While holding it, you can use an action to expend 1 or more of its charges to cast the _magic missile_ spell from it. For 1 charge, you cast the 1st-level version of the spell. You can increase the spell slot level by one for each additional charge you expend.\n\nThe wand regains 1d6 + 1 expended charges daily at dawn. If you expend the wand's last charge, roll a d20. On a 1, the wand crumbles into ashes and is destroyed."
    }
  },
  {
    "edition": "2024",
    "slug": "healers-kit",
    "item": {
      "name": "Healer's Kit",
      "category": "Tools",
      "rarity": "",
      "attunement": "",
      "costGp": 5,
      "weightLb": 3,
      "detail": "",
      "description": "A Healer's Kit has ten uses. As a Utilize action, you can expend one of its uses to stabilize an Unconscious creature that has 0 Hit Points without needing to make a Wisdom (Medicine) check."
    }
  },
  {
    "edition": "2024",
    "slug": "rope-of-climbing",
    "item": {
      "name": "Rope of Climbing",
      "category": "Wondrous Item",
      "rarity": "Uncommon",
      "attunement": "",
      "costGp": 0,
      "weightLb": 0,
      "detail": "",
      "description": "This 60-foot length of rope can hold up to 3,000 pounds. While holding one end of the rope, you can take a Magic action to command the other end of the rope to animate and move toward a destination you choose, up to the rope's length away from you. That end moves 10 feet on your turn when you first command it and 10 feet at the start of each of your subsequent turns until reaching its destination or until you tell it to stop. You can also tell the rope to fasten itself securely to an object or to unfasten itself, to knot or unknot itself, or to coil itself for carrying. If you tell the rope to knot, large knots appear at 1-foot intervals along the rope. While knotted, the rope shortens to a 50-foot length and grants Advantage on ability checks made to climb using the rope. The rope has AC 20, HP 20, and Immunity to Poison and Psychic damage. It regains 1 Hit Point every 5 minutes as long as it has at least 1 Hit Point. If the rope drops to 0 Hit Points, it is destroyed."
    }
  },
  {
    "edition": "2024",
    "slug": "ring-of-protection",
    "item": {
      "name": "Ring of Protection",
      "category": "Ring",
      "rarity": "Rare",
      "attunement": "Required",
      "costGp": 0,
      "weightLb": 0,
      "detail": "",
      "description": "You gain a +1 bonus to Armor Class and saving throws while wearing this ring."
    }
  },
  {
    "edition": "2024",
    "slug": "boots-of-elvenkind",
    "item": {
      "name": "Boots of Elvenkind",
      "category": "Wondrous Item",
      "rarity": "Uncommon",
      "attunement": "",
      "costGp": 0,
      "weightLb": 0,
      "detail": "",
      "description": "While you wear these boots, your steps make no sound, regardless of the surface you are moving across. You also have Advantage on Dexterity (Stealth) checks."
    }
  },
  {
    "edition": "2024",
    "slug": "longsword-plus-1",
    "item": {
      "name": "Longsword (+1)",
      "category": "Weapon",
      "rarity": "Uncommon",
      "attunement": "",
      "costGp": 0,
      "weightLb": 3,
      "detail": "1d8 slashing · Sap, Versatile (1d10)",
      "description": "You have a bonus to attack rolls and damage rolls made with this magic weapon. The bonus is determined by the weapon's rarity."
    }
  }
];
