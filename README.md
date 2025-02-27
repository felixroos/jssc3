# jssc3

## Running locally

After cloning:

### 1. Init submodules

```sh
git submodule update --init
```

### 2. Start server

```sh
python3 py/http-server-cgi-cross-origin.py & open http://localhost:8000
```

### 3. Use

1. set from ".stc" to ".js"
2. press Boot
3. select example and press play

## original README

[Js](https://developer.mozilla.org/en-US/docs/Web/JavaScript) bindings to the
[SuperCollider](http://audiosynth.com/) real-time synthesiser.

![](sw/jssc3/png/jssc3-rte.png)

Online editors:
[Plain Text](https://rohandrape.net/pub/jssc3/jssc3-wasm.html),
[Rich Text](https://rohandrape.net/pub/jssc3/jssc3-rte.html)

Requires:
[osc.js](https://github.com/colinbdclark/osc.js),
[scsynth-wasm-builds](https://gitlab.com/rd--/scsynth-wasm-builds),
[stsc3](http://rohandrape.net/?t=stsc3)

Tested with:

[Chromium](https://www.chromium.org/) 90.0.4430.212,
[Firefox](https://www.mozilla.org/firefox/) 91.5 & 97.0,
[Safari](https://apple.com/safari/) 15.3,
[SuperCollider](https://www.audiosynth.com/) 3.11.2

© [Rohan Drape](http://rohandrape.net/), 2021-2022, [Gpl](http://gnu.org/copyleft/)

---

[Html](https://jssc3.rohandrape.net)
[Video](https://rohandrape.net/?t=jssc3&e=md/video.md)
