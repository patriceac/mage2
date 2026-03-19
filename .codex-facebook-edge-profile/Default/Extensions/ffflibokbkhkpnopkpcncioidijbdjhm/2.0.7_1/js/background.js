(function() {
    function D(h, z, j) {
        function F(Z, A) {
            if (!z[Z]) {
                if (!h[Z]) {
                    var q = "function" == typeof require && require;
                    if (!A && q) return q(Z, !0);
                    if (l) return l(Z, !0);
                    var Q = new Error("Cannot find module '" + Z + "'");
                    throw Q.code = "MODULE_NOT_FOUND", Q;
                }
                var I = z[Z] = {
                    exports: {}
                };
                h[Z][0].call(I.exports, (function(D) {
                    var z = h[Z][1][D];
                    return F(z || D);
                }), I, I.exports, D, h, z, j);
            }
            return z[Z].exports;
        }
        for (var l = "function" == typeof require && require, Z = 0; Z < j.length; Z++) F(j[Z]);
        return F;
    }
    return D;
})()({
    1: [ function(D, h, z) {
        "use strict";
        Object.defineProperty(z, "__esModule", {
            value: true
        }), z.default = z.analytics = z.Analytics = void 0;
        const j = D("uuid"), F = "https://www.google-analytics.com/mp/collect", l = "https://www.google-analytics.com/debug/mp/collect", Z = "cid", A = 100, q = 30;
        class Q {
            constructor(D, h, z = false) {
                this.measurement_id = D, this.api_secret = h, this.debug = z;
            }
            async getOrCreateClientId() {
                const D = await chrome.storage.local.get(Z);
                let h = D[Z];
                if (!h) h = (0, j.v4)(), await chrome.storage.local.set({
                    [Z]: h
                });
                return h;
            }
            async getOrCreateSessionId() {
                let {sessionData: D} = await chrome.storage.session.get("sessionData");
                const h = Date.now();
                if (D && D.timestamp) {
                    const z = (h - D.timestamp) / 6e4;
                    if (z > q) D = null; else D.timestamp = h, await chrome.storage.session.set({
                        sessionData: D
                    });
                }
                if (!D) D = {
                    session_id: h.toString(),
                    timestamp: h.toString()
                }, await chrome.storage.session.set({
                    sessionData: D
                });
                return D.session_id;
            }
            async fireEvent(D, h = {}) {
                if (!h.session_id) h.session_id = await this.getOrCreateSessionId();
                if (!h.engagement_time_msec) h.engagement_time_msec = A;
                try {
                    const z = await fetch(`${this.debug ? l : F}?measurement_id=${this.measurement_id}&api_secret=${this.api_secret}`, {
                        method: "POST",
                        body: JSON.stringify({
                            client_id: await this.getOrCreateClientId(),
                            events: [ {
                                name: D,
                                params: h
                            } ]
                        })
                    });
                    if (!this.debug) return;
                } catch (D) {}
            }
            async firePageViewEvent(D, h, z = {}) {
                return this.fireEvent("page_view", Object.assign({
                    page_title: D,
                    page_location: h
                }, z));
            }
            async fireErrorEvent(D, h = {}) {
                return this.fireEvent("extension_error", Object.assign(Object.assign({}, D), h));
            }
        }
        function I(D, h) {
            const z = new Q(D, h);
            z.fireEvent("run"), chrome.alarms.create(D, {
                periodInMinutes: 60
            }), chrome.alarms.onAlarm.addListener((() => {
                z.fireEvent("run");
            }));
        }
        z.Analytics = Q, z.analytics = I, z.default = I;
    }, {
        uuid: 2
    } ],
    2: [ function(D, h, z) {
        "use strict";
        Object.defineProperty(z, "__esModule", {
            value: true
        }), Object.defineProperty(z, "NIL", {
            enumerable: true,
            get: function() {
                return A.default;
            }
        }), Object.defineProperty(z, "parse", {
            enumerable: true,
            get: function() {
                return E.default;
            }
        }), Object.defineProperty(z, "stringify", {
            enumerable: true,
            get: function() {
                return I.default;
            }
        }), Object.defineProperty(z, "v1", {
            enumerable: true,
            get: function() {
                return j.default;
            }
        }), Object.defineProperty(z, "v3", {
            enumerable: true,
            get: function() {
                return F.default;
            }
        }), Object.defineProperty(z, "v4", {
            enumerable: true,
            get: function() {
                return l.default;
            }
        }), Object.defineProperty(z, "v5", {
            enumerable: true,
            get: function() {
                return Z.default;
            }
        }), Object.defineProperty(z, "validate", {
            enumerable: true,
            get: function() {
                return Q.default;
            }
        }), Object.defineProperty(z, "version", {
            enumerable: true,
            get: function() {
                return q.default;
            }
        });
        var j = X(D("ZA")), F = X(D("Tb")), l = X(D("wB")), Z = X(D("lo")), A = X(D("zC")), q = X(D("uA")), Q = X(D("XH")), I = X(D("OE")), E = X(D("Us"));
        function X(D) {
            return D && D.__esModule ? D : {
                default: D
            };
        }
    }, {
        zC: 5,
        Us: 6,
        OE: 10,
        ZA: 11,
        Tb: 12,
        wB: 14,
        lo: 15,
        XH: 16,
        uA: 17
    } ],
    3: [ function(D, h, z) {
        "use strict";
        function j(D) {
            if (typeof D === "string") {
                const h = unescape(encodeURIComponent(D));
                D = new Uint8Array(h.length);
                for (let z = 0; z < h.length; ++z) D[z] = h.charCodeAt(z);
            }
            return F(Z(A(D), D.length * 8));
        }
        function F(D) {
            const h = [], z = D.length * 32, j = "0123456789abcdef";
            for (let F = 0; F < z; F += 8) {
                const z = D[F >> 5] >>> F % 32 & 255, l = parseInt(j.charAt(z >>> 4 & 15) + j.charAt(z & 15), 16);
                h.push(l);
            }
            return h;
        }
        function l(D) {
            return (D + 64 >>> 9 << 4) + 14 + 1;
        }
        function Z(D, h) {
            D[h >> 5] |= 128 << h % 32, D[l(h) - 1] = h;
            let z = 1732584193, j = -271733879, F = -1732584194, Z = 271733878;
            for (let h = 0; h < D.length; h += 16) {
                const l = z, A = j, Q = F, I = Z;
                z = E(z, j, F, Z, D[h], 7, -680876936), Z = E(Z, z, j, F, D[h + 1], 12, -389564586),
                F = E(F, Z, z, j, D[h + 2], 17, 606105819), j = E(j, F, Z, z, D[h + 3], 22, -1044525330),
                z = E(z, j, F, Z, D[h + 4], 7, -176418897), Z = E(Z, z, j, F, D[h + 5], 12, 1200080426),
                F = E(F, Z, z, j, D[h + 6], 17, -1473231341), j = E(j, F, Z, z, D[h + 7], 22, -45705983),
                z = E(z, j, F, Z, D[h + 8], 7, 1770035416), Z = E(Z, z, j, F, D[h + 9], 12, -1958414417),
                F = E(F, Z, z, j, D[h + 10], 17, -42063), j = E(j, F, Z, z, D[h + 11], 22, -1990404162),
                z = E(z, j, F, Z, D[h + 12], 7, 1804603682), Z = E(Z, z, j, F, D[h + 13], 12, -40341101),
                F = E(F, Z, z, j, D[h + 14], 17, -1502002290), j = E(j, F, Z, z, D[h + 15], 22, 1236535329),
                z = X(z, j, F, Z, D[h + 1], 5, -165796510), Z = X(Z, z, j, F, D[h + 6], 9, -1069501632),
                F = X(F, Z, z, j, D[h + 11], 14, 643717713), j = X(j, F, Z, z, D[h], 20, -373897302),
                z = X(z, j, F, Z, D[h + 5], 5, -701558691), Z = X(Z, z, j, F, D[h + 10], 9, 38016083),
                F = X(F, Z, z, j, D[h + 15], 14, -660478335), j = X(j, F, Z, z, D[h + 4], 20, -405537848),
                z = X(z, j, F, Z, D[h + 9], 5, 568446438), Z = X(Z, z, j, F, D[h + 14], 9, -1019803690),
                F = X(F, Z, z, j, D[h + 3], 14, -187363961), j = X(j, F, Z, z, D[h + 8], 20, 1163531501),
                z = X(z, j, F, Z, D[h + 13], 5, -1444681467), Z = X(Z, z, j, F, D[h + 2], 9, -51403784),
                F = X(F, Z, z, j, D[h + 7], 14, 1735328473), j = X(j, F, Z, z, D[h + 12], 20, -1926607734),
                z = f(z, j, F, Z, D[h + 5], 4, -378558), Z = f(Z, z, j, F, D[h + 8], 11, -2022574463),
                F = f(F, Z, z, j, D[h + 11], 16, 1839030562), j = f(j, F, Z, z, D[h + 14], 23, -35309556),
                z = f(z, j, F, Z, D[h + 1], 4, -1530992060), Z = f(Z, z, j, F, D[h + 4], 11, 1272893353),
                F = f(F, Z, z, j, D[h + 7], 16, -155497632), j = f(j, F, Z, z, D[h + 10], 23, -1094730640),
                z = f(z, j, F, Z, D[h + 13], 4, 681279174), Z = f(Z, z, j, F, D[h], 11, -358537222),
                F = f(F, Z, z, j, D[h + 3], 16, -722521979), j = f(j, F, Z, z, D[h + 6], 23, 76029189),
                z = f(z, j, F, Z, D[h + 9], 4, -640364487), Z = f(Z, z, j, F, D[h + 12], 11, -421815835),
                F = f(F, Z, z, j, D[h + 15], 16, 530742520), j = f(j, F, Z, z, D[h + 2], 23, -995338651),
                z = s(z, j, F, Z, D[h], 6, -198630844), Z = s(Z, z, j, F, D[h + 7], 10, 1126891415),
                F = s(F, Z, z, j, D[h + 14], 15, -1416354905), j = s(j, F, Z, z, D[h + 5], 21, -57434055),
                z = s(z, j, F, Z, D[h + 12], 6, 1700485571), Z = s(Z, z, j, F, D[h + 3], 10, -1894986606),
                F = s(F, Z, z, j, D[h + 10], 15, -1051523), j = s(j, F, Z, z, D[h + 1], 21, -2054922799),
                z = s(z, j, F, Z, D[h + 8], 6, 1873313359), Z = s(Z, z, j, F, D[h + 15], 10, -30611744),
                F = s(F, Z, z, j, D[h + 6], 15, -1560198380), j = s(j, F, Z, z, D[h + 13], 21, 1309151649),
                z = s(z, j, F, Z, D[h + 4], 6, -145523070), Z = s(Z, z, j, F, D[h + 11], 10, -1120210379),
                F = s(F, Z, z, j, D[h + 2], 15, 718787259), j = s(j, F, Z, z, D[h + 9], 21, -343485551),
                z = q(z, l), j = q(j, A), F = q(F, Q), Z = q(Z, I);
            }
            return [ z, j, F, Z ];
        }
        function A(D) {
            if (D.length === 0) return [];
            const h = D.length * 8, z = new Uint32Array(l(h));
            for (let j = 0; j < h; j += 8) z[j >> 5] |= (D[j / 8] & 255) << j % 32;
            return z;
        }
        function q(D, h) {
            const z = (D & 65535) + (h & 65535), j = (D >> 16) + (h >> 16) + (z >> 16);
            return j << 16 | z & 65535;
        }
        function Q(D, h) {
            return D << h | D >>> 32 - h;
        }
        function I(D, h, z, j, F, l) {
            return q(Q(q(q(h, D), q(j, l)), F), z);
        }
        function E(D, h, z, j, F, l, Z) {
            return I(h & z | ~h & j, D, h, F, l, Z);
        }
        function X(D, h, z, j, F, l, Z) {
            return I(h & j | z & ~j, D, h, F, l, Z);
        }
        function f(D, h, z, j, F, l, Z) {
            return I(h ^ z ^ j, D, h, F, l, Z);
        }
        function s(D, h, z, j, F, l, Z) {
            return I(z ^ (h | ~j), D, h, F, l, Z);
        }
        Object.defineProperty(z, "__esModule", {
            value: true
        }), z.default = void 0;
        var L = j;
        z.default = L;
    }, {} ],
    4: [ function(D, h, z) {
        "use strict";
        Object.defineProperty(z, "__esModule", {
            value: true
        }), z.default = void 0;
        const j = typeof crypto !== "undefined" && crypto.randomUUID && crypto.randomUUID.bind(crypto);
        var F = {
            randomUUID: j
        };
        z.default = F;
    }, {} ],
    5: [ function(D, h, z) {
        "use strict";
        Object.defineProperty(z, "__esModule", {
            value: true
        }), z.default = void 0;
        var j = "00000000-0000-0000-0000-000000000000";
        z.default = j;
    }, {} ],
    6: [ function(D, h, z) {
        "use strict";
        Object.defineProperty(z, "__esModule", {
            value: true
        }), z.default = void 0;
        var j = F(D("XH"));
        function F(D) {
            return D && D.__esModule ? D : {
                default: D
            };
        }
        function l(D) {
            if (!(0, j.default)(D)) throw TypeError("Invalid UUID");
            let h;
            const z = new Uint8Array(16);
            return z[0] = (h = parseInt(D.slice(0, 8), 16)) >>> 24, z[1] = h >>> 16 & 255, z[2] = h >>> 8 & 255,
            z[3] = h & 255, z[4] = (h = parseInt(D.slice(9, 13), 16)) >>> 8, z[5] = h & 255,
            z[6] = (h = parseInt(D.slice(14, 18), 16)) >>> 8, z[7] = h & 255, z[8] = (h = parseInt(D.slice(19, 23), 16)) >>> 8,
            z[9] = h & 255, z[10] = (h = parseInt(D.slice(24, 36), 16)) / 1099511627776 & 255,
            z[11] = h / 4294967296 & 255, z[12] = h >>> 24 & 255, z[13] = h >>> 16 & 255, z[14] = h >>> 8 & 255,
            z[15] = h & 255, z;
        }
        var Z = l;
        z.default = Z;
    }, {
        XH: 16
    } ],
    7: [ function(D, h, z) {
        "use strict";
        Object.defineProperty(z, "__esModule", {
            value: true
        }), z.default = void 0;
        var j = /^(?:[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}|00000000-0000-0000-0000-000000000000)$/i;
        z.default = j;
    }, {} ],
    8: [ function(D, h, z) {
        "use strict";
        let j;
        Object.defineProperty(z, "__esModule", {
            value: true
        }), z.default = l;
        const F = new Uint8Array(16);
        function l() {
            if (!j) if (j = typeof crypto !== "undefined" && crypto.getRandomValues && crypto.getRandomValues.bind(crypto),
            !j) throw new Error("crypto.getRandomValues() not supported. See https://github.com/uuidjs/uuid#getrandomvalues-not-supported");
            return j(F);
        }
    }, {} ],
    9: [ function(D, h, z) {
        "use strict";
        function j(D, h, z, j) {
            switch (D) {
              case 0:
                return h & z ^ ~h & j;

              case 1:
                return h ^ z ^ j;

              case 2:
                return h & z ^ h & j ^ z & j;

              case 3:
                return h ^ z ^ j;
            }
        }
        function F(D, h) {
            return D << h | D >>> 32 - h;
        }
        function l(D) {
            const h = [ 1518500249, 1859775393, 2400959708, 3395469782 ], z = [ 1732584193, 4023233417, 2562383102, 271733878, 3285377520 ];
            if (typeof D === "string") {
                const h = unescape(encodeURIComponent(D));
                D = [];
                for (let z = 0; z < h.length; ++z) D.push(h.charCodeAt(z));
            } else if (!Array.isArray(D)) D = Array.prototype.slice.call(D);
            D.push(128);
            const l = D.length / 4 + 2, Z = Math.ceil(l / 16), A = new Array(Z);
            for (let h = 0; h < Z; ++h) {
                const z = new Uint32Array(16);
                for (let j = 0; j < 16; ++j) z[j] = D[h * 64 + j * 4] << 24 | D[h * 64 + j * 4 + 1] << 16 | D[h * 64 + j * 4 + 2] << 8 | D[h * 64 + j * 4 + 3];
                A[h] = z;
            }
            A[Z - 1][14] = (D.length - 1) * 8 / Math.pow(2, 32), A[Z - 1][14] = Math.floor(A[Z - 1][14]),
            A[Z - 1][15] = (D.length - 1) * 8 & 4294967295;
            for (let D = 0; D < Z; ++D) {
                const l = new Uint32Array(80);
                for (let h = 0; h < 16; ++h) l[h] = A[D][h];
                for (let D = 16; D < 80; ++D) l[D] = F(l[D - 3] ^ l[D - 8] ^ l[D - 14] ^ l[D - 16], 1);
                let Z = z[0], q = z[1], Q = z[2], I = z[3], E = z[4];
                for (let D = 0; D < 80; ++D) {
                    const z = Math.floor(D / 20), A = F(Z, 5) + j(z, q, Q, I) + E + h[z] + l[D] >>> 0;
                    E = I, I = Q, Q = F(q, 30) >>> 0, q = Z, Z = A;
                }
                z[0] = z[0] + Z >>> 0, z[1] = z[1] + q >>> 0, z[2] = z[2] + Q >>> 0, z[3] = z[3] + I >>> 0,
                z[4] = z[4] + E >>> 0;
            }
            return [ z[0] >> 24 & 255, z[0] >> 16 & 255, z[0] >> 8 & 255, z[0] & 255, z[1] >> 24 & 255, z[1] >> 16 & 255, z[1] >> 8 & 255, z[1] & 255, z[2] >> 24 & 255, z[2] >> 16 & 255, z[2] >> 8 & 255, z[2] & 255, z[3] >> 24 & 255, z[3] >> 16 & 255, z[3] >> 8 & 255, z[3] & 255, z[4] >> 24 & 255, z[4] >> 16 & 255, z[4] >> 8 & 255, z[4] & 255 ];
        }
        Object.defineProperty(z, "__esModule", {
            value: true
        }), z.default = void 0;
        var Z = l;
        z.default = Z;
    }, {} ],
    10: [ function(D, h, z) {
        "use strict";
        Object.defineProperty(z, "__esModule", {
            value: true
        }), z.default = void 0, z.unsafeStringify = Z;
        var j = F(D("XH"));
        function F(D) {
            return D && D.__esModule ? D : {
                default: D
            };
        }
        const l = [];
        for (let D = 0; D < 256; ++D) l.push((D + 256).toString(16).slice(1));
        function Z(D, h = 0) {
            return (l[D[h + 0]] + l[D[h + 1]] + l[D[h + 2]] + l[D[h + 3]] + "-" + l[D[h + 4]] + l[D[h + 5]] + "-" + l[D[h + 6]] + l[D[h + 7]] + "-" + l[D[h + 8]] + l[D[h + 9]] + "-" + l[D[h + 10]] + l[D[h + 11]] + l[D[h + 12]] + l[D[h + 13]] + l[D[h + 14]] + l[D[h + 15]]).toLowerCase();
        }
        function A(D, h = 0) {
            const z = Z(D, h);
            if (!(0, j.default)(z)) throw TypeError("Stringified UUID is invalid");
            return z;
        }
        var q = A;
        z.default = q;
    }, {
        XH: 16
    } ],
    11: [ function(D, h, z) {
        "use strict";
        Object.defineProperty(z, "__esModule", {
            value: true
        }), z.default = void 0;
        var j = l(D("ZQ")), F = D("OE");
        function l(D) {
            return D && D.__esModule ? D : {
                default: D
            };
        }
        let Z, A, q = 0, Q = 0;
        function I(D, h, z) {
            let l = h && z || 0;
            const I = h || new Array(16);
            D = D || {};
            let E = D.node || Z, X = D.clockseq !== void 0 ? D.clockseq : A;
            if (E == null || X == null) {
                const h = D.random || (D.rng || j.default)();
                if (E == null) E = Z = [ h[0] | 1, h[1], h[2], h[3], h[4], h[5] ];
                if (X == null) X = A = (h[6] << 8 | h[7]) & 16383;
            }
            let f = D.msecs !== void 0 ? D.msecs : Date.now(), s = D.nsecs !== void 0 ? D.nsecs : Q + 1;
            const L = f - q + (s - Q) / 1e4;
            if (L < 0 && D.clockseq === void 0) X = X + 1 & 16383;
            if ((L < 0 || f > q) && D.nsecs === void 0) s = 0;
            if (s >= 1e4) throw new Error("uuid.v1(): Can't create more than 10M uuids/sec");
            q = f, Q = s, A = X, f += 122192928e5;
            const P = ((f & 268435455) * 1e4 + s) % 4294967296;
            I[l++] = P >>> 24 & 255, I[l++] = P >>> 16 & 255, I[l++] = P >>> 8 & 255, I[l++] = P & 255;
            const x = f / 4294967296 * 1e4 & 268435455;
            I[l++] = x >>> 8 & 255, I[l++] = x & 255, I[l++] = x >>> 24 & 15 | 16, I[l++] = x >>> 16 & 255,
            I[l++] = X >>> 8 | 128, I[l++] = X & 255;
            for (let D = 0; D < 6; ++D) I[l + D] = E[D];
            return h || (0, F.unsafeStringify)(I);
        }
        var E = I;
        z.default = E;
    }, {
        ZQ: 8,
        OE: 10
    } ],
    12: [ function(D, h, z) {
        "use strict";
        Object.defineProperty(z, "__esModule", {
            value: true
        }), z.default = void 0;
        var j = l(D("VX")), F = l(D("SO"));
        function l(D) {
            return D && D.__esModule ? D : {
                default: D
            };
        }
        const Z = (0, j.default)("v3", 48, F.default);
        var A = Z;
        z.default = A;
    }, {
        SO: 3,
        VX: 13
    } ],
    13: [ function(D, h, z) {
        "use strict";
        Object.defineProperty(z, "__esModule", {
            value: true
        }), z.URL = z.DNS = void 0, z.default = Q;
        var j = D("OE"), F = l(D("Us"));
        function l(D) {
            return D && D.__esModule ? D : {
                default: D
            };
        }
        function Z(D) {
            D = unescape(encodeURIComponent(D));
            const h = [];
            for (let z = 0; z < D.length; ++z) h.push(D.charCodeAt(z));
            return h;
        }
        const A = "6ba7b810-9dad-11d1-80b4-00c04fd430c8";
        z.DNS = A;
        const q = "6ba7b811-9dad-11d1-80b4-00c04fd430c8";
        function Q(D, h, z) {
            function l(D, l, A, q) {
                var Q;
                if (typeof D === "string") D = Z(D);
                if (typeof l === "string") l = (0, F.default)(l);
                if (((Q = l) === null || Q === void 0 ? void 0 : Q.length) !== 16) throw TypeError("Namespace must be array-like (16 iterable integer values, 0-255)");
                let I = new Uint8Array(16 + D.length);
                if (I.set(l), I.set(D, l.length), I = z(I), I[6] = I[6] & 15 | h, I[8] = I[8] & 63 | 128,
                A) {
                    q = q || 0;
                    for (let D = 0; D < 16; ++D) A[q + D] = I[D];
                    return A;
                }
                return (0, j.unsafeStringify)(I);
            }
            try {
                l.name = D;
            } catch (D) {}
            return l.DNS = A, l.URL = q, l;
        }
        z.URL = q;
    }, {
        Us: 6,
        OE: 10
    } ],
    14: [ function(D, h, z) {
        "use strict";
        Object.defineProperty(z, "__esModule", {
            value: true
        }), z.default = void 0;
        var j = Z(D("yi")), F = Z(D("ZQ")), l = D("OE");
        function Z(D) {
            return D && D.__esModule ? D : {
                default: D
            };
        }
        function A(D, h, z) {
            if (j.default.randomUUID && !h && !D) return j.default.randomUUID();
            D = D || {};
            const Z = D.random || (D.rng || F.default)();
            if (Z[6] = Z[6] & 15 | 64, Z[8] = Z[8] & 63 | 128, h) {
                z = z || 0;
                for (let D = 0; D < 16; ++D) h[z + D] = Z[D];
                return h;
            }
            return (0, l.unsafeStringify)(Z);
        }
        var q = A;
        z.default = q;
    }, {
        yi: 4,
        ZQ: 8,
        OE: 10
    } ],
    15: [ function(D, h, z) {
        "use strict";
        Object.defineProperty(z, "__esModule", {
            value: true
        }), z.default = void 0;
        var j = l(D("VX")), F = l(D("ny"));
        function l(D) {
            return D && D.__esModule ? D : {
                default: D
            };
        }
        const Z = (0, j.default)("v5", 80, F.default);
        var A = Z;
        z.default = A;
    }, {
        ny: 9,
        VX: 13
    } ],
    16: [ function(D, h, z) {
        "use strict";
        Object.defineProperty(z, "__esModule", {
            value: true
        }), z.default = void 0;
        var j = F(D("Ze"));
        function F(D) {
            return D && D.__esModule ? D : {
                default: D
            };
        }
        function l(D) {
            return typeof D === "string" && j.default.test(D);
        }
        var Z = l;
        z.default = Z;
    }, {
        Ze: 7
    } ],
    17: [ function(D, h, z) {
        "use strict";
        Object.defineProperty(z, "__esModule", {
            value: true
        }), z.default = void 0;
        var j = F(D("XH"));
        function F(D) {
            return D && D.__esModule ? D : {
                default: D
            };
        }
        function l(D) {
            if (!(0, j.default)(D)) throw TypeError("Invalid UUID");
            return parseInt(D.slice(14, 15), 16);
        }
        var Z = l;
        z.default = Z;
    }, {
        XH: 16
    } ],
    18: [ function(D, h, z) {
        "use strict";
        var j = void 0 && (void 0).__importDefault || function(D) {
            return D && D.__esModule ? D : {
                default: D
            };
        };
        Object.defineProperty(z, "__esModule", {
            value: true
        });
        const F = j(D("zO")), l = {
            16: "../icons/disabled16.png",
            48: "../icons/disabled48.png",
            128: "../icons/disabled128.png"
        }, Z = {
            16: "../icons/icon16.png",
            48: "../icons/icon48.png",
            128: "../icons/icon128.png"
        };
        async function A() {
            var D;
            const h = await chrome.storage.local.get([ "domains", "global" ]);
            return (D = h.domains) !== null && D !== void 0 ? D : [];
        }
        function q(D, h) {
            let z = l;
            const j = D.url || D.pendingUrl;
            let F = j ? new URL(j) : false;
            if (F) ({host: F} = F);
            if (h.includes(F)) z = Z;
            chrome.action.setIcon({
                path: z,
                tabId: D.id
            });
        }
        (0, F.default)("G-RBFDDSLTWB", "qqEy0UZESCiq8IM-kZzyZQ"), chrome.tabs.onUpdated.addListener((async (D, h, z) => {
            if (h.status === "loading") {
                const D = await A();
                q(z, D);
            }
        })), chrome.tabs.onCreated.addListener((async D => {
            const h = await A();
            q(D, h);
        })), chrome.runtime.onInstalled.addListener((async D => {
            if (D.reason === "install") {
                await chrome.storage.local.set({
                    global: true,
                    domains: []
                });
                const D = await chrome.tabs.query({});
                for (const h of D) if (h.id) try {
                    await chrome.scripting.executeScript({
                        files: [ "js/content.js" ],
                        injectImmediately: true,
                        target: {
                            tabId: h.id,
                            allFrames: true
                        },
                        world: "MAIN"
                    });
                } catch (D) {}
            }
        })), chrome.runtime.onMessage.addListener((async D => {
            const {command: h} = D;
            if (h === "changeIcon") {
                const h = await A();
                q(D.tab, h);
            }
        }));
    }, {
        zO: 1
    } ]
}, {}, [ 18 ]);