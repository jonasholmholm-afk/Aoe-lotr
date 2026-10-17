// Light sources per building: [u, v, zPx, kind, radiusPx]  (u,v in tiles from the footprint's top-left)
export const LIGHTS = {
  elves: {
    tc: [[2, 2.8, 14, 'warm', 34], [1.1, 1.3, 72, 'warm', 26], [3.0, 1.2, 80, 'warm', 26], [1.4, 2.9, 64, 'warm', 26], [2, 2, 110, 'warm', 60]],
    house: [[1, 1, 36, 'warm', 26]],
    barracks: [[1.5, 2.4, 10, 'warm', 30], [0.3, 0.3, 24, 'green', 22]],
    range: [[1.0, 1.7, 10, 'warm', 24]],
    stable: [[2.7, 2.7, 30, 'green', 24]],
    smith: [[1.3, 2.5, 8, 'cold', 34], [0.3, 2.5, 14, 'cold', 20]],
    tower: [[0.5, 0.5, 64, 'warm', 30]],
    siege: [[1.5, 1.5, 20, 'green', 44]],
    shrine: [[1.5, 1.5, 52, 'warm', 64], [1.5, 1.95, 22, 'green', 22]],
    mill: [[1, 1.6, 10, 'warm', 20]],
    mine: [[0.6, 0.6, 10, 'cold', 26], [1.5, 0.5, 10, 'cold', 20]],
    lumber: [], farm: [],
  },
  orcs: {
    tc: [[1.3, 3.3, 18, 'torch', 34], [2.7, 3.3, 18, 'torch', 34], [3.3, 1.5, 18, 'torch', 34], [2, 3.1, 8, 'ember', 22]],
    house: [[1.7, 1.7, 14, 'torch', 26], [1, 1, 6, 'ember', 16]],
    barracks: [[0.3, 2.7, 16, 'torch', 30]],
    range: [[0.3, 2.7, 14, 'torch', 26]],
    stable: [[2.8, 2.8, 14, 'torch', 26]],
    smith: [[1.3, 2.5, 8, 'ember', 44], [2.6, 2.7, 14, 'torch', 24]],
    tower: [[0.5, 0.5, 60, 'torch', 34], [0.5, 0.5, 62, 'torch', 30]],
    siege: [[1.2, 1.4, 14, 'torch', 30], [1.8, 1.4, 14, 'torch', 30], [1.5, 1.2, 10, 'ember', 18]],
    shrine: [[1.5, 1.5, 44, 'ember', 70], [0.4, 0.9, 12, 'torch', 22], [2.6, 0.9, 12, 'torch', 22], [1.5, 2.6, 12, 'torch', 22]],
    mill: [], mine: [[0.6, 1.1, 12, 'torch', 26]], lumber: [], farm: [],
  },
};
