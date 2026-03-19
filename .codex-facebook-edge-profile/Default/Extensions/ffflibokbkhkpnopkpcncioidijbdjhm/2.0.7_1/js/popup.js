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
        (function(D, z) {
            "use strict";
            if (typeof h === "object" && typeof h.exports === "object") h.exports = D.document ? z(D, true) : function(D) {
                if (!D.document) throw new Error("jQuery requires a window with a document");
                return z(D);
            }; else z(D);
        })(typeof window !== "undefined" ? window : void 0, (function(D, h) {
            "use strict";
            var z = [], j = Object.getPrototypeOf, F = z.slice, l = z.flat ? function(D) {
                return z.flat.call(D);
            } : function(D) {
                return z.concat.apply([], D);
            }, Z = z.push, A = z.indexOf, q = {}, Q = q.toString, I = q.hasOwnProperty, E = I.toString, X = E.call(Object), f = {}, s = function D(h) {
                return typeof h === "function" && typeof h.nodeType !== "number" && typeof h.item !== "function";
            }, L = function D(h) {
                return h != null && h === h.window;
            }, P = D.document, x = {
                type: true,
                src: true,
                nonce: true,
                noModule: true
            };
            function n(D, h, z) {
                z = z || P;
                var j, F, l = z.createElement("script");
                if (l.text = D, h) for (j in x) if (F = h[j] || h.getAttribute && h.getAttribute(j),
                F) l.setAttribute(j, F);
                z.head.appendChild(l).parentNode.removeChild(l);
            }
            function w(D) {
                if (D == null) return D + "";
                return typeof D === "object" || typeof D === "function" ? q[Q.call(D)] || "object" : typeof D;
            }
            var J = "3.7.0", a = /HTML$/i, d = function(D, h) {
                return new d.fn.init(D, h);
            };
            if (d.fn = d.prototype = {
                jquery: J,
                constructor: d,
                length: 0,
                toArray: function() {
                    return F.call(this);
                },
                get: function(D) {
                    if (D == null) return F.call(this);
                    return D < 0 ? this[D + this.length] : this[D];
                },
                pushStack: function(D) {
                    var h = d.merge(this.constructor(), D);
                    return h.prevObject = this, h;
                },
                each: function(D) {
                    return d.each(this, D);
                },
                map: function(D) {
                    return this.pushStack(d.map(this, (function(h, z) {
                        return D.call(h, z, h);
                    })));
                },
                slice: function() {
                    return this.pushStack(F.apply(this, arguments));
                },
                first: function() {
                    return this.eq(0);
                },
                last: function() {
                    return this.eq(-1);
                },
                even: function() {
                    return this.pushStack(d.grep(this, (function(D, h) {
                        return (h + 1) % 2;
                    })));
                },
                odd: function() {
                    return this.pushStack(d.grep(this, (function(D, h) {
                        return h % 2;
                    })));
                },
                eq: function(D) {
                    var h = this.length, z = +D + (D < 0 ? h : 0);
                    return this.pushStack(z >= 0 && z < h ? [ this[z] ] : []);
                },
                end: function() {
                    return this.prevObject || this.constructor();
                },
                push: Z,
                sort: z.sort,
                splice: z.splice
            }, d.extend = d.fn.extend = function() {
                var D, h, z, j, F, l, Z = arguments[0] || {}, A = 1, q = arguments.length, Q = false;
                if (typeof Z === "boolean") Q = Z, Z = arguments[A] || {}, A++;
                if (typeof Z !== "object" && !s(Z)) Z = {};
                if (A === q) Z = this, A--;
                for (;A < q; A++) if ((D = arguments[A]) != null) for (h in D) {
                    if (j = D[h], h === "__proto__" || Z === j) continue;
                    if (Q && j && (d.isPlainObject(j) || (F = Array.isArray(j)))) {
                        if (z = Z[h], F && !Array.isArray(z)) l = []; else if (!F && !d.isPlainObject(z)) l = {}; else l = z;
                        F = false, Z[h] = d.extend(Q, l, j);
                    } else if (j !== void 0) Z[h] = j;
                }
                return Z;
            }, d.extend({
                expando: "jQuery" + (J + Math.random()).replace(/\D/g, ""),
                isReady: true,
                error: function(D) {
                    throw new Error(D);
                },
                noop: function() {},
                isPlainObject: function(D) {
                    var h, z;
                    if (!D || Q.call(D) !== "[object Object]") return false;
                    if (h = j(D), !h) return true;
                    return z = I.call(h, "constructor") && h.constructor, typeof z === "function" && E.call(z) === X;
                },
                isEmptyObject: function(D) {
                    var h;
                    for (h in D) return false;
                    return true;
                },
                globalEval: function(D, h, z) {
                    n(D, {
                        nonce: h && h.nonce
                    }, z);
                },
                each: function(D, h) {
                    var z, j = 0;
                    if (H(D)) {
                        for (z = D.length; j < z; j++) if (h.call(D[j], j, D[j]) === false) break;
                    } else for (j in D) if (h.call(D[j], j, D[j]) === false) break;
                    return D;
                },
                text: function(D) {
                    var h, z = "", j = 0, F = D.nodeType;
                    if (!F) while (h = D[j++]) z += d.text(h); else if (F === 1 || F === 9 || F === 11) return D.textContent; else if (F === 3 || F === 4) return D.nodeValue;
                    return z;
                },
                makeArray: function(D, h) {
                    var z = h || [];
                    if (D != null) if (H(Object(D))) d.merge(z, typeof D === "string" ? [ D ] : D); else Z.call(z, D);
                    return z;
                },
                inArray: function(D, h, z) {
                    return h == null ? -1 : A.call(h, D, z);
                },
                isXMLDoc: function(D) {
                    var h = D && D.namespaceURI, z = D && (D.ownerDocument || D).documentElement;
                    return !a.test(h || z && z.nodeName || "HTML");
                },
                merge: function(D, h) {
                    for (var z = +h.length, j = 0, F = D.length; j < z; j++) D[F++] = h[j];
                    return D.length = F, D;
                },
                grep: function(D, h, z) {
                    for (var j, F = [], l = 0, Z = D.length, A = !z; l < Z; l++) if (j = !h(D[l], l),
                    j !== A) F.push(D[l]);
                    return F;
                },
                map: function(D, h, z) {
                    var j, F, Z = 0, A = [];
                    if (H(D)) {
                        for (j = D.length; Z < j; Z++) if (F = h(D[Z], Z, z), F != null) A.push(F);
                    } else for (Z in D) if (F = h(D[Z], Z, z), F != null) A.push(F);
                    return l(A);
                },
                guid: 1,
                support: f
            }), typeof Symbol === "function") d.fn[Symbol.iterator] = z[Symbol.iterator];
            function H(D) {
                var h = !!D && "length" in D && D.length, z = w(D);
                if (s(D) || L(D)) return false;
                return z === "array" || h === 0 || typeof h === "number" && h > 0 && h - 1 in D;
            }
            function K(D, h) {
                return D.nodeName && D.nodeName.toLowerCase() === h.toLowerCase();
            }
            d.each("Boolean Number String Function Array Date RegExp Object Error Symbol".split(" "), (function(D, h) {
                q["[object " + h + "]"] = h.toLowerCase();
            }));
            var c = z.pop, M = z.sort, S = z.splice, T = "[\\x20\\t\\r\\n\\f]", e = new RegExp("^" + T + "+|((?:^|[^\\\\])(?:\\\\.)*)" + T + "+$", "g");
            d.contains = function(D, h) {
                var z = h && h.parentNode;
                return D === z || !!(z && z.nodeType === 1 && (D.contains ? D.contains(z) : D.compareDocumentPosition && D.compareDocumentPosition(z) & 16));
            };
            var v = /([\0-\x1f\x7f]|^-?\d)|^-$|[^\x80-\uFFFF\w-]/g;
            function m(D, h) {
                if (h) {
                    if (D === "\0") return "�";
                    return D.slice(0, -1) + "\\" + D.charCodeAt(D.length - 1).toString(16) + " ";
                }
                return "\\" + D;
            }
            d.escapeSelector = function(D) {
                return (D + "").replace(v, m);
            };
            var G = P, r = Z;
            (function() {
                var h, j, l, Z, q, Q = r, E, X, s, L, P, x = d.expando, n = 0, w = 0, J = xk(), a = xk(), H = xk(), v = xk(), m = function(D, h) {
                    if (D === h) q = true;
                    return 0;
                }, t = "checked|selected|async|autofocus|autoplay|controls|defer|disabled|hidden|ismap|" + "loop|multiple|open|readonly|required|scoped", C = "(?:\\\\[\\da-fA-F]{1,6}" + T + "?|\\\\[^\\r\\n\\f]|[\\w-]|[^\0-\\x7f])+", y = "\\[" + T + "*(" + C + ")(?:" + T + "*([*^$|!~]?=)" + T + "*(?:'((?:\\\\.|[^\\\\'])*)'|\"((?:\\\\.|[^\\\\\"])*)\"|(" + C + "))|)" + T + "*\\]", k = ":(" + C + ")(?:\\((" + "('((?:\\\\.|[^\\\\'])*)'|\"((?:\\\\.|[^\\\\\"])*)\")|" + "((?:\\\\.|[^\\\\()[\\]]|" + y + ")*)|" + ".*" + ")\\)|)", W = new RegExp(T + "+", "g"), U = new RegExp("^" + T + "*," + T + "*"), p = new RegExp("^" + T + "*([>+~]|" + T + ")" + T + "*"), u = new RegExp(T + "|>"), O = new RegExp(k), o = new RegExp("^" + C + "$"), b = {
                    ID: new RegExp("^#(" + C + ")"),
                    CLASS: new RegExp("^\\.(" + C + ")"),
                    TAG: new RegExp("^(" + C + "|[*])"),
                    ATTR: new RegExp("^" + y),
                    PSEUDO: new RegExp("^" + k),
                    CHILD: new RegExp("^:(only|first|last|nth|nth-last)-(child|of-type)(?:\\(" + T + "*(even|odd|(([+-]|)(\\d*)n|)" + T + "*(?:([+-]|)" + T + "*(\\d+)|))" + T + "*\\)|)", "i"),
                    bool: new RegExp("^(?:" + t + ")$", "i"),
                    needsContext: new RegExp("^" + T + "*[>+~]|:(even|odd|eq|gt|lt|nth|first|last)(?:\\(" + T + "*((?:-\\d)?\\d*)" + T + "*\\)|)(?=[^-]|$)", "i")
                }, B = /^(?:input|select|textarea|button)$/i, Y = /^h\d$/i, R = /^(?:#([\w-]+)|(\w+)|\.([\w-]+))$/, V = /[+~]/, i = new RegExp("\\\\[\\da-fA-F]{1,6}" + T + "?|\\\\([^\\r\\n\\f])", "g"), g = function(D, h) {
                    var z = "0x" + D.slice(1) - 65536;
                    if (h) return h;
                    return z < 0 ? String.fromCharCode(z + 65536) : String.fromCharCode(z >> 10 | 55296, z & 1023 | 56320);
                }, N = function() {
                    Oq();
                }, kN = yi((function(D) {
                    return D.disabled === true && K(D, "fieldset");
                }), {
                    dir: "parentNode",
                    next: "legend"
                });
                function Ar() {
                    try {
                        return E.activeElement;
                    } catch (D) {}
                }
                try {
                    Q.apply(z = F.call(G.childNodes), G.childNodes), z[G.childNodes.length].nodeType;
                } catch (D) {
                    Q = {
                        apply: function(D, h) {
                            r.apply(D, F.call(h));
                        },
                        call: function(D) {
                            r.apply(D, F.call(arguments, 1));
                        }
                    };
                }
                function qk(D, h, z, j) {
                    var F, l, Z, A, q, I, X, P = h && h.ownerDocument, n = h ? h.nodeType : 9;
                    if (z = z || [], typeof D !== "string" || !D || n !== 1 && n !== 9 && n !== 11) return z;
                    if (!j) if (Oq(h), h = h || E, s) {
                        if (n !== 11 && (q = R.exec(D))) if (F = q[1]) {
                            if (n === 9) if (Z = h.getElementById(F)) {
                                if (Z.id === F) return Q.call(z, Z), z;
                            } else return z; else if (P && (Z = P.getElementById(F)) && qk.contains(h, Z) && Z.id === F) return Q.call(z, Z),
                            z;
                        } else if (q[2]) return Q.apply(z, h.getElementsByTagName(D)), z; else if ((F = q[3]) && h.getElementsByClassName) return Q.apply(z, h.getElementsByClassName(F)),
                        z;
                        if (!v[D + " "] && (!L || !L.test(D))) {
                            if (X = D, P = h, n === 1 && (u.test(D) || p.test(D))) {
                                if (P = V.test(D) && Cv(h.parentNode) || h, P != h || !f.scope) if (A = h.getAttribute("id")) A = d.escapeSelector(A); else h.setAttribute("id", A = x);
                                I = KU(D), l = I.length;
                                while (l--) I[l] = (A ? "#" + A : ":scope") + " " + BW(I[l]);
                                X = I.join(",");
                            }
                            try {
                                return Q.apply(z, P.querySelectorAll(X)), z;
                            } catch (h) {
                                v(D, true);
                            } finally {
                                if (A === x) h.removeAttribute("id");
                            }
                        }
                    }
                    return Jo(D.replace(e, "$1"), h, z, j);
                }
                function xk() {
                    var D = [];
                    function h(z, F) {
                        if (D.push(z + " ") > j.cacheLength) delete h[D.shift()];
                        return h[z + " "] = F;
                    }
                    return h;
                }
                function LD(D) {
                    return D[x] = true, D;
                }
                function hO(D) {
                    var h = E.createElement("fieldset");
                    try {
                        return !!D(h);
                    } catch (D) {
                        return false;
                    } finally {
                        if (h.parentNode) h.parentNode.removeChild(h);
                        h = null;
                    }
                }
                function VB(D) {
                    return function(h) {
                        return K(h, "input") && h.type === D;
                    };
                }
                function zi(D) {
                    return function(h) {
                        return (K(h, "input") || K(h, "button")) && h.type === D;
                    };
                }
                function dj(D) {
                    return function(h) {
                        if ("form" in h) {
                            if (h.parentNode && h.disabled === false) {
                                if ("label" in h) if ("label" in h.parentNode) return h.parentNode.disabled === D; else return h.disabled === D;
                                return h.isDisabled === D || h.isDisabled !== !D && kN(h) === D;
                            }
                            return h.disabled === D;
                        } else if ("label" in h) return h.disabled === D;
                        return false;
                    };
                }
                function Su(D) {
                    return LD((function(h) {
                        return h = +h, LD((function(z, j) {
                            var F, l = D([], z.length, h), Z = l.length;
                            while (Z--) if (z[F = l[Z]]) z[F] = !(j[F] = z[F]);
                        }));
                    }));
                }
                function Cv(D) {
                    return D && typeof D.getElementsByTagName !== "undefined" && D;
                }
                function Oq(D) {
                    var h, z = D ? D.ownerDocument || D : G;
                    if (z == E || z.nodeType !== 9 || !z.documentElement) return E;
                    if (E = z, X = E.documentElement, s = !d.isXMLDoc(E), P = X.matches || X.webkitMatchesSelector || X.msMatchesSelector,
                    G != E && (h = E.defaultView) && h.top !== h) h.addEventListener("unload", N);
                    if (f.getById = hO((function(D) {
                        return X.appendChild(D).id = d.expando, !E.getElementsByName || !E.getElementsByName(d.expando).length;
                    })), f.disconnectedMatch = hO((function(D) {
                        return P.call(D, "*");
                    })), f.scope = hO((function() {
                        return E.querySelectorAll(":scope");
                    })), f.cssHas = hO((function() {
                        try {
                            return E.querySelector(":has(*,:jqfake)"), false;
                        } catch (D) {
                            return true;
                        }
                    })), f.getById) j.filter.ID = function(D) {
                        var h = D.replace(i, g);
                        return function(D) {
                            return D.getAttribute("id") === h;
                        };
                    }, j.find.ID = function(D, h) {
                        if (typeof h.getElementById !== "undefined" && s) {
                            var z = h.getElementById(D);
                            return z ? [ z ] : [];
                        }
                    }; else j.filter.ID = function(D) {
                        var h = D.replace(i, g);
                        return function(D) {
                            var z = typeof D.getAttributeNode !== "undefined" && D.getAttributeNode("id");
                            return z && z.value === h;
                        };
                    }, j.find.ID = function(D, h) {
                        if (typeof h.getElementById !== "undefined" && s) {
                            var z, j, F, l = h.getElementById(D);
                            if (l) {
                                if (z = l.getAttributeNode("id"), z && z.value === D) return [ l ];
                                F = h.getElementsByName(D), j = 0;
                                while (l = F[j++]) if (z = l.getAttributeNode("id"), z && z.value === D) return [ l ];
                            }
                            return [];
                        }
                    };
                    if (j.find.TAG = function(D, h) {
                        if (typeof h.getElementsByTagName !== "undefined") return h.getElementsByTagName(D); else return h.querySelectorAll(D);
                    }, j.find.CLASS = function(D, h) {
                        if (typeof h.getElementsByClassName !== "undefined" && s) return h.getElementsByClassName(D);
                    }, L = [], hO((function(D) {
                        var h;
                        if (X.appendChild(D).innerHTML = "<a id='" + x + "' href='' disabled='disabled'></a>" + "<select id='" + x + "-\r\\' disabled='disabled'>" + "<option selected=''></option></select>",
                        !D.querySelectorAll("[selected]").length) L.push("\\[" + T + "*(?:value|" + t + ")");
                        if (!D.querySelectorAll("[id~=" + x + "-]").length) L.push("~=");
                        if (!D.querySelectorAll("a#" + x + "+*").length) L.push(".#.+[+~]");
                        if (!D.querySelectorAll(":checked").length) L.push(":checked");
                        if (h = E.createElement("input"), h.setAttribute("type", "hidden"), D.appendChild(h).setAttribute("name", "D"),
                        X.appendChild(D).disabled = true, D.querySelectorAll(":disabled").length !== 2) L.push(":enabled", ":disabled");
                        if (h = E.createElement("input"), h.setAttribute("name", ""), D.appendChild(h),
                        !D.querySelectorAll("[name='']").length) L.push("\\[" + T + "*name" + T + "*=" + T + "*(?:''|\"\")");
                    })), !f.cssHas) L.push(":has");
                    return L = L.length && new RegExp(L.join("|")), m = function(D, h) {
                        if (D === h) return q = true, 0;
                        var z = !D.compareDocumentPosition - !h.compareDocumentPosition;
                        if (z) return z;
                        if (z = (D.ownerDocument || D) == (h.ownerDocument || h) ? D.compareDocumentPosition(h) : 1,
                        z & 1 || !f.sortDetached && h.compareDocumentPosition(D) === z) {
                            if (D === E || D.ownerDocument == G && qk.contains(G, D)) return -1;
                            if (h === E || h.ownerDocument == G && qk.contains(G, h)) return 1;
                            return Z ? A.call(Z, D) - A.call(Z, h) : 0;
                        }
                        return z & 4 ? -1 : 1;
                    }, E;
                }
                for (h in qk.matches = function(D, h) {
                    return qk(D, null, null, h);
                }, qk.matchesSelector = function(D, h) {
                    if (Oq(D), s && !v[h + " "] && (!L || !L.test(h))) try {
                        var z = P.call(D, h);
                        if (z || f.disconnectedMatch || D.document && D.document.nodeType !== 11) return z;
                    } catch (D) {
                        v(h, true);
                    }
                    return qk(h, E, null, [ D ]).length > 0;
                }, qk.contains = function(D, h) {
                    if ((D.ownerDocument || D) != E) Oq(D);
                    return d.contains(D, h);
                }, qk.attr = function(D, h) {
                    if ((D.ownerDocument || D) != E) Oq(D);
                    var z = j.attrHandle[h.toLowerCase()], F = z && I.call(j.attrHandle, h.toLowerCase()) ? z(D, h, !s) : void 0;
                    if (F !== void 0) return F;
                    return D.getAttribute(h);
                }, qk.error = function(D) {
                    throw new Error("Syntax error, unrecognized expression: " + D);
                }, d.uniqueSort = function(D) {
                    var h, z = [], j = 0, l = 0;
                    if (q = !f.sortStable, Z = !f.sortStable && F.call(D, 0), M.call(D, m), q) {
                        while (h = D[l++]) if (h === D[l]) j = z.push(l);
                        while (j--) S.call(D, z[j], 1);
                    }
                    return Z = null, D;
                }, d.fn.uniqueSort = function() {
                    return this.pushStack(d.uniqueSort(F.apply(this)));
                }, j = d.expr = {
                    cacheLength: 50,
                    createPseudo: LD,
                    match: b,
                    attrHandle: {},
                    find: {},
                    relative: {
                        ">": {
                            dir: "parentNode",
                            first: true
                        },
                        " ": {
                            dir: "parentNode"
                        },
                        "+": {
                            dir: "previousSibling",
                            first: true
                        },
                        "~": {
                            dir: "previousSibling"
                        }
                    },
                    preFilter: {
                        ATTR: function(D) {
                            if (D[1] = D[1].replace(i, g), D[3] = (D[3] || D[4] || D[5] || "").replace(i, g),
                            D[2] === "~=") D[3] = " " + D[3] + " ";
                            return D.slice(0, 4);
                        },
                        CHILD: function(D) {
                            if (D[1] = D[1].toLowerCase(), D[1].slice(0, 3) === "nth") {
                                if (!D[3]) qk.error(D[0]);
                                D[4] = +(D[4] ? D[5] + (D[6] || 1) : 2 * (D[3] === "even" || D[3] === "odd")), D[5] = +(D[7] + D[8] || D[3] === "odd");
                            } else if (D[3]) qk.error(D[0]);
                            return D;
                        },
                        PSEUDO: function(D) {
                            var h, z = !D[6] && D[2];
                            if (b.CHILD.test(D[0])) return null;
                            if (D[3]) D[2] = D[4] || D[5] || ""; else if (z && O.test(z) && (h = KU(z, true)) && (h = z.indexOf(")", z.length - h) - z.length)) D[0] = D[0].slice(0, h),
                            D[2] = z.slice(0, h);
                            return D.slice(0, 3);
                        }
                    },
                    filter: {
                        TAG: function(D) {
                            var h = D.replace(i, g).toLowerCase();
                            return D === "*" ? function() {
                                return true;
                            } : function(D) {
                                return K(D, h);
                            };
                        },
                        CLASS: function(D) {
                            var h = J[D + " "];
                            return h || (h = new RegExp("(^|" + T + ")" + D + "(" + T + "|$)")) && J(D, (function(D) {
                                return h.test(typeof D.className === "string" && D.className || typeof D.getAttribute !== "undefined" && D.getAttribute("class") || "");
                            }));
                        },
                        ATTR: function(D, h, z) {
                            return function(j) {
                                var F = qk.attr(j, D);
                                if (F == null) return h === "!=";
                                if (!h) return true;
                                if (F += "", h === "=") return F === z;
                                if (h === "!=") return F !== z;
                                if (h === "^=") return z && F.indexOf(z) === 0;
                                if (h === "*=") return z && F.indexOf(z) > -1;
                                if (h === "$=") return z && F.slice(-z.length) === z;
                                if (h === "~=") return (" " + F.replace(W, " ") + " ").indexOf(z) > -1;
                                if (h === "|=") return F === z || F.slice(0, z.length + 1) === z + "-";
                                return false;
                            };
                        },
                        CHILD: function(D, h, z, j, F) {
                            var l = D.slice(0, 3) !== "nth", Z = D.slice(-4) !== "last", A = h === "of-type";
                            return j === 1 && F === 0 ? function(D) {
                                return !!D.parentNode;
                            } : function(h, z, q) {
                                var Q, I, E, X, f, s = l !== Z ? "nextSibling" : "previousSibling", L = h.parentNode, P = A && h.nodeName.toLowerCase(), w = !q && !A, J = false;
                                if (L) {
                                    if (l) {
                                        while (s) {
                                            E = h;
                                            while (E = E[s]) if (A ? K(E, P) : E.nodeType === 1) return false;
                                            f = s = D === "only" && !f && "nextSibling";
                                        }
                                        return true;
                                    }
                                    if (f = [ Z ? L.firstChild : L.lastChild ], Z && w) {
                                        I = L[x] || (L[x] = {}), Q = I[D] || [], X = Q[0] === n && Q[1], J = X && Q[2],
                                        E = X && L.childNodes[X];
                                        while (E = ++X && E && E[s] || (J = X = 0) || f.pop()) if (E.nodeType === 1 && ++J && E === h) {
                                            I[D] = [ n, X, J ];
                                            break;
                                        }
                                    } else {
                                        if (w) I = h[x] || (h[x] = {}), Q = I[D] || [], X = Q[0] === n && Q[1], J = X;
                                        if (J === false) while (E = ++X && E && E[s] || (J = X = 0) || f.pop()) if ((A ? K(E, P) : E.nodeType === 1) && ++J) {
                                            if (w) I = E[x] || (E[x] = {}), I[D] = [ n, J ];
                                            if (E === h) break;
                                        }
                                    }
                                    return J -= F, J === j || J % j === 0 && J / j >= 0;
                                }
                            };
                        },
                        PSEUDO: function(D, h) {
                            var z, F = j.pseudos[D] || j.setFilters[D.toLowerCase()] || qk.error("unsupported pseudo: " + D);
                            if (F[x]) return F(h);
                            if (F.length > 1) return z = [ D, D, "", h ], j.setFilters.hasOwnProperty(D.toLowerCase()) ? LD((function(D, z) {
                                var j, l = F(D, h), Z = l.length;
                                while (Z--) j = A.call(D, l[Z]), D[j] = !(z[j] = l[Z]);
                            })) : function(D) {
                                return F(D, 0, z);
                            };
                            return F;
                        }
                    },
                    pseudos: {
                        not: LD((function(D) {
                            var h = [], z = [], j = Ki(D.replace(e, "$1"));
                            return j[x] ? LD((function(D, h, z, F) {
                                var l, Z = j(D, null, F, []), A = D.length;
                                while (A--) if (l = Z[A]) D[A] = !(h[A] = l);
                            })) : function(D, F, l) {
                                return h[0] = D, j(h, null, l, z), h[0] = null, !z.pop();
                            };
                        })),
                        has: LD((function(D) {
                            return function(h) {
                                return qk(D, h).length > 0;
                            };
                        })),
                        contains: LD((function(D) {
                            return D = D.replace(i, g), function(h) {
                                return (h.textContent || d.text(h)).indexOf(D) > -1;
                            };
                        })),
                        lang: LD((function(D) {
                            if (!o.test(D || "")) qk.error("unsupported lang: " + D);
                            return D = D.replace(i, g).toLowerCase(), function(h) {
                                var z;
                                do {
                                    if (z = s ? h.lang : h.getAttribute("xml:lang") || h.getAttribute("lang")) return z = z.toLowerCase(),
                                    z === D || z.indexOf(D + "-") === 0;
                                } while ((h = h.parentNode) && h.nodeType === 1);
                                return false;
                            };
                        })),
                        target: function(h) {
                            var z = D.location && D.location.hash;
                            return z && z.slice(1) === h.id;
                        },
                        root: function(D) {
                            return D === X;
                        },
                        focus: function(D) {
                            return D === Ar() && E.hasFocus() && !!(D.type || D.href || ~D.tabIndex);
                        },
                        enabled: dj(false),
                        disabled: dj(true),
                        checked: function(D) {
                            return K(D, "input") && !!D.checked || K(D, "option") && !!D.selected;
                        },
                        selected: function(D) {
                            if (D.parentNode) D.parentNode.selectedIndex;
                            return D.selected === true;
                        },
                        empty: function(D) {
                            for (D = D.firstChild; D; D = D.nextSibling) if (D.nodeType < 6) return false;
                            return true;
                        },
                        parent: function(D) {
                            return !j.pseudos.empty(D);
                        },
                        header: function(D) {
                            return Y.test(D.nodeName);
                        },
                        input: function(D) {
                            return B.test(D.nodeName);
                        },
                        button: function(D) {
                            return K(D, "input") && D.type === "button" || K(D, "button");
                        },
                        text: function(D) {
                            var h;
                            return K(D, "input") && D.type === "text" && ((h = D.getAttribute("type")) == null || h.toLowerCase() === "text");
                        },
                        first: Su((function() {
                            return [ 0 ];
                        })),
                        last: Su((function(D, h) {
                            return [ h - 1 ];
                        })),
                        eq: Su((function(D, h, z) {
                            return [ z < 0 ? z + h : z ];
                        })),
                        even: Su((function(D, h) {
                            for (var z = 0; z < h; z += 2) D.push(z);
                            return D;
                        })),
                        odd: Su((function(D, h) {
                            for (var z = 1; z < h; z += 2) D.push(z);
                            return D;
                        })),
                        lt: Su((function(D, h, z) {
                            var j;
                            if (z < 0) j = z + h; else if (z > h) j = h; else j = z;
                            for (;--j >= 0; ) D.push(j);
                            return D;
                        })),
                        gt: Su((function(D, h, z) {
                            for (var j = z < 0 ? z + h : z; ++j < h; ) D.push(j);
                            return D;
                        }))
                    }
                }, j.pseudos.nth = j.pseudos.eq, {
                    radio: true,
                    checkbox: true,
                    file: true,
                    password: true,
                    image: true
                }) j.pseudos[h] = VB(h);
                for (h in {
                    submit: true,
                    reset: true
                }) j.pseudos[h] = zi(h);
                function rB() {}
                function KU(D, h) {
                    var z, F, l, Z, A, q, Q, I = a[D + " "];
                    if (I) return h ? 0 : I.slice(0);
                    A = D, q = [], Q = j.preFilter;
                    while (A) {
                        if (!z || (F = U.exec(A))) {
                            if (F) A = A.slice(F[0].length) || A;
                            q.push(l = []);
                        }
                        if (z = false, F = p.exec(A)) z = F.shift(), l.push({
                            value: z,
                            type: F[0].replace(e, " ")
                        }), A = A.slice(z.length);
                        for (Z in j.filter) if ((F = b[Z].exec(A)) && (!Q[Z] || (F = Q[Z](F)))) z = F.shift(),
                        l.push({
                            value: z,
                            type: Z,
                            matches: F
                        }), A = A.slice(z.length);
                        if (!z) break;
                    }
                    if (h) return A.length;
                    return A ? qk.error(D) : a(D, q).slice(0);
                }
                function BW(D) {
                    for (var h = 0, z = D.length, j = ""; h < z; h++) j += D[h].value;
                    return j;
                }
                function yi(D, h, z) {
                    var j = h.dir, F = h.next, l = F || j, Z = z && l === "parentNode", A = w++;
                    return h.first ? function(h, z, F) {
                        while (h = h[j]) if (h.nodeType === 1 || Z) return D(h, z, F);
                        return false;
                    } : function(h, z, q) {
                        var Q, I, E = [ n, A ];
                        if (q) {
                            while (h = h[j]) if (h.nodeType === 1 || Z) if (D(h, z, q)) return true;
                        } else while (h = h[j]) if (h.nodeType === 1 || Z) if (I = h[x] || (h[x] = {}),
                        F && K(h, F)) h = h[j] || h; else if ((Q = I[l]) && Q[0] === n && Q[1] === A) return E[2] = Q[2]; else if (I[l] = E,
                        E[2] = D(h, z, q)) return true;
                        return false;
                    };
                }
                function mX(D) {
                    return D.length > 1 ? function(h, z, j) {
                        var F = D.length;
                        while (F--) if (!D[F](h, z, j)) return false;
                        return true;
                    } : D[0];
                }
                function ol(D, h, z) {
                    for (var j = 0, F = h.length; j < F; j++) qk(D, h[j], z);
                    return z;
                }
                function tR(D, h, z, j, F) {
                    for (var l, Z = [], A = 0, q = D.length, Q = h != null; A < q; A++) if (l = D[A]) if (!z || z(l, j, F)) if (Z.push(l),
                    Q) h.push(A);
                    return Z;
                }
                function An(D, h, z, j, F, l) {
                    if (j && !j[x]) j = An(j);
                    if (F && !F[x]) F = An(F, l);
                    return LD((function(l, Z, q, I) {
                        var E, X, f, s, L = [], P = [], x = Z.length, n = l || ol(h || "*", q.nodeType ? [ q ] : q, []), w = D && (l || !h) ? tR(n, L, D, q, I) : n;
                        if (z) s = F || (l ? D : x || j) ? [] : Z, z(w, s, q, I); else s = w;
                        if (j) {
                            E = tR(s, P), j(E, [], q, I), X = E.length;
                            while (X--) if (f = E[X]) s[P[X]] = !(w[P[X]] = f);
                        }
                        if (l) {
                            if (F || D) {
                                if (F) {
                                    E = [], X = s.length;
                                    while (X--) if (f = s[X]) E.push(w[X] = f);
                                    F(null, s = [], E, I);
                                }
                                X = s.length;
                                while (X--) if ((f = s[X]) && (E = F ? A.call(l, f) : L[X]) > -1) l[E] = !(Z[E] = f);
                            }
                        } else if (s = tR(s === Z ? s.splice(x, s.length) : s), F) F(null, Z, s, I); else Q.apply(Z, s);
                    }));
                }
                function qe(D) {
                    for (var h, z, F, Z = D.length, q = j.relative[D[0].type], Q = q || j.relative[" "], I = q ? 1 : 0, E = yi((function(D) {
                        return D === h;
                    }), Q, true), X = yi((function(D) {
                        return A.call(h, D) > -1;
                    }), Q, true), f = [ function(D, z, j) {
                        var F = !q && (j || z != l) || ((h = z).nodeType ? E(D, z, j) : X(D, z, j));
                        return h = null, F;
                    } ]; I < Z; I++) if (z = j.relative[D[I].type]) f = [ yi(mX(f), z) ]; else {
                        if (z = j.filter[D[I].type].apply(null, D[I].matches), z[x]) {
                            for (F = ++I; F < Z; F++) if (j.relative[D[F].type]) break;
                            return An(I > 1 && mX(f), I > 1 && BW(D.slice(0, I - 1).concat({
                                value: D[I - 2].type === " " ? "*" : ""
                            })).replace(e, "$1"), z, I < F && qe(D.slice(I, F)), F < Z && qe(D = D.slice(F)), F < Z && BW(D));
                        }
                        f.push(z);
                    }
                    return mX(f);
                }
                function LL(D, h) {
                    var z = h.length > 0, F = D.length > 0, Z = function(Z, A, q, I, X) {
                        var f, L, P, x = 0, w = "0", J = Z && [], a = [], H = l, K = Z || F && j.find.TAG("*", X), M = n += H == null ? 1 : Math.random() || .1, S = K.length;
                        if (X) l = A == E || A || X;
                        for (;w !== S && (f = K[w]) != null; w++) {
                            if (F && f) {
                                if (L = 0, !A && f.ownerDocument != E) Oq(f), q = !s;
                                while (P = D[L++]) if (P(f, A || E, q)) {
                                    Q.call(I, f);
                                    break;
                                }
                                if (X) n = M;
                            }
                            if (z) {
                                if (f = !P && f) x--;
                                if (Z) J.push(f);
                            }
                        }
                        if (x += w, z && w !== x) {
                            L = 0;
                            while (P = h[L++]) P(J, a, A, q);
                            if (Z) {
                                if (x > 0) while (w--) if (!(J[w] || a[w])) a[w] = c.call(I);
                                a = tR(a);
                            }
                            if (Q.apply(I, a), X && !Z && a.length > 0 && x + h.length > 1) d.uniqueSort(I);
                        }
                        if (X) n = M, l = H;
                        return J;
                    };
                    return z ? LD(Z) : Z;
                }
                function Ki(D, h) {
                    var z, j = [], F = [], l = H[D + " "];
                    if (!l) {
                        if (!h) h = KU(D);
                        z = h.length;
                        while (z--) if (l = qe(h[z]), l[x]) j.push(l); else F.push(l);
                        l = H(D, LL(F, j)), l.selector = D;
                    }
                    return l;
                }
                function Jo(D, h, z, F) {
                    var l, Z, A, q, I, E = typeof D === "function" && D, X = !F && KU(D = E.selector || D);
                    if (z = z || [], X.length === 1) {
                        if (Z = X[0] = X[0].slice(0), Z.length > 2 && (A = Z[0]).type === "ID" && h.nodeType === 9 && s && j.relative[Z[1].type]) {
                            if (h = (j.find.ID(A.matches[0].replace(i, g), h) || [])[0], !h) return z; else if (E) h = h.parentNode;
                            D = D.slice(Z.shift().value.length);
                        }
                        l = b.needsContext.test(D) ? 0 : Z.length;
                        while (l--) {
                            if (A = Z[l], j.relative[q = A.type]) break;
                            if (I = j.find[q]) if (F = I(A.matches[0].replace(i, g), V.test(Z[0].type) && Cv(h.parentNode) || h)) {
                                if (Z.splice(l, 1), D = F.length && BW(Z), !D) return Q.apply(z, F), z;
                                break;
                            }
                        }
                    }
                    return (E || Ki(D, X))(F, h, !s, z, !h || V.test(D) && Cv(h.parentNode) || h), z;
                }
                rB.prototype = j.filters = j.pseudos, j.setFilters = new rB, f.sortStable = x.split("").sort(m).join("") === x,
                Oq(), f.sortDetached = hO((function(D) {
                    return D.compareDocumentPosition(E.createElement("fieldset")) & 1;
                })), d.find = qk, d.expr[":"] = d.expr.pseudos, d.unique = d.uniqueSort, qk.compile = Ki,
                qk.select = Jo, qk.setDocument = Oq, qk.escape = d.escapeSelector, qk.getText = d.text,
                qk.isXML = d.isXMLDoc, qk.selectors = d.expr, qk.support = d.support, qk.uniqueSort = d.uniqueSort;
            })();
            var t = function(D, h, z) {
                var j = [], F = z !== void 0;
                while ((D = D[h]) && D.nodeType !== 9) if (D.nodeType === 1) {
                    if (F && d(D).is(z)) break;
                    j.push(D);
                }
                return j;
            }, C = function(D, h) {
                for (var z = []; D; D = D.nextSibling) if (D.nodeType === 1 && D !== h) z.push(D);
                return z;
            }, y = d.expr.match.needsContext, k = /^<([a-z][^\/\0>:\x20\t\r\n\f]*)[\x20\t\r\n\f]*\/?>(?:<\/\1>|)$/i;
            function W(D, h, z) {
                if (s(h)) return d.grep(D, (function(D, j) {
                    return !!h.call(D, j, D) !== z;
                }));
                if (h.nodeType) return d.grep(D, (function(D) {
                    return D === h !== z;
                }));
                if (typeof h !== "string") return d.grep(D, (function(D) {
                    return A.call(h, D) > -1 !== z;
                }));
                return d.filter(h, D, z);
            }
            d.filter = function(D, h, z) {
                var j = h[0];
                if (z) D = ":not(" + D + ")";
                if (h.length === 1 && j.nodeType === 1) return d.find.matchesSelector(j, D) ? [ j ] : [];
                return d.find.matches(D, d.grep(h, (function(D) {
                    return D.nodeType === 1;
                })));
            }, d.fn.extend({
                find: function(D) {
                    var h, z, j = this.length, F = this;
                    if (typeof D !== "string") return this.pushStack(d(D).filter((function() {
                        for (h = 0; h < j; h++) if (d.contains(F[h], this)) return true;
                    })));
                    for (z = this.pushStack([]), h = 0; h < j; h++) d.find(D, F[h], z);
                    return j > 1 ? d.uniqueSort(z) : z;
                },
                filter: function(D) {
                    return this.pushStack(W(this, D || [], false));
                },
                not: function(D) {
                    return this.pushStack(W(this, D || [], true));
                },
                is: function(D) {
                    return !!W(this, typeof D === "string" && y.test(D) ? d(D) : D || [], false).length;
                }
            });
            var U, p = /^(?:\s*(<[\w\W]+>)[^>]*|#([\w-]+))$/, u = d.fn.init = function(D, h, z) {
                var j, F;
                if (!D) return this;
                if (z = z || U, typeof D === "string") {
                    if (D[0] === "<" && D[D.length - 1] === ">" && D.length >= 3) j = [ null, D, null ]; else j = p.exec(D);
                    if (j && (j[1] || !h)) if (j[1]) {
                        if (h = h instanceof d ? h[0] : h, d.merge(this, d.parseHTML(j[1], h && h.nodeType ? h.ownerDocument || h : P, true)),
                        k.test(j[1]) && d.isPlainObject(h)) for (j in h) if (s(this[j])) this[j](h[j]); else this.attr(j, h[j]);
                        return this;
                    } else {
                        if (F = P.getElementById(j[2]), F) this[0] = F, this.length = 1;
                        return this;
                    } else if (!h || h.jquery) return (h || z).find(D); else return this.constructor(h).find(D);
                } else if (D.nodeType) return this[0] = D, this.length = 1, this; else if (s(D)) return z.ready !== void 0 ? z.ready(D) : D(d);
                return d.makeArray(D, this);
            };
            u.prototype = d.fn, U = d(P);
            var O = /^(?:parents|prev(?:Until|All))/, o = {
                children: true,
                contents: true,
                next: true,
                prev: true
            };
            function b(D, h) {
                while ((D = D[h]) && D.nodeType !== 1) ;
                return D;
            }
            d.fn.extend({
                has: function(D) {
                    var h = d(D, this), z = h.length;
                    return this.filter((function() {
                        for (var D = 0; D < z; D++) if (d.contains(this, h[D])) return true;
                    }));
                },
                closest: function(D, h) {
                    var z, j = 0, F = this.length, l = [], Z = typeof D !== "string" && d(D);
                    if (!y.test(D)) for (;j < F; j++) for (z = this[j]; z && z !== h; z = z.parentNode) if (z.nodeType < 11 && (Z ? Z.index(z) > -1 : z.nodeType === 1 && d.find.matchesSelector(z, D))) {
                        l.push(z);
                        break;
                    }
                    return this.pushStack(l.length > 1 ? d.uniqueSort(l) : l);
                },
                index: function(D) {
                    if (!D) return this[0] && this[0].parentNode ? this.first().prevAll().length : -1;
                    if (typeof D === "string") return A.call(d(D), this[0]);
                    return A.call(this, D.jquery ? D[0] : D);
                },
                add: function(D, h) {
                    return this.pushStack(d.uniqueSort(d.merge(this.get(), d(D, h))));
                },
                addBack: function(D) {
                    return this.add(D == null ? this.prevObject : this.prevObject.filter(D));
                }
            }), d.each({
                parent: function(D) {
                    var h = D.parentNode;
                    return h && h.nodeType !== 11 ? h : null;
                },
                parents: function(D) {
                    return t(D, "parentNode");
                },
                parentsUntil: function(D, h, z) {
                    return t(D, "parentNode", z);
                },
                next: function(D) {
                    return b(D, "nextSibling");
                },
                prev: function(D) {
                    return b(D, "previousSibling");
                },
                nextAll: function(D) {
                    return t(D, "nextSibling");
                },
                prevAll: function(D) {
                    return t(D, "previousSibling");
                },
                nextUntil: function(D, h, z) {
                    return t(D, "nextSibling", z);
                },
                prevUntil: function(D, h, z) {
                    return t(D, "previousSibling", z);
                },
                siblings: function(D) {
                    return C((D.parentNode || {}).firstChild, D);
                },
                children: function(D) {
                    return C(D.firstChild);
                },
                contents: function(D) {
                    if (D.contentDocument != null && j(D.contentDocument)) return D.contentDocument;
                    if (K(D, "template")) D = D.content || D;
                    return d.merge([], D.childNodes);
                }
            }, (function(D, h) {
                d.fn[D] = function(z, j) {
                    var F = d.map(this, h, z);
                    if (D.slice(-5) !== "Until") j = z;
                    if (j && typeof j === "string") F = d.filter(j, F);
                    if (this.length > 1) {
                        if (!o[D]) d.uniqueSort(F);
                        if (O.test(D)) F.reverse();
                    }
                    return this.pushStack(F);
                };
            }));
            var B = /[^\x20\t\r\n\f]+/g;
            function Y(D) {
                var h = {};
                return d.each(D.match(B) || [], (function(D, z) {
                    h[z] = true;
                })), h;
            }
            function R(D) {
                return D;
            }
            function V(D) {
                throw D;
            }
            function i(D, h, z, j) {
                var F;
                try {
                    if (D && s(F = D.promise)) F.call(D).done(h).fail(z); else if (D && s(F = D.then)) F.call(D, h, z); else h.apply(void 0, [ D ].slice(j));
                } catch (D) {
                    z.apply(void 0, [ D ]);
                }
            }
            d.Callbacks = function(D) {
                D = typeof D === "string" ? Y(D) : d.extend({}, D);
                var h, z, j, F, l = [], Z = [], A = -1, q = function() {
                    for (F = F || D.once, j = h = true; Z.length; A = -1) {
                        z = Z.shift();
                        while (++A < l.length) if (l[A].apply(z[0], z[1]) === false && D.stopOnFalse) A = l.length,
                        z = false;
                    }
                    if (!D.memory) z = false;
                    if (h = false, F) if (z) l = []; else l = "";
                }, Q = {
                    add: function() {
                        if (l) {
                            if (z && !h) A = l.length - 1, Z.push(z);
                            if (function h(z) {
                                d.each(z, (function(z, j) {
                                    if (s(j)) {
                                        if (!D.unique || !Q.has(j)) l.push(j);
                                    } else if (j && j.length && w(j) !== "string") h(j);
                                }));
                            }(arguments), z && !h) q();
                        }
                        return this;
                    },
                    remove: function() {
                        return d.each(arguments, (function(D, h) {
                            var z;
                            while ((z = d.inArray(h, l, z)) > -1) if (l.splice(z, 1), z <= A) A--;
                        })), this;
                    },
                    has: function(D) {
                        return D ? d.inArray(D, l) > -1 : l.length > 0;
                    },
                    empty: function() {
                        if (l) l = [];
                        return this;
                    },
                    disable: function() {
                        return F = Z = [], l = z = "", this;
                    },
                    disabled: function() {
                        return !l;
                    },
                    lock: function() {
                        if (F = Z = [], !z && !h) l = z = "";
                        return this;
                    },
                    locked: function() {
                        return !!F;
                    },
                    fireWith: function(D, z) {
                        if (!F) if (z = z || [], z = [ D, z.slice ? z.slice() : z ], Z.push(z), !h) q();
                        return this;
                    },
                    fire: function() {
                        return Q.fireWith(this, arguments), this;
                    },
                    fired: function() {
                        return !!j;
                    }
                };
                return Q;
            }, d.extend({
                Deferred: function(h) {
                    var z = [ [ "notify", "progress", d.Callbacks("memory"), d.Callbacks("memory"), 2 ], [ "resolve", "done", d.Callbacks("once memory"), d.Callbacks("once memory"), 0, "resolved" ], [ "reject", "fail", d.Callbacks("once memory"), d.Callbacks("once memory"), 1, "rejected" ] ], j = "pending", F = {
                        state: function() {
                            return j;
                        },
                        always: function() {
                            return l.done(arguments).fail(arguments), this;
                        },
                        catch: function(D) {
                            return F.then(null, D);
                        },
                        pipe: function() {
                            var D = arguments;
                            return d.Deferred((function(h) {
                                d.each(z, (function(z, j) {
                                    var F = s(D[j[4]]) && D[j[4]];
                                    l[j[1]]((function() {
                                        var D = F && F.apply(this, arguments);
                                        if (D && s(D.promise)) D.promise().progress(h.notify).done(h.resolve).fail(h.reject); else h[j[0] + "With"](this, F ? [ D ] : arguments);
                                    }));
                                })), D = null;
                            })).promise();
                        },
                        then: function(h, j, F) {
                            var l = 0;
                            function Z(h, z, j, F) {
                                return function() {
                                    var A = this, q = arguments, Q = function() {
                                        var D, Q;
                                        if (h < l) return;
                                        if (D = j.apply(A, q), D === z.promise()) throw new TypeError("Thenable self-resolution");
                                        if (Q = D && (typeof D === "object" || typeof D === "function") && D.then, s(Q)) if (F) Q.call(D, Z(l, z, R, F), Z(l, z, V, F)); else l++,
                                        Q.call(D, Z(l, z, R, F), Z(l, z, V, F), Z(l, z, R, z.notifyWith)); else {
                                            if (j !== R) A = void 0, q = [ D ];
                                            (F || z.resolveWith)(A, q);
                                        }
                                    }, I = F ? Q : function() {
                                        try {
                                            Q();
                                        } catch (D) {
                                            if (d.Deferred.exceptionHook) d.Deferred.exceptionHook(D, I.error);
                                            if (h + 1 >= l) {
                                                if (j !== V) A = void 0, q = [ D ];
                                                z.rejectWith(A, q);
                                            }
                                        }
                                    };
                                    if (h) I(); else {
                                        if (d.Deferred.getErrorHook) I.error = d.Deferred.getErrorHook(); else if (d.Deferred.getStackHook) I.error = d.Deferred.getStackHook();
                                        D.setTimeout(I);
                                    }
                                };
                            }
                            return d.Deferred((function(D) {
                                z[0][3].add(Z(0, D, s(F) ? F : R, D.notifyWith)), z[1][3].add(Z(0, D, s(h) ? h : R)),
                                z[2][3].add(Z(0, D, s(j) ? j : V));
                            })).promise();
                        },
                        promise: function(D) {
                            return D != null ? d.extend(D, F) : F;
                        }
                    }, l = {};
                    if (d.each(z, (function(D, h) {
                        var Z = h[2], A = h[5];
                        if (F[h[1]] = Z.add, A) Z.add((function() {
                            j = A;
                        }), z[3 - D][2].disable, z[3 - D][3].disable, z[0][2].lock, z[0][3].lock);
                        Z.add(h[3].fire), l[h[0]] = function() {
                            return l[h[0] + "With"](this === l ? void 0 : this, arguments), this;
                        }, l[h[0] + "With"] = Z.fireWith;
                    })), F.promise(l), h) h.call(l, l);
                    return l;
                },
                when: function(D) {
                    var h = arguments.length, z = h, j = Array(z), l = F.call(arguments), Z = d.Deferred(), A = function(D) {
                        return function(z) {
                            if (j[D] = this, l[D] = arguments.length > 1 ? F.call(arguments) : z, ! --h) Z.resolveWith(j, l);
                        };
                    };
                    if (h <= 1) if (i(D, Z.done(A(z)).resolve, Z.reject, !h), Z.state() === "pending" || s(l[z] && l[z].then)) return Z.then();
                    while (z--) i(l[z], A(z), Z.reject);
                    return Z.promise();
                }
            });
            var g = /^(Eval|Internal|Range|Reference|Syntax|Type|URI)Error$/;
            d.Deferred.exceptionHook = function(h, z) {
                if (D.console && D.console.warn && h && g.test(h.name)) D.console.warn("jQuery.Deferred exception: " + h.message, h.stack, z);
            }, d.readyException = function(h) {
                D.setTimeout((function() {
                    throw h;
                }));
            };
            var N = d.Deferred();
            function kN() {
                P.removeEventListener("DOMContentLoaded", kN), D.removeEventListener("load", kN),
                d.ready();
            }
            if (d.fn.ready = function(D) {
                return N.then(D).catch((function(D) {
                    d.readyException(D);
                })), this;
            }, d.extend({
                isReady: false,
                readyWait: 1,
                ready: function(D) {
                    if (D === true ? --d.readyWait : d.isReady) return;
                    if (d.isReady = true, D !== true && --d.readyWait > 0) return;
                    N.resolveWith(P, [ d ]);
                }
            }), d.ready.then = N.then, P.readyState === "complete" || P.readyState !== "loading" && !P.documentElement.doScroll) D.setTimeout(d.ready); else P.addEventListener("DOMContentLoaded", kN),
            D.addEventListener("load", kN);
            var Ar = function(D, h, z, j, F, l, Z) {
                var A = 0, q = D.length, Q = z == null;
                if (w(z) === "object") for (A in F = true, z) Ar(D, h, A, z[A], true, l, Z); else if (j !== void 0) {
                    if (F = true, !s(j)) Z = true;
                    if (Q) if (Z) h.call(D, j), h = null; else Q = h, h = function(D, h, z) {
                        return Q.call(d(D), z);
                    };
                    if (h) for (;A < q; A++) h(D[A], z, Z ? j : j.call(D[A], A, h(D[A], z)));
                }
                if (F) return D;
                if (Q) return h.call(D);
                return q ? h(D[0], z) : l;
            }, qk = /^-ms-/, xk = /-([a-z])/g;
            function LD(D, h) {
                return h.toUpperCase();
            }
            function hO(D) {
                return D.replace(qk, "ms-").replace(xk, LD);
            }
            var VB = function(D) {
                return D.nodeType === 1 || D.nodeType === 9 || !+D.nodeType;
            };
            function zi() {
                this.expando = d.expando + zi.uid++;
            }
            zi.uid = 1, zi.prototype = {
                cache: function(D) {
                    var h = D[this.expando];
                    if (!h) if (h = {}, VB(D)) if (D.nodeType) D[this.expando] = h; else Object.defineProperty(D, this.expando, {
                        value: h,
                        configurable: true
                    });
                    return h;
                },
                set: function(D, h, z) {
                    var j, F = this.cache(D);
                    if (typeof h === "string") F[hO(h)] = z; else for (j in h) F[hO(j)] = h[j];
                    return F;
                },
                get: function(D, h) {
                    return h === void 0 ? this.cache(D) : D[this.expando] && D[this.expando][hO(h)];
                },
                access: function(D, h, z) {
                    if (h === void 0 || h && typeof h === "string" && z === void 0) return this.get(D, h);
                    return this.set(D, h, z), z !== void 0 ? z : h;
                },
                remove: function(D, h) {
                    var z, j = D[this.expando];
                    if (j === void 0) return;
                    if (h !== void 0) {
                        if (Array.isArray(h)) h = h.map(hO); else h = hO(h), h = h in j ? [ h ] : h.match(B) || [];
                        z = h.length;
                        while (z--) delete j[h[z]];
                    }
                    if (h === void 0 || d.isEmptyObject(j)) if (D.nodeType) D[this.expando] = void 0; else delete D[this.expando];
                },
                hasData: function(D) {
                    var h = D[this.expando];
                    return h !== void 0 && !d.isEmptyObject(h);
                }
            };
            var dj = new zi, Su = new zi, Cv = /^(?:\{[\w\W]*\}|\[[\w\W]*\])$/, Oq = /[A-Z]/g;
            function rB(D) {
                if (D === "true") return true;
                if (D === "false") return false;
                if (D === "null") return null;
                if (D === +D + "") return +D;
                if (Cv.test(D)) return JSON.parse(D);
                return D;
            }
            function KU(D, h, z) {
                var j;
                if (z === void 0 && D.nodeType === 1) if (j = "data-" + h.replace(Oq, "-$&").toLowerCase(),
                z = D.getAttribute(j), typeof z === "string") {
                    try {
                        z = rB(z);
                    } catch (D) {}
                    Su.set(D, h, z);
                } else z = void 0;
                return z;
            }
            d.extend({
                hasData: function(D) {
                    return Su.hasData(D) || dj.hasData(D);
                },
                data: function(D, h, z) {
                    return Su.access(D, h, z);
                },
                removeData: function(D, h) {
                    Su.remove(D, h);
                },
                _data: function(D, h, z) {
                    return dj.access(D, h, z);
                },
                _removeData: function(D, h) {
                    dj.remove(D, h);
                }
            }), d.fn.extend({
                data: function(D, h) {
                    var z, j, F, l = this[0], Z = l && l.attributes;
                    if (D === void 0) {
                        if (this.length) if (F = Su.get(l), l.nodeType === 1 && !dj.get(l, "hasDataAttrs")) {
                            z = Z.length;
                            while (z--) if (Z[z]) if (j = Z[z].name, j.indexOf("data-") === 0) j = hO(j.slice(5)),
                            KU(l, j, F[j]);
                            dj.set(l, "hasDataAttrs", true);
                        }
                        return F;
                    }
                    if (typeof D === "object") return this.each((function() {
                        Su.set(this, D);
                    }));
                    return Ar(this, (function(h) {
                        var z;
                        if (l && h === void 0) {
                            if (z = Su.get(l, D), z !== void 0) return z;
                            if (z = KU(l, D), z !== void 0) return z;
                            return;
                        }
                        this.each((function() {
                            Su.set(this, D, h);
                        }));
                    }), null, h, arguments.length > 1, null, true);
                },
                removeData: function(D) {
                    return this.each((function() {
                        Su.remove(this, D);
                    }));
                }
            }), d.extend({
                queue: function(D, h, z) {
                    var j;
                    if (D) {
                        if (h = (h || "fx") + "queue", j = dj.get(D, h), z) if (!j || Array.isArray(z)) j = dj.access(D, h, d.makeArray(z)); else j.push(z);
                        return j || [];
                    }
                },
                dequeue: function(D, h) {
                    h = h || "fx";
                    var z = d.queue(D, h), j = z.length, F = z.shift(), l = d._queueHooks(D, h), Z = function() {
                        d.dequeue(D, h);
                    };
                    if (F === "inprogress") F = z.shift(), j--;
                    if (F) {
                        if (h === "fx") z.unshift("inprogress");
                        delete l.stop, F.call(D, Z, l);
                    }
                    if (!j && l) l.empty.fire();
                },
                _queueHooks: function(D, h) {
                    var z = h + "queueHooks";
                    return dj.get(D, z) || dj.access(D, z, {
                        empty: d.Callbacks("once memory").add((function() {
                            dj.remove(D, [ h + "queue", z ]);
                        }))
                    });
                }
            }), d.fn.extend({
                queue: function(D, h) {
                    var z = 2;
                    if (typeof D !== "string") h = D, D = "fx", z--;
                    if (arguments.length < z) return d.queue(this[0], D);
                    return h === void 0 ? this : this.each((function() {
                        var z = d.queue(this, D, h);
                        if (d._queueHooks(this, D), D === "fx" && z[0] !== "inprogress") d.dequeue(this, D);
                    }));
                },
                dequeue: function(D) {
                    return this.each((function() {
                        d.dequeue(this, D);
                    }));
                },
                clearQueue: function(D) {
                    return this.queue(D || "fx", []);
                },
                promise: function(D, h) {
                    var z, j = 1, F = d.Deferred(), l = this, Z = this.length, A = function() {
                        if (! --j) F.resolveWith(l, [ l ]);
                    };
                    if (typeof D !== "string") h = D, D = void 0;
                    D = D || "fx";
                    while (Z--) if (z = dj.get(l[Z], D + "queueHooks"), z && z.empty) j++, z.empty.add(A);
                    return A(), F.promise(h);
                }
            });
            var BW = /[+-]?(?:\d*\.|)\d+(?:[eE][+-]?\d+|)/.source, yi = new RegExp("^(?:([+-])=|)(" + BW + ")([a-z%]*)$", "i"), mX = [ "Top", "Right", "Bottom", "Left" ], ol = P.documentElement, tR = function(D) {
                return d.contains(D.ownerDocument, D);
            }, An = {
                composed: true
            };
            if (ol.getRootNode) tR = function(D) {
                return d.contains(D.ownerDocument, D) || D.getRootNode(An) === D.ownerDocument;
            };
            var qe = function(D, h) {
                return D = h || D, D.style.display === "none" || D.style.display === "" && tR(D) && d.css(D, "display") === "none";
            };
            function LL(D, h, z, j) {
                var F, l, Z = 20, A = j ? function() {
                    return j.cur();
                } : function() {
                    return d.css(D, h, "");
                }, q = A(), Q = z && z[3] || (d.cssNumber[h] ? "" : "px"), I = D.nodeType && (d.cssNumber[h] || Q !== "px" && +q) && yi.exec(d.css(D, h));
                if (I && I[3] !== Q) {
                    q /= 2, Q = Q || I[3], I = +q || 1;
                    while (Z--) {
                        if (d.style(D, h, I + Q), (1 - l) * (1 - (l = A() / q || .5)) <= 0) Z = 0;
                        I /= l;
                    }
                    I *= 2, d.style(D, h, I + Q), z = z || [];
                }
                if (z) if (I = +I || +q || 0, F = z[1] ? I + (z[1] + 1) * z[2] : +z[2], j) j.unit = Q,
                j.start = I, j.end = F;
                return F;
            }
            var Ki = {};
            function Jo(D) {
                var h, z = D.ownerDocument, j = D.nodeName, F = Ki[j];
                if (F) return F;
                if (h = z.body.appendChild(z.createElement(j)), F = d.css(h, "display"), h.parentNode.removeChild(h),
                F === "none") F = "block";
                return Ki[j] = F, F;
            }
            function Tx(D, h) {
                for (var z, j, F = [], l = 0, Z = D.length; l < Z; l++) {
                    if (j = D[l], !j.style) continue;
                    if (z = j.style.display, h) {
                        if (z === "none") if (F[l] = dj.get(j, "display") || null, !F[l]) j.style.display = "";
                        if (j.style.display === "" && qe(j)) F[l] = Jo(j);
                    } else if (z !== "none") F[l] = "none", dj.set(j, "display", z);
                }
                for (l = 0; l < Z; l++) if (F[l] != null) D[l].style.display = F[l];
                return D;
            }
            d.fn.extend({
                show: function() {
                    return Tx(this, true);
                },
                hide: function() {
                    return Tx(this);
                },
                toggle: function(D) {
                    if (typeof D === "boolean") return D ? this.show() : this.hide();
                    return this.each((function() {
                        if (qe(this)) d(this).show(); else d(this).hide();
                    }));
                }
            });
            var By = /^(?:checkbox|radio)$/i, vF = /<([a-z][^\/\0>\x20\t\r\n\f]*)/i, kn = /^$|^module$|\/(?:java|ecma)script/i, wQ, lp, Hd;
            wQ = P.createDocumentFragment(), lp = wQ.appendChild(P.createElement("div")), Hd = P.createElement("input"),
            Hd.setAttribute("type", "radio"), Hd.setAttribute("checked", "checked"), Hd.setAttribute("name", "t"),
            lp.appendChild(Hd), f.checkClone = lp.cloneNode(true).cloneNode(true).lastChild.checked,
            lp.innerHTML = "<textarea>x</textarea>", f.noCloneChecked = !!lp.cloneNode(true).lastChild.defaultValue,
            lp.innerHTML = "<option></option>", f.option = !!lp.lastChild;
            var rG = {
                thead: [ 1, "<table>", "</table>" ],
                col: [ 2, "<table><colgroup>", "</colgroup></table>" ],
                tr: [ 2, "<table><tbody>", "</tbody></table>" ],
                td: [ 3, "<table><tbody><tr>", "</tr></tbody></table>" ],
                _default: [ 0, "", "" ]
            };
            if (rG.tbody = rG.tfoot = rG.colgroup = rG.caption = rG.thead, rG.th = rG.td, !f.option) rG.optgroup = rG.option = [ 1, "<select multiple='multiple'>", "</select>" ];
            function Az(D, h) {
                var z;
                if (typeof D.getElementsByTagName !== "undefined") z = D.getElementsByTagName(h || "*"); else if (typeof D.querySelectorAll !== "undefined") z = D.querySelectorAll(h || "*"); else z = [];
                if (h === void 0 || h && K(D, h)) return d.merge([ D ], z);
                return z;
            }
            function vS(D, h) {
                for (var z = 0, j = D.length; z < j; z++) dj.set(D[z], "globalEval", !h || dj.get(h[z], "globalEval"));
            }
            var Sq = /<|&#?\w+;/;
            function PG(D, h, z, j, F) {
                for (var l, Z, A, q, Q, I, E = h.createDocumentFragment(), X = [], f = 0, s = D.length; f < s; f++) if (l = D[f],
                l || l === 0) if (w(l) === "object") d.merge(X, l.nodeType ? [ l ] : l); else if (!Sq.test(l)) X.push(h.createTextNode(l)); else {
                    Z = Z || E.appendChild(h.createElement("div")), A = (vF.exec(l) || [ "", "" ])[1].toLowerCase(),
                    q = rG[A] || rG._default, Z.innerHTML = q[1] + d.htmlPrefilter(l) + q[2], I = q[0];
                    while (I--) Z = Z.lastChild;
                    d.merge(X, Z.childNodes), Z = E.firstChild, Z.textContent = "";
                }
                E.textContent = "", f = 0;
                while (l = X[f++]) {
                    if (j && d.inArray(l, j) > -1) {
                        if (F) F.push(l);
                        continue;
                    }
                    if (Q = tR(l), Z = Az(E.appendChild(l), "script"), Q) vS(Z);
                    if (z) {
                        I = 0;
                        while (l = Z[I++]) if (kn.test(l.type || "")) z.push(l);
                    }
                }
                return E;
            }
            var Tm = /^([^.]*)(?:\.(.+)|)/;
            function FM() {
                return true;
            }
            function oF() {
                return false;
            }
            function an(D, h, z, j, F, l) {
                var Z, A;
                if (typeof h === "object") {
                    if (typeof z !== "string") j = j || z, z = void 0;
                    for (A in h) an(D, A, z, j, h[A], l);
                    return D;
                }
                if (j == null && F == null) F = z, j = z = void 0; else if (F == null) if (typeof z === "string") F = j,
                j = void 0; else F = j, j = z, z = void 0;
                if (F === false) F = oF; else if (!F) return D;
                if (l === 1) Z = F, F = function(D) {
                    return d().off(D), Z.apply(this, arguments);
                }, F.guid = Z.guid || (Z.guid = d.guid++);
                return D.each((function() {
                    d.event.add(this, h, F, j, z);
                }));
            }
            function cz(D, h, z) {
                if (!z) {
                    if (dj.get(D, h) === void 0) d.event.add(D, h, FM);
                    return;
                }
                dj.set(D, h, false), d.event.add(D, h, {
                    namespace: false,
                    handler: function(D) {
                        var z, j = dj.get(this, h);
                        if (D.isTrigger & 1 && this[h]) {
                            if (!j) {
                                if (j = F.call(arguments), dj.set(this, h, j), this[h](), z = dj.get(this, h), dj.set(this, h, false),
                                j !== z) return D.stopImmediatePropagation(), D.preventDefault(), z;
                            } else if ((d.event.special[h] || {}).delegateType) D.stopPropagation();
                        } else if (j) dj.set(this, h, d.event.trigger(j[0], j.slice(1), this)), D.stopPropagation(),
                        D.isImmediatePropagationStopped = FM;
                    }
                });
            }
            d.event = {
                global: {},
                add: function(D, h, z, j, F) {
                    var l, Z, A, q, Q, I, E, X, f, s, L, P = dj.get(D);
                    if (!VB(D)) return;
                    if (z.handler) l = z, z = l.handler, F = l.selector;
                    if (F) d.find.matchesSelector(ol, F);
                    if (!z.guid) z.guid = d.guid++;
                    if (!(q = P.events)) q = P.events = Object.create(null);
                    if (!(Z = P.handle)) Z = P.handle = function(h) {
                        return typeof d !== "undefined" && d.event.triggered !== h.type ? d.event.dispatch.apply(D, arguments) : void 0;
                    };
                    h = (h || "").match(B) || [ "" ], Q = h.length;
                    while (Q--) {
                        if (A = Tm.exec(h[Q]) || [], f = L = A[1], s = (A[2] || "").split(".").sort(), !f) continue;
                        if (E = d.event.special[f] || {}, f = (F ? E.delegateType : E.bindType) || f, E = d.event.special[f] || {},
                        I = d.extend({
                            type: f,
                            origType: L,
                            data: j,
                            handler: z,
                            guid: z.guid,
                            selector: F,
                            needsContext: F && d.expr.match.needsContext.test(F),
                            namespace: s.join(".")
                        }, l), !(X = q[f])) if (X = q[f] = [], X.delegateCount = 0, !E.setup || E.setup.call(D, j, s, Z) === false) if (D.addEventListener) D.addEventListener(f, Z);
                        if (E.add) if (E.add.call(D, I), !I.handler.guid) I.handler.guid = z.guid;
                        if (F) X.splice(X.delegateCount++, 0, I); else X.push(I);
                        d.event.global[f] = true;
                    }
                },
                remove: function(D, h, z, j, F) {
                    var l, Z, A, q, Q, I, E, X, f, s, L, P = dj.hasData(D) && dj.get(D);
                    if (!P || !(q = P.events)) return;
                    h = (h || "").match(B) || [ "" ], Q = h.length;
                    while (Q--) {
                        if (A = Tm.exec(h[Q]) || [], f = L = A[1], s = (A[2] || "").split(".").sort(), !f) {
                            for (f in q) d.event.remove(D, f + h[Q], z, j, true);
                            continue;
                        }
                        E = d.event.special[f] || {}, f = (j ? E.delegateType : E.bindType) || f, X = q[f] || [],
                        A = A[2] && new RegExp("(^|\\.)" + s.join("\\.(?:.*\\.|)") + "(\\.|$)"), Z = l = X.length;
                        while (l--) if (I = X[l], (F || L === I.origType) && (!z || z.guid === I.guid) && (!A || A.test(I.namespace)) && (!j || j === I.selector || j === "**" && I.selector)) {
                            if (X.splice(l, 1), I.selector) X.delegateCount--;
                            if (E.remove) E.remove.call(D, I);
                        }
                        if (Z && !X.length) {
                            if (!E.teardown || E.teardown.call(D, s, P.handle) === false) d.removeEvent(D, f, P.handle);
                            delete q[f];
                        }
                    }
                    if (d.isEmptyObject(q)) dj.remove(D, "handle events");
                },
                dispatch: function(D) {
                    var h, z, j, F, l, Z, A = new Array(arguments.length), q = d.event.fix(D), Q = (dj.get(this, "events") || Object.create(null))[q.type] || [], I = d.event.special[q.type] || {};
                    for (A[0] = q, h = 1; h < arguments.length; h++) A[h] = arguments[h];
                    if (q.delegateTarget = this, I.preDispatch && I.preDispatch.call(this, q) === false) return;
                    Z = d.event.handlers.call(this, q, Q), h = 0;
                    while ((F = Z[h++]) && !q.isPropagationStopped()) {
                        q.currentTarget = F.elem, z = 0;
                        while ((l = F.handlers[z++]) && !q.isImmediatePropagationStopped()) if (!q.rnamespace || l.namespace === false || q.rnamespace.test(l.namespace)) if (q.handleObj = l,
                        q.data = l.data, j = ((d.event.special[l.origType] || {}).handle || l.handler).apply(F.elem, A),
                        j !== void 0) if ((q.result = j) === false) q.preventDefault(), q.stopPropagation();
                    }
                    if (I.postDispatch) I.postDispatch.call(this, q);
                    return q.result;
                },
                handlers: function(D, h) {
                    var z, j, F, l, Z, A = [], q = h.delegateCount, Q = D.target;
                    if (q && Q.nodeType && !(D.type === "click" && D.button >= 1)) for (;Q !== this; Q = Q.parentNode || this) if (Q.nodeType === 1 && !(D.type === "click" && Q.disabled === true)) {
                        for (l = [], Z = {}, z = 0; z < q; z++) {
                            if (j = h[z], F = j.selector + " ", Z[F] === void 0) Z[F] = j.needsContext ? d(F, this).index(Q) > -1 : d.find(F, this, null, [ Q ]).length;
                            if (Z[F]) l.push(j);
                        }
                        if (l.length) A.push({
                            elem: Q,
                            handlers: l
                        });
                    }
                    if (Q = this, q < h.length) A.push({
                        elem: Q,
                        handlers: h.slice(q)
                    });
                    return A;
                },
                addProp: function(D, h) {
                    Object.defineProperty(d.Event.prototype, D, {
                        enumerable: true,
                        configurable: true,
                        get: s(h) ? function() {
                            if (this.originalEvent) return h(this.originalEvent);
                        } : function() {
                            if (this.originalEvent) return this.originalEvent[D];
                        },
                        set: function(h) {
                            Object.defineProperty(this, D, {
                                enumerable: true,
                                configurable: true,
                                writable: true,
                                value: h
                            });
                        }
                    });
                },
                fix: function(D) {
                    return D[d.expando] ? D : new d.Event(D);
                },
                special: {
                    load: {
                        noBubble: true
                    },
                    click: {
                        setup: function(D) {
                            var h = this || D;
                            if (By.test(h.type) && h.click && K(h, "input")) cz(h, "click", true);
                            return false;
                        },
                        trigger: function(D) {
                            var h = this || D;
                            if (By.test(h.type) && h.click && K(h, "input")) cz(h, "click");
                            return true;
                        },
                        _default: function(D) {
                            var h = D.target;
                            return By.test(h.type) && h.click && K(h, "input") && dj.get(h, "click") || K(h, "a");
                        }
                    },
                    beforeunload: {
                        postDispatch: function(D) {
                            if (D.result !== void 0 && D.originalEvent) D.originalEvent.returnValue = D.result;
                        }
                    }
                }
            }, d.removeEvent = function(D, h, z) {
                if (D.removeEventListener) D.removeEventListener(h, z);
            }, d.Event = function(D, h) {
                if (!(this instanceof d.Event)) return new d.Event(D, h);
                if (D && D.type) this.originalEvent = D, this.type = D.type, this.isDefaultPrevented = D.defaultPrevented || D.defaultPrevented === void 0 && D.returnValue === false ? FM : oF,
                this.target = D.target && D.target.nodeType === 3 ? D.target.parentNode : D.target,
                this.currentTarget = D.currentTarget, this.relatedTarget = D.relatedTarget; else this.type = D;
                if (h) d.extend(this, h);
                this.timeStamp = D && D.timeStamp || Date.now(), this[d.expando] = true;
            }, d.Event.prototype = {
                constructor: d.Event,
                isDefaultPrevented: oF,
                isPropagationStopped: oF,
                isImmediatePropagationStopped: oF,
                isSimulated: false,
                preventDefault: function() {
                    var D = this.originalEvent;
                    if (this.isDefaultPrevented = FM, D && !this.isSimulated) D.preventDefault();
                },
                stopPropagation: function() {
                    var D = this.originalEvent;
                    if (this.isPropagationStopped = FM, D && !this.isSimulated) D.stopPropagation();
                },
                stopImmediatePropagation: function() {
                    var D = this.originalEvent;
                    if (this.isImmediatePropagationStopped = FM, D && !this.isSimulated) D.stopImmediatePropagation();
                    this.stopPropagation();
                }
            }, d.each({
                altKey: true,
                bubbles: true,
                cancelable: true,
                changedTouches: true,
                ctrlKey: true,
                detail: true,
                eventPhase: true,
                metaKey: true,
                pageX: true,
                pageY: true,
                shiftKey: true,
                view: true,
                char: true,
                code: true,
                charCode: true,
                key: true,
                keyCode: true,
                button: true,
                buttons: true,
                clientX: true,
                clientY: true,
                offsetX: true,
                offsetY: true,
                pointerId: true,
                pointerType: true,
                screenX: true,
                screenY: true,
                targetTouches: true,
                toElement: true,
                touches: true,
                which: true
            }, d.event.addProp), d.each({
                focus: "focusin",
                blur: "focusout"
            }, (function(D, h) {
                function z(D) {
                    if (P.documentMode) {
                        var z = dj.get(this, "handle"), j = d.event.fix(D);
                        if (j.type = D.type === "focusin" ? "focus" : "blur", j.isSimulated = true, z(D),
                        j.target === j.currentTarget) z(j);
                    } else d.event.simulate(h, D.target, d.event.fix(D));
                }
                d.event.special[D] = {
                    setup: function() {
                        var j;
                        if (cz(this, D, true), P.documentMode) {
                            if (j = dj.get(this, h), !j) this.addEventListener(h, z);
                            dj.set(this, h, (j || 0) + 1);
                        } else return false;
                    },
                    trigger: function() {
                        return cz(this, D), true;
                    },
                    teardown: function() {
                        var D;
                        if (P.documentMode) if (D = dj.get(this, h) - 1, !D) this.removeEventListener(h, z),
                        dj.remove(this, h); else dj.set(this, h, D); else return false;
                    },
                    _default: function(h) {
                        return dj.get(h.target, D);
                    },
                    delegateType: h
                }, d.event.special[h] = {
                    setup: function() {
                        var j = this.ownerDocument || this.document || this, F = P.documentMode ? this : j, l = dj.get(F, h);
                        if (!l) if (P.documentMode) this.addEventListener(h, z); else j.addEventListener(D, z, true);
                        dj.set(F, h, (l || 0) + 1);
                    },
                    teardown: function() {
                        var j = this.ownerDocument || this.document || this, F = P.documentMode ? this : j, l = dj.get(F, h) - 1;
                        if (!l) {
                            if (P.documentMode) this.removeEventListener(h, z); else j.removeEventListener(D, z, true);
                            dj.remove(F, h);
                        } else dj.set(F, h, l);
                    }
                };
            })), d.each({
                mouseenter: "mouseover",
                mouseleave: "mouseout",
                pointerenter: "pointerover",
                pointerleave: "pointerout"
            }, (function(D, h) {
                d.event.special[D] = {
                    delegateType: h,
                    bindType: h,
                    handle: function(D) {
                        var z, j = this, F = D.relatedTarget, l = D.handleObj;
                        if (!F || F !== j && !d.contains(j, F)) D.type = l.origType, z = l.handler.apply(this, arguments),
                        D.type = h;
                        return z;
                    }
                };
            })), d.fn.extend({
                on: function(D, h, z, j) {
                    return an(this, D, h, z, j);
                },
                one: function(D, h, z, j) {
                    return an(this, D, h, z, j, 1);
                },
                off: function(D, h, z) {
                    var j, F;
                    if (D && D.preventDefault && D.handleObj) return j = D.handleObj, d(D.delegateTarget).off(j.namespace ? j.origType + "." + j.namespace : j.origType, j.selector, j.handler),
                    this;
                    if (typeof D === "object") {
                        for (F in D) this.off(F, h, D[F]);
                        return this;
                    }
                    if (h === false || typeof h === "function") z = h, h = void 0;
                    if (z === false) z = oF;
                    return this.each((function() {
                        d.event.remove(this, D, z, h);
                    }));
                }
            });
            var Md = /<script|<style|<link/i, gU = /checked\s*(?:[^=]|=\s*.checked.)/i, xZ = /^\s*<!\[CDATA\[|\]\]>\s*$/g;
            function YJ(D, h) {
                if (K(D, "table") && K(h.nodeType !== 11 ? h : h.firstChild, "tr")) return d(D).children("tbody")[0] || D;
                return D;
            }
            function oC(D) {
                return D.type = (D.getAttribute("type") !== null) + "/" + D.type, D;
            }
            function jg(D) {
                if ((D.type || "").slice(0, 5) === "true/") D.type = D.type.slice(5); else D.removeAttribute("type");
                return D;
            }
            function ll(D, h) {
                var z, j, F, l, Z, A, q;
                if (h.nodeType !== 1) return;
                if (dj.hasData(D)) if (l = dj.get(D), q = l.events, q) for (F in dj.remove(h, "handle events"),
                q) for (z = 0, j = q[F].length; z < j; z++) d.event.add(h, F, q[F][z]);
                if (Su.hasData(D)) Z = Su.access(D), A = d.extend({}, Z), Su.set(h, A);
            }
            function aJ(D, h) {
                var z = h.nodeName.toLowerCase();
                if (z === "input" && By.test(D.type)) h.checked = D.checked; else if (z === "input" || z === "textarea") h.defaultValue = D.defaultValue;
            }
            function nz(D, h, z, j) {
                h = l(h);
                var F, Z, A, q, Q, I, E = 0, X = D.length, L = X - 1, P = h[0], x = s(P);
                if (x || X > 1 && typeof P === "string" && !f.checkClone && gU.test(P)) return D.each((function(F) {
                    var l = D.eq(F);
                    if (x) h[0] = P.call(this, F, l.html());
                    nz(l, h, z, j);
                }));
                if (X) {
                    if (F = PG(h, D[0].ownerDocument, false, D, j), Z = F.firstChild, F.childNodes.length === 1) F = Z;
                    if (Z || j) {
                        for (A = d.map(Az(F, "script"), oC), q = A.length; E < X; E++) {
                            if (Q = F, E !== L) if (Q = d.clone(Q, true, true), q) d.merge(A, Az(Q, "script"));
                            z.call(D[E], Q, E);
                        }
                        if (q) for (I = A[A.length - 1].ownerDocument, d.map(A, jg), E = 0; E < q; E++) if (Q = A[E],
                        kn.test(Q.type || "") && !dj.access(Q, "globalEval") && d.contains(I, Q)) if (Q.src && (Q.type || "").toLowerCase() !== "module") {
                            if (d._evalUrl && !Q.noModule) d._evalUrl(Q.src, {
                                nonce: Q.nonce || Q.getAttribute("nonce")
                            }, I);
                        } else n(Q.textContent.replace(xZ, ""), Q, I);
                    }
                }
                return D;
            }
            function lJ(D, h, z) {
                for (var j, F = h ? d.filter(h, D) : D, l = 0; (j = F[l]) != null; l++) {
                    if (!z && j.nodeType === 1) d.cleanData(Az(j));
                    if (j.parentNode) {
                        if (z && tR(j)) vS(Az(j, "script"));
                        j.parentNode.removeChild(j);
                    }
                }
                return D;
            }
            d.extend({
                htmlPrefilter: function(D) {
                    return D;
                },
                clone: function(D, h, z) {
                    var j, F, l, Z, A = D.cloneNode(true), q = tR(D);
                    if (!f.noCloneChecked && (D.nodeType === 1 || D.nodeType === 11) && !d.isXMLDoc(D)) for (Z = Az(A),
                    l = Az(D), j = 0, F = l.length; j < F; j++) aJ(l[j], Z[j]);
                    if (h) if (z) for (l = l || Az(D), Z = Z || Az(A), j = 0, F = l.length; j < F; j++) ll(l[j], Z[j]); else ll(D, A);
                    if (Z = Az(A, "script"), Z.length > 0) vS(Z, !q && Az(D, "script"));
                    return A;
                },
                cleanData: function(D) {
                    for (var h, z, j, F = d.event.special, l = 0; (z = D[l]) !== void 0; l++) if (VB(z)) {
                        if (h = z[dj.expando]) {
                            if (h.events) for (j in h.events) if (F[j]) d.event.remove(z, j); else d.removeEvent(z, j, h.handle);
                            z[dj.expando] = void 0;
                        }
                        if (z[Su.expando]) z[Su.expando] = void 0;
                    }
                }
            }), d.fn.extend({
                detach: function(D) {
                    return lJ(this, D, true);
                },
                remove: function(D) {
                    return lJ(this, D);
                },
                text: function(D) {
                    return Ar(this, (function(D) {
                        return D === void 0 ? d.text(this) : this.empty().each((function() {
                            if (this.nodeType === 1 || this.nodeType === 11 || this.nodeType === 9) this.textContent = D;
                        }));
                    }), null, D, arguments.length);
                },
                append: function() {
                    return nz(this, arguments, (function(D) {
                        if (this.nodeType === 1 || this.nodeType === 11 || this.nodeType === 9) {
                            var h = YJ(this, D);
                            h.appendChild(D);
                        }
                    }));
                },
                prepend: function() {
                    return nz(this, arguments, (function(D) {
                        if (this.nodeType === 1 || this.nodeType === 11 || this.nodeType === 9) {
                            var h = YJ(this, D);
                            h.insertBefore(D, h.firstChild);
                        }
                    }));
                },
                before: function() {
                    return nz(this, arguments, (function(D) {
                        if (this.parentNode) this.parentNode.insertBefore(D, this);
                    }));
                },
                after: function() {
                    return nz(this, arguments, (function(D) {
                        if (this.parentNode) this.parentNode.insertBefore(D, this.nextSibling);
                    }));
                },
                empty: function() {
                    for (var D, h = 0; (D = this[h]) != null; h++) if (D.nodeType === 1) d.cleanData(Az(D, false)),
                    D.textContent = "";
                    return this;
                },
                clone: function(D, h) {
                    return D = D == null ? false : D, h = h == null ? D : h, this.map((function() {
                        return d.clone(this, D, h);
                    }));
                },
                html: function(D) {
                    return Ar(this, (function(D) {
                        var h = this[0] || {}, z = 0, j = this.length;
                        if (D === void 0 && h.nodeType === 1) return h.innerHTML;
                        if (typeof D === "string" && !Md.test(D) && !rG[(vF.exec(D) || [ "", "" ])[1].toLowerCase()]) {
                            D = d.htmlPrefilter(D);
                            try {
                                for (;z < j; z++) if (h = this[z] || {}, h.nodeType === 1) d.cleanData(Az(h, false)),
                                h.innerHTML = D;
                                h = 0;
                            } catch (D) {}
                        }
                        if (h) this.empty().append(D);
                    }), null, D, arguments.length);
                },
                replaceWith: function() {
                    var D = [];
                    return nz(this, arguments, (function(h) {
                        var z = this.parentNode;
                        if (d.inArray(this, D) < 0) if (d.cleanData(Az(this)), z) z.replaceChild(h, this);
                    }), D);
                }
            }), d.each({
                appendTo: "append",
                prependTo: "prepend",
                insertBefore: "before",
                insertAfter: "after",
                replaceAll: "replaceWith"
            }, (function(D, h) {
                d.fn[D] = function(D) {
                    for (var z, j = [], F = d(D), l = F.length - 1, A = 0; A <= l; A++) z = A === l ? this : this.clone(true),
                    d(F[A])[h](z), Z.apply(j, z.get());
                    return this.pushStack(j);
                };
            }));
            var Xv = new RegExp("^(" + BW + ")(?!px)[a-z%]+$", "i"), WY = /^--/, KY = function(h) {
                var z = h.ownerDocument.defaultView;
                if (!z || !z.opener) z = D;
                return z.getComputedStyle(h);
            }, WJ = function(D, h, z) {
                var j, F, l = {};
                for (F in h) l[F] = D.style[F], D.style[F] = h[F];
                for (F in j = z.call(D), h) D.style[F] = l[F];
                return j;
            }, PP = new RegExp(mX.join("|"), "i");
            function ce(D, h, z) {
                var j, F, l, Z, A = WY.test(h), q = D.style;
                if (z = z || KY(D), z) {
                    if (Z = z.getPropertyValue(h) || z[h], A && Z) Z = Z.replace(e, "$1") || void 0;
                    if (Z === "" && !tR(D)) Z = d.style(D, h);
                    if (!f.pixelBoxStyles() && Xv.test(Z) && PP.test(h)) j = q.width, F = q.minWidth,
                    l = q.maxWidth, q.minWidth = q.maxWidth = q.width = Z, Z = z.width, q.width = j,
                    q.minWidth = F, q.maxWidth = l;
                }
                return Z !== void 0 ? Z + "" : Z;
            }
            function OK(D, h) {
                return {
                    get: function() {
                        if (D()) return void delete this.get;
                        return (this.get = h).apply(this, arguments);
                    }
                };
            }
            (function() {
                function h() {
                    if (!I) return;
                    Q.style.cssText = "position:absolute;left:-11111px;width:60px;" + "margin-top:1px;padding:0;border:0",
                    I.style.cssText = "position:relative;display:block;box-sizing:border-box;overflow:scroll;" + "margin:auto;border:1px;padding:1px;" + "width:60%;top:1%",
                    ol.appendChild(Q).appendChild(I);
                    var h = D.getComputedStyle(I);
                    j = h.top !== "1%", q = z(h.marginLeft) === 12, I.style.right = "60%", Z = z(h.right) === 36,
                    F = z(h.width) === 36, I.style.position = "absolute", l = z(I.offsetWidth / 3) === 12,
                    ol.removeChild(Q), I = null;
                }
                function z(D) {
                    return Math.round(parseFloat(D));
                }
                var j, F, l, Z, A, q, Q = P.createElement("div"), I = P.createElement("div");
                if (!I.style) return;
                I.style.backgroundClip = "content-box", I.cloneNode(true).style.backgroundClip = "",
                f.clearCloneStyle = I.style.backgroundClip === "content-box", d.extend(f, {
                    boxSizingReliable: function() {
                        return h(), F;
                    },
                    pixelBoxStyles: function() {
                        return h(), Z;
                    },
                    pixelPosition: function() {
                        return h(), j;
                    },
                    reliableMarginLeft: function() {
                        return h(), q;
                    },
                    scrollboxSize: function() {
                        return h(), l;
                    },
                    reliableTrDimensions: function() {
                        var h, z, j, F;
                        if (A == null) h = P.createElement("table"), z = P.createElement("tr"), j = P.createElement("div"),
                        h.style.cssText = "position:absolute;left:-11111px;border-collapse:separate", z.style.cssText = "border:1px solid",
                        z.style.height = "1px", j.style.height = "9px", j.style.display = "block", ol.appendChild(h).appendChild(z).appendChild(j),
                        F = D.getComputedStyle(z), A = parseInt(F.height, 10) + parseInt(F.borderTopWidth, 10) + parseInt(F.borderBottomWidth, 10) === z.offsetHeight,
                        ol.removeChild(h);
                        return A;
                    }
                });
            })();
            var bv = [ "Webkit", "Moz", "ms" ], je = P.createElement("div").style, HO = {};
            function pd(D) {
                var h = D[0].toUpperCase() + D.slice(1), z = bv.length;
                while (z--) if (D = bv[z] + h, D in je) return D;
            }
            function sd(D) {
                var h = d.cssProps[D] || HO[D];
                if (h) return h;
                if (D in je) return D;
                return HO[D] = pd(D) || D;
            }
            var Cb = /^(none|table(?!-c[ea]).+)/, Ll = {
                position: "absolute",
                visibility: "hidden",
                display: "block"
            }, gH = {
                letterSpacing: "0",
                fontWeight: "400"
            };
            function Bq(D, h, z) {
                var j = yi.exec(h);
                return j ? Math.max(0, j[2] - (z || 0)) + (j[3] || "px") : h;
            }
            function fB(D, h, z, j, F, l) {
                var Z = h === "width" ? 1 : 0, A = 0, q = 0, Q = 0;
                if (z === (j ? "border" : "content")) return 0;
                for (;Z < 4; Z += 2) {
                    if (z === "margin") Q += d.css(D, z + mX[Z], true, F);
                    if (!j) if (q += d.css(D, "padding" + mX[Z], true, F), z !== "padding") q += d.css(D, "border" + mX[Z] + "Width", true, F); else A += d.css(D, "border" + mX[Z] + "Width", true, F); else {
                        if (z === "content") q -= d.css(D, "padding" + mX[Z], true, F);
                        if (z !== "margin") q -= d.css(D, "border" + mX[Z] + "Width", true, F);
                    }
                }
                if (!j && l >= 0) q += Math.max(0, Math.ceil(D["offset" + h[0].toUpperCase() + h.slice(1)] - l - q - A - .5)) || 0;
                return q + Q;
            }
            function GJ(D, h, z) {
                var j = KY(D), F = !f.boxSizingReliable() || z, l = F && d.css(D, "boxSizing", false, j) === "border-box", Z = l, A = ce(D, h, j), q = "offset" + h[0].toUpperCase() + h.slice(1);
                if (Xv.test(A)) {
                    if (!z) return A;
                    A = "auto";
                }
                if ((!f.boxSizingReliable() && l || !f.reliableTrDimensions() && K(D, "tr") || A === "auto" || !parseFloat(A) && d.css(D, "display", false, j) === "inline") && D.getClientRects().length) if (l = d.css(D, "boxSizing", false, j) === "border-box",
                Z = q in D, Z) A = D[q];
                return A = parseFloat(A) || 0, A + fB(D, h, z || (l ? "border" : "content"), Z, j, A) + "px";
            }
            function fd(D, h, z, j, F) {
                return new fd.prototype.init(D, h, z, j, F);
            }
            d.extend({
                cssHooks: {
                    opacity: {
                        get: function(D, h) {
                            if (h) {
                                var z = ce(D, "opacity");
                                return z === "" ? "1" : z;
                            }
                        }
                    }
                },
                cssNumber: {
                    animationIterationCount: true,
                    aspectRatio: true,
                    borderImageSlice: true,
                    columnCount: true,
                    flexGrow: true,
                    flexShrink: true,
                    fontWeight: true,
                    gridArea: true,
                    gridColumn: true,
                    gridColumnEnd: true,
                    gridColumnStart: true,
                    gridRow: true,
                    gridRowEnd: true,
                    gridRowStart: true,
                    lineHeight: true,
                    opacity: true,
                    order: true,
                    orphans: true,
                    scale: true,
                    widows: true,
                    zIndex: true,
                    zoom: true,
                    fillOpacity: true,
                    floodOpacity: true,
                    stopOpacity: true,
                    strokeMiterlimit: true,
                    strokeOpacity: true
                },
                cssProps: {},
                style: function(D, h, z, j) {
                    if (!D || D.nodeType === 3 || D.nodeType === 8 || !D.style) return;
                    var F, l, Z, A = hO(h), q = WY.test(h), Q = D.style;
                    if (!q) h = sd(A);
                    if (Z = d.cssHooks[h] || d.cssHooks[A], z !== void 0) {
                        if (l = typeof z, l === "string" && (F = yi.exec(z)) && F[1]) z = LL(D, h, F), l = "number";
                        if (z == null || z !== z) return;
                        if (l === "number" && !q) z += F && F[3] || (d.cssNumber[A] ? "" : "px");
                        if (!f.clearCloneStyle && z === "" && h.indexOf("background") === 0) Q[h] = "inherit";
                        if (!Z || !("set" in Z) || (z = Z.set(D, z, j)) !== void 0) if (q) Q.setProperty(h, z); else Q[h] = z;
                    } else {
                        if (Z && "get" in Z && (F = Z.get(D, false, j)) !== void 0) return F;
                        return Q[h];
                    }
                },
                css: function(D, h, z, j) {
                    var F, l, Z, A = hO(h), q = WY.test(h);
                    if (!q) h = sd(A);
                    if (Z = d.cssHooks[h] || d.cssHooks[A], Z && "get" in Z) F = Z.get(D, true, z);
                    if (F === void 0) F = ce(D, h, j);
                    if (F === "normal" && h in gH) F = gH[h];
                    if (z === "" || z) return l = parseFloat(F), z === true || isFinite(l) ? l || 0 : F;
                    return F;
                }
            }), d.each([ "height", "width" ], (function(D, h) {
                d.cssHooks[h] = {
                    get: function(D, z, j) {
                        if (z) return Cb.test(d.css(D, "display")) && (!D.getClientRects().length || !D.getBoundingClientRect().width) ? WJ(D, Ll, (function() {
                            return GJ(D, h, j);
                        })) : GJ(D, h, j);
                    },
                    set: function(D, z, j) {
                        var F, l = KY(D), Z = !f.scrollboxSize() && l.position === "absolute", A = Z || j, q = A && d.css(D, "boxSizing", false, l) === "border-box", Q = j ? fB(D, h, j, q, l) : 0;
                        if (q && Z) Q -= Math.ceil(D["offset" + h[0].toUpperCase() + h.slice(1)] - parseFloat(l[h]) - fB(D, h, "border", false, l) - .5);
                        if (Q && (F = yi.exec(z)) && (F[3] || "px") !== "px") D.style[h] = z, z = d.css(D, h);
                        return Bq(D, z, Q);
                    }
                };
            })), d.cssHooks.marginLeft = OK(f.reliableMarginLeft, (function(D, h) {
                if (h) return (parseFloat(ce(D, "marginLeft")) || D.getBoundingClientRect().left - WJ(D, {
                    marginLeft: 0
                }, (function() {
                    return D.getBoundingClientRect().left;
                }))) + "px";
            })), d.each({
                margin: "",
                padding: "",
                border: "Width"
            }, (function(D, h) {
                if (d.cssHooks[D + h] = {
                    expand: function(z) {
                        for (var j = 0, F = {}, l = typeof z === "string" ? z.split(" ") : [ z ]; j < 4; j++) F[D + mX[j] + h] = l[j] || l[j - 2] || l[0];
                        return F;
                    }
                }, D !== "margin") d.cssHooks[D + h].set = Bq;
            })), d.fn.extend({
                css: function(D, h) {
                    return Ar(this, (function(D, h, z) {
                        var j, F, l = {}, Z = 0;
                        if (Array.isArray(h)) {
                            for (j = KY(D), F = h.length; Z < F; Z++) l[h[Z]] = d.css(D, h[Z], false, j);
                            return l;
                        }
                        return z !== void 0 ? d.style(D, h, z) : d.css(D, h);
                    }), D, h, arguments.length > 1);
                }
            }), d.Tween = fd, fd.prototype = {
                constructor: fd,
                init: function(D, h, z, j, F, l) {
                    this.elem = D, this.prop = z, this.easing = F || d.easing._default, this.options = h,
                    this.start = this.now = this.cur(), this.end = j, this.unit = l || (d.cssNumber[z] ? "" : "px");
                },
                cur: function() {
                    var D = fd.propHooks[this.prop];
                    return D && D.get ? D.get(this) : fd.propHooks._default.get(this);
                },
                run: function(D) {
                    var h, z = fd.propHooks[this.prop];
                    if (this.options.duration) this.pos = h = d.easing[this.easing](D, this.options.duration * D, 0, 1, this.options.duration); else this.pos = h = D;
                    if (this.now = (this.end - this.start) * h + this.start, this.options.step) this.options.step.call(this.elem, this.now, this);
                    if (z && z.set) z.set(this); else fd.propHooks._default.set(this);
                    return this;
                }
            }, fd.prototype.init.prototype = fd.prototype, fd.propHooks = {
                _default: {
                    get: function(D) {
                        var h;
                        if (D.elem.nodeType !== 1 || D.elem[D.prop] != null && D.elem.style[D.prop] == null) return D.elem[D.prop];
                        return h = d.css(D.elem, D.prop, ""), !h || h === "auto" ? 0 : h;
                    },
                    set: function(D) {
                        if (d.fx.step[D.prop]) d.fx.step[D.prop](D); else if (D.elem.nodeType === 1 && (d.cssHooks[D.prop] || D.elem.style[sd(D.prop)] != null)) d.style(D.elem, D.prop, D.now + D.unit); else D.elem[D.prop] = D.now;
                    }
                }
            }, fd.propHooks.scrollTop = fd.propHooks.scrollLeft = {
                set: function(D) {
                    if (D.elem.nodeType && D.elem.parentNode) D.elem[D.prop] = D.now;
                }
            }, d.easing = {
                linear: function(D) {
                    return D;
                },
                swing: function(D) {
                    return .5 - Math.cos(D * Math.PI) / 2;
                },
                _default: "swing"
            }, d.fx = fd.prototype.init, d.fx.step = {};
            var YS, Bn, Tk = /^(?:toggle|show|hide)$/, WI = /queueHooks$/;
            function fU() {
                if (Bn) {
                    if (P.hidden === false && D.requestAnimationFrame) D.requestAnimationFrame(fU); else D.setTimeout(fU, d.fx.interval);
                    d.fx.tick();
                }
            }
            function FC() {
                return D.setTimeout((function() {
                    YS = void 0;
                })), YS = Date.now();
            }
            function Ri(D, h) {
                var z, j = 0, F = {
                    height: D
                };
                for (h = h ? 1 : 0; j < 4; j += 2 - h) z = mX[j], F["margin" + z] = F["padding" + z] = D;
                if (h) F.opacity = F.width = D;
                return F;
            }
            function OV(D, h, z) {
                for (var j, F = (Iz.tweeners[h] || []).concat(Iz.tweeners["*"]), l = 0, Z = F.length; l < Z; l++) if (j = F[l].call(z, h, D)) return j;
            }
            function UE(D, h, z) {
                var j, F, l, Z, A, q, Q, I, E = "width" in h || "height" in h, X = this, f = {}, s = D.style, L = D.nodeType && qe(D), P = dj.get(D, "fxshow");
                if (!z.queue) {
                    if (Z = d._queueHooks(D, "fx"), Z.unqueued == null) Z.unqueued = 0, A = Z.empty.fire,
                    Z.empty.fire = function() {
                        if (!Z.unqueued) A();
                    };
                    Z.unqueued++, X.always((function() {
                        X.always((function() {
                            if (Z.unqueued--, !d.queue(D, "fx").length) Z.empty.fire();
                        }));
                    }));
                }
                for (j in h) if (F = h[j], Tk.test(F)) {
                    if (delete h[j], l = l || F === "toggle", F === (L ? "hide" : "show")) if (F === "show" && P && P[j] !== void 0) L = true; else continue;
                    f[j] = P && P[j] || d.style(D, j);
                }
                if (q = !d.isEmptyObject(h), !q && d.isEmptyObject(f)) return;
                if (E && D.nodeType === 1) {
                    if (z.overflow = [ s.overflow, s.overflowX, s.overflowY ], Q = P && P.display, Q == null) Q = dj.get(D, "display");
                    if (I = d.css(D, "display"), I === "none") if (Q) I = Q; else Tx([ D ], true), Q = D.style.display || Q,
                    I = d.css(D, "display"), Tx([ D ]);
                    if (I === "inline" || I === "inline-block" && Q != null) if (d.css(D, "float") === "none") {
                        if (!q) if (X.done((function() {
                            s.display = Q;
                        })), Q == null) I = s.display, Q = I === "none" ? "" : I;
                        s.display = "inline-block";
                    }
                }
                if (z.overflow) s.overflow = "hidden", X.always((function() {
                    s.overflow = z.overflow[0], s.overflowX = z.overflow[1], s.overflowY = z.overflow[2];
                }));
                for (j in q = false, f) {
                    if (!q) {
                        if (P) {
                            if ("hidden" in P) L = P.hidden;
                        } else P = dj.access(D, "fxshow", {
                            display: Q
                        });
                        if (l) P.hidden = !L;
                        if (L) Tx([ D ], true);
                        X.done((function() {
                            if (!L) Tx([ D ]);
                            for (j in dj.remove(D, "fxshow"), f) d.style(D, j, f[j]);
                        }));
                    }
                    if (q = OV(L ? P[j] : 0, j, X), !(j in P)) if (P[j] = q.start, L) q.end = q.start,
                    q.start = 0;
                }
            }
            function Sg(D, h) {
                var z, j, F, l, Z;
                for (z in D) {
                    if (j = hO(z), F = h[j], l = D[z], Array.isArray(l)) F = l[1], l = D[z] = l[0];
                    if (z !== j) D[j] = l, delete D[z];
                    if (Z = d.cssHooks[j], Z && "expand" in Z) {
                        for (z in l = Z.expand(l), delete D[j], l) if (!(z in D)) D[z] = l[z], h[z] = F;
                    } else h[j] = F;
                }
            }
            function Iz(D, h, z) {
                var j, F, l = 0, Z = Iz.prefilters.length, A = d.Deferred().always((function() {
                    delete q.elem;
                })), q = function() {
                    if (F) return false;
                    for (var h = YS || FC(), z = Math.max(0, Q.startTime + Q.duration - h), j = z / Q.duration || 0, l = 1 - j, Z = 0, q = Q.tweens.length; Z < q; Z++) Q.tweens[Z].run(l);
                    if (A.notifyWith(D, [ Q, l, z ]), l < 1 && q) return z;
                    if (!q) A.notifyWith(D, [ Q, 1, 0 ]);
                    return A.resolveWith(D, [ Q ]), false;
                }, Q = A.promise({
                    elem: D,
                    props: d.extend({}, h),
                    opts: d.extend(true, {
                        specialEasing: {},
                        easing: d.easing._default
                    }, z),
                    originalProperties: h,
                    originalOptions: z,
                    startTime: YS || FC(),
                    duration: z.duration,
                    tweens: [],
                    createTween: function(h, z) {
                        var j = d.Tween(D, Q.opts, h, z, Q.opts.specialEasing[h] || Q.opts.easing);
                        return Q.tweens.push(j), j;
                    },
                    stop: function(h) {
                        var z = 0, j = h ? Q.tweens.length : 0;
                        if (F) return this;
                        for (F = true; z < j; z++) Q.tweens[z].run(1);
                        if (h) A.notifyWith(D, [ Q, 1, 0 ]), A.resolveWith(D, [ Q, h ]); else A.rejectWith(D, [ Q, h ]);
                        return this;
                    }
                }), I = Q.props;
                for (Sg(I, Q.opts.specialEasing); l < Z; l++) if (j = Iz.prefilters[l].call(Q, D, I, Q.opts),
                j) {
                    if (s(j.stop)) d._queueHooks(Q.elem, Q.opts.queue).stop = j.stop.bind(j);
                    return j;
                }
                if (d.map(I, OV, Q), s(Q.opts.start)) Q.opts.start.call(D, Q);
                return Q.progress(Q.opts.progress).done(Q.opts.done, Q.opts.complete).fail(Q.opts.fail).always(Q.opts.always),
                d.fx.timer(d.extend(q, {
                    elem: D,
                    anim: Q,
                    queue: Q.opts.queue
                })), Q;
            }
            d.Animation = d.extend(Iz, {
                tweeners: {
                    "*": [ function(D, h) {
                        var z = this.createTween(D, h);
                        return LL(z.elem, D, yi.exec(h), z), z;
                    } ]
                },
                tweener: function(D, h) {
                    if (s(D)) h = D, D = [ "*" ]; else D = D.match(B);
                    for (var z, j = 0, F = D.length; j < F; j++) z = D[j], Iz.tweeners[z] = Iz.tweeners[z] || [],
                    Iz.tweeners[z].unshift(h);
                },
                prefilters: [ UE ],
                prefilter: function(D, h) {
                    if (h) Iz.prefilters.unshift(D); else Iz.prefilters.push(D);
                }
            }), d.speed = function(D, h, z) {
                var j = D && typeof D === "object" ? d.extend({}, D) : {
                    complete: z || !z && h || s(D) && D,
                    duration: D,
                    easing: z && h || h && !s(h) && h
                };
                if (d.fx.off) j.duration = 0; else if (typeof j.duration !== "number") if (j.duration in d.fx.speeds) j.duration = d.fx.speeds[j.duration]; else j.duration = d.fx.speeds._default;
                if (j.queue == null || j.queue === true) j.queue = "fx";
                return j.old = j.complete, j.complete = function() {
                    if (s(j.old)) j.old.call(this);
                    if (j.queue) d.dequeue(this, j.queue);
                }, j;
            }, d.fn.extend({
                fadeTo: function(D, h, z, j) {
                    return this.filter(qe).css("opacity", 0).show().end().animate({
                        opacity: h
                    }, D, z, j);
                },
                animate: function(D, h, z, j) {
                    var F = d.isEmptyObject(D), l = d.speed(h, z, j), Z = function() {
                        var h = Iz(this, d.extend({}, D), l);
                        if (F || dj.get(this, "finish")) h.stop(true);
                    };
                    return Z.finish = Z, F || l.queue === false ? this.each(Z) : this.queue(l.queue, Z);
                },
                stop: function(D, h, z) {
                    var j = function(D) {
                        var h = D.stop;
                        delete D.stop, h(z);
                    };
                    if (typeof D !== "string") z = h, h = D, D = void 0;
                    if (h) this.queue(D || "fx", []);
                    return this.each((function() {
                        var h = true, F = D != null && D + "queueHooks", l = d.timers, Z = dj.get(this);
                        if (F) {
                            if (Z[F] && Z[F].stop) j(Z[F]);
                        } else for (F in Z) if (Z[F] && Z[F].stop && WI.test(F)) j(Z[F]);
                        for (F = l.length; F--; ) if (l[F].elem === this && (D == null || l[F].queue === D)) l[F].anim.stop(z),
                        h = false, l.splice(F, 1);
                        if (h || !z) d.dequeue(this, D);
                    }));
                },
                finish: function(D) {
                    if (D !== false) D = D || "fx";
                    return this.each((function() {
                        var h, z = dj.get(this), j = z[D + "queue"], F = z[D + "queueHooks"], l = d.timers, Z = j ? j.length : 0;
                        if (z.finish = true, d.queue(this, D, []), F && F.stop) F.stop.call(this, true);
                        for (h = l.length; h--; ) if (l[h].elem === this && l[h].queue === D) l[h].anim.stop(true),
                        l.splice(h, 1);
                        for (h = 0; h < Z; h++) if (j[h] && j[h].finish) j[h].finish.call(this);
                        delete z.finish;
                    }));
                }
            }), d.each([ "toggle", "show", "hide" ], (function(D, h) {
                var z = d.fn[h];
                d.fn[h] = function(D, j, F) {
                    return D == null || typeof D === "boolean" ? z.apply(this, arguments) : this.animate(Ri(h, true), D, j, F);
                };
            })), d.each({
                slideDown: Ri("show"),
                slideUp: Ri("hide"),
                slideToggle: Ri("toggle"),
                fadeIn: {
                    opacity: "show"
                },
                fadeOut: {
                    opacity: "hide"
                },
                fadeToggle: {
                    opacity: "toggle"
                }
            }, (function(D, h) {
                d.fn[D] = function(D, z, j) {
                    return this.animate(h, D, z, j);
                };
            })), d.timers = [], d.fx.tick = function() {
                var D, h = 0, z = d.timers;
                for (YS = Date.now(); h < z.length; h++) if (D = z[h], !D() && z[h] === D) z.splice(h--, 1);
                if (!z.length) d.fx.stop();
                YS = void 0;
            }, d.fx.timer = function(D) {
                d.timers.push(D), d.fx.start();
            }, d.fx.interval = 13, d.fx.start = function() {
                if (Bn) return;
                Bn = true, fU();
            }, d.fx.stop = function() {
                Bn = null;
            }, d.fx.speeds = {
                slow: 600,
                fast: 200,
                _default: 400
            }, d.fn.delay = function(h, z) {
                return h = d.fx ? d.fx.speeds[h] || h : h, z = z || "fx", this.queue(z, (function(z, j) {
                    var F = D.setTimeout(z, h);
                    j.stop = function() {
                        D.clearTimeout(F);
                    };
                }));
            }, function() {
                var D = P.createElement("input"), h = P.createElement("select"), z = h.appendChild(P.createElement("option"));
                D.type = "checkbox", f.checkOn = D.value !== "", f.optSelected = z.selected, D = P.createElement("input"),
                D.value = "t", D.type = "radio", f.radioValue = D.value === "t";
            }();
            var YB, Cp = d.expr.attrHandle;
            d.fn.extend({
                attr: function(D, h) {
                    return Ar(this, d.attr, D, h, arguments.length > 1);
                },
                removeAttr: function(D) {
                    return this.each((function() {
                        d.removeAttr(this, D);
                    }));
                }
            }), d.extend({
                attr: function(D, h, z) {
                    var j, F, l = D.nodeType;
                    if (l === 3 || l === 8 || l === 2) return;
                    if (typeof D.getAttribute === "undefined") return d.prop(D, h, z);
                    if (l !== 1 || !d.isXMLDoc(D)) F = d.attrHooks[h.toLowerCase()] || (d.expr.match.bool.test(h) ? YB : void 0);
                    if (z !== void 0) {
                        if (z === null) return void d.removeAttr(D, h);
                        if (F && "set" in F && (j = F.set(D, z, h)) !== void 0) return j;
                        return D.setAttribute(h, z + ""), z;
                    }
                    if (F && "get" in F && (j = F.get(D, h)) !== null) return j;
                    return j = d.find.attr(D, h), j == null ? void 0 : j;
                },
                attrHooks: {
                    type: {
                        set: function(D, h) {
                            if (!f.radioValue && h === "radio" && K(D, "input")) {
                                var z = D.value;
                                if (D.setAttribute("type", h), z) D.value = z;
                                return h;
                            }
                        }
                    }
                },
                removeAttr: function(D, h) {
                    var z, j = 0, F = h && h.match(B);
                    if (F && D.nodeType === 1) while (z = F[j++]) D.removeAttribute(z);
                }
            }), YB = {
                set: function(D, h, z) {
                    if (h === false) d.removeAttr(D, z); else D.setAttribute(z, z);
                    return z;
                }
            }, d.each(d.expr.match.bool.source.match(/\w+/g), (function(D, h) {
                var z = Cp[h] || d.find.attr;
                Cp[h] = function(D, h, j) {
                    var F, l, Z = h.toLowerCase();
                    if (!j) l = Cp[Z], Cp[Z] = F, F = z(D, h, j) != null ? Z : null, Cp[Z] = l;
                    return F;
                };
            }));
            var Af = /^(?:input|select|textarea|button)$/i, yQ = /^(?:a|area)$/i;
            if (d.fn.extend({
                prop: function(D, h) {
                    return Ar(this, d.prop, D, h, arguments.length > 1);
                },
                removeProp: function(D) {
                    return this.each((function() {
                        delete this[d.propFix[D] || D];
                    }));
                }
            }), d.extend({
                prop: function(D, h, z) {
                    var j, F, l = D.nodeType;
                    if (l === 3 || l === 8 || l === 2) return;
                    if (l !== 1 || !d.isXMLDoc(D)) h = d.propFix[h] || h, F = d.propHooks[h];
                    if (z !== void 0) {
                        if (F && "set" in F && (j = F.set(D, z, h)) !== void 0) return j;
                        return D[h] = z;
                    }
                    if (F && "get" in F && (j = F.get(D, h)) !== null) return j;
                    return D[h];
                },
                propHooks: {
                    tabIndex: {
                        get: function(D) {
                            var h = d.find.attr(D, "tabindex");
                            if (h) return parseInt(h, 10);
                            if (Af.test(D.nodeName) || yQ.test(D.nodeName) && D.href) return 0;
                            return -1;
                        }
                    }
                },
                propFix: {
                    for: "htmlFor",
                    class: "className"
                }
            }), !f.optSelected) d.propHooks.selected = {
                get: function(D) {
                    var h = D.parentNode;
                    if (h && h.parentNode) h.parentNode.selectedIndex;
                    return null;
                },
                set: function(D) {
                    var h = D.parentNode;
                    if (h) if (h.selectedIndex, h.parentNode) h.parentNode.selectedIndex;
                }
            };
            function TV(D) {
                var h = D.match(B) || [];
                return h.join(" ");
            }
            function Ta(D) {
                return D.getAttribute && D.getAttribute("class") || "";
            }
            function oB(D) {
                if (Array.isArray(D)) return D;
                if (typeof D === "string") return D.match(B) || [];
                return [];
            }
            d.each([ "tabIndex", "readOnly", "maxLength", "cellSpacing", "cellPadding", "rowSpan", "colSpan", "useMap", "frameBorder", "contentEditable" ], (function() {
                d.propFix[this.toLowerCase()] = this;
            })), d.fn.extend({
                addClass: function(D) {
                    var h, z, j, F, l, Z;
                    if (s(D)) return this.each((function(h) {
                        d(this).addClass(D.call(this, h, Ta(this)));
                    }));
                    if (h = oB(D), h.length) return this.each((function() {
                        if (j = Ta(this), z = this.nodeType === 1 && " " + TV(j) + " ", z) {
                            for (l = 0; l < h.length; l++) if (F = h[l], z.indexOf(" " + F + " ") < 0) z += F + " ";
                            if (Z = TV(z), j !== Z) this.setAttribute("class", Z);
                        }
                    }));
                    return this;
                },
                removeClass: function(D) {
                    var h, z, j, F, l, Z;
                    if (s(D)) return this.each((function(h) {
                        d(this).removeClass(D.call(this, h, Ta(this)));
                    }));
                    if (!arguments.length) return this.attr("class", "");
                    if (h = oB(D), h.length) return this.each((function() {
                        if (j = Ta(this), z = this.nodeType === 1 && " " + TV(j) + " ", z) {
                            for (l = 0; l < h.length; l++) {
                                F = h[l];
                                while (z.indexOf(" " + F + " ") > -1) z = z.replace(" " + F + " ", " ");
                            }
                            if (Z = TV(z), j !== Z) this.setAttribute("class", Z);
                        }
                    }));
                    return this;
                },
                toggleClass: function(D, h) {
                    var z, j, F, l, Z = typeof D, A = Z === "string" || Array.isArray(D);
                    if (s(D)) return this.each((function(z) {
                        d(this).toggleClass(D.call(this, z, Ta(this), h), h);
                    }));
                    if (typeof h === "boolean" && A) return h ? this.addClass(D) : this.removeClass(D);
                    return z = oB(D), this.each((function() {
                        if (A) for (l = d(this), F = 0; F < z.length; F++) if (j = z[F], l.hasClass(j)) l.removeClass(j); else l.addClass(j); else if (D === void 0 || Z === "boolean") {
                            if (j = Ta(this), j) dj.set(this, "__className__", j);
                            if (this.setAttribute) this.setAttribute("class", j || D === false ? "" : dj.get(this, "__className__") || "");
                        }
                    }));
                },
                hasClass: function(D) {
                    var h, z, j = 0;
                    h = " " + D + " ";
                    while (z = this[j++]) if (z.nodeType === 1 && (" " + TV(Ta(z)) + " ").indexOf(h) > -1) return true;
                    return false;
                }
            });
            var te = /\r/g;
            d.fn.extend({
                val: function(D) {
                    var h, z, j, F = this[0];
                    if (!arguments.length) {
                        if (F) {
                            if (h = d.valHooks[F.type] || d.valHooks[F.nodeName.toLowerCase()], h && "get" in h && (z = h.get(F, "value")) !== void 0) return z;
                            if (z = F.value, typeof z === "string") return z.replace(te, "");
                            return z == null ? "" : z;
                        }
                        return;
                    }
                    return j = s(D), this.each((function(z) {
                        var F;
                        if (this.nodeType !== 1) return;
                        if (j) F = D.call(this, z, d(this).val()); else F = D;
                        if (F == null) F = ""; else if (typeof F === "number") F += ""; else if (Array.isArray(F)) F = d.map(F, (function(D) {
                            return D == null ? "" : D + "";
                        }));
                        if (h = d.valHooks[this.type] || d.valHooks[this.nodeName.toLowerCase()], !h || !("set" in h) || h.set(this, F, "value") === void 0) this.value = F;
                    }));
                }
            }), d.extend({
                valHooks: {
                    option: {
                        get: function(D) {
                            var h = d.find.attr(D, "value");
                            return h != null ? h : TV(d.text(D));
                        }
                    },
                    select: {
                        get: function(D) {
                            var h, z, j, F = D.options, l = D.selectedIndex, Z = D.type === "select-one", A = Z ? null : [], q = Z ? l + 1 : F.length;
                            if (l < 0) j = q; else j = Z ? l : 0;
                            for (;j < q; j++) if (z = F[j], (z.selected || j === l) && !z.disabled && (!z.parentNode.disabled || !K(z.parentNode, "optgroup"))) {
                                if (h = d(z).val(), Z) return h;
                                A.push(h);
                            }
                            return A;
                        },
                        set: function(D, h) {
                            var z, j, F = D.options, l = d.makeArray(h), Z = F.length;
                            while (Z--) if (j = F[Z], j.selected = d.inArray(d.valHooks.option.get(j), l) > -1) z = true;
                            if (!z) D.selectedIndex = -1;
                            return l;
                        }
                    }
                }
            }), d.each([ "radio", "checkbox" ], (function() {
                if (d.valHooks[this] = {
                    set: function(D, h) {
                        if (Array.isArray(h)) return D.checked = d.inArray(d(D).val(), h) > -1;
                    }
                }, !f.checkOn) d.valHooks[this].get = function(D) {
                    return D.getAttribute("value") === null ? "on" : D.value;
                };
            }));
            var ID = D.location, pU = {
                guid: Date.now()
            }, zA = /\?/;
            d.parseXML = function(h) {
                var z, j;
                if (!h || typeof h !== "string") return null;
                try {
                    z = (new D.DOMParser).parseFromString(h, "text/xml");
                } catch (D) {}
                if (j = z && z.getElementsByTagName("parsererror")[0], !z || j) d.error("Invalid XML: " + (j ? d.map(j.childNodes, (function(D) {
                    return D.textContent;
                })).join("\n") : h));
                return z;
            };
            var rv = /^(?:focusinfocus|focusoutblur)$/, yq = function(D) {
                D.stopPropagation();
            };
            d.extend(d.event, {
                trigger: function(h, z, j, F) {
                    var l, Z, A, q, Q, E, X, f, x = [ j || P ], n = I.call(h, "type") ? h.type : h, w = I.call(h, "namespace") ? h.namespace.split(".") : [];
                    if (Z = f = A = j = j || P, j.nodeType === 3 || j.nodeType === 8) return;
                    if (rv.test(n + d.event.triggered)) return;
                    if (n.indexOf(".") > -1) w = n.split("."), n = w.shift(), w.sort();
                    if (Q = n.indexOf(":") < 0 && "on" + n, h = h[d.expando] ? h : new d.Event(n, typeof h === "object" && h),
                    h.isTrigger = F ? 2 : 3, h.namespace = w.join("."), h.rnamespace = h.namespace ? new RegExp("(^|\\.)" + w.join("\\.(?:.*\\.|)") + "(\\.|$)") : null,
                    h.result = void 0, !h.target) h.target = j;
                    if (z = z == null ? [ h ] : d.makeArray(z, [ h ]), X = d.event.special[n] || {},
                    !F && X.trigger && X.trigger.apply(j, z) === false) return;
                    if (!F && !X.noBubble && !L(j)) {
                        if (q = X.delegateType || n, !rv.test(q + n)) Z = Z.parentNode;
                        for (;Z; Z = Z.parentNode) x.push(Z), A = Z;
                        if (A === (j.ownerDocument || P)) x.push(A.defaultView || A.parentWindow || D);
                    }
                    l = 0;
                    while ((Z = x[l++]) && !h.isPropagationStopped()) {
                        if (f = Z, h.type = l > 1 ? q : X.bindType || n, E = (dj.get(Z, "events") || Object.create(null))[h.type] && dj.get(Z, "handle"),
                        E) E.apply(Z, z);
                        if (E = Q && Z[Q], E && E.apply && VB(Z)) if (h.result = E.apply(Z, z), h.result === false) h.preventDefault();
                    }
                    if (h.type = n, !F && !h.isDefaultPrevented()) if ((!X._default || X._default.apply(x.pop(), z) === false) && VB(j)) if (Q && s(j[n]) && !L(j)) {
                        if (A = j[Q], A) j[Q] = null;
                        if (d.event.triggered = n, h.isPropagationStopped()) f.addEventListener(n, yq);
                        if (j[n](), h.isPropagationStopped()) f.removeEventListener(n, yq);
                        if (d.event.triggered = void 0, A) j[Q] = A;
                    }
                    return h.result;
                },
                simulate: function(D, h, z) {
                    var j = d.extend(new d.Event, z, {
                        type: D,
                        isSimulated: true
                    });
                    d.event.trigger(j, null, h);
                }
            }), d.fn.extend({
                trigger: function(D, h) {
                    return this.each((function() {
                        d.event.trigger(D, h, this);
                    }));
                },
                triggerHandler: function(D, h) {
                    var z = this[0];
                    if (z) return d.event.trigger(D, h, z, true);
                }
            });
            var fp = /\[\]$/, vN = /\r?\n/g, Te = /^(?:submit|button|image|reset|file)$/i, ju = /^(?:input|select|textarea|keygen)/i;
            function sB(D, h, z, j) {
                var F;
                if (Array.isArray(h)) d.each(h, (function(h, F) {
                    if (z || fp.test(D)) j(D, F); else sB(D + "[" + (typeof F === "object" && F != null ? h : "") + "]", F, z, j);
                })); else if (!z && w(h) === "object") for (F in h) sB(D + "[" + F + "]", h[F], z, j); else j(D, h);
            }
            d.param = function(D, h) {
                var z, j = [], F = function(D, h) {
                    var z = s(h) ? h() : h;
                    j[j.length] = encodeURIComponent(D) + "=" + encodeURIComponent(z == null ? "" : z);
                };
                if (D == null) return "";
                if (Array.isArray(D) || D.jquery && !d.isPlainObject(D)) d.each(D, (function() {
                    F(this.name, this.value);
                })); else for (z in D) sB(z, D[z], h, F);
                return j.join("&");
            }, d.fn.extend({
                serialize: function() {
                    return d.param(this.serializeArray());
                },
                serializeArray: function() {
                    return this.map((function() {
                        var D = d.prop(this, "elements");
                        return D ? d.makeArray(D) : this;
                    })).filter((function() {
                        var D = this.type;
                        return this.name && !d(this).is(":disabled") && ju.test(this.nodeName) && !Te.test(D) && (this.checked || !By.test(D));
                    })).map((function(D, h) {
                        var z = d(this).val();
                        if (z == null) return null;
                        if (Array.isArray(z)) return d.map(z, (function(D) {
                            return {
                                name: h.name,
                                value: D.replace(vN, "\r\n")
                            };
                        }));
                        return {
                            name: h.name,
                            value: z.replace(vN, "\r\n")
                        };
                    })).get();
                }
            });
            var jS = /%20/g, rM = /#.*$/, qM = /([?&])_=[^&]*/, Ja = /^(.*?):[ \t]*([^\r\n]*)$/gm, Qj = /^(?:about|app|app-storage|.+-extension|file|res|widget):$/, cY = /^(?:GET|HEAD)$/, gn = /^\/\//, Kf = {}, Ys = {}, wx = "*/".concat("*"), zD = P.createElement("a");
            function FZ(D) {
                return function(h, z) {
                    if (typeof h !== "string") z = h, h = "*";
                    var j, F = 0, l = h.toLowerCase().match(B) || [];
                    if (s(z)) while (j = l[F++]) if (j[0] === "+") j = j.slice(1) || "*", (D[j] = D[j] || []).unshift(z); else (D[j] = D[j] || []).push(z);
                };
            }
            function qm(D, h, z, j) {
                var F = {}, l = D === Ys;
                function Z(A) {
                    var q;
                    return F[A] = true, d.each(D[A] || [], (function(D, A) {
                        var Q = A(h, z, j);
                        if (typeof Q === "string" && !l && !F[Q]) return h.dataTypes.unshift(Q), Z(Q), false; else if (l) return !(q = Q);
                    })), q;
                }
                return Z(h.dataTypes[0]) || !F["*"] && Z("*");
            }
            function hl(D, h) {
                var z, j, F = d.ajaxSettings.flatOptions || {};
                for (z in h) if (h[z] !== void 0) (F[z] ? D : j || (j = {}))[z] = h[z];
                if (j) d.extend(true, D, j);
                return D;
            }
            function Ap(D, h, z) {
                var j, F, l, Z, A = D.contents, q = D.dataTypes;
                while (q[0] === "*") if (q.shift(), j === void 0) j = D.mimeType || h.getResponseHeader("Content-Type");
                if (j) for (F in A) if (A[F] && A[F].test(j)) {
                    q.unshift(F);
                    break;
                }
                if (q[0] in z) l = q[0]; else {
                    for (F in z) {
                        if (!q[0] || D.converters[F + " " + q[0]]) {
                            l = F;
                            break;
                        }
                        if (!Z) Z = F;
                    }
                    l = l || Z;
                }
                if (l) {
                    if (l !== q[0]) q.unshift(l);
                    return z[l];
                }
            }
            function BC(D, h, z, j) {
                var F, l, Z, A, q, Q = {}, I = D.dataTypes.slice();
                if (I[1]) for (Z in D.converters) Q[Z.toLowerCase()] = D.converters[Z];
                l = I.shift();
                while (l) {
                    if (D.responseFields[l]) z[D.responseFields[l]] = h;
                    if (!q && j && D.dataFilter) h = D.dataFilter(h, D.dataType);
                    if (q = l, l = I.shift(), l) if (l === "*") l = q; else if (q !== "*" && q !== l) {
                        if (Z = Q[q + " " + l] || Q["* " + l], !Z) for (F in Q) if (A = F.split(" "), A[1] === l) if (Z = Q[q + " " + A[0]] || Q["* " + A[0]],
                        Z) {
                            if (Z === true) Z = Q[F]; else if (Q[F] !== true) l = A[0], I.unshift(A[1]);
                            break;
                        }
                        if (Z !== true) if (Z && D.throws) h = Z(h); else try {
                            h = Z(h);
                        } catch (D) {
                            return {
                                state: "parsererror",
                                error: Z ? D : "No conversion from " + q + " to " + l
                            };
                        }
                    }
                }
                return {
                    state: "success",
                    data: h
                };
            }
            zD.href = ID.href, d.extend({
                active: 0,
                lastModified: {},
                etag: {},
                ajaxSettings: {
                    url: ID.href,
                    type: "GET",
                    isLocal: Qj.test(ID.protocol),
                    global: true,
                    processData: true,
                    async: true,
                    contentType: "application/x-www-form-urlencoded; charset=UTF-8",
                    accepts: {
                        "*": wx,
                        text: "text/plain",
                        html: "text/html",
                        xml: "application/xml, text/xml",
                        json: "application/json, text/javascript"
                    },
                    contents: {
                        xml: /\bxml\b/,
                        html: /\bhtml/,
                        json: /\bjson\b/
                    },
                    responseFields: {
                        xml: "responseXML",
                        text: "responseText",
                        json: "responseJSON"
                    },
                    converters: {
                        "* text": String,
                        "text html": true,
                        "text json": JSON.parse,
                        "text xml": d.parseXML
                    },
                    flatOptions: {
                        url: true,
                        context: true
                    }
                },
                ajaxSetup: function(D, h) {
                    return h ? hl(hl(D, d.ajaxSettings), h) : hl(d.ajaxSettings, D);
                },
                ajaxPrefilter: FZ(Kf),
                ajaxTransport: FZ(Ys),
                ajax: function(h, z) {
                    if (typeof h === "object") z = h, h = void 0;
                    z = z || {};
                    var j, F, l, Z, A, q, Q, I, E, X, f = d.ajaxSetup({}, z), s = f.context || f, L = f.context && (s.nodeType || s.jquery) ? d(s) : d.event, x = d.Deferred(), n = d.Callbacks("once memory"), w = f.statusCode || {}, J = {}, a = {}, H = "canceled", K = {
                        readyState: 0,
                        getResponseHeader: function(D) {
                            var h;
                            if (Q) {
                                if (!Z) {
                                    Z = {};
                                    while (h = Ja.exec(l)) Z[h[1].toLowerCase() + " "] = (Z[h[1].toLowerCase() + " "] || []).concat(h[2]);
                                }
                                h = Z[D.toLowerCase() + " "];
                            }
                            return h == null ? null : h.join(", ");
                        },
                        getAllResponseHeaders: function() {
                            return Q ? l : null;
                        },
                        setRequestHeader: function(D, h) {
                            if (Q == null) D = a[D.toLowerCase()] = a[D.toLowerCase()] || D, J[D] = h;
                            return this;
                        },
                        overrideMimeType: function(D) {
                            if (Q == null) f.mimeType = D;
                            return this;
                        },
                        statusCode: function(D) {
                            var h;
                            if (D) if (Q) K.always(D[K.status]); else for (h in D) w[h] = [ w[h], D[h] ];
                            return this;
                        },
                        abort: function(D) {
                            var h = D || H;
                            if (j) j.abort(h);
                            return c(0, h), this;
                        }
                    };
                    if (x.promise(K), f.url = ((h || f.url || ID.href) + "").replace(gn, ID.protocol + "//"),
                    f.type = z.method || z.type || f.method || f.type, f.dataTypes = (f.dataType || "*").toLowerCase().match(B) || [ "" ],
                    f.crossDomain == null) {
                        q = P.createElement("a");
                        try {
                            q.href = f.url, q.href = q.href, f.crossDomain = zD.protocol + "//" + zD.host !== q.protocol + "//" + q.host;
                        } catch (D) {
                            f.crossDomain = true;
                        }
                    }
                    if (f.data && f.processData && typeof f.data !== "string") f.data = d.param(f.data, f.traditional);
                    if (qm(Kf, f, z, K), Q) return K;
                    if (I = d.event && f.global, I && d.active++ === 0) d.event.trigger("ajaxStart");
                    if (f.type = f.type.toUpperCase(), f.hasContent = !cY.test(f.type), F = f.url.replace(rM, ""),
                    !f.hasContent) {
                        if (X = f.url.slice(F.length), f.data && (f.processData || typeof f.data === "string")) F += (zA.test(F) ? "&" : "?") + f.data,
                        delete f.data;
                        if (f.cache === false) F = F.replace(qM, "$1"), X = (zA.test(F) ? "&" : "?") + "_=" + pU.guid++ + X;
                        f.url = F + X;
                    } else if (f.data && f.processData && (f.contentType || "").indexOf("application/x-www-form-urlencoded") === 0) f.data = f.data.replace(jS, "+");
                    if (f.ifModified) {
                        if (d.lastModified[F]) K.setRequestHeader("If-Modified-Since", d.lastModified[F]);
                        if (d.etag[F]) K.setRequestHeader("If-None-Match", d.etag[F]);
                    }
                    if (f.data && f.hasContent && f.contentType !== false || z.contentType) K.setRequestHeader("Content-Type", f.contentType);
                    for (E in K.setRequestHeader("Accept", f.dataTypes[0] && f.accepts[f.dataTypes[0]] ? f.accepts[f.dataTypes[0]] + (f.dataTypes[0] !== "*" ? ", " + wx + "; q=0.01" : "") : f.accepts["*"]),
                    f.headers) K.setRequestHeader(E, f.headers[E]);
                    if (f.beforeSend && (f.beforeSend.call(s, K, f) === false || Q)) return K.abort();
                    if (H = "abort", n.add(f.complete), K.done(f.success), K.fail(f.error), j = qm(Ys, f, z, K),
                    !j) c(-1, "No Transport"); else {
                        if (K.readyState = 1, I) L.trigger("ajaxSend", [ K, f ]);
                        if (Q) return K;
                        if (f.async && f.timeout > 0) A = D.setTimeout((function() {
                            K.abort("timeout");
                        }), f.timeout);
                        try {
                            Q = false, j.send(J, c);
                        } catch (D) {
                            if (Q) throw D;
                            c(-1, D);
                        }
                    }
                    function c(h, z, Z, q) {
                        var E, X, P, J, a, H = z;
                        if (Q) return;
                        if (Q = true, A) D.clearTimeout(A);
                        if (j = void 0, l = q || "", K.readyState = h > 0 ? 4 : 0, E = h >= 200 && h < 300 || h === 304,
                        Z) J = Ap(f, K, Z);
                        if (!E && d.inArray("script", f.dataTypes) > -1 && d.inArray("json", f.dataTypes) < 0) f.converters["text script"] = function() {};
                        if (J = BC(f, J, K, E), E) {
                            if (f.ifModified) {
                                if (a = K.getResponseHeader("Last-Modified"), a) d.lastModified[F] = a;
                                if (a = K.getResponseHeader("etag"), a) d.etag[F] = a;
                            }
                            if (h === 204 || f.type === "HEAD") H = "nocontent"; else if (h === 304) H = "notmodified"; else H = J.state,
                            X = J.data, P = J.error, E = !P;
                        } else if (P = H, h || !H) if (H = "error", h < 0) h = 0;
                        if (K.status = h, K.statusText = (z || H) + "", E) x.resolveWith(s, [ X, H, K ]); else x.rejectWith(s, [ K, H, P ]);
                        if (K.statusCode(w), w = void 0, I) L.trigger(E ? "ajaxSuccess" : "ajaxError", [ K, f, E ? X : P ]);
                        if (n.fireWith(s, [ K, H ]), I) if (L.trigger("ajaxComplete", [ K, f ]), ! --d.active) d.event.trigger("ajaxStop");
                    }
                    return K;
                },
                getJSON: function(D, h, z) {
                    return d.get(D, h, z, "json");
                },
                getScript: function(D, h) {
                    return d.get(D, void 0, h, "script");
                }
            }), d.each([ "get", "post" ], (function(D, h) {
                d[h] = function(D, z, j, F) {
                    if (s(z)) F = F || j, j = z, z = void 0;
                    return d.ajax(d.extend({
                        url: D,
                        type: h,
                        dataType: F,
                        data: z,
                        success: j
                    }, d.isPlainObject(D) && D));
                };
            })), d.ajaxPrefilter((function(D) {
                var h;
                for (h in D.headers) if (h.toLowerCase() === "content-type") D.contentType = D.headers[h] || "";
            })), d._evalUrl = function(D, h, z) {
                return d.ajax({
                    url: D,
                    type: "GET",
                    dataType: "script",
                    cache: true,
                    async: false,
                    global: false,
                    converters: {
                        "text script": function() {}
                    },
                    dataFilter: function(D) {
                        d.globalEval(D, h, z);
                    }
                });
            }, d.fn.extend({
                wrapAll: function(D) {
                    var h;
                    if (this[0]) {
                        if (s(D)) D = D.call(this[0]);
                        if (h = d(D, this[0].ownerDocument).eq(0).clone(true), this[0].parentNode) h.insertBefore(this[0]);
                        h.map((function() {
                            var D = this;
                            while (D.firstElementChild) D = D.firstElementChild;
                            return D;
                        })).append(this);
                    }
                    return this;
                },
                wrapInner: function(D) {
                    if (s(D)) return this.each((function(h) {
                        d(this).wrapInner(D.call(this, h));
                    }));
                    return this.each((function() {
                        var h = d(this), z = h.contents();
                        if (z.length) z.wrapAll(D); else h.append(D);
                    }));
                },
                wrap: function(D) {
                    var h = s(D);
                    return this.each((function(z) {
                        d(this).wrapAll(h ? D.call(this, z) : D);
                    }));
                },
                unwrap: function(D) {
                    return this.parent(D).not("body").each((function() {
                        d(this).replaceWith(this.childNodes);
                    })), this;
                }
            }), d.expr.pseudos.hidden = function(D) {
                return !d.expr.pseudos.visible(D);
            }, d.expr.pseudos.visible = function(D) {
                return !!(D.offsetWidth || D.offsetHeight || D.getClientRects().length);
            }, d.ajaxSettings.xhr = function() {
                try {
                    return new D.XMLHttpRequest;
                } catch (D) {}
            };
            var Qw = {
                0: 200,
                1223: 204
            }, Gy = d.ajaxSettings.xhr();
            f.cors = !!Gy && "withCredentials" in Gy, f.ajax = Gy = !!Gy, d.ajaxTransport((function(h) {
                var z, j;
                if (f.cors || Gy && !h.crossDomain) return {
                    send: function(F, l) {
                        var Z, A = h.xhr();
                        if (A.open(h.type, h.url, h.async, h.username, h.password), h.xhrFields) for (Z in h.xhrFields) A[Z] = h.xhrFields[Z];
                        if (h.mimeType && A.overrideMimeType) A.overrideMimeType(h.mimeType);
                        if (!h.crossDomain && !F["X-Requested-With"]) F["X-Requested-With"] = "XMLHttpRequest";
                        for (Z in F) A.setRequestHeader(Z, F[Z]);
                        if (z = function(D) {
                            return function() {
                                if (z) if (z = j = A.onload = A.onerror = A.onabort = A.ontimeout = A.onreadystatechange = null,
                                D === "abort") A.abort(); else if (D === "error") if (typeof A.status !== "number") l(0, "error"); else l(A.status, A.statusText); else l(Qw[A.status] || A.status, A.statusText, (A.responseType || "text") !== "text" || typeof A.responseText !== "string" ? {
                                    binary: A.response
                                } : {
                                    text: A.responseText
                                }, A.getAllResponseHeaders());
                            };
                        }, A.onload = z(), j = A.onerror = A.ontimeout = z("error"), A.onabort !== void 0) A.onabort = j; else A.onreadystatechange = function() {
                            if (A.readyState === 4) D.setTimeout((function() {
                                if (z) j();
                            }));
                        };
                        z = z("abort");
                        try {
                            A.send(h.hasContent && h.data || null);
                        } catch (D) {
                            if (z) throw D;
                        }
                    },
                    abort: function() {
                        if (z) z();
                    }
                };
            })), d.ajaxPrefilter((function(D) {
                if (D.crossDomain) D.contents.script = false;
            })), d.ajaxSetup({
                accepts: {
                    script: "text/javascript, application/javascript, " + "application/ecmascript, application/x-ecmascript"
                },
                contents: {
                    script: /\b(?:java|ecma)script\b/
                },
                converters: {
                    "text script": function(D) {
                        return d.globalEval(D), D;
                    }
                }
            }), d.ajaxPrefilter("script", (function(D) {
                if (D.cache === void 0) D.cache = false;
                if (D.crossDomain) D.type = "GET";
            })), d.ajaxTransport("script", (function(D) {
                if (D.crossDomain || D.scriptAttrs) {
                    var h, z;
                    return {
                        send: function(j, F) {
                            h = d("<script>").attr(D.scriptAttrs || {}).prop({
                                charset: D.scriptCharset,
                                src: D.url
                            }).on("load error", z = function(D) {
                                if (h.remove(), z = null, D) F(D.type === "error" ? 404 : 200, D.type);
                            }), P.head.appendChild(h[0]);
                        },
                        abort: function() {
                            if (z) z();
                        }
                    };
                }
            }));
            var YT = [], ep = /(=)\?(?=&|$)|\?\?/, cm;
            d.ajaxSetup({
                jsonp: "callback",
                jsonpCallback: function() {
                    var D = YT.pop() || d.expando + "_" + pU.guid++;
                    return this[D] = true, D;
                }
            }), d.ajaxPrefilter("json jsonp", (function(h, z, j) {
                var F, l, Z, A = h.jsonp !== false && (ep.test(h.url) ? "url" : typeof h.data === "string" && (h.contentType || "").indexOf("application/x-www-form-urlencoded") === 0 && ep.test(h.data) && "data");
                if (A || h.dataTypes[0] === "jsonp") {
                    if (F = h.jsonpCallback = s(h.jsonpCallback) ? h.jsonpCallback() : h.jsonpCallback,
                    A) h[A] = h[A].replace(ep, "$1" + F); else if (h.jsonp !== false) h.url += (zA.test(h.url) ? "&" : "?") + h.jsonp + "=" + F;
                    return h.converters["script json"] = function() {
                        if (!Z) d.error(F + " was not called");
                        return Z[0];
                    }, h.dataTypes[0] = "json", l = D[F], D[F] = function() {
                        Z = arguments;
                    }, j.always((function() {
                        if (l === void 0) d(D).removeProp(F); else D[F] = l;
                        if (h[F]) h.jsonpCallback = z.jsonpCallback, YT.push(F);
                        if (Z && s(l)) l(Z[0]);
                        Z = l = void 0;
                    })), "script";
                }
            })), f.createHTMLDocument = (cm = P.implementation.createHTMLDocument("").body,
            cm.innerHTML = "<form></form><form></form>", cm.childNodes.length === 2), d.parseHTML = function(D, h, z) {
                if (typeof D !== "string") return [];
                if (typeof h === "boolean") z = h, h = false;
                var j, F, l;
                if (!h) if (f.createHTMLDocument) h = P.implementation.createHTMLDocument(""), j = h.createElement("base"),
                j.href = P.location.href, h.head.appendChild(j); else h = P;
                if (F = k.exec(D), l = !z && [], F) return [ h.createElement(F[1]) ];
                if (F = PG([ D ], h, l), l && l.length) d(l).remove();
                return d.merge([], F.childNodes);
            }, d.fn.load = function(D, h, z) {
                var j, F, l, Z = this, A = D.indexOf(" ");
                if (A > -1) j = TV(D.slice(A)), D = D.slice(0, A);
                if (s(h)) z = h, h = void 0; else if (h && typeof h === "object") F = "POST";
                if (Z.length > 0) d.ajax({
                    url: D,
                    type: F || "GET",
                    dataType: "html",
                    data: h
                }).done((function(D) {
                    l = arguments, Z.html(j ? d("<div>").append(d.parseHTML(D)).find(j) : D);
                })).always(z && function(D, h) {
                    Z.each((function() {
                        z.apply(this, l || [ D.responseText, h, D ]);
                    }));
                });
                return this;
            }, d.expr.pseudos.animated = function(D) {
                return d.grep(d.timers, (function(h) {
                    return D === h.elem;
                })).length;
            }, d.offset = {
                setOffset: function(D, h, z) {
                    var j, F, l, Z, A, q, Q, I = d.css(D, "position"), E = d(D), X = {};
                    if (I === "static") D.style.position = "relative";
                    if (A = E.offset(), l = d.css(D, "top"), q = d.css(D, "left"), Q = (I === "absolute" || I === "fixed") && (l + q).indexOf("auto") > -1,
                    Q) j = E.position(), Z = j.top, F = j.left; else Z = parseFloat(l) || 0, F = parseFloat(q) || 0;
                    if (s(h)) h = h.call(D, z, d.extend({}, A));
                    if (h.top != null) X.top = h.top - A.top + Z;
                    if (h.left != null) X.left = h.left - A.left + F;
                    if ("using" in h) h.using.call(D, X); else E.css(X);
                }
            }, d.fn.extend({
                offset: function(D) {
                    if (arguments.length) return D === void 0 ? this : this.each((function(h) {
                        d.offset.setOffset(this, D, h);
                    }));
                    var h, z, j = this[0];
                    if (!j) return;
                    if (!j.getClientRects().length) return {
                        top: 0,
                        left: 0
                    };
                    return h = j.getBoundingClientRect(), z = j.ownerDocument.defaultView, {
                        top: h.top + z.pageYOffset,
                        left: h.left + z.pageXOffset
                    };
                },
                position: function() {
                    if (!this[0]) return;
                    var D, h, z, j = this[0], F = {
                        top: 0,
                        left: 0
                    };
                    if (d.css(j, "position") === "fixed") h = j.getBoundingClientRect(); else {
                        h = this.offset(), z = j.ownerDocument, D = j.offsetParent || z.documentElement;
                        while (D && (D === z.body || D === z.documentElement) && d.css(D, "position") === "static") D = D.parentNode;
                        if (D && D !== j && D.nodeType === 1) F = d(D).offset(), F.top += d.css(D, "borderTopWidth", true),
                        F.left += d.css(D, "borderLeftWidth", true);
                    }
                    return {
                        top: h.top - F.top - d.css(j, "marginTop", true),
                        left: h.left - F.left - d.css(j, "marginLeft", true)
                    };
                },
                offsetParent: function() {
                    return this.map((function() {
                        var D = this.offsetParent;
                        while (D && d.css(D, "position") === "static") D = D.offsetParent;
                        return D || ol;
                    }));
                }
            }), d.each({
                scrollLeft: "pageXOffset",
                scrollTop: "pageYOffset"
            }, (function(D, h) {
                var z = "pageYOffset" === h;
                d.fn[D] = function(j) {
                    return Ar(this, (function(D, j, F) {
                        var l;
                        if (L(D)) l = D; else if (D.nodeType === 9) l = D.defaultView;
                        if (F === void 0) return l ? l[h] : D[j];
                        if (l) l.scrollTo(!z ? F : l.pageXOffset, z ? F : l.pageYOffset); else D[j] = F;
                    }), D, j, arguments.length);
                };
            })), d.each([ "top", "left" ], (function(D, h) {
                d.cssHooks[h] = OK(f.pixelPosition, (function(D, z) {
                    if (z) return z = ce(D, h), Xv.test(z) ? d(D).position()[h] + "px" : z;
                }));
            })), d.each({
                Height: "height",
                Width: "width"
            }, (function(D, h) {
                d.each({
                    padding: "inner" + D,
                    content: h,
                    "": "outer" + D
                }, (function(z, j) {
                    d.fn[j] = function(F, l) {
                        var Z = arguments.length && (z || typeof F !== "boolean"), A = z || (F === true || l === true ? "margin" : "border");
                        return Ar(this, (function(h, z, F) {
                            var l;
                            if (L(h)) return j.indexOf("outer") === 0 ? h["inner" + D] : h.document.documentElement["client" + D];
                            if (h.nodeType === 9) return l = h.documentElement, Math.max(h.body["scroll" + D], l["scroll" + D], h.body["offset" + D], l["offset" + D], l["client" + D]);
                            return F === void 0 ? d.css(h, z, A) : d.style(h, z, F, A);
                        }), h, Z ? F : void 0, Z);
                    };
                }));
            })), d.each([ "ajaxStart", "ajaxStop", "ajaxComplete", "ajaxError", "ajaxSuccess", "ajaxSend" ], (function(D, h) {
                d.fn[h] = function(D) {
                    return this.on(h, D);
                };
            })), d.fn.extend({
                bind: function(D, h, z) {
                    return this.on(D, null, h, z);
                },
                unbind: function(D, h) {
                    return this.off(D, null, h);
                },
                delegate: function(D, h, z, j) {
                    return this.on(h, D, z, j);
                },
                undelegate: function(D, h, z) {
                    return arguments.length === 1 ? this.off(D, "**") : this.off(h, D || "**", z);
                },
                hover: function(D, h) {
                    return this.mouseenter(D).mouseleave(h || D);
                }
            }), d.each(("blur focus focusin focusout resize scroll click dblclick " + "mousedown mouseup mousemove mouseover mouseout mouseenter mouseleave " + "change select submit keydown keypress keyup contextmenu").split(" "), (function(D, h) {
                d.fn[h] = function(D, z) {
                    return arguments.length > 0 ? this.on(h, null, D, z) : this.trigger(h);
                };
            }));
            var Ul = /^[\s\uFEFF\xA0]+|([^\s\uFEFF\xA0])[\s\uFEFF\xA0]+$/g;
            if (d.proxy = function(D, h) {
                var z, j, l;
                if (typeof h === "string") z = D[h], h = D, D = z;
                if (!s(D)) return;
                return j = F.call(arguments, 2), l = function() {
                    return D.apply(h || this, j.concat(F.call(arguments)));
                }, l.guid = D.guid = D.guid || d.guid++, l;
            }, d.holdReady = function(D) {
                if (D) d.readyWait++; else d.ready(true);
            }, d.isArray = Array.isArray, d.parseJSON = JSON.parse, d.nodeName = K, d.isFunction = s,
            d.isWindow = L, d.camelCase = hO, d.type = w, d.now = Date.now, d.isNumeric = function(D) {
                var h = d.type(D);
                return (h === "number" || h === "string") && !isNaN(D - parseFloat(D));
            }, d.trim = function(D) {
                return D == null ? "" : (D + "").replace(Ul, "$1");
            }, typeof define === "function" && define.amd) define("jquery", [], (function() {
                return d;
            }));
            var sm = D.jQuery, QR = D.$;
            if (d.noConflict = function(h) {
                if (D.$ === d) D.$ = QR;
                if (h && D.jQuery === d) D.jQuery = sm;
                return d;
            }, typeof h === "undefined") D.jQuery = D.$ = d;
            return d;
        }));
    }, {} ],
    2: [ function(D, h, z) {
        "use strict";
        var j = void 0 && (void 0).__importDefault || function(D) {
            return D && D.__esModule ? D : {
                default: D
            };
        };
        Object.defineProperty(z, "__esModule", {
            value: true
        });
        const F = j(D("jquery"));
        function l(D) {
            const h = (0, F.default)(".content"), z = (0, F.default)("#status"), j = (0, F.default)("#switch");
            if (D && !h.hasClass("active")) h.addClass("active"), j.text("Disable extension on this website"),
            z.text("Active"); else h.removeClass("active"), j.text("Enable extension on this website"),
            z.text("Inactive");
        }
        (0, F.default)((async () => {
            var D;
            const h = (0, F.default)("#domain"), z = await chrome.storage.local.get([ "domains", "global" ]);
            let j = (D = z.domains) !== null && D !== void 0 ? D : [];
            const Z = await chrome.tabs.query({
                active: true,
                currentWindow: true
            });
            if (!Z || Z.length === 0) return;
            const {host: A} = new URL(Z[0].url), q = Z[0].id;
            h.text(A);
            let Q = j.includes(A);
            l(Q), (0, F.default)("#switch").on("click", (async () => {
                if (Q) j.splice(j.indexOf(A), 1), Q = false, chrome.tabs.reload(q); else j.push(A),
                Q = true, chrome.runtime.sendMessage({
                    command: "changeIcon",
                    tab: Z[0]
                });
                j = [ ...new Set(j) ], await chrome.storage.local.set({
                    domains: j
                }), l(Q);
            }));
        }));
    }, {
        jquery: 1
    } ]
}, {}, [ 2 ]);