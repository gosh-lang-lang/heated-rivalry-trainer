import type { ArtSceneSpec } from "./word-art.ts";

/** Layered scenes; application integration is controlled by REVIEWED. */
export const ANIMATED_04_B1: Record<string, ArtSceneSpec> = {
  "defenseman": {
    "src": "partia-04-animated/defenseman",
    "dur": 3600,
    "quality": 70,
    "motion": {
      "yellow": {
        "origin": [
          260,
          660
        ],
        "keys": [
          {
            "at": 0
          },
          {
            "at": 0.5,
            "x": -14,
            "y": -6,
            "r": -1
          },
          {
            "at": 1
          }
        ]
      },
      "defender": {
        "origin": [
          750,
          890
        ],
        "keys": [
          {
            "at": 0
          },
          {
            "at": 0.5,
            "x": 6,
            "r": 1
          },
          {
            "at": 1
          }
        ]
      },
      "puck": {
        "keys": [
          {
            "at": 0
          },
          {
            "at": 0.5,
            "x": -26,
            "y": 8
          },
          {
            "at": 1
          }
        ]
      }
    }
  },
  "hurl": {
    "src": "partia-04-animated/hurl",
    "dur": 3600,
    "quality": 70,
    "motion": {
      "yellow": {
        "origin": [
          280,
          880
        ],
        "keys": [
          {
            "at": 0
          },
          {
            "at": 0.2,
            "r": 1.2,
            "x": 4
          },
          {
            "at": 0.5,
            "r": -0.6
          },
          {
            "at": 1
          }
        ]
      },
      "helmet": {
        "origin": [
          890,
          485
        ],
        "keys": [
          {
            "at": 0
          },
          {
            "at": 0.18,
            "x": -25,
            "y": 136,
            "r": 28,
            "ease": "ease-in"
          },
          {
            "at": 0.25,
            "x": -28,
            "y": 123,
            "r": 24
          },
          {
            "at": 0.32,
            "x": -30,
            "y": 136,
            "r": 28
          },
          {
            "at": 0.65,
            "x": -30,
            "y": 136,
            "r": 28,
            "o": 1
          },
          {
            "at": 0.78,
            "x": -30,
            "y": 136,
            "r": 28,
            "o": 0
          },
          {
            "at": 0.85,
            "o": 0
          },
          {
            "at": 1
          }
        ]
      }
    }
  },
  "stick": {
    "src": "partia-04-animated/stick",
    "dur": 3600,
    "quality": 70,
    "motion": {
      "arm": {
        "origin": [
          346,
          518
        ],
        "keys": [
          {
            "at": 0
          },
          {
            "at": 0.25,
            "r": -0.8
          },
          {
            "at": 0.5,
            "r": 0.8
          },
          {
            "at": 0.75,
            "r": -0.8
          },
          {
            "at": 1
          }
        ]
      },
      "tape": {
        "origin": [
          611,
          553
        ],
        "keys": [
          {
            "at": 0
          },
          {
            "at": 0.25,
            "r": 0.7,
            "sx": 1.015
          },
          {
            "at": 0.5,
            "r": -0.7,
            "sx": 0.99
          },
          {
            "at": 0.75,
            "r": 0.7,
            "sx": 1.015
          },
          {
            "at": 1
          }
        ]
      }
    }
  },
  "argue": {
    "src": "partia-04-animated/argue",
    "dur": 3600,
    "quality": 70,
    "motion": {
      "red": {
        "origin": [
          280,
          780
        ],
        "keys": [
          {
            "at": 0
          },
          {
            "at": 0.2,
            "x": 3,
            "r": 1
          },
          {
            "at": 0.4
          },
          {
            "at": 0.65,
            "x": 2,
            "r": 0.7
          },
          {
            "at": 1
          }
        ]
      },
      "yellow": {
        "origin": [
          740,
          780
        ],
        "keys": [
          {
            "at": 0
          },
          {
            "at": 0.2
          },
          {
            "at": 0.45,
            "x": -3,
            "r": -1
          },
          {
            "at": 0.72
          },
          {
            "at": 1
          }
        ]
      },
      "red-hand": {
        "origin": [
          280,
          780
        ],
        "keys": [
          {
            "at": 0
          },
          {
            "at": 0.2,
            "x": 3,
            "r": 1
          },
          {
            "at": 0.4
          },
          {
            "at": 0.65,
            "x": 2,
            "r": 0.7
          },
          {
            "at": 1
          }
        ]
      },
      "yellow-hand": {
        "origin": [
          740,
          780
        ],
        "keys": [
          {
            "at": 0
          },
          {
            "at": 0.2
          },
          {
            "at": 0.45,
            "x": -3,
            "r": -1
          },
          {
            "at": 0.72
          },
          {
            "at": 1
          }
        ]
      }
    }
  },
  "flatly": {
    "src": "partia-04-animated/flatly",
    "dur": 3600,
    "quality": 70,
    "motion": {
      "head": {
        "origin": [
          638,
          359
        ],
        "keys": [
          {
            "at": 0
          },
          {
            "at": 0.24,
            "r": -2
          },
          {
            "at": 0.48,
            "r": 2
          },
          {
            "at": 0.7,
            "r": -1.5
          },
          {
            "at": 1
          }
        ]
      },
      "splash": {
        "origin": [
          147,
          686
        ],
        "keys": [
          {
            "at": 0
          },
          {
            "at": 0.25,
            "y": -8,
            "o": 0.7
          },
          {
            "at": 0.5,
            "y": 0,
            "o": 1
          },
          {
            "at": 0.75,
            "y": -5,
            "o": 0.8
          },
          {
            "at": 1
          }
        ]
      }
    }
  },
  "quietly": {
    "src": "partia-04-animated/quietly",
    "dur": 3600,
    "quality": 70,
    "motion": {
      "door": {
        "origin": [
          404,
          520
        ],
        "keys": [
          {
            "at": 0
          },
          {
            "at": 0.6,
            "sx": 1.06
          },
          {
            "at": 0.8,
            "sx": 1.06
          },
          {
            "at": 1
          }
        ]
      },
      "red": {
        "keys": [
          {
            "at": 0
          },
          {
            "at": 0.6,
            "x": 4
          },
          {
            "at": 0.8,
            "x": 4
          },
          {
            "at": 1
          }
        ]
      }
    }
  },
  "also": {
    "src": "partia-04-animated/also",
    "dur": 3600,
    "quality": 70,
    "motion": {
      "red": {
        "origin": [
          500,
          755
        ],
        "keys": [
          {
            "at": 0
          },
          {
            "at": 0.25,
            "r": 0.45,
            "x": 1,
            "y": -2
          },
          {
            "at": 0.5
          },
          {
            "at": 0.75,
            "r": 0.45,
            "x": 1,
            "y": -2
          },
          {
            "at": 1
          }
        ]
      },
      "steam": {
        "origin": [
          205,
          690
        ],
        "keys": [
          {
            "at": 0,
            "o": 0.8,
            "y": 0
          },
          {
            "at": 0.42,
            "o": 0,
            "y": -22
          },
          {
            "at": 0.5,
            "o": 0,
            "y": 14
          },
          {
            "at": 0.8,
            "o": 0.8,
            "y": 0
          },
          {
            "at": 1,
            "o": 0.8,
            "y": 0
          }
        ]
      },
      "foam": {
        "origin": [
          680,
          855
        ],
        "keys": [
          {
            "at": 0
          },
          {
            "at": 0.25,
            "y": -3,
            "sy": 1.03
          },
          {
            "at": 0.5
          },
          {
            "at": 0.75,
            "y": -2,
            "sy": 1.02
          },
          {
            "at": 1
          }
        ]
      }
    }
  }
};
