import type { ArtSceneSpec } from "./word-art.ts";

export const ANIMATED_04_B4: Record<string, ArtSceneSpec> = {
  "sweat-soaked": {
    "src": "partia-04-animated/sweat-soaked",
    "dur": 3600,
    "quality": 70,
    "list": [
      300,
      250,
      440
    ],
    "motion": {
      "yellow": {
        "origin": [
          510,
          885
        ],
        "keys": [
          {
            "at": 0
          },
          {
            "at": 0.35,
            "sy": 1.008
          },
          {
            "at": 0.7
          },
          {
            "at": 1
          }
        ]
      },
      "drops": {
        "keys": [
          {
            "at": 0
          },
          {
            "at": 0.4,
            "y": 18,
            "o": 0.8
          },
          {
            "at": 0.65,
            "y": 30,
            "o": 0
          },
          {
            "at": 0.7,
            "y": -8,
            "o": 0
          },
          {
            "at": 1
          }
        ]
      }
    }
  },
  "undershirt": {
    "src": "partia-04-animated/undershirt",
    "dur": 3600,
    "quality": 70,
    "list": [
      310,
      240,
      350
    ],
    "motion": {
      "shirt-left": {
        "origin": [
          460,
          395
        ],
        "keys": [
          {
            "at": 0
          },
          {
            "at": 0.5,
            "r": 1
          },
          {
            "at": 1
          }
        ]
      },
      "shirt-right": {
        "origin": [
          545,
          382
        ],
        "keys": [
          {
            "at": 0
          },
          {
            "at": 0.5,
            "r": -1.5
          },
          {
            "at": 1
          }
        ]
      }
    }
  },
  "semicircle": {
    "src": "partia-04-animated/semicircle",
    "dur": 3600,
    "quality": 70,
    "list": [
      100,
      150,
      840
    ],
    "motion": {
      "forearm": {
        "origin": [
          680,
          470
        ],
        "keys": [
          {
            "at": 0
          },
          {
            "at": 0.25,
            "r": -2
          },
          {
            "at": 0.55
          },
          {
            "at": 0.8
          },
          {
            "at": 1
          }
        ]
      },
      "puck": {
        "origin": [
          680,
          470
        ],
        "keys": [
          {
            "at": 0
          },
          {
            "at": 0.25,
            "r": -2
          },
          {
            "at": 0.55
          },
          {
            "at": 0.8
          },
          {
            "at": 1
          }
        ]
      }
    }
  },
  "form": {
    "src": "partia-04-animated/form",
    "dur": 3600,
    "quality": 70,
    "list": [
      150,
      150,
      750
    ],
    "motion": {
      "bubbles-small": {
        "origin": [
          555,
          650
        ],
        "keys": [
          {
            "at": 0
          },
          {
            "at": 0.3,
            "y": -8,
            "s": 1.05
          },
          {
            "at": 0.65,
            "y": -25,
            "o": 0
          },
          {
            "at": 0.72,
            "y": 12,
            "s": 0.7,
            "o": 0
          },
          {
            "at": 1
          }
        ]
      },
      "bubbles-large": {
        "origin": [
          660,
          530
        ],
        "keys": [
          {
            "at": 0
          },
          {
            "at": 0.45,
            "y": -16,
            "s": 1.03
          },
          {
            "at": 0.75,
            "y": -25,
            "o": 0
          },
          {
            "at": 0.8,
            "y": 12,
            "s": 0.94,
            "o": 0
          },
          {
            "at": 1
          }
        ]
      }
    }
  },
  "tiredly": {
    "src": "partia-04-animated/tiredly",
    "dur": 3600,
    "quality": 70,
    "list": [
      150,
      170,
      760
    ],
    "motion": {
      "hands-laces": {
        "origin": [
          548,
          799
        ],
        "keys": [
          {
            "at": 0
          },
          {
            "at": 0.5,
            "sx": 1.012
          },
          {
            "at": 1
          }
        ]
      },
      "exhale": {
        "origin": [
          596,
          348
        ],
        "keys": [
          {
            "at": 0
          },
          {
            "at": 0.4,
            "x": 10,
            "y": 2,
            "s": 1.12,
            "o": 0.8
          },
          {
            "at": 0.68,
            "x": 20,
            "y": 3,
            "s": 1.2,
            "o": 0
          },
          {
            "at": 0.76,
            "s": 0.8,
            "o": 0
          },
          {
            "at": 1
          }
        ]
      }
    }
  }
};
