'use strict';

// Counter

// () -> (() -> int)
function makeCounter() {
    var x = 0;
    function f() {
        x = x + 1;
        return x;
    }
    return f;
}

// Ugen

// () -> int
var ugenCounter = makeCounter();

class Ugen {
    constructor(name, nc, rt, op, inputs) {
        this.ugenName = name; // str
        this.numChan = nc; // int
        this.ugenRate = rt; // str
        this.specialIndex = op; // maybe int
        this.ugenId = ugenCounter(); // int
        this.inputValues = inputs; // [number | port]
        this.mrg = [];
    }
}

function isUgen(obj) {
    return obj.constructor === Ugen;
}

class Port {
    constructor(ugen, index) {
        this.ugen = ugen; // ugen
        this.index = index; // int
    }
}

function isPort(obj) {
    return obj instanceof Port;
}

// input = port | number
function inputRate(i) {
    //console.log('inputRate', i);
    return isPort(i) ? i.ugen.ugenRate : (isNumber(i) ? Rate.ir : console.error('inputRate: ', i));
}

function deriveRate(rt, inputs) {
    //console.log('deriveRate', rt, inputs);
    return isNumber(rt) ? rt : arrayMaxItem(arrayAtIndices(inputs, rt).map(inputRate));
}

// If rt is a scalar it is the operating rate, if it is an array it is indices into the inputs telling how to derive the rate.
function makeUgen(name, nc, rt, op, inputs) {
    //console.log('makeUgen', name, nc, rt, op, inputs);
    if(arrayContainsArray(inputs)) {
        return arrayTranspose(arrayExtendToBeOfEqualSize(inputs)).map(item => makeUgen(name, nc, rt, op, item));
    } else {
        var u = new Ugen(name, nc, deriveRate(rt, inputs), op, inputs);
        switch(nc) {
            case 0: return (new Port(u, null));
            case 1: return (new Port(u, 0));
            default: return arrayFillWithIndex(nc, i => new Port(u, i));
        }
    }
}

Ugen.prototype.displayName = function() {
    switch(this.ugenName) {
    case 'UnaryOpUGen': return objectKeyFromValue(unaryOperators, this.specialIndex);
    case 'BinaryOpUGen': return objectKeyFromValue(binaryOperators, this.specialIndex);
    default: return this.ugenName;
    }
};

// Rate

var Rate = { ir: 0, kr: 1, ar: 2, dr: 3 };

function rateSelector(r) {
    return objectKeyFromValue(Rate, r);
}

// Mrg

// inputFirstUgen([SinOsc([440, 441], 0), SinOsc(442, 0)])
function inputFirstUgen(i) {
    if(Array.isArray(i)) {
        //console.log('inputFirstUgen: array', i)
        return i.find(inputFirstUgen).ugen || null;
    } else if(isPort(i)) {
        //console.log('inputFirstUgen: port', i)
        return i.ugen;
    } else {
        //console.log('inputFirstUgen: number?', i)
        return null;
    }
}

function mrg(lhs,rhs) {
    var u = inputFirstUgen(lhs);
    //console.log('mrg', lhs, rhs, u);
    if(u) {
        if(Array.isArray(rhs)) {
            rhs.forEach(item => u.mrg.push(item));
        } else {
            u.mrg.push(rhs);
        }
    } else {
        console.error("mrg?");
    }
    return lhs;
}

// Kr

function krMutateInPlace(i) {
    if(isPort(i)) {
        // console.log('kr: port', i);
        krMutateInPlace(i.ugen);
    } else if(isUgen(i)) {
        // console.log('kr: ugen', i);
        i.ugenRate = i.ugenRate === 2 ? 1 : i.ugenRate;
        i.inputValues.forEach(item => krMutateInPlace(item));
    } else if(Array.isArray(i)) {
        // console.log('kr: array', i);
        i.forEach(item => krMutateInPlace(item));
    } else {
        if(!isNumber(i)) {
            console.error('krMutateInPlace', i);
        }
    }
}

function kr(i) { krMutateInPlace(i); return i; }

// Operators

function UnaryOpWithConstantOptimiser(ix, a) {
    if(isNumber(a)) {
        switch(ix) {
        case 0: return 0 - a;
        case 5: return Math.abs(a);
        case 8: return Math.ceil(a);
        case 9: return Math.floor(a);
        case 12: return a * a;
        case 13: return a * a * a;
        case 14: return Math.sqrt(a);
        case 16: return 1 / a;
        case 28: return Math.sin(a);
        case 29: return Math.cos(a);
        case 30: return Math.tan(a);
        }
    }
    return makeUgen('UnaryOpUGen', 1, [0], ix, [a]);
}

// [1, [], [1], [1, 2], [1, null], SinOsc(440, 0), [SinOsc(440, 0)]].map(isArrayConstant)
function isArrayConstant(a) {
    return Array.isArray(a) && a.every(isNumber);
}

function UnaryOp(ix, a) {
    if(isArrayConstant(a)) {
        return a.map(item => UnaryOpWithConstantOptimiser(ix, item));
    } else {
        return UnaryOpWithConstantOptimiser(ix, a);
    }
}

function BinaryOpWithConstantOptimiser(ix, a, b) {
    if(isNumber(a) && isNumber(b)) {
        switch(ix) {
        case 0: return a + b;
        case 1: return a - b;
        case 2: return a * b;
        case 4: return a / b;
        }
    }
    return  makeUgen('BinaryOpUGen', 1, [0, 1], ix, [a, b]);
}

function BinaryOp(ix, a, b) {
    if(Array.isArray(a) || Array.isArray(b)) {
        var expanded = arrayTranspose(arrayExtendToBeOfEqualSize([unitArrayIfScalar(a), unitArrayIfScalar(b)]));
        // console.log('BinaryOp: array constant', expanded);
        return expanded.map(item => BinaryOpWithConstantOptimiser(ix, item[0], item[1]));
    } else {
        return BinaryOpWithConstantOptimiser(ix, a, b);
    }
}

// Texture

function OverlapTexture(graphFunc, sustainTime, transitionTime, overlap) {
        return sum(to(0, overlap - 1).map(function(i) {
            var trg = kr(Impulse(1 / (sustainTime + (transitionTime * 2)), i / overlap));
            var snd = graphFunc(trg);
            var env = Env([0, 1, 1, 0], [transitionTime,sustainTime,transitionTime], 'sin', null, null, 0);
            var sig = mul(snd, EnvGen(trg, 1, 0, 1, 0, env.coord()));
            //console.log('OverlapTexture', trg, snd, env, sig);
            return sig;
        }));
}

// Graph

// p : port | [port], c & w : {number | ugen} ; traverse graph from p adding leaf nodes to the set c ; w protects from loops in mrg
function ugenTraverseCollecting(p, c, w) {
    if(Array.isArray(p)) {
        //console.log('ugenTraverseCollecting: array', p);
        p.forEach(item => ugenTraverseCollecting(item, c, w));
    } else if(isPort(p)) {
        //console.log('ugenTraverseCollecting: port', p);
        if(!w.has(p.ugen)) {
            c.add(p.ugen);
            p.ugen.inputValues.forEach(item => isNumber(item) ? c.add(item)  : ugenTraverseCollecting(item, c, w));
            p.ugen.mrg.forEach(item => isNumber(item) ? c.add(item) : ugenTraverseCollecting(item, c, c));
        }
    } else {
        console.error('ugenTraverseCollecting', p, c, w);
    }
}

// all leaf nodes of p
function ugenGraphLeafNodes(p) {
    var c = new Set();
    ugenTraverseCollecting(p, c, new Set());
    return Array.from(c);
}

// ugens are sorted by id, which is in applicative order. a maxlocalbufs ugen is always present.
class Graph {
    constructor(name, graph) {
        var leafNodes = ugenGraphLeafNodes(graph);
        var ugens = leafNodes.filter(item => isUgen(item)).sort((i, j) => i.ugenId - j.ugenId);
        var constants = leafNodes.filter(item => isNumber(item));
        var numLocalBufs = ugens.filter(item => isUgen(item) && item.ugenName == 'LocalBuf').length;
        this.graphName = name;
        this.ugenSeq = [MaxLocalBufs(numLocalBufs).ugen].concat(ugens);
        this.constantSeq = arrayNub([numLocalBufs].concat(constants)).sort((i, j) => i - j);
    }
}

function isGraph(obj) {
    return obj.constructor === Graph;
}

Graph.prototype.constantIndex = function(k) {
    return this.constantSeq.indexOf(k);
};

// lookup ugen index at graph given ugenId
Graph.prototype.ugenIndex = function(k) {
    return this.ugenSeq.findIndex(u => u.ugenId === k);
};

// port|num -> [int, int]
Graph.prototype.inputSpec = function(i) {
    return isPort(i) ? [this.ugenIndex(i.ugen.ugenId), i.index] : [-1, this.constantIndex(i)];
};

Graph.prototype.printUgenSpec = function(u) {
    console.log(
        u.ugenName,
        u.ugenRate,
        u.inputValues.length,
        u.numChan,
        u.specialIndex,
        u.inputValues.map(i => this.inputSpec(i)),
        arrayReplicate(u.numChan, u.ugenRate)
    );
};

var SCgf = Number(1396926310);

Graph.prototype.printSyndef = function() {
    console.log(SCgf, 2, 1, this.graphName, this.constantSeq.length, this.constantSeq, 0, [], 0, [], this.ugenSeq.length);
    this.ugenSeq.forEach(item => this.printUgenSpec(item));
    console.log(0, []);
};

Graph.prototype.encodeUgenSpec = function(u) {
    return [
        encodePascalString(u.ugenName),
        encodeInt8(u.ugenRate),
        encodeInt32(u.inputValues.length),
        encodeInt32(u.numChan),
        encodeInt16(u.specialIndex),
        u.inputValues.map(i => this.inputSpec(i).map(ix => encodeInt32(ix))),
        arrayReplicate(u.numChan, encodeInt8(u.ugenRate))
    ];
};

Graph.prototype.encodeSyndef = function() {
    return flattenByteEncoding([
        encodeInt32(SCgf),
        encodeInt32(2), // file version
        encodeInt16(1), // # synth definitions
        encodePascalString(this.graphName), // pstring
        encodeInt32(this.constantSeq.length),
        this.constantSeq.map(item => encodeFloat32(item)),
        encodeInt32(0), // # param
        encodeInt32(0), // # param names
        encodeInt32(this.ugenSeq.length),
        this.ugenSeq.map(item => this.encodeUgenSpec(item)),
        encodeInt16(0) // # variants
    ]);
};

// Print

function printSyndefOf(u) {
    var g = new Graph('sc3.js', Out(0, u));
    g.printSyndef(g);
}

// Pretty print

Graph.prototype.inputDisplayName = function(i) {
    if(isPort(i)) {
        var id = String(this.ugenIndex(i.ugen.ugenId));
        var nm = i.ugen.displayName();
        var ix = i.ugen.numChan > 1 ? ('[' + String(i.index) + ']') : '';
        return id + '_' + nm + ix;
    } else if(isNumber(i)) {
        return String(i);
    } else {
        console.error('inputDisplayName', i);
    }
};

Graph.prototype.prettyPrintUgen = function(u) {
    console.log(
        this.ugenIndex(u.ugenId) + '_' + u.displayName(),
        rateSelector(u.ugenRate),
        '[' + String(u.inputValues.map(i => this.inputDisplayName(i))) + ']'
    );
};

Graph.prototype.prettyPrintSyndef = function() {
    this.ugenSeq.forEach(item => this.prettyPrintUgen(item));
};

function prettyPrintSyndefOf(u) {
    var g = new Graph('sc3.js', Out(0, u));
    g.prettyPrintSyndef(g);
}

