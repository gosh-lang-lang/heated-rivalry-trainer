import type { ArtSceneSpec } from "./word-art.ts";

export const ANIMATED_04_B2: Record<string, ArtSceneSpec> = {
  "consequences": {
    "src": "partia-04-animated/consequences",
    "dur": 3600,
    "quality": 65,
    "motion": {
      "splash": {
        "origin": [
          400,
          800
        ],
        "keys": [
          {
            "at": 0,
            "y": 12,
            "sy": 0.85,
            "o": 0.2
          },
          {
            "at": 0.28,
            "y": -8,
            "sy": 1.05,
            "o": 1
          },
          {
            "at": 0.65,
            "y": 10,
            "sy": 0.9,
            "o": 0.5
          },
          {
            "at": 1,
            "y": 12,
            "sy": 0.85,
            "o": 0.2
          }
        ]
      },
      "mud": {
        "keys": [
          {
            "at": 0,
            "o": 0.4
          },
          {
            "at": 0.38,
            "o": 1
          },
          {
            "at": 0.85,
            "o": 1
          },
          {
            "at": 1,
            "o": 0.4
          }
        ]
      }
    }
  },
  "bludgeon": {
    "src": "partia-04-animated/bludgeon",
    "dur": 3600,
    "quality": 65,
    "motion": {
      "mallet": {
        "origin": [
          580,
          590
        ],
        "keys": [
          {
            "at": 0,
            "r": -1
          },
          {
            "at": 0.35,
            "r": -3
          },
          {
            "at": 0.48,
            "r": 0.6
          },
          {
            "at": 0.65,
            "r": -0.5
          },
          {
            "at": 1,
            "r": -1
          }
        ]
      },
      "coconut": {
        "origin": [
          825,
          720
        ],
        "keys": [
          {
            "at": 0,
            "y": 0,
            "r": 0
          },
          {
            "at": 0.48,
            "y": 0,
            "r": 0
          },
          {
            "at": 0.57,
            "y": -12,
            "r": 4
          },
          {
            "at": 0.75,
            "y": 0,
            "r": 0
          },
          {
            "at": 1,
            "y": 0,
            "r": 0
          }
        ]
      }
    }
  },
  "smug": {
    "src": "partia-04-animated/smug",
    "dur": 3600,
    "quality": 65,
    "motion": {
      "eyes": {
        "origin": [
          480,
          371
        ],
        "keys": [
          {
            "at": 0,
            "sy": 1
          },
          {
            "at": 0.5,
            "sy": 0.6
          },
          {
            "at": 1,
            "sy": 1
          }
        ]
      },
      "smile": {
        "origin": [
          497,
          391
        ],
        "keys": [
          {
            "at": 0,
            "sx": 0.96,
            "sy": 0.95
          },
          {
            "at": 0.5,
            "sx": 1.1,
            "sy": 1.06
          },
          {
            "at": 1,
            "sx": 0.96,
            "sy": 0.95
          }
        ]
      }
    }
  },
  "satisfying": {
    "src": "partia-04-animated/satisfying",
    "dur": 3600,
    "quality": 65,
    "motion": {
      "bubble-left": {
        "origin": [
          431,
          543
        ],
        "keys": [
          {
            "at": 0,
            "s": 1,
            "o": 1
          },
          {
            "at": 0.22,
            "s": 1,
            "o": 1
          },
          {
            "at": 0.32,
            "sx": 1.08,
            "sy": 0.3,
            "o": 0.25
          },
          {
            "at": 0.4,
            "s": 0.1,
            "o": 0
          },
          {
            "at": 0.85,
            "s": 0.1,
            "o": 0
          },
          {
            "at": 1,
            "s": 1,
            "o": 1
          }
        ]
      },
      "bubble-right": {
        "origin": [
          499,
          543
        ],
        "keys": [
          {
            "at": 0,
            "s": 1,
            "o": 1
          },
          {
            "at": 0.5,
            "s": 1,
            "o": 1
          },
          {
            "at": 0.6,
            "sx": 1.08,
            "sy": 0.3,
            "o": 0.25
          },
          {
            "at": 0.68,
            "s": 0.1,
            "o": 0
          },
          {
            "at": 0.9,
            "s": 0.1,
            "o": 0
          },
          {
            "at": 1,
            "s": 1,
            "o": 1
          }
        ]
      }
    }
  },
  "glitch": {
    "src": "partia-04-animated/glitch",
    "dur": 3600,
    "quality": 65,
    "motion": {
      "blocks-a": {
        "keys": [
          {
            "at": 0,
            "x": -4,
            "y": 0,
            "o": 0.9
          },
          {
            "at": 0.3,
            "x": 5,
            "y": 1,
            "o": 1
          },
          {
            "at": 0.6,
            "x": -6,
            "y": -1,
            "o": 0.8
          },
          {
            "at": 1,
            "x": -4,
            "y": 0,
            "o": 0.9
          }
        ]
      },
      "blocks-b": {
        "keys": [
          {
            "at": 0,
            "x": 4,
            "y": 0,
            "o": 1
          },
          {
            "at": 0.3,
            "x": -5,
            "y": -1,
            "o": 0.8
          },
          {
            "at": 0.6,
            "x": 6,
            "y": 1,
            "o": 1
          },
          {
            "at": 1,
            "x": 4,
            "y": 0,
            "o": 1
          }
        ]
      }
    }
  },
  "always": {
    "src": "partia-04-animated/always",
    "dur": 4000,
    "quality": 65,
    "motion": {
      "morning": {
        "keys": [
          {
            "at": 0,
            "o": 1
          },
          {
            "at": 0.22,
            "o": 1
          },
          {
            "at": 0.33,
            "o": 0.3
          },
          {
            "at": 0.83,
            "o": 0.3
          },
          {
            "at": 1,
            "o": 1
          }
        ]
      },
      "evening": {
        "keys": [
          {
            "at": 0,
            "o": 0.3
          },
          {
            "at": 0.22,
            "o": 0.3
          },
          {
            "at": 0.33,
            "o": 1
          },
          {
            "at": 0.55,
            "o": 1
          },
          {
            "at": 0.66,
            "o": 0.3
          },
          {
            "at": 1,
            "o": 0.3
          }
        ]
      },
      "night": {
        "keys": [
          {
            "at": 0,
            "o": 0.3
          },
          {
            "at": 0.55,
            "o": 0.3
          },
          {
            "at": 0.66,
            "o": 1
          },
          {
            "at": 0.83,
            "o": 1
          },
          {
            "at": 1,
            "o": 0.3
          }
        ]
      }
    }
  },
  "specifically": {
    "src": "partia-04-animated/specifically",
    "dur": 3600,
    "quality": 65,
    "motion": {
      "pointing-arm": {
        "origin": [
          744,
          536
        ],
        "keys": [
          {
            "at": 0,
            "r": 0
          },
          {
            "at": 0.24,
            "r": 2.5
          },
          {
            "at": 0.5,
            "r": -2
          },
          {
            "at": 0.72,
            "r": -2
          },
          {
            "at": 1,
            "r": 0
          }
        ]
      },
      "selection": {
        "origin": [
          532,
          702
        ],
        "keys": [
          {
            "at": 0,
            "o": 0.12,
            "s": 0.98
          },
          {
            "at": 0.4,
            "o": 0.72,
            "s": 1.04
          },
          {
            "at": 0.65,
            "o": 0.72,
            "s": 1.04
          },
          {
            "at": 1,
            "o": 0.12,
            "s": 0.98
          }
        ]
      }
    }
  }
};
