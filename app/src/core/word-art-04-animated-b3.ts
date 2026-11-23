import type { ArtSceneSpec } from "./word-art.ts";

export const ANIMATED_04_B3: Record<string, ArtSceneSpec> = {
  "own": {
    "src": "partia-04-animated/own",
    "dur": 3600,
    "list": [
      300,
      220,
      400
    ],
    "motion": {
      "player": {
        "origin": [
          490,
          870
        ],
        "keys": [
          {
            "at": 0
          },
          {
            "at": 0.38,
            "r": -1.1,
            "y": -3
          },
          {
            "at": 0.65,
            "r": -0.4
          },
          {
            "at": 1
          }
        ]
      },
      "sparkle": {
        "origin": [
          630,
          325
        ],
        "follow": "player",
        "keys": [
          {
            "at": 0,
            "o": 0.5,
            "s": 0.8
          },
          {
            "at": 0.4,
            "o": 1,
            "s": 1.3
          },
          {
            "at": 0.7,
            "o": 0.7
          },
          {
            "at": 1,
            "o": 0.5,
            "s": 0.8
          }
        ]
      }
    }
  },
  "beloved": {
    "src": "partia-04-animated/beloved",
    "dur": 3600,
    "list": [
      260,
      130,
      520
    ],
    "motion": {
      "hug": {
        "origin": [
          535,
          730
        ],
        "keys": [
          {
            "at": 0
          },
          {
            "at": 0.45,
            "r": -0.6,
            "y": -3,
            "sy": 1.006
          },
          {
            "at": 1
          }
        ]
      },
      "sun": {
        "origin": [
          915,
          84
        ],
        "keys": [
          {
            "at": 0
          },
          {
            "at": 0.5,
            "s": 1.045,
            "o": 0.92
          },
          {
            "at": 1
          }
        ]
      }
    }
  },
  "disappointed": {
    "src": "partia-04-animated/disappointed",
    "dur": 3600,
    "list": [
      230,
      160,
      650
    ],
    "motion": {
      "fisherman": {
        "origin": [
          370,
          750
        ],
        "keys": [
          {
            "at": 0
          },
          {
            "at": 0.45,
            "y": -2
          },
          {
            "at": 1
          }
        ]
      },
      "boot": {
        "follow": "fisherman",
        "origin": [
          736,
          384
        ],
        "keys": [
          {
            "at": 0
          },
          {
            "at": 0.25,
            "r": 4
          },
          {
            "at": 0.7,
            "r": -3
          },
          {
            "at": 1
          }
        ]
      },
      "drops": {
        "follow": "fisherman",
        "keys": [
          {
            "at": 0,
            "o": 0.8
          },
          {
            "at": 0.6,
            "y": 25,
            "o": 0.1
          },
          {
            "at": 0.61,
            "y": -5,
            "o": 0
          },
          {
            "at": 1,
            "o": 0.8
          }
        ]
      }
    },
    "quality": 68
  },
  "devastated": {
    "src": "partia-04-animated/devastated",
    "dur": 3600,
    "list": [
      100,
      150,
      870
    ],
    "motion": {
      "man": {
        "origin": [
          250,
          760
        ],
        "keys": [
          {
            "at": 0
          },
          {
            "at": 0.42
          },
          {
            "at": 0.63,
            "r": -1.5,
            "y": -4
          },
          {
            "at": 1
          }
        ]
      },
      "tower": {
        "origin": [
          690,
          795
        ],
        "keys": [
          {
            "at": 0
          },
          {
            "at": 0.3,
            "r": -3
          },
          {
            "at": 0.62,
            "r": 5,
            "y": 4
          },
          {
            "at": 0.75,
            "r": 9,
            "y": 18,
            "sy": 0.85,
            "o": 0.15
          },
          {
            "at": 0.84,
            "r": 9,
            "y": 18,
            "sy": 0.85,
            "o": 0.15
          },
          {
            "at": 1
          }
        ]
      },
      "wave": {
        "origin": [
          1000,
          890
        ],
        "keys": [
          {
            "at": 0
          },
          {
            "at": 0.3,
            "x": 28,
            "y": 4
          },
          {
            "at": 0.62,
            "x": -24,
            "y": -9
          },
          {
            "at": 1
          }
        ]
      }
    }
  },
  "almost": {
    "src": "partia-04-animated/almost",
    "dur": 3600,
    "list": [
      240,
      220,
      650
    ],
    "motion": {
      "bus": {
        "keys": [
          {
            "at": 0
          },
          {
            "at": 0.52,
            "x": 40
          },
          {
            "at": 0.76,
            "x": 40
          },
          {
            "at": 1
          }
        ]
      },
      "runner": {
        "origin": [
          450,
          900
        ],
        "keys": [
          {
            "at": 0
          },
          {
            "at": 0.25,
            "x": 8,
            "y": -5,
            "r": 1
          },
          {
            "at": 0.52,
            "x": 14,
            "y": -2,
            "r": 1.5
          },
          {
            "at": 0.76,
            "x": 6,
            "y": -4
          },
          {
            "at": 1
          }
        ]
      }
    }
  },
  "whatever": {
    "src": "partia-04-animated/whatever",
    "dur": 3600,
    "list": [
      120,
      150,
      800
    ],
    "motion": {
      "chooser": {
        "origin": [
          878,
          865
        ],
        "keys": [
          {
            "at": 0
          },
          {
            "at": 0.25
          },
          {
            "at": 0.5,
            "r": -0.8,
            "y": 2
          },
          {
            "at": 0.7,
            "r": -0.3
          },
          {
            "at": 1
          }
        ]
      },
      "offer": {
        "origin": [
          210,
          850
        ],
        "keys": [
          {
            "at": 0
          },
          {
            "at": 0.25,
            "y": -4,
            "r": -0.3
          },
          {
            "at": 0.65,
            "y": -2
          },
          {
            "at": 1
          }
        ]
      }
    }
  }
};
