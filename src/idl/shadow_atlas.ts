/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/shadow_atlas.json`.
 */
export type ShadowAtlas = {
  "address": "7EJzHvTvmxWZynJKpKWHGdfDd9wrNFx6RT63B5TrDbkz",
  "metadata": {
    "name": "shadowAtlas",
    "version": "0.1.0",
    "spec": "0.1.0",
    "description": "Created with Anchor"
  },
  "docs": [
    "Shadow Atlas: two players, eight territories, simultaneous hidden moves.",
    "",
    "Lifecycle:",
    "- Solana base layer: `create_match` -> `join_match` -> `delegate_match`",
    "- MagicBlock Private ER: `init_permissions` ->",
    "(`submit_secret_move` then `announce_commit`, per player; the second announce",
    "resolves the turn, `resolve_turn` is a permissionless fallback)*",
    "-> `settle_match`, which commits the final state back to Solana.",
    "`claim_timeout` ends a turn the opponent has stalled."
  ],
  "instructions": [
    {
      "name": "announceCommit",
      "docs": [
        "Private ER. Separate transaction after a submit: flags the commit publicly and",
        "resolves the turn if the opponent has committed too."
      ],
      "discriminator": [
        7,
        52,
        106,
        10,
        46,
        12,
        17,
        148
      ],
      "accounts": [
        {
          "name": "player",
          "signer": true
        },
        {
          "name": "matchAccount",
          "writable": true
        },
        {
          "name": "moveA",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  111,
                  118,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "matchAccount"
              },
              {
                "kind": "account",
                "path": "matchAccount.playerA",
                "account": "match"
              }
            ]
          }
        },
        {
          "name": "moveB",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  111,
                  118,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "matchAccount"
              },
              {
                "kind": "account",
                "path": "matchAccount.playerB",
                "account": "match"
              }
            ]
          }
        }
      ],
      "args": []
    },
    {
      "name": "cancelMatch",
      "docs": [
        "Base layer. Creator closes a match nobody has joined."
      ],
      "discriminator": [
        142,
        136,
        247,
        45,
        92,
        112,
        180,
        83
      ],
      "accounts": [
        {
          "name": "creator",
          "writable": true,
          "signer": true,
          "relations": [
            "matchAccount"
          ]
        },
        {
          "name": "matchAccount",
          "writable": true
        },
        {
          "name": "moveA",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  111,
                  118,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "matchAccount"
              },
              {
                "kind": "account",
                "path": "creator"
              }
            ]
          }
        }
      ],
      "args": []
    },
    {
      "name": "claimTimeout",
      "docs": [
        "Private ER. Ends a stalled turn after `TURN_TIMEOUT_SECS`."
      ],
      "discriminator": [
        130,
        234,
        45,
        53,
        120,
        90,
        86,
        178
      ],
      "accounts": [
        {
          "name": "player",
          "signer": true
        },
        {
          "name": "matchAccount",
          "writable": true
        },
        {
          "name": "moveA",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  111,
                  118,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "matchAccount"
              },
              {
                "kind": "account",
                "path": "matchAccount.playerA",
                "account": "match"
              }
            ]
          }
        },
        {
          "name": "moveB",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  111,
                  118,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "matchAccount"
              },
              {
                "kind": "account",
                "path": "matchAccount.playerB",
                "account": "match"
              }
            ]
          }
        }
      ],
      "args": []
    },
    {
      "name": "createMatch",
      "docs": [
        "UC01. Base layer. Creates the match PDA and the creator's move PDA."
      ],
      "discriminator": [
        107,
        2,
        184,
        145,
        70,
        142,
        17,
        165
      ],
      "accounts": [
        {
          "name": "creator",
          "writable": true,
          "signer": true
        },
        {
          "name": "matchAccount",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  116,
                  99,
                  104
                ]
              },
              {
                "kind": "arg",
                "path": "code"
              }
            ]
          }
        },
        {
          "name": "moveA",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  111,
                  118,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "matchAccount"
              },
              {
                "kind": "account",
                "path": "creator"
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "code",
          "type": {
            "array": [
              "u8",
              6
            ]
          }
        }
      ]
    },
    {
      "name": "delegateMatch",
      "docs": [
        "Base layer. Delegates match + both move PDAs to the TEE validator."
      ],
      "discriminator": [
        30,
        116,
        9,
        69,
        147,
        61,
        133,
        238
      ],
      "accounts": [
        {
          "name": "payer",
          "writable": true,
          "signer": true
        },
        {
          "name": "bufferMatchAccount",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  98,
                  117,
                  102,
                  102,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "matchAccount"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                92,
                143,
                2,
                204,
                143,
                13,
                67,
                242,
                186,
                26,
                44,
                75,
                169,
                57,
                61,
                159,
                48,
                102,
                16,
                12,
                183,
                244,
                38,
                86,
                121,
                125,
                199,
                45,
                149,
                197,
                18,
                239
              ]
            }
          }
        },
        {
          "name": "delegationRecordMatchAccount",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  100,
                  101,
                  108,
                  101,
                  103,
                  97,
                  116,
                  105,
                  111,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "matchAccount"
              }
            ],
            "program": {
              "kind": "account",
              "path": "delegationProgram"
            }
          }
        },
        {
          "name": "delegationMetadataMatchAccount",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  100,
                  101,
                  108,
                  101,
                  103,
                  97,
                  116,
                  105,
                  111,
                  110,
                  45,
                  109,
                  101,
                  116,
                  97,
                  100,
                  97,
                  116,
                  97
                ]
              },
              {
                "kind": "account",
                "path": "matchAccount"
              }
            ],
            "program": {
              "kind": "account",
              "path": "delegationProgram"
            }
          }
        },
        {
          "name": "matchAccount",
          "writable": true
        },
        {
          "name": "bufferMoveA",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  98,
                  117,
                  102,
                  102,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "moveA"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                92,
                143,
                2,
                204,
                143,
                13,
                67,
                242,
                186,
                26,
                44,
                75,
                169,
                57,
                61,
                159,
                48,
                102,
                16,
                12,
                183,
                244,
                38,
                86,
                121,
                125,
                199,
                45,
                149,
                197,
                18,
                239
              ]
            }
          }
        },
        {
          "name": "delegationRecordMoveA",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  100,
                  101,
                  108,
                  101,
                  103,
                  97,
                  116,
                  105,
                  111,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "moveA"
              }
            ],
            "program": {
              "kind": "account",
              "path": "delegationProgram"
            }
          }
        },
        {
          "name": "delegationMetadataMoveA",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  100,
                  101,
                  108,
                  101,
                  103,
                  97,
                  116,
                  105,
                  111,
                  110,
                  45,
                  109,
                  101,
                  116,
                  97,
                  100,
                  97,
                  116,
                  97
                ]
              },
              {
                "kind": "account",
                "path": "moveA"
              }
            ],
            "program": {
              "kind": "account",
              "path": "delegationProgram"
            }
          }
        },
        {
          "name": "moveA",
          "writable": true
        },
        {
          "name": "bufferMoveB",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  98,
                  117,
                  102,
                  102,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "moveB"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                92,
                143,
                2,
                204,
                143,
                13,
                67,
                242,
                186,
                26,
                44,
                75,
                169,
                57,
                61,
                159,
                48,
                102,
                16,
                12,
                183,
                244,
                38,
                86,
                121,
                125,
                199,
                45,
                149,
                197,
                18,
                239
              ]
            }
          }
        },
        {
          "name": "delegationRecordMoveB",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  100,
                  101,
                  108,
                  101,
                  103,
                  97,
                  116,
                  105,
                  111,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "moveB"
              }
            ],
            "program": {
              "kind": "account",
              "path": "delegationProgram"
            }
          }
        },
        {
          "name": "delegationMetadataMoveB",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  100,
                  101,
                  108,
                  101,
                  103,
                  97,
                  116,
                  105,
                  111,
                  110,
                  45,
                  109,
                  101,
                  116,
                  97,
                  100,
                  97,
                  116,
                  97
                ]
              },
              {
                "kind": "account",
                "path": "moveB"
              }
            ],
            "program": {
              "kind": "account",
              "path": "delegationProgram"
            }
          }
        },
        {
          "name": "moveB",
          "writable": true
        },
        {
          "name": "validator",
          "address": "MTEWGuqxUpYZGFJQcp8tLN7x5v9BSeoFHYWQQ3n3xzo"
        },
        {
          "name": "ownerProgram",
          "address": "7EJzHvTvmxWZynJKpKWHGdfDd9wrNFx6RT63B5TrDbkz"
        },
        {
          "name": "delegationProgram",
          "address": "DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "initPermissions",
      "docs": [
        "Private ER. Public permission on the match, owner-only permission on each move."
      ],
      "discriminator": [
        247,
        240,
        133,
        29,
        26,
        176,
        185,
        61
      ],
      "accounts": [
        {
          "name": "payer",
          "writable": true,
          "signer": true
        },
        {
          "name": "matchAccount",
          "writable": true
        },
        {
          "name": "moveA",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  111,
                  118,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "matchAccount"
              },
              {
                "kind": "account",
                "path": "matchAccount.playerA",
                "account": "match"
              }
            ]
          }
        },
        {
          "name": "moveB",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  111,
                  118,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "matchAccount"
              },
              {
                "kind": "account",
                "path": "matchAccount.playerB",
                "account": "match"
              }
            ]
          }
        },
        {
          "name": "permissionMatch",
          "writable": true
        },
        {
          "name": "permissionA",
          "writable": true
        },
        {
          "name": "permissionB",
          "writable": true
        },
        {
          "name": "permissionProgram",
          "address": "ACLseoPoyC3cBqoUtkbjZ4aDrkurZW86v19pXz2XQnp1"
        },
        {
          "name": "ephemeralVault",
          "writable": true,
          "address": "MagicVau1t999999999999999999999999999999999"
        },
        {
          "name": "magicProgram",
          "address": "Magic11111111111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "joinMatch",
      "docs": [
        "UC02. Base layer. Second player joins; the board is initialized."
      ],
      "discriminator": [
        244,
        8,
        47,
        130,
        192,
        59,
        179,
        44
      ],
      "accounts": [
        {
          "name": "player",
          "writable": true,
          "signer": true
        },
        {
          "name": "matchAccount",
          "writable": true
        },
        {
          "name": "moveB",
          "docs": [
            "`init` also rejects a second join attempt by the same wallet."
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  111,
                  118,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "matchAccount"
              },
              {
                "kind": "account",
                "path": "player"
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "processUndelegation",
      "discriminator": [
        196,
        28,
        41,
        206,
        48,
        37,
        51,
        167
      ],
      "accounts": [
        {
          "name": "baseAccount",
          "writable": true
        },
        {
          "name": "buffer",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  117,
                  110,
                  100,
                  101,
                  108,
                  101,
                  103,
                  97,
                  116,
                  101,
                  45,
                  98,
                  117,
                  102,
                  102,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "baseAccount"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                181,
                183,
                0,
                225,
                242,
                87,
                58,
                192,
                204,
                6,
                34,
                1,
                52,
                74,
                207,
                151,
                184,
                53,
                6,
                235,
                140,
                229,
                25,
                152,
                204,
                98,
                126,
                24,
                147,
                128,
                167,
                62
              ]
            }
          }
        },
        {
          "name": "payer",
          "writable": true
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "accountSeeds",
          "type": {
            "vec": "bytes"
          }
        }
      ]
    },
    {
      "name": "resolveTurn",
      "docs": [
        "UC04. Private ER. Resolves the turn once both players committed."
      ],
      "discriminator": [
        97,
        96,
        32,
        80,
        136,
        41,
        228,
        44
      ],
      "accounts": [
        {
          "name": "payer",
          "signer": true
        },
        {
          "name": "matchAccount",
          "writable": true
        },
        {
          "name": "moveA",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  111,
                  118,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "matchAccount"
              },
              {
                "kind": "account",
                "path": "matchAccount.playerA",
                "account": "match"
              }
            ]
          }
        },
        {
          "name": "moveB",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  111,
                  118,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "matchAccount"
              },
              {
                "kind": "account",
                "path": "matchAccount.playerB",
                "account": "match"
              }
            ]
          }
        }
      ],
      "args": []
    },
    {
      "name": "settleMatch",
      "docs": [
        "Private ER. Commits + undelegates the finished match back to Solana."
      ],
      "discriminator": [
        71,
        124,
        117,
        96,
        191,
        217,
        116,
        24
      ],
      "accounts": [
        {
          "name": "payer",
          "writable": true,
          "signer": true
        },
        {
          "name": "matchAccount",
          "writable": true
        },
        {
          "name": "moveA",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  111,
                  118,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "matchAccount"
              },
              {
                "kind": "account",
                "path": "matchAccount.playerA",
                "account": "match"
              }
            ]
          }
        },
        {
          "name": "moveB",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  111,
                  118,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "matchAccount"
              },
              {
                "kind": "account",
                "path": "matchAccount.playerB",
                "account": "match"
              }
            ]
          }
        },
        {
          "name": "magicProgram",
          "address": "Magic11111111111111111111111111111111111111"
        },
        {
          "name": "magicContext",
          "writable": true,
          "address": "MagicContext1111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "submitSecretMove",
      "docs": [
        "UC03. Private ER. Commits the signer's hidden action for `turn`."
      ],
      "discriminator": [
        248,
        242,
        186,
        244,
        73,
        72,
        144,
        38
      ],
      "accounts": [
        {
          "name": "player",
          "signer": true
        },
        {
          "name": "playerMove",
          "docs": [
            "Seeds bind the move PDA to the signer: a player can only write their own move."
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  111,
                  118,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "playerMove.matchAccount",
                "account": "playerMove"
              },
              {
                "kind": "account",
                "path": "player"
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "turn",
          "type": "u32"
        },
        {
          "name": "action",
          "type": {
            "defined": {
              "name": "action"
            }
          }
        }
      ]
    }
  ],
  "accounts": [
    {
      "name": "match",
      "discriminator": [
        236,
        63,
        169,
        38,
        15,
        56,
        196,
        162
      ]
    },
    {
      "name": "playerMove",
      "discriminator": [
        213,
        41,
        205,
        203,
        240,
        72,
        80,
        150
      ]
    }
  ],
  "events": [
    {
      "name": "matchCreated",
      "discriminator": [
        151,
        176,
        11,
        24,
        34,
        225,
        227,
        16
      ]
    },
    {
      "name": "matchFinished",
      "discriminator": [
        64,
        23,
        27,
        37,
        145,
        154,
        100,
        255
      ]
    },
    {
      "name": "moveAnnounced",
      "discriminator": [
        18,
        14,
        72,
        43,
        121,
        250,
        6,
        225
      ]
    },
    {
      "name": "moveCommitted",
      "discriminator": [
        236,
        104,
        12,
        242,
        153,
        135,
        13,
        77
      ]
    },
    {
      "name": "playerJoined",
      "discriminator": [
        39,
        144,
        49,
        106,
        108,
        210,
        183,
        38
      ]
    },
    {
      "name": "turnOpened",
      "discriminator": [
        251,
        31,
        119,
        50,
        176,
        106,
        254,
        144
      ]
    },
    {
      "name": "turnResolved",
      "discriminator": [
        123,
        208,
        138,
        8,
        148,
        6,
        53,
        10
      ]
    }
  ],
  "errors": [
    {
      "code": 6000,
      "name": "notWaitingForPlayer",
      "msg": "Match is not waiting for a second player"
    },
    {
      "code": 6001,
      "name": "cannotJoinOwnMatch",
      "msg": "Creator cannot join their own match"
    },
    {
      "code": 6002,
      "name": "matchFull",
      "msg": "Match already has two players"
    },
    {
      "code": 6003,
      "name": "notReady",
      "msg": "Match is not in the Ready state"
    },
    {
      "code": 6004,
      "name": "turnNotOpen",
      "msg": "Match is not accepting moves"
    },
    {
      "code": 6005,
      "name": "notAPlayer",
      "msg": "Signer is not a player in this match"
    },
    {
      "code": 6006,
      "name": "staleTurn",
      "msg": "Turn number does not match the current turn"
    },
    {
      "code": 6007,
      "name": "alreadyCommitted",
      "msg": "Player already committed a move this turn"
    },
    {
      "code": 6008,
      "name": "missingCommit",
      "msg": "Both players must commit before the turn resolves"
    },
    {
      "code": 6009,
      "name": "invalidTerritory",
      "msg": "Territory index out of range"
    },
    {
      "code": 6010,
      "name": "notOwner",
      "msg": "Territory is not owned by this player"
    },
    {
      "code": 6011,
      "name": "notAdjacent",
      "msg": "Target does not border the attacking territory"
    },
    {
      "code": 6012,
      "name": "attackOwnTerritory",
      "msg": "Cannot attack your own territory"
    },
    {
      "code": 6013,
      "name": "insufficientStrength",
      "msg": "Attacking territory needs at least 2 strength"
    },
    {
      "code": 6014,
      "name": "matchNotFinished",
      "msg": "Match is not finished"
    },
    {
      "code": 6015,
      "name": "invalidAccount",
      "msg": "Account does not match the expected PDA"
    },
    {
      "code": 6016,
      "name": "commitSameSlot",
      "msg": "Turn must resolve in a later slot than the last commit"
    },
    {
      "code": 6017,
      "name": "invalidPermission",
      "msg": "Existing permission account does not match the required access rules"
    },
    {
      "code": 6018,
      "name": "turnNotTimedOut",
      "msg": "The turn timeout has not elapsed"
    },
    {
      "code": 6019,
      "name": "bothCommitted",
      "msg": "Both moves are committed; resolve the turn instead"
    },
    {
      "code": 6020,
      "name": "opponentCommitted",
      "msg": "Only the player who committed can claim the timeout"
    },
    {
      "code": 6021,
      "name": "movesNotCleared",
      "msg": "Unrevealed moves must be cleared before settlement"
    },
    {
      "code": 6022,
      "name": "invalidTroops",
      "msg": "Troops must be at least 1 and leave at least 1 behind"
    },
    {
      "code": 6023,
      "name": "invalidRoomCode",
      "msg": "Room code must be 6 characters from A-Z (no I or O) and 2-9"
    }
  ],
  "types": [
    {
      "name": "action",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "attack",
            "fields": [
              {
                "name": "from",
                "type": "u8"
              },
              {
                "name": "target",
                "type": "u8"
              },
              {
                "name": "troops",
                "type": "u8"
              }
            ]
          },
          {
            "name": "reinforce",
            "fields": [
              {
                "name": "from",
                "type": "u8"
              },
              {
                "name": "to",
                "type": "u8"
              },
              {
                "name": "troops",
                "type": "u8"
              }
            ]
          },
          {
            "name": "hold"
          }
        ]
      }
    },
    {
      "name": "board",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "owner",
            "docs": [
              "`OWNER_NONE`, `OWNER_A` or `OWNER_B` per territory."
            ],
            "type": {
              "array": [
                "u8",
                8
              ]
            }
          },
          {
            "name": "strength",
            "docs": [
              "Troops per territory."
            ],
            "type": {
              "array": [
                "u8",
                8
              ]
            }
          }
        ]
      }
    },
    {
      "name": "match",
      "docs": [
        "Public match state. Delegated to the Private ER with a *public* permission, so both",
        "players and observers can read it. It never holds an unrevealed move, and no",
        "transaction that carries an unrevealed move references it.",
        "",
        "Seeds: `[\"match\", code]`. The 6-character room code is the match's public name:",
        "anyone with the code can derive the address and join."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "creator",
            "type": "pubkey"
          },
          {
            "name": "code",
            "type": {
              "array": [
                "u8",
                6
              ]
            }
          },
          {
            "name": "playerA",
            "type": "pubkey"
          },
          {
            "name": "playerB",
            "type": {
              "option": "pubkey"
            }
          },
          {
            "name": "status",
            "type": {
              "defined": {
                "name": "matchStatus"
              }
            }
          },
          {
            "name": "turn",
            "docs": [
              "Current turn accepting moves (1-based once the match is TurnOpen)."
            ],
            "type": "u32"
          },
          {
            "name": "board",
            "type": {
              "defined": {
                "name": "board"
              }
            }
          },
          {
            "name": "turnStartedAt",
            "docs": [
              "When the current turn opened; drives `claim_timeout`."
            ],
            "type": "i64"
          },
          {
            "name": "aCommitted",
            "docs": [
              "Public \"has committed\" signals for the current turn, set by `announce_commit`",
              "in a transaction that carries no move data."
            ],
            "type": "bool"
          },
          {
            "name": "bCommitted",
            "type": "bool"
          },
          {
            "name": "lastTurn",
            "docs": [
              "Both actions of the most recently resolved turn — the public reveal."
            ],
            "type": {
              "option": {
                "defined": {
                  "name": "revealedTurn"
                }
              }
            }
          },
          {
            "name": "outcome",
            "type": {
              "option": {
                "defined": {
                  "name": "outcome"
                }
              }
            }
          },
          {
            "name": "createdAt",
            "type": "i64"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "matchCreated",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "matchAccount",
            "type": "pubkey"
          },
          {
            "name": "creator",
            "type": "pubkey"
          },
          {
            "name": "code",
            "type": {
              "array": [
                "u8",
                6
              ]
            }
          }
        ]
      }
    },
    {
      "name": "matchFinished",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "matchAccount",
            "type": "pubkey"
          },
          {
            "name": "outcome",
            "type": {
              "defined": {
                "name": "outcome"
              }
            }
          },
          {
            "name": "turnsPlayed",
            "type": "u32"
          }
        ]
      }
    },
    {
      "name": "matchStatus",
      "docs": [
        "`Resolving` from the design doc is not stored: resolution is a single atomic",
        "instruction, so the match moves straight from TurnOpen to TurnOpen/Finished."
      ],
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "waitingForPlayer"
          },
          {
            "name": "ready"
          },
          {
            "name": "turnOpen"
          },
          {
            "name": "finished"
          }
        ]
      }
    },
    {
      "name": "moveAnnounced",
      "docs": [
        "Public commit signal. Carries no action data."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "matchAccount",
            "type": "pubkey"
          },
          {
            "name": "player",
            "type": "pubkey"
          },
          {
            "name": "turn",
            "type": "u32"
          }
        ]
      }
    },
    {
      "name": "moveCommitted",
      "docs": [
        "Deliberately carries no action data. Emitted only in the submit transaction,",
        "which references nothing but the committing player's private move PDA."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "matchAccount",
            "type": "pubkey"
          },
          {
            "name": "player",
            "type": "pubkey"
          },
          {
            "name": "turn",
            "type": "u32"
          }
        ]
      }
    },
    {
      "name": "outcome",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "playerA"
          },
          {
            "name": "playerB"
          },
          {
            "name": "draw"
          }
        ]
      }
    },
    {
      "name": "playerJoined",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "matchAccount",
            "type": "pubkey"
          },
          {
            "name": "playerB",
            "type": "pubkey"
          }
        ]
      }
    },
    {
      "name": "playerMove",
      "docs": [
        "One player's hidden move. Lives on the Private ER under a permission whose only",
        "member is `player`, so the opponent cannot read it before the turn resolves.",
        "",
        "It also carries its own copy of the turn state (`open`, `turn`, `board`) so that",
        "`submit_secret_move` never has to touch the public match account: the transaction",
        "that carries the plaintext action references only the signer and this private PDA.",
        "`resolve_turn` copies the action into the public `Match::last_turn` and clears it here.",
        "",
        "Seeds: `[\"move\", match, player]`."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "matchAccount",
            "type": "pubkey"
          },
          {
            "name": "player",
            "type": "pubkey"
          },
          {
            "name": "isPlayerA",
            "type": "bool"
          },
          {
            "name": "open",
            "docs": [
              "Accepting a move for `turn`. Set by `init_permissions`, cleared when the match ends."
            ],
            "type": "bool"
          },
          {
            "name": "turn",
            "docs": [
              "Turn currently accepting moves."
            ],
            "type": "u32"
          },
          {
            "name": "board",
            "docs": [
              "Board at the start of `turn`, used to validate the action without the match account."
            ],
            "type": {
              "defined": {
                "name": "board"
              }
            }
          },
          {
            "name": "action",
            "type": {
              "option": {
                "defined": {
                  "name": "action"
                }
              }
            }
          },
          {
            "name": "committedSlot",
            "docs": [
              "Slot the action was committed in. Resolution must happen in a later slot."
            ],
            "type": "u64"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "revealedTurn",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "turn",
            "type": "u32"
          },
          {
            "name": "actionA",
            "type": {
              "defined": {
                "name": "action"
              }
            }
          },
          {
            "name": "actionB",
            "type": {
              "defined": {
                "name": "action"
              }
            }
          }
        ]
      }
    },
    {
      "name": "turnOpened",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "matchAccount",
            "type": "pubkey"
          },
          {
            "name": "turn",
            "type": "u32"
          }
        ]
      }
    },
    {
      "name": "turnResolved",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "matchAccount",
            "type": "pubkey"
          },
          {
            "name": "turn",
            "type": "u32"
          },
          {
            "name": "actionA",
            "type": {
              "defined": {
                "name": "action"
              }
            }
          },
          {
            "name": "actionB",
            "type": {
              "defined": {
                "name": "action"
              }
            }
          },
          {
            "name": "board",
            "type": {
              "defined": {
                "name": "board"
              }
            }
          }
        ]
      }
    }
  ],
  "constants": [
    {
      "name": "matchSeed",
      "type": "bytes",
      "value": "[109, 97, 116, 99, 104]"
    },
    {
      "name": "moveSeed",
      "type": "bytes",
      "value": "[109, 111, 118, 101]"
    }
  ]
};
