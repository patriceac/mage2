/******/ (() => { // webpackBootstrap
/******/ 	var __webpack_modules__ = ({

/***/ 166:
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

var SetCache = __webpack_require__(9524),
    arraySome = __webpack_require__(9097),
    cacheHas = __webpack_require__(4808);

/** Used to compose bitmasks for value comparisons. */
var COMPARE_PARTIAL_FLAG = 1,
    COMPARE_UNORDERED_FLAG = 2;

/**
 * A specialized version of `baseIsEqualDeep` for arrays with support for
 * partial deep comparisons.
 *
 * @private
 * @param {Array} array The array to compare.
 * @param {Array} other The other array to compare.
 * @param {number} bitmask The bitmask flags. See `baseIsEqual` for more details.
 * @param {Function} customizer The function to customize comparisons.
 * @param {Function} equalFunc The function to determine equivalents of values.
 * @param {Object} stack Tracks traversed `array` and `other` objects.
 * @returns {boolean} Returns `true` if the arrays are equivalent, else `false`.
 */
function equalArrays(array, other, bitmask, customizer, equalFunc, stack) {
  var isPartial = bitmask & COMPARE_PARTIAL_FLAG,
      arrLength = array.length,
      othLength = other.length;

  if (arrLength != othLength && !(isPartial && othLength > arrLength)) {
    return false;
  }
  // Check that cyclic values are equal.
  var arrStacked = stack.get(array);
  var othStacked = stack.get(other);
  if (arrStacked && othStacked) {
    return arrStacked == other && othStacked == array;
  }
  var index = -1,
      result = true,
      seen = (bitmask & COMPARE_UNORDERED_FLAG) ? new SetCache : undefined;

  stack.set(array, other);
  stack.set(other, array);

  // Ignore non-index properties.
  while (++index < arrLength) {
    var arrValue = array[index],
        othValue = other[index];

    if (customizer) {
      var compared = isPartial
        ? customizer(othValue, arrValue, index, other, array, stack)
        : customizer(arrValue, othValue, index, array, other, stack);
    }
    if (compared !== undefined) {
      if (compared) {
        continue;
      }
      result = false;
      break;
    }
    // Recursively compare arrays (susceptible to call stack limits).
    if (seen) {
      if (!arraySome(other, function(othValue, othIndex) {
            if (!cacheHas(seen, othIndex) &&
                (arrValue === othValue || equalFunc(arrValue, othValue, bitmask, customizer, stack))) {
              return seen.push(othIndex);
            }
          })) {
        result = false;
        break;
      }
    } else if (!(
          arrValue === othValue ||
            equalFunc(arrValue, othValue, bitmask, customizer, stack)
        )) {
      result = false;
      break;
    }
  }
  stack['delete'](array);
  stack['delete'](other);
  return result;
}

module.exports = equalArrays;


/***/ }),

/***/ 268:
/***/ ((module) => {

/**
 * Converts `set` to an array of its values.
 *
 * @private
 * @param {Object} set The set to convert.
 * @returns {Array} Returns the values.
 */
function setToArray(set) {
  var index = -1,
      result = Array(set.size);

  set.forEach(function(value) {
    result[++index] = value;
  });
  return result;
}

module.exports = setToArray;


/***/ }),

/***/ 274:
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

var eq = __webpack_require__(8373);

/**
 * Gets the index at which the `key` is found in `array` of key-value pairs.
 *
 * @private
 * @param {Array} array The array to inspect.
 * @param {*} key The key to search for.
 * @returns {number} Returns the index of the matched value, else `-1`.
 */
function assocIndexOf(array, key) {
  var length = array.length;
  while (length--) {
    if (eq(array[length][0], key)) {
      return length;
    }
  }
  return -1;
}

module.exports = assocIndexOf;


/***/ }),

/***/ 334:
/***/ ((module) => {

/**
 * Creates a unary function that invokes `func` with its argument transformed.
 *
 * @private
 * @param {Function} func The function to wrap.
 * @param {Function} transform The argument transform.
 * @returns {Function} Returns the new function.
 */
function overArg(func, transform) {
  return function(arg) {
    return func(transform(arg));
  };
}

module.exports = overArg;


/***/ }),

/***/ 601:
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

var isFunction = __webpack_require__(8079),
    isLength = __webpack_require__(9459);

/**
 * Checks if `value` is array-like. A value is considered array-like if it's
 * not a function and has a `value.length` that's an integer greater than or
 * equal to `0` and less than or equal to `Number.MAX_SAFE_INTEGER`.
 *
 * @static
 * @memberOf _
 * @since 4.0.0
 * @category Lang
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is array-like, else `false`.
 * @example
 *
 * _.isArrayLike([1, 2, 3]);
 * // => true
 *
 * _.isArrayLike(document.body.children);
 * // => true
 *
 * _.isArrayLike('abc');
 * // => true
 *
 * _.isArrayLike(_.noop);
 * // => false
 */
function isArrayLike(value) {
  return value != null && isLength(value.length) && !isFunction(value);
}

module.exports = isArrayLike;


/***/ }),

/***/ 628:
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

var isKeyable = __webpack_require__(9715);

/**
 * Gets the data for `map`.
 *
 * @private
 * @param {Object} map The map to query.
 * @param {string} key The reference key.
 * @returns {*} Returns the map data.
 */
function getMapData(map, key) {
  var data = map.__data__;
  return isKeyable(key)
    ? data[typeof key == 'string' ? 'string' : 'hash']
    : data.map;
}

module.exports = getMapData;


/***/ }),

/***/ 644:
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

var getMapData = __webpack_require__(628);

/**
 * Checks if a map value for `key` exists.
 *
 * @private
 * @name has
 * @memberOf MapCache
 * @param {string} key The key of the entry to check.
 * @returns {boolean} Returns `true` if an entry for `key` exists, else `false`.
 */
function mapCacheHas(key) {
  return getMapData(this, key).has(key);
}

module.exports = mapCacheHas;


/***/ }),

/***/ 767:
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

var coreJsData = __webpack_require__(950);

/** Used to detect methods masquerading as native. */
var maskSrcKey = (function() {
  var uid = /[^.]+$/.exec(coreJsData && coreJsData.keys && coreJsData.keys.IE_PROTO || '');
  return uid ? ('Symbol(src)_1.' + uid) : '';
}());

/**
 * Checks if `func` has its source masked.
 *
 * @private
 * @param {Function} func The function to check.
 * @returns {boolean} Returns `true` if `func` is masked, else `false`.
 */
function isMasked(func) {
  return !!maskSrcKey && (maskSrcKey in func);
}

module.exports = isMasked;


/***/ }),

/***/ 773:
/***/ ((module) => {

/** Used for built-in method references. */
var objectProto = Object.prototype;

/**
 * Used to resolve the
 * [`toStringTag`](http://ecma-international.org/ecma-262/7.0/#sec-object.prototype.tostring)
 * of values.
 */
var nativeObjectToString = objectProto.toString;

/**
 * Converts `value` to a string using `Object.prototype.toString`.
 *
 * @private
 * @param {*} value The value to convert.
 * @returns {string} Returns the converted string.
 */
function objectToString(value) {
  return nativeObjectToString.call(value);
}

module.exports = objectToString;


/***/ }),

/***/ 860:
/***/ ((module) => {

/**
 * The base implementation of `_.unary` without support for storing metadata.
 *
 * @private
 * @param {Function} func The function to cap arguments for.
 * @returns {Function} Returns the new capped function.
 */
function baseUnary(func) {
  return function(value) {
    return func(value);
  };
}

module.exports = baseUnary;


/***/ }),

/***/ 950:
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

var root = __webpack_require__(8454);

/** Used to detect overreaching core-js shims. */
var coreJsData = root['__core-js_shared__'];

module.exports = coreJsData;


/***/ }),

/***/ 953:
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

var getNative = __webpack_require__(4947);

/* Built-in method references that are verified to be native. */
var nativeCreate = getNative(Object, 'create');

module.exports = nativeCreate;


/***/ }),

/***/ 990:
/***/ ((module) => {

/**
 * Converts `map` to its key-value pairs.
 *
 * @private
 * @param {Object} map The map to convert.
 * @returns {Array} Returns the key-value pairs.
 */
function mapToArray(map) {
  var index = -1,
      result = Array(map.size);

  map.forEach(function(value, key) {
    result[++index] = [key, value];
  });
  return result;
}

module.exports = mapToArray;


/***/ }),

/***/ 1099:
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

var debounce = __webpack_require__(3880),
    isObject = __webpack_require__(4420);

/** Error message constants. */
var FUNC_ERROR_TEXT = 'Expected a function';

/**
 * Creates a throttled function that only invokes `func` at most once per
 * every `wait` milliseconds. The throttled function comes with a `cancel`
 * method to cancel delayed `func` invocations and a `flush` method to
 * immediately invoke them. Provide `options` to indicate whether `func`
 * should be invoked on the leading and/or trailing edge of the `wait`
 * timeout. The `func` is invoked with the last arguments provided to the
 * throttled function. Subsequent calls to the throttled function return the
 * result of the last `func` invocation.
 *
 * **Note:** If `leading` and `trailing` options are `true`, `func` is
 * invoked on the trailing edge of the timeout only if the throttled function
 * is invoked more than once during the `wait` timeout.
 *
 * If `wait` is `0` and `leading` is `false`, `func` invocation is deferred
 * until to the next tick, similar to `setTimeout` with a timeout of `0`.
 *
 * See [David Corbacho's article](https://css-tricks.com/debouncing-throttling-explained-examples/)
 * for details over the differences between `_.throttle` and `_.debounce`.
 *
 * @static
 * @memberOf _
 * @since 0.1.0
 * @category Function
 * @param {Function} func The function to throttle.
 * @param {number} [wait=0] The number of milliseconds to throttle invocations to.
 * @param {Object} [options={}] The options object.
 * @param {boolean} [options.leading=true]
 *  Specify invoking on the leading edge of the timeout.
 * @param {boolean} [options.trailing=true]
 *  Specify invoking on the trailing edge of the timeout.
 * @returns {Function} Returns the new throttled function.
 * @example
 *
 * // Avoid excessively updating the position while scrolling.
 * jQuery(window).on('scroll', _.throttle(updatePosition, 100));
 *
 * // Invoke `renewToken` when the click event is fired, but not more than once every 5 minutes.
 * var throttled = _.throttle(renewToken, 300000, { 'trailing': false });
 * jQuery(element).on('click', throttled);
 *
 * // Cancel the trailing throttled invocation.
 * jQuery(window).on('popstate', throttled.cancel);
 */
function throttle(func, wait, options) {
  var leading = true,
      trailing = true;

  if (typeof func != 'function') {
    throw new TypeError(FUNC_ERROR_TEXT);
  }
  if (isObject(options)) {
    leading = 'leading' in options ? !!options.leading : leading;
    trailing = 'trailing' in options ? !!options.trailing : trailing;
  }
  return debounce(func, wait, {
    'leading': leading,
    'maxWait': wait,
    'trailing': trailing
  });
}

module.exports = throttle;


/***/ }),

/***/ 1140:
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

var getMapData = __webpack_require__(628);

/**
 * Sets the map `key` to `value`.
 *
 * @private
 * @name set
 * @memberOf MapCache
 * @param {string} key The key of the value to set.
 * @param {*} value The value to set.
 * @returns {Object} Returns the map cache instance.
 */
function mapCacheSet(key, value) {
  var data = getMapData(this, key),
      size = data.size;

  data.set(key, value);
  this.size += data.size == size ? 0 : 1;
  return this;
}

module.exports = mapCacheSet;


/***/ }),

/***/ 1176:
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

var getNative = __webpack_require__(4947),
    root = __webpack_require__(8454);

/* Built-in method references that are verified to be native. */
var Set = getNative(root, 'Set');

module.exports = Set;


/***/ }),

/***/ 1221:
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

var Symbol = __webpack_require__(7930),
    Uint8Array = __webpack_require__(9679),
    eq = __webpack_require__(8373),
    equalArrays = __webpack_require__(166),
    mapToArray = __webpack_require__(990),
    setToArray = __webpack_require__(268);

/** Used to compose bitmasks for value comparisons. */
var COMPARE_PARTIAL_FLAG = 1,
    COMPARE_UNORDERED_FLAG = 2;

/** `Object#toString` result references. */
var boolTag = '[object Boolean]',
    dateTag = '[object Date]',
    errorTag = '[object Error]',
    mapTag = '[object Map]',
    numberTag = '[object Number]',
    regexpTag = '[object RegExp]',
    setTag = '[object Set]',
    stringTag = '[object String]',
    symbolTag = '[object Symbol]';

var arrayBufferTag = '[object ArrayBuffer]',
    dataViewTag = '[object DataView]';

/** Used to convert symbols to primitives and strings. */
var symbolProto = Symbol ? Symbol.prototype : undefined,
    symbolValueOf = symbolProto ? symbolProto.valueOf : undefined;

/**
 * A specialized version of `baseIsEqualDeep` for comparing objects of
 * the same `toStringTag`.
 *
 * **Note:** This function only supports comparing values with tags of
 * `Boolean`, `Date`, `Error`, `Number`, `RegExp`, or `String`.
 *
 * @private
 * @param {Object} object The object to compare.
 * @param {Object} other The other object to compare.
 * @param {string} tag The `toStringTag` of the objects to compare.
 * @param {number} bitmask The bitmask flags. See `baseIsEqual` for more details.
 * @param {Function} customizer The function to customize comparisons.
 * @param {Function} equalFunc The function to determine equivalents of values.
 * @param {Object} stack Tracks traversed `object` and `other` objects.
 * @returns {boolean} Returns `true` if the objects are equivalent, else `false`.
 */
function equalByTag(object, other, tag, bitmask, customizer, equalFunc, stack) {
  switch (tag) {
    case dataViewTag:
      if ((object.byteLength != other.byteLength) ||
          (object.byteOffset != other.byteOffset)) {
        return false;
      }
      object = object.buffer;
      other = other.buffer;

    case arrayBufferTag:
      if ((object.byteLength != other.byteLength) ||
          !equalFunc(new Uint8Array(object), new Uint8Array(other))) {
        return false;
      }
      return true;

    case boolTag:
    case dateTag:
    case numberTag:
      // Coerce booleans to `1` or `0` and dates to milliseconds.
      // Invalid dates are coerced to `NaN`.
      return eq(+object, +other);

    case errorTag:
      return object.name == other.name && object.message == other.message;

    case regexpTag:
    case stringTag:
      // Coerce regexes to strings and treat strings, primitives and objects,
      // as equal. See http://www.ecma-international.org/ecma-262/7.0/#sec-regexp.prototype.tostring
      // for more details.
      return object == (other + '');

    case mapTag:
      var convert = mapToArray;

    case setTag:
      var isPartial = bitmask & COMPARE_PARTIAL_FLAG;
      convert || (convert = setToArray);

      if (object.size != other.size && !isPartial) {
        return false;
      }
      // Assume cyclic values are equal.
      var stacked = stack.get(object);
      if (stacked) {
        return stacked == other;
      }
      bitmask |= COMPARE_UNORDERED_FLAG;

      // Recursively compare objects (susceptible to call stack limits).
      stack.set(object, other);
      var result = equalArrays(convert(object), convert(other), bitmask, customizer, equalFunc, stack);
      stack['delete'](object);
      return result;

    case symbolTag:
      if (symbolValueOf) {
        return symbolValueOf.call(object) == symbolValueOf.call(other);
      }
  }
  return false;
}

module.exports = equalByTag;


/***/ }),

/***/ 1278:
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

var baseTimes = __webpack_require__(4753),
    isArguments = __webpack_require__(7163),
    isArray = __webpack_require__(5038),
    isBuffer = __webpack_require__(7493),
    isIndex = __webpack_require__(4472),
    isTypedArray = __webpack_require__(5074);

/** Used for built-in method references. */
var objectProto = Object.prototype;

/** Used to check objects for own properties. */
var hasOwnProperty = objectProto.hasOwnProperty;

/**
 * Creates an array of the enumerable property names of the array-like `value`.
 *
 * @private
 * @param {*} value The value to query.
 * @param {boolean} inherited Specify returning inherited property names.
 * @returns {Array} Returns the array of property names.
 */
function arrayLikeKeys(value, inherited) {
  var isArr = isArray(value),
      isArg = !isArr && isArguments(value),
      isBuff = !isArr && !isArg && isBuffer(value),
      isType = !isArr && !isArg && !isBuff && isTypedArray(value),
      skipIndexes = isArr || isArg || isBuff || isType,
      result = skipIndexes ? baseTimes(value.length, String) : [],
      length = result.length;

  for (var key in value) {
    if ((inherited || hasOwnProperty.call(value, key)) &&
        !(skipIndexes && (
           // Safari 9 has enumerable `arguments.length` in strict mode.
           key == 'length' ||
           // Node.js 0.10 has enumerable non-index properties on buffers.
           (isBuff && (key == 'offset' || key == 'parent')) ||
           // PhantomJS 2 has enumerable non-index properties on typed arrays.
           (isType && (key == 'buffer' || key == 'byteLength' || key == 'byteOffset')) ||
           // Skip index properties.
           isIndex(key, length)
        ))) {
      result.push(key);
    }
  }
  return result;
}

module.exports = arrayLikeKeys;


/***/ }),

/***/ 1514:
/***/ ((module) => {

/** Used for built-in method references. */
var funcProto = Function.prototype;

/** Used to resolve the decompiled source of functions. */
var funcToString = funcProto.toString;

/**
 * Converts `func` to its source code.
 *
 * @private
 * @param {Function} func The function to convert.
 * @returns {string} Returns the source code.
 */
function toSource(func) {
  if (func != null) {
    try {
      return funcToString.call(func);
    } catch (e) {}
    try {
      return (func + '');
    } catch (e) {}
  }
  return '';
}

module.exports = toSource;


/***/ }),

/***/ 1538:
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

var mapCacheClear = __webpack_require__(8929),
    mapCacheDelete = __webpack_require__(6265),
    mapCacheGet = __webpack_require__(8608),
    mapCacheHas = __webpack_require__(644),
    mapCacheSet = __webpack_require__(1140);

/**
 * Creates a map cache object to store key-value pairs.
 *
 * @private
 * @constructor
 * @param {Array} [entries] The key-value pairs to cache.
 */
function MapCache(entries) {
  var index = -1,
      length = entries == null ? 0 : entries.length;

  this.clear();
  while (++index < length) {
    var entry = entries[index];
    this.set(entry[0], entry[1]);
  }
}

// Add methods to `MapCache`.
MapCache.prototype.clear = mapCacheClear;
MapCache.prototype['delete'] = mapCacheDelete;
MapCache.prototype.get = mapCacheGet;
MapCache.prototype.has = mapCacheHas;
MapCache.prototype.set = mapCacheSet;

module.exports = MapCache;


/***/ }),

/***/ 1710:
/***/ ((module) => {

/**
 * Checks if a stack value for `key` exists.
 *
 * @private
 * @name has
 * @memberOf Stack
 * @param {string} key The key of the entry to check.
 * @returns {boolean} Returns `true` if an entry for `key` exists, else `false`.
 */
function stackHas(key) {
  return this.__data__.has(key);
}

module.exports = stackHas;


/***/ }),

/***/ 1723:
/***/ ((module) => {

/**
 * Removes `key` and its value from the stack.
 *
 * @private
 * @name delete
 * @memberOf Stack
 * @param {string} key The key of the value to remove.
 * @returns {boolean} Returns `true` if the entry was removed, else `false`.
 */
function stackDelete(key) {
  var data = this.__data__,
      result = data['delete'](key);

  this.size = data.size;
  return result;
}

module.exports = stackDelete;


/***/ }),

/***/ 1741:
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

var getNative = __webpack_require__(4947),
    root = __webpack_require__(8454);

/* Built-in method references that are verified to be native. */
var Promise = getNative(root, 'Promise');

module.exports = Promise;


/***/ }),

/***/ 1834:
/***/ ((module) => {

/**
 * Gets the stack value for `key`.
 *
 * @private
 * @name get
 * @memberOf Stack
 * @param {string} key The key of the value to get.
 * @returns {*} Returns the entry value.
 */
function stackGet(key) {
  return this.__data__.get(key);
}

module.exports = stackGet;


/***/ }),

/***/ 2014:
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

var DataView = __webpack_require__(9431),
    Map = __webpack_require__(2994),
    Promise = __webpack_require__(1741),
    Set = __webpack_require__(1176),
    WeakMap = __webpack_require__(3230),
    baseGetTag = __webpack_require__(7259),
    toSource = __webpack_require__(1514);

/** `Object#toString` result references. */
var mapTag = '[object Map]',
    objectTag = '[object Object]',
    promiseTag = '[object Promise]',
    setTag = '[object Set]',
    weakMapTag = '[object WeakMap]';

var dataViewTag = '[object DataView]';

/** Used to detect maps, sets, and weakmaps. */
var dataViewCtorString = toSource(DataView),
    mapCtorString = toSource(Map),
    promiseCtorString = toSource(Promise),
    setCtorString = toSource(Set),
    weakMapCtorString = toSource(WeakMap);

/**
 * Gets the `toStringTag` of `value`.
 *
 * @private
 * @param {*} value The value to query.
 * @returns {string} Returns the `toStringTag`.
 */
var getTag = baseGetTag;

// Fallback for data views, maps, sets, and weak maps in IE 11 and promises in Node.js < 6.
if ((DataView && getTag(new DataView(new ArrayBuffer(1))) != dataViewTag) ||
    (Map && getTag(new Map) != mapTag) ||
    (Promise && getTag(Promise.resolve()) != promiseTag) ||
    (Set && getTag(new Set) != setTag) ||
    (WeakMap && getTag(new WeakMap) != weakMapTag)) {
  getTag = function(value) {
    var result = baseGetTag(value),
        Ctor = result == objectTag ? value.constructor : undefined,
        ctorString = Ctor ? toSource(Ctor) : '';

    if (ctorString) {
      switch (ctorString) {
        case dataViewCtorString: return dataViewTag;
        case mapCtorString: return mapTag;
        case promiseCtorString: return promiseTag;
        case setCtorString: return setTag;
        case weakMapCtorString: return weakMapTag;
      }
    }
    return result;
  };
}

module.exports = getTag;


/***/ }),

/***/ 2036:
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

var assocIndexOf = __webpack_require__(274);

/**
 * Checks if a list cache value for `key` exists.
 *
 * @private
 * @name has
 * @memberOf ListCache
 * @param {string} key The key of the entry to check.
 * @returns {boolean} Returns `true` if an entry for `key` exists, else `false`.
 */
function listCacheHas(key) {
  return assocIndexOf(this.__data__, key) > -1;
}

module.exports = listCacheHas;


/***/ }),

/***/ 2044:
/***/ ((module) => {

/**
 * This method returns `false`.
 *
 * @static
 * @memberOf _
 * @since 4.13.0
 * @category Util
 * @returns {boolean} Returns `false`.
 * @example
 *
 * _.times(2, _.stubFalse);
 * // => [false, false]
 */
function stubFalse() {
  return false;
}

module.exports = stubFalse;


/***/ }),

/***/ 2369:
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

var nativeCreate = __webpack_require__(953);

/**
 * Removes all key-value entries from the hash.
 *
 * @private
 * @name clear
 * @memberOf Hash
 */
function hashClear() {
  this.__data__ = nativeCreate ? nativeCreate(null) : {};
  this.size = 0;
}

module.exports = hashClear;


/***/ }),

/***/ 2513:
/***/ ((module) => {

/**
 * Appends the elements of `values` to `array`.
 *
 * @private
 * @param {Array} array The array to modify.
 * @param {Array} values The values to append.
 * @returns {Array} Returns `array`.
 */
function arrayPush(array, values) {
  var index = -1,
      length = values.length,
      offset = array.length;

  while (++index < length) {
    array[offset + index] = values[index];
  }
  return array;
}

module.exports = arrayPush;


/***/ }),

/***/ 2639:
/***/ ((module) => {

/**
 * A specialized version of `_.filter` for arrays without support for
 * iteratee shorthands.
 *
 * @private
 * @param {Array} [array] The array to iterate over.
 * @param {Function} predicate The function invoked per iteration.
 * @returns {Array} Returns the new filtered array.
 */
function arrayFilter(array, predicate) {
  var index = -1,
      length = array == null ? 0 : array.length,
      resIndex = 0,
      result = [];

  while (++index < length) {
    var value = array[index];
    if (predicate(value, index, array)) {
      result[resIndex++] = value;
    }
  }
  return result;
}

module.exports = arrayFilter;


/***/ }),

/***/ 2962:
/***/ ((module) => {

/**
 * This method returns a new empty array.
 *
 * @static
 * @memberOf _
 * @since 4.13.0
 * @category Util
 * @returns {Array} Returns the new empty array.
 * @example
 *
 * var arrays = _.times(2, _.stubArray);
 *
 * console.log(arrays);
 * // => [[], []]
 *
 * console.log(arrays[0] === arrays[1]);
 * // => false
 */
function stubArray() {
  return [];
}

module.exports = stubArray;


/***/ }),

/***/ 2979:
/***/ ((module) => {

/**
 * Gets the value at `key` of `object`.
 *
 * @private
 * @param {Object} [object] The object to query.
 * @param {string} key The key of the property to get.
 * @returns {*} Returns the property value.
 */
function getValue(object, key) {
  return object == null ? undefined : object[key];
}

module.exports = getValue;


/***/ }),

/***/ 2994:
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

var getNative = __webpack_require__(4947),
    root = __webpack_require__(8454);

/* Built-in method references that are verified to be native. */
var Map = getNative(root, 'Map');

module.exports = Map;


/***/ }),

/***/ 3087:
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

var baseIsEqual = __webpack_require__(6503);

/**
 * Performs a deep comparison between two values to determine if they are
 * equivalent.
 *
 * **Note:** This method supports comparing arrays, array buffers, booleans,
 * date objects, error objects, maps, numbers, `Object` objects, regexes,
 * sets, strings, symbols, and typed arrays. `Object` objects are compared
 * by their own, not inherited, enumerable properties. Functions and DOM
 * nodes are compared by strict equality, i.e. `===`.
 *
 * @static
 * @memberOf _
 * @since 0.1.0
 * @category Lang
 * @param {*} value The value to compare.
 * @param {*} other The other value to compare.
 * @returns {boolean} Returns `true` if the values are equivalent, else `false`.
 * @example
 *
 * var object = { 'a': 1 };
 * var other = { 'a': 1 };
 *
 * _.isEqual(object, other);
 * // => true
 *
 * object === other;
 * // => false
 */
function isEqual(value, other) {
  return baseIsEqual(value, other);
}

module.exports = isEqual;


/***/ }),

/***/ 3230:
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

var getNative = __webpack_require__(4947),
    root = __webpack_require__(8454);

/* Built-in method references that are verified to be native. */
var WeakMap = getNative(root, 'WeakMap');

module.exports = WeakMap;


/***/ }),

/***/ 3329:
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

var overArg = __webpack_require__(334);

/* Built-in method references for those with the same name as other `lodash` methods. */
var nativeKeys = overArg(Object.keys, Object);

module.exports = nativeKeys;


/***/ }),

/***/ 3880:
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

var isObject = __webpack_require__(4420),
    now = __webpack_require__(5831),
    toNumber = __webpack_require__(9483);

/** Error message constants. */
var FUNC_ERROR_TEXT = 'Expected a function';

/* Built-in method references for those with the same name as other `lodash` methods. */
var nativeMax = Math.max,
    nativeMin = Math.min;

/**
 * Creates a debounced function that delays invoking `func` until after `wait`
 * milliseconds have elapsed since the last time the debounced function was
 * invoked. The debounced function comes with a `cancel` method to cancel
 * delayed `func` invocations and a `flush` method to immediately invoke them.
 * Provide `options` to indicate whether `func` should be invoked on the
 * leading and/or trailing edge of the `wait` timeout. The `func` is invoked
 * with the last arguments provided to the debounced function. Subsequent
 * calls to the debounced function return the result of the last `func`
 * invocation.
 *
 * **Note:** If `leading` and `trailing` options are `true`, `func` is
 * invoked on the trailing edge of the timeout only if the debounced function
 * is invoked more than once during the `wait` timeout.
 *
 * If `wait` is `0` and `leading` is `false`, `func` invocation is deferred
 * until to the next tick, similar to `setTimeout` with a timeout of `0`.
 *
 * See [David Corbacho's article](https://css-tricks.com/debouncing-throttling-explained-examples/)
 * for details over the differences between `_.debounce` and `_.throttle`.
 *
 * @static
 * @memberOf _
 * @since 0.1.0
 * @category Function
 * @param {Function} func The function to debounce.
 * @param {number} [wait=0] The number of milliseconds to delay.
 * @param {Object} [options={}] The options object.
 * @param {boolean} [options.leading=false]
 *  Specify invoking on the leading edge of the timeout.
 * @param {number} [options.maxWait]
 *  The maximum time `func` is allowed to be delayed before it's invoked.
 * @param {boolean} [options.trailing=true]
 *  Specify invoking on the trailing edge of the timeout.
 * @returns {Function} Returns the new debounced function.
 * @example
 *
 * // Avoid costly calculations while the window size is in flux.
 * jQuery(window).on('resize', _.debounce(calculateLayout, 150));
 *
 * // Invoke `sendMail` when clicked, debouncing subsequent calls.
 * jQuery(element).on('click', _.debounce(sendMail, 300, {
 *   'leading': true,
 *   'trailing': false
 * }));
 *
 * // Ensure `batchLog` is invoked once after 1 second of debounced calls.
 * var debounced = _.debounce(batchLog, 250, { 'maxWait': 1000 });
 * var source = new EventSource('/stream');
 * jQuery(source).on('message', debounced);
 *
 * // Cancel the trailing debounced invocation.
 * jQuery(window).on('popstate', debounced.cancel);
 */
function debounce(func, wait, options) {
  var lastArgs,
      lastThis,
      maxWait,
      result,
      timerId,
      lastCallTime,
      lastInvokeTime = 0,
      leading = false,
      maxing = false,
      trailing = true;

  if (typeof func != 'function') {
    throw new TypeError(FUNC_ERROR_TEXT);
  }
  wait = toNumber(wait) || 0;
  if (isObject(options)) {
    leading = !!options.leading;
    maxing = 'maxWait' in options;
    maxWait = maxing ? nativeMax(toNumber(options.maxWait) || 0, wait) : maxWait;
    trailing = 'trailing' in options ? !!options.trailing : trailing;
  }

  function invokeFunc(time) {
    var args = lastArgs,
        thisArg = lastThis;

    lastArgs = lastThis = undefined;
    lastInvokeTime = time;
    result = func.apply(thisArg, args);
    return result;
  }

  function leadingEdge(time) {
    // Reset any `maxWait` timer.
    lastInvokeTime = time;
    // Start the timer for the trailing edge.
    timerId = setTimeout(timerExpired, wait);
    // Invoke the leading edge.
    return leading ? invokeFunc(time) : result;
  }

  function remainingWait(time) {
    var timeSinceLastCall = time - lastCallTime,
        timeSinceLastInvoke = time - lastInvokeTime,
        timeWaiting = wait - timeSinceLastCall;

    return maxing
      ? nativeMin(timeWaiting, maxWait - timeSinceLastInvoke)
      : timeWaiting;
  }

  function shouldInvoke(time) {
    var timeSinceLastCall = time - lastCallTime,
        timeSinceLastInvoke = time - lastInvokeTime;

    // Either this is the first call, activity has stopped and we're at the
    // trailing edge, the system time has gone backwards and we're treating
    // it as the trailing edge, or we've hit the `maxWait` limit.
    return (lastCallTime === undefined || (timeSinceLastCall >= wait) ||
      (timeSinceLastCall < 0) || (maxing && timeSinceLastInvoke >= maxWait));
  }

  function timerExpired() {
    var time = now();
    if (shouldInvoke(time)) {
      return trailingEdge(time);
    }
    // Restart the timer.
    timerId = setTimeout(timerExpired, remainingWait(time));
  }

  function trailingEdge(time) {
    timerId = undefined;

    // Only invoke if we have `lastArgs` which means `func` has been
    // debounced at least once.
    if (trailing && lastArgs) {
      return invokeFunc(time);
    }
    lastArgs = lastThis = undefined;
    return result;
  }

  function cancel() {
    if (timerId !== undefined) {
      clearTimeout(timerId);
    }
    lastInvokeTime = 0;
    lastArgs = lastCallTime = lastThis = timerId = undefined;
  }

  function flush() {
    return timerId === undefined ? result : trailingEdge(now());
  }

  function debounced() {
    var time = now(),
        isInvoking = shouldInvoke(time);

    lastArgs = arguments;
    lastThis = this;
    lastCallTime = time;

    if (isInvoking) {
      if (timerId === undefined) {
        return leadingEdge(lastCallTime);
      }
      if (maxing) {
        // Handle invocations in a tight loop.
        clearTimeout(timerId);
        timerId = setTimeout(timerExpired, wait);
        return invokeFunc(lastCallTime);
      }
    }
    if (timerId === undefined) {
      timerId = setTimeout(timerExpired, wait);
    }
    return result;
  }
  debounced.cancel = cancel;
  debounced.flush = flush;
  return debounced;
}

module.exports = debounce;


/***/ }),

/***/ 3918:
/***/ ((module) => {

/**
 * Checks if `value` is in the array cache.
 *
 * @private
 * @name has
 * @memberOf SetCache
 * @param {*} value The value to search for.
 * @returns {number} Returns `true` if `value` is found, else `false`.
 */
function setCacheHas(value) {
  return this.__data__.has(value);
}

module.exports = setCacheHas;


/***/ }),

/***/ 3919:
/***/ (function(module, exports) {

var __WEBPACK_AMD_DEFINE_FACTORY__, __WEBPACK_AMD_DEFINE_ARRAY__, __WEBPACK_AMD_DEFINE_RESULT__;(function (global, factory) {
  if (true) {
    !(__WEBPACK_AMD_DEFINE_ARRAY__ = [module], __WEBPACK_AMD_DEFINE_FACTORY__ = (factory),
		__WEBPACK_AMD_DEFINE_RESULT__ = (typeof __WEBPACK_AMD_DEFINE_FACTORY__ === 'function' ?
		(__WEBPACK_AMD_DEFINE_FACTORY__.apply(exports, __WEBPACK_AMD_DEFINE_ARRAY__)) : __WEBPACK_AMD_DEFINE_FACTORY__),
		__WEBPACK_AMD_DEFINE_RESULT__ !== undefined && (module.exports = __WEBPACK_AMD_DEFINE_RESULT__));
  } else { var mod; }
})(typeof globalThis !== "undefined" ? globalThis : typeof self !== "undefined" ? self : this, function (module) {
  /* webextension-polyfill - v0.6.0 - Mon Dec 23 2019 12:32:53 */

  /* -*- Mode: indent-tabs-mode: nil; js-indent-level: 2 -*- */

  /* vim: set sts=2 sw=2 et tw=80: */

  /* This Source Code Form is subject to the terms of the Mozilla Public
   * License, v. 2.0. If a copy of the MPL was not distributed with this
   * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
  "use strict";

  if (typeof browser === "undefined" || Object.getPrototypeOf(browser) !== Object.prototype) {
    const CHROME_SEND_MESSAGE_CALLBACK_NO_RESPONSE_MESSAGE = "The message port closed before a response was received.";
    const SEND_RESPONSE_DEPRECATION_WARNING = "Returning a Promise is the preferred way to send a reply from an onMessage/onMessageExternal listener, as the sendResponse will be removed from the specs (See https://developer.mozilla.org/docs/Mozilla/Add-ons/WebExtensions/API/runtime/onMessage)"; // Wrapping the bulk of this polyfill in a one-time-use function is a minor
    // optimization for Firefox. Since Spidermonkey does not fully parse the
    // contents of a function until the first time it's called, and since it will
    // never actually need to be called, this allows the polyfill to be included
    // in Firefox nearly for free.

    const wrapAPIs = extensionAPIs => {
      // NOTE: apiMetadata is associated to the content of the api-metadata.json file
      // at build time by replacing the following "include" with the content of the
      // JSON file.
      const apiMetadata = {
        "alarms": {
          "clear": {
            "minArgs": 0,
            "maxArgs": 1
          },
          "clearAll": {
            "minArgs": 0,
            "maxArgs": 0
          },
          "get": {
            "minArgs": 0,
            "maxArgs": 1
          },
          "getAll": {
            "minArgs": 0,
            "maxArgs": 0
          }
        },
        "bookmarks": {
          "create": {
            "minArgs": 1,
            "maxArgs": 1
          },
          "get": {
            "minArgs": 1,
            "maxArgs": 1
          },
          "getChildren": {
            "minArgs": 1,
            "maxArgs": 1
          },
          "getRecent": {
            "minArgs": 1,
            "maxArgs": 1
          },
          "getSubTree": {
            "minArgs": 1,
            "maxArgs": 1
          },
          "getTree": {
            "minArgs": 0,
            "maxArgs": 0
          },
          "move": {
            "minArgs": 2,
            "maxArgs": 2
          },
          "remove": {
            "minArgs": 1,
            "maxArgs": 1
          },
          "removeTree": {
            "minArgs": 1,
            "maxArgs": 1
          },
          "search": {
            "minArgs": 1,
            "maxArgs": 1
          },
          "update": {
            "minArgs": 2,
            "maxArgs": 2
          }
        },
        "browserAction": {
          "disable": {
            "minArgs": 0,
            "maxArgs": 1,
            "fallbackToNoCallback": true
          },
          "enable": {
            "minArgs": 0,
            "maxArgs": 1,
            "fallbackToNoCallback": true
          },
          "getBadgeBackgroundColor": {
            "minArgs": 1,
            "maxArgs": 1
          },
          "getBadgeText": {
            "minArgs": 1,
            "maxArgs": 1
          },
          "getPopup": {
            "minArgs": 1,
            "maxArgs": 1
          },
          "getTitle": {
            "minArgs": 1,
            "maxArgs": 1
          },
          "openPopup": {
            "minArgs": 0,
            "maxArgs": 0
          },
          "setBadgeBackgroundColor": {
            "minArgs": 1,
            "maxArgs": 1,
            "fallbackToNoCallback": true
          },
          "setBadgeText": {
            "minArgs": 1,
            "maxArgs": 1,
            "fallbackToNoCallback": true
          },
          "setIcon": {
            "minArgs": 1,
            "maxArgs": 1
          },
          "setPopup": {
            "minArgs": 1,
            "maxArgs": 1,
            "fallbackToNoCallback": true
          },
          "setTitle": {
            "minArgs": 1,
            "maxArgs": 1,
            "fallbackToNoCallback": true
          }
        },
        "browsingData": {
          "remove": {
            "minArgs": 2,
            "maxArgs": 2
          },
          "removeCache": {
            "minArgs": 1,
            "maxArgs": 1
          },
          "removeCookies": {
            "minArgs": 1,
            "maxArgs": 1
          },
          "removeDownloads": {
            "minArgs": 1,
            "maxArgs": 1
          },
          "removeFormData": {
            "minArgs": 1,
            "maxArgs": 1
          },
          "removeHistory": {
            "minArgs": 1,
            "maxArgs": 1
          },
          "removeLocalStorage": {
            "minArgs": 1,
            "maxArgs": 1
          },
          "removePasswords": {
            "minArgs": 1,
            "maxArgs": 1
          },
          "removePluginData": {
            "minArgs": 1,
            "maxArgs": 1
          },
          "settings": {
            "minArgs": 0,
            "maxArgs": 0
          }
        },
        "commands": {
          "getAll": {
            "minArgs": 0,
            "maxArgs": 0
          }
        },
        "contextMenus": {
          "remove": {
            "minArgs": 1,
            "maxArgs": 1
          },
          "removeAll": {
            "minArgs": 0,
            "maxArgs": 0
          },
          "update": {
            "minArgs": 2,
            "maxArgs": 2
          }
        },
        "cookies": {
          "get": {
            "minArgs": 1,
            "maxArgs": 1
          },
          "getAll": {
            "minArgs": 1,
            "maxArgs": 1
          },
          "getAllCookieStores": {
            "minArgs": 0,
            "maxArgs": 0
          },
          "remove": {
            "minArgs": 1,
            "maxArgs": 1
          },
          "set": {
            "minArgs": 1,
            "maxArgs": 1
          }
        },
        "devtools": {
          "inspectedWindow": {
            "eval": {
              "minArgs": 1,
              "maxArgs": 2,
              "singleCallbackArg": false
            }
          },
          "panels": {
            "create": {
              "minArgs": 3,
              "maxArgs": 3,
              "singleCallbackArg": true
            }
          }
        },
        "downloads": {
          "cancel": {
            "minArgs": 1,
            "maxArgs": 1
          },
          "download": {
            "minArgs": 1,
            "maxArgs": 1
          },
          "erase": {
            "minArgs": 1,
            "maxArgs": 1
          },
          "getFileIcon": {
            "minArgs": 1,
            "maxArgs": 2
          },
          "open": {
            "minArgs": 1,
            "maxArgs": 1,
            "fallbackToNoCallback": true
          },
          "pause": {
            "minArgs": 1,
            "maxArgs": 1
          },
          "removeFile": {
            "minArgs": 1,
            "maxArgs": 1
          },
          "resume": {
            "minArgs": 1,
            "maxArgs": 1
          },
          "search": {
            "minArgs": 1,
            "maxArgs": 1
          },
          "show": {
            "minArgs": 1,
            "maxArgs": 1,
            "fallbackToNoCallback": true
          }
        },
        "extension": {
          "isAllowedFileSchemeAccess": {
            "minArgs": 0,
            "maxArgs": 0
          },
          "isAllowedIncognitoAccess": {
            "minArgs": 0,
            "maxArgs": 0
          }
        },
        "history": {
          "addUrl": {
            "minArgs": 1,
            "maxArgs": 1
          },
          "deleteAll": {
            "minArgs": 0,
            "maxArgs": 0
          },
          "deleteRange": {
            "minArgs": 1,
            "maxArgs": 1
          },
          "deleteUrl": {
            "minArgs": 1,
            "maxArgs": 1
          },
          "getVisits": {
            "minArgs": 1,
            "maxArgs": 1
          },
          "search": {
            "minArgs": 1,
            "maxArgs": 1
          }
        },
        "i18n": {
          "detectLanguage": {
            "minArgs": 1,
            "maxArgs": 1
          },
          "getAcceptLanguages": {
            "minArgs": 0,
            "maxArgs": 0
          }
        },
        "identity": {
          "launchWebAuthFlow": {
            "minArgs": 1,
            "maxArgs": 1
          }
        },
        "idle": {
          "queryState": {
            "minArgs": 1,
            "maxArgs": 1
          }
        },
        "management": {
          "get": {
            "minArgs": 1,
            "maxArgs": 1
          },
          "getAll": {
            "minArgs": 0,
            "maxArgs": 0
          },
          "getSelf": {
            "minArgs": 0,
            "maxArgs": 0
          },
          "setEnabled": {
            "minArgs": 2,
            "maxArgs": 2
          },
          "uninstallSelf": {
            "minArgs": 0,
            "maxArgs": 1
          }
        },
        "notifications": {
          "clear": {
            "minArgs": 1,
            "maxArgs": 1
          },
          "create": {
            "minArgs": 1,
            "maxArgs": 2
          },
          "getAll": {
            "minArgs": 0,
            "maxArgs": 0
          },
          "getPermissionLevel": {
            "minArgs": 0,
            "maxArgs": 0
          },
          "update": {
            "minArgs": 2,
            "maxArgs": 2
          }
        },
        "pageAction": {
          "getPopup": {
            "minArgs": 1,
            "maxArgs": 1
          },
          "getTitle": {
            "minArgs": 1,
            "maxArgs": 1
          },
          "hide": {
            "minArgs": 1,
            "maxArgs": 1,
            "fallbackToNoCallback": true
          },
          "setIcon": {
            "minArgs": 1,
            "maxArgs": 1
          },
          "setPopup": {
            "minArgs": 1,
            "maxArgs": 1,
            "fallbackToNoCallback": true
          },
          "setTitle": {
            "minArgs": 1,
            "maxArgs": 1,
            "fallbackToNoCallback": true
          },
          "show": {
            "minArgs": 1,
            "maxArgs": 1,
            "fallbackToNoCallback": true
          }
        },
        "permissions": {
          "contains": {
            "minArgs": 1,
            "maxArgs": 1
          },
          "getAll": {
            "minArgs": 0,
            "maxArgs": 0
          },
          "remove": {
            "minArgs": 1,
            "maxArgs": 1
          },
          "request": {
            "minArgs": 1,
            "maxArgs": 1
          }
        },
        "runtime": {
          "getBackgroundPage": {
            "minArgs": 0,
            "maxArgs": 0
          },
          "getPlatformInfo": {
            "minArgs": 0,
            "maxArgs": 0
          },
          "openOptionsPage": {
            "minArgs": 0,
            "maxArgs": 0
          },
          "requestUpdateCheck": {
            "minArgs": 0,
            "maxArgs": 0
          },
          "sendMessage": {
            "minArgs": 1,
            "maxArgs": 3
          },
          "sendNativeMessage": {
            "minArgs": 2,
            "maxArgs": 2
          },
          "setUninstallURL": {
            "minArgs": 1,
            "maxArgs": 1
          }
        },
        "sessions": {
          "getDevices": {
            "minArgs": 0,
            "maxArgs": 1
          },
          "getRecentlyClosed": {
            "minArgs": 0,
            "maxArgs": 1
          },
          "restore": {
            "minArgs": 0,
            "maxArgs": 1
          }
        },
        "storage": {
          "local": {
            "clear": {
              "minArgs": 0,
              "maxArgs": 0
            },
            "get": {
              "minArgs": 0,
              "maxArgs": 1
            },
            "getBytesInUse": {
              "minArgs": 0,
              "maxArgs": 1
            },
            "remove": {
              "minArgs": 1,
              "maxArgs": 1
            },
            "set": {
              "minArgs": 1,
              "maxArgs": 1
            }
          },
          "managed": {
            "get": {
              "minArgs": 0,
              "maxArgs": 1
            },
            "getBytesInUse": {
              "minArgs": 0,
              "maxArgs": 1
            }
          },
          "sync": {
            "clear": {
              "minArgs": 0,
              "maxArgs": 0
            },
            "get": {
              "minArgs": 0,
              "maxArgs": 1
            },
            "getBytesInUse": {
              "minArgs": 0,
              "maxArgs": 1
            },
            "remove": {
              "minArgs": 1,
              "maxArgs": 1
            },
            "set": {
              "minArgs": 1,
              "maxArgs": 1
            }
          }
        },
        "tabs": {
          "captureVisibleTab": {
            "minArgs": 0,
            "maxArgs": 2
          },
          "create": {
            "minArgs": 1,
            "maxArgs": 1
          },
          "detectLanguage": {
            "minArgs": 0,
            "maxArgs": 1
          },
          "discard": {
            "minArgs": 0,
            "maxArgs": 1
          },
          "duplicate": {
            "minArgs": 1,
            "maxArgs": 1
          },
          "executeScript": {
            "minArgs": 1,
            "maxArgs": 2
          },
          "get": {
            "minArgs": 1,
            "maxArgs": 1
          },
          "getCurrent": {
            "minArgs": 0,
            "maxArgs": 0
          },
          "getZoom": {
            "minArgs": 0,
            "maxArgs": 1
          },
          "getZoomSettings": {
            "minArgs": 0,
            "maxArgs": 1
          },
          "highlight": {
            "minArgs": 1,
            "maxArgs": 1
          },
          "insertCSS": {
            "minArgs": 1,
            "maxArgs": 2
          },
          "move": {
            "minArgs": 2,
            "maxArgs": 2
          },
          "query": {
            "minArgs": 1,
            "maxArgs": 1
          },
          "reload": {
            "minArgs": 0,
            "maxArgs": 2
          },
          "remove": {
            "minArgs": 1,
            "maxArgs": 1
          },
          "removeCSS": {
            "minArgs": 1,
            "maxArgs": 2
          },
          "sendMessage": {
            "minArgs": 2,
            "maxArgs": 3
          },
          "setZoom": {
            "minArgs": 1,
            "maxArgs": 2
          },
          "setZoomSettings": {
            "minArgs": 1,
            "maxArgs": 2
          },
          "update": {
            "minArgs": 1,
            "maxArgs": 2
          }
        },
        "topSites": {
          "get": {
            "minArgs": 0,
            "maxArgs": 0
          }
        },
        "webNavigation": {
          "getAllFrames": {
            "minArgs": 1,
            "maxArgs": 1
          },
          "getFrame": {
            "minArgs": 1,
            "maxArgs": 1
          }
        },
        "webRequest": {
          "handlerBehaviorChanged": {
            "minArgs": 0,
            "maxArgs": 0
          }
        },
        "windows": {
          "create": {
            "minArgs": 0,
            "maxArgs": 1
          },
          "get": {
            "minArgs": 1,
            "maxArgs": 2
          },
          "getAll": {
            "minArgs": 0,
            "maxArgs": 1
          },
          "getCurrent": {
            "minArgs": 0,
            "maxArgs": 1
          },
          "getLastFocused": {
            "minArgs": 0,
            "maxArgs": 1
          },
          "remove": {
            "minArgs": 1,
            "maxArgs": 1
          },
          "update": {
            "minArgs": 2,
            "maxArgs": 2
          }
        }
      };

      if (Object.keys(apiMetadata).length === 0) {
        throw new Error("api-metadata.json has not been included in browser-polyfill");
      }
      /**
       * A WeakMap subclass which creates and stores a value for any key which does
       * not exist when accessed, but behaves exactly as an ordinary WeakMap
       * otherwise.
       *
       * @param {function} createItem
       *        A function which will be called in order to create the value for any
       *        key which does not exist, the first time it is accessed. The
       *        function receives, as its only argument, the key being created.
       */


      class DefaultWeakMap extends WeakMap {
        constructor(createItem, items = undefined) {
          super(items);
          this.createItem = createItem;
        }

        get(key) {
          if (!this.has(key)) {
            this.set(key, this.createItem(key));
          }

          return super.get(key);
        }

      }
      /**
       * Returns true if the given object is an object with a `then` method, and can
       * therefore be assumed to behave as a Promise.
       *
       * @param {*} value The value to test.
       * @returns {boolean} True if the value is thenable.
       */


      const isThenable = value => {
        return value && typeof value === "object" && typeof value.then === "function";
      };
      /**
       * Creates and returns a function which, when called, will resolve or reject
       * the given promise based on how it is called:
       *
       * - If, when called, `chrome.runtime.lastError` contains a non-null object,
       *   the promise is rejected with that value.
       * - If the function is called with exactly one argument, the promise is
       *   resolved to that value.
       * - Otherwise, the promise is resolved to an array containing all of the
       *   function's arguments.
       *
       * @param {object} promise
       *        An object containing the resolution and rejection functions of a
       *        promise.
       * @param {function} promise.resolve
       *        The promise's resolution function.
       * @param {function} promise.rejection
       *        The promise's rejection function.
       * @param {object} metadata
       *        Metadata about the wrapped method which has created the callback.
       * @param {integer} metadata.maxResolvedArgs
       *        The maximum number of arguments which may be passed to the
       *        callback created by the wrapped async function.
       *
       * @returns {function}
       *        The generated callback function.
       */


      const makeCallback = (promise, metadata) => {
        return (...callbackArgs) => {
          if (extensionAPIs.runtime.lastError) {
            promise.reject(extensionAPIs.runtime.lastError);
          } else if (metadata.singleCallbackArg || callbackArgs.length <= 1 && metadata.singleCallbackArg !== false) {
            promise.resolve(callbackArgs[0]);
          } else {
            promise.resolve(callbackArgs);
          }
        };
      };

      const pluralizeArguments = numArgs => numArgs == 1 ? "argument" : "arguments";
      /**
       * Creates a wrapper function for a method with the given name and metadata.
       *
       * @param {string} name
       *        The name of the method which is being wrapped.
       * @param {object} metadata
       *        Metadata about the method being wrapped.
       * @param {integer} metadata.minArgs
       *        The minimum number of arguments which must be passed to the
       *        function. If called with fewer than this number of arguments, the
       *        wrapper will raise an exception.
       * @param {integer} metadata.maxArgs
       *        The maximum number of arguments which may be passed to the
       *        function. If called with more than this number of arguments, the
       *        wrapper will raise an exception.
       * @param {integer} metadata.maxResolvedArgs
       *        The maximum number of arguments which may be passed to the
       *        callback created by the wrapped async function.
       *
       * @returns {function(object, ...*)}
       *       The generated wrapper function.
       */


      const wrapAsyncFunction = (name, metadata) => {
        return function asyncFunctionWrapper(target, ...args) {
          if (args.length < metadata.minArgs) {
            throw new Error(`Expected at least ${metadata.minArgs} ${pluralizeArguments(metadata.minArgs)} for ${name}(), got ${args.length}`);
          }

          if (args.length > metadata.maxArgs) {
            throw new Error(`Expected at most ${metadata.maxArgs} ${pluralizeArguments(metadata.maxArgs)} for ${name}(), got ${args.length}`);
          }

          return new Promise((resolve, reject) => {
            if (metadata.fallbackToNoCallback) {
              // This API method has currently no callback on Chrome, but it return a promise on Firefox,
              // and so the polyfill will try to call it with a callback first, and it will fallback
              // to not passing the callback if the first call fails.
              try {
                target[name](...args, makeCallback({
                  resolve,
                  reject
                }, metadata));
              } catch (cbError) {
                console.warn(`${name} API method doesn't seem to support the callback parameter, ` + "falling back to call it without a callback: ", cbError);
                target[name](...args); // Update the API method metadata, so that the next API calls will not try to
                // use the unsupported callback anymore.

                metadata.fallbackToNoCallback = false;
                metadata.noCallback = true;
                resolve();
              }
            } else if (metadata.noCallback) {
              target[name](...args);
              resolve();
            } else {
              target[name](...args, makeCallback({
                resolve,
                reject
              }, metadata));
            }
          });
        };
      };
      /**
       * Wraps an existing method of the target object, so that calls to it are
       * intercepted by the given wrapper function. The wrapper function receives,
       * as its first argument, the original `target` object, followed by each of
       * the arguments passed to the original method.
       *
       * @param {object} target
       *        The original target object that the wrapped method belongs to.
       * @param {function} method
       *        The method being wrapped. This is used as the target of the Proxy
       *        object which is created to wrap the method.
       * @param {function} wrapper
       *        The wrapper function which is called in place of a direct invocation
       *        of the wrapped method.
       *
       * @returns {Proxy<function>}
       *        A Proxy object for the given method, which invokes the given wrapper
       *        method in its place.
       */


      const wrapMethod = (target, method, wrapper) => {
        return new Proxy(method, {
          apply(targetMethod, thisObj, args) {
            return wrapper.call(thisObj, target, ...args);
          }

        });
      };

      let hasOwnProperty = Function.call.bind(Object.prototype.hasOwnProperty);
      /**
       * Wraps an object in a Proxy which intercepts and wraps certain methods
       * based on the given `wrappers` and `metadata` objects.
       *
       * @param {object} target
       *        The target object to wrap.
       *
       * @param {object} [wrappers = {}]
       *        An object tree containing wrapper functions for special cases. Any
       *        function present in this object tree is called in place of the
       *        method in the same location in the `target` object tree. These
       *        wrapper methods are invoked as described in {@see wrapMethod}.
       *
       * @param {object} [metadata = {}]
       *        An object tree containing metadata used to automatically generate
       *        Promise-based wrapper functions for asynchronous. Any function in
       *        the `target` object tree which has a corresponding metadata object
       *        in the same location in the `metadata` tree is replaced with an
       *        automatically-generated wrapper function, as described in
       *        {@see wrapAsyncFunction}
       *
       * @returns {Proxy<object>}
       */

      const wrapObject = (target, wrappers = {}, metadata = {}) => {
        let cache = Object.create(null);
        let handlers = {
          has(proxyTarget, prop) {
            return prop in target || prop in cache;
          },

          get(proxyTarget, prop, receiver) {
            if (prop in cache) {
              return cache[prop];
            }

            if (!(prop in target)) {
              return undefined;
            }

            let value = target[prop];

            if (typeof value === "function") {
              // This is a method on the underlying object. Check if we need to do
              // any wrapping.
              if (typeof wrappers[prop] === "function") {
                // We have a special-case wrapper for this method.
                value = wrapMethod(target, target[prop], wrappers[prop]);
              } else if (hasOwnProperty(metadata, prop)) {
                // This is an async method that we have metadata for. Create a
                // Promise wrapper for it.
                let wrapper = wrapAsyncFunction(prop, metadata[prop]);
                value = wrapMethod(target, target[prop], wrapper);
              } else {
                // This is a method that we don't know or care about. Return the
                // original method, bound to the underlying object.
                value = value.bind(target);
              }
            } else if (typeof value === "object" && value !== null && (hasOwnProperty(wrappers, prop) || hasOwnProperty(metadata, prop))) {
              // This is an object that we need to do some wrapping for the children
              // of. Create a sub-object wrapper for it with the appropriate child
              // metadata.
              value = wrapObject(value, wrappers[prop], metadata[prop]);
            } else if (hasOwnProperty(metadata, "*")) {
              // Wrap all properties in * namespace.
              value = wrapObject(value, wrappers[prop], metadata["*"]);
            } else {
              // We don't need to do any wrapping for this property,
              // so just forward all access to the underlying object.
              Object.defineProperty(cache, prop, {
                configurable: true,
                enumerable: true,

                get() {
                  return target[prop];
                },

                set(value) {
                  target[prop] = value;
                }

              });
              return value;
            }

            cache[prop] = value;
            return value;
          },

          set(proxyTarget, prop, value, receiver) {
            if (prop in cache) {
              cache[prop] = value;
            } else {
              target[prop] = value;
            }

            return true;
          },

          defineProperty(proxyTarget, prop, desc) {
            return Reflect.defineProperty(cache, prop, desc);
          },

          deleteProperty(proxyTarget, prop) {
            return Reflect.deleteProperty(cache, prop);
          }

        }; // Per contract of the Proxy API, the "get" proxy handler must return the
        // original value of the target if that value is declared read-only and
        // non-configurable. For this reason, we create an object with the
        // prototype set to `target` instead of using `target` directly.
        // Otherwise we cannot return a custom object for APIs that
        // are declared read-only and non-configurable, such as `chrome.devtools`.
        //
        // The proxy handlers themselves will still use the original `target`
        // instead of the `proxyTarget`, so that the methods and properties are
        // dereferenced via the original targets.

        let proxyTarget = Object.create(target);
        return new Proxy(proxyTarget, handlers);
      };
      /**
       * Creates a set of wrapper functions for an event object, which handles
       * wrapping of listener functions that those messages are passed.
       *
       * A single wrapper is created for each listener function, and stored in a
       * map. Subsequent calls to `addListener`, `hasListener`, or `removeListener`
       * retrieve the original wrapper, so that  attempts to remove a
       * previously-added listener work as expected.
       *
       * @param {DefaultWeakMap<function, function>} wrapperMap
       *        A DefaultWeakMap object which will create the appropriate wrapper
       *        for a given listener function when one does not exist, and retrieve
       *        an existing one when it does.
       *
       * @returns {object}
       */


      const wrapEvent = wrapperMap => ({
        addListener(target, listener, ...args) {
          target.addListener(wrapperMap.get(listener), ...args);
        },

        hasListener(target, listener) {
          return target.hasListener(wrapperMap.get(listener));
        },

        removeListener(target, listener) {
          target.removeListener(wrapperMap.get(listener));
        }

      }); // Keep track if the deprecation warning has been logged at least once.


      let loggedSendResponseDeprecationWarning = false;
      const onMessageWrappers = new DefaultWeakMap(listener => {
        if (typeof listener !== "function") {
          return listener;
        }
        /**
         * Wraps a message listener function so that it may send responses based on
         * its return value, rather than by returning a sentinel value and calling a
         * callback. If the listener function returns a Promise, the response is
         * sent when the promise either resolves or rejects.
         *
         * @param {*} message
         *        The message sent by the other end of the channel.
         * @param {object} sender
         *        Details about the sender of the message.
         * @param {function(*)} sendResponse
         *        A callback which, when called with an arbitrary argument, sends
         *        that value as a response.
         * @returns {boolean}
         *        True if the wrapped listener returned a Promise, which will later
         *        yield a response. False otherwise.
         */


        return function onMessage(message, sender, sendResponse) {
          let didCallSendResponse = false;
          let wrappedSendResponse;
          let sendResponsePromise = new Promise(resolve => {
            wrappedSendResponse = function (response) {
              if (!loggedSendResponseDeprecationWarning) {
                console.warn(SEND_RESPONSE_DEPRECATION_WARNING, new Error().stack);
                loggedSendResponseDeprecationWarning = true;
              }

              didCallSendResponse = true;
              resolve(response);
            };
          });
          let result;

          try {
            result = listener(message, sender, wrappedSendResponse);
          } catch (err) {
            result = Promise.reject(err);
          }

          const isResultThenable = result !== true && isThenable(result); // If the listener didn't returned true or a Promise, or called
          // wrappedSendResponse synchronously, we can exit earlier
          // because there will be no response sent from this listener.

          if (result !== true && !isResultThenable && !didCallSendResponse) {
            return false;
          } // A small helper to send the message if the promise resolves
          // and an error if the promise rejects (a wrapped sendMessage has
          // to translate the message into a resolved promise or a rejected
          // promise).


          const sendPromisedResult = promise => {
            promise.then(msg => {
              // send the message value.
              sendResponse(msg);
            }, error => {
              // Send a JSON representation of the error if the rejected value
              // is an instance of error, or the object itself otherwise.
              let message;

              if (error && (error instanceof Error || typeof error.message === "string")) {
                message = error.message;
              } else {
                message = "An unexpected error occurred";
              }

              sendResponse({
                __mozWebExtensionPolyfillReject__: true,
                message
              });
            }).catch(err => {
              // Print an error on the console if unable to send the response.
              console.error("Failed to send onMessage rejected reply", err);
            });
          }; // If the listener returned a Promise, send the resolved value as a
          // result, otherwise wait the promise related to the wrappedSendResponse
          // callback to resolve and send it as a response.


          if (isResultThenable) {
            sendPromisedResult(result);
          } else {
            sendPromisedResult(sendResponsePromise);
          } // Let Chrome know that the listener is replying.


          return true;
        };
      });

      const wrappedSendMessageCallback = ({
        reject,
        resolve
      }, reply) => {
        if (extensionAPIs.runtime.lastError) {
          // Detect when none of the listeners replied to the sendMessage call and resolve
          // the promise to undefined as in Firefox.
          // See https://github.com/mozilla/webextension-polyfill/issues/130
          if (extensionAPIs.runtime.lastError.message === CHROME_SEND_MESSAGE_CALLBACK_NO_RESPONSE_MESSAGE) {
            resolve();
          } else {
            reject(extensionAPIs.runtime.lastError);
          }
        } else if (reply && reply.__mozWebExtensionPolyfillReject__) {
          // Convert back the JSON representation of the error into
          // an Error instance.
          reject(new Error(reply.message));
        } else {
          resolve(reply);
        }
      };

      const wrappedSendMessage = (name, metadata, apiNamespaceObj, ...args) => {
        if (args.length < metadata.minArgs) {
          throw new Error(`Expected at least ${metadata.minArgs} ${pluralizeArguments(metadata.minArgs)} for ${name}(), got ${args.length}`);
        }

        if (args.length > metadata.maxArgs) {
          throw new Error(`Expected at most ${metadata.maxArgs} ${pluralizeArguments(metadata.maxArgs)} for ${name}(), got ${args.length}`);
        }

        return new Promise((resolve, reject) => {
          const wrappedCb = wrappedSendMessageCallback.bind(null, {
            resolve,
            reject
          });
          args.push(wrappedCb);
          apiNamespaceObj.sendMessage(...args);
        });
      };

      const staticWrappers = {
        runtime: {
          onMessage: wrapEvent(onMessageWrappers),
          onMessageExternal: wrapEvent(onMessageWrappers),
          sendMessage: wrappedSendMessage.bind(null, "sendMessage", {
            minArgs: 1,
            maxArgs: 3
          })
        },
        tabs: {
          sendMessage: wrappedSendMessage.bind(null, "sendMessage", {
            minArgs: 2,
            maxArgs: 3
          })
        }
      };
      const settingMetadata = {
        clear: {
          minArgs: 1,
          maxArgs: 1
        },
        get: {
          minArgs: 1,
          maxArgs: 1
        },
        set: {
          minArgs: 1,
          maxArgs: 1
        }
      };
      apiMetadata.privacy = {
        network: {
          "*": settingMetadata
        },
        services: {
          "*": settingMetadata
        },
        websites: {
          "*": settingMetadata
        }
      };
      return wrapObject(extensionAPIs, staticWrappers, apiMetadata);
    };

    if (typeof chrome != "object" || !chrome || !chrome.runtime || !chrome.runtime.id) {
      throw new Error("This script should only be loaded in a browser extension.");
    } // The build process adds a UMD wrapper around this file, which makes the
    // `module` variable available.


    module.exports = wrapAPIs(chrome);
  } else {
    module.exports = browser;
  }
});
//# sourceMappingURL=browser-polyfill.js.map


/***/ }),

/***/ 3961:
/***/ ((module) => {

/** Used to match a single whitespace character. */
var reWhitespace = /\s/;

/**
 * Used by `_.trim` and `_.trimEnd` to get the index of the last non-whitespace
 * character of `string`.
 *
 * @private
 * @param {string} string The string to inspect.
 * @returns {number} Returns the index of the last non-whitespace character.
 */
function trimmedEndIndex(string) {
  var index = string.length;

  while (index-- && reWhitespace.test(string.charAt(index))) {}
  return index;
}

module.exports = trimmedEndIndex;


/***/ }),

/***/ 4001:
/***/ ((module) => {

/**
 * Removes all key-value entries from the list cache.
 *
 * @private
 * @name clear
 * @memberOf ListCache
 */
function listCacheClear() {
  this.__data__ = [];
  this.size = 0;
}

module.exports = listCacheClear;


/***/ }),

/***/ 4195:
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

var arrayLikeKeys = __webpack_require__(1278),
    baseKeys = __webpack_require__(6907),
    isArrayLike = __webpack_require__(601);

/**
 * Creates an array of the own enumerable property names of `object`.
 *
 * **Note:** Non-object values are coerced to objects. See the
 * [ES spec](http://ecma-international.org/ecma-262/7.0/#sec-object.keys)
 * for more details.
 *
 * @static
 * @since 0.1.0
 * @memberOf _
 * @category Object
 * @param {Object} object The object to query.
 * @returns {Array} Returns the array of property names.
 * @example
 *
 * function Foo() {
 *   this.a = 1;
 *   this.b = 2;
 * }
 *
 * Foo.prototype.c = 3;
 *
 * _.keys(new Foo);
 * // => ['a', 'b'] (iteration order is not guaranteed)
 *
 * _.keys('hi');
 * // => ['0', '1']
 */
function keys(object) {
  return isArrayLike(object) ? arrayLikeKeys(object) : baseKeys(object);
}

module.exports = keys;


/***/ }),

/***/ 4420:
/***/ ((module) => {

/**
 * Checks if `value` is the
 * [language type](http://www.ecma-international.org/ecma-262/7.0/#sec-ecmascript-language-types)
 * of `Object`. (e.g. arrays, functions, objects, regexes, `new Number(0)`, and `new String('')`)
 *
 * @static
 * @memberOf _
 * @since 0.1.0
 * @category Lang
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is an object, else `false`.
 * @example
 *
 * _.isObject({});
 * // => true
 *
 * _.isObject([1, 2, 3]);
 * // => true
 *
 * _.isObject(_.noop);
 * // => true
 *
 * _.isObject(null);
 * // => false
 */
function isObject(value) {
  var type = typeof value;
  return value != null && (type == 'object' || type == 'function');
}

module.exports = isObject;


/***/ }),

/***/ 4472:
/***/ ((module) => {

/** Used as references for various `Number` constants. */
var MAX_SAFE_INTEGER = 9007199254740991;

/** Used to detect unsigned integer values. */
var reIsUint = /^(?:0|[1-9]\d*)$/;

/**
 * Checks if `value` is a valid array-like index.
 *
 * @private
 * @param {*} value The value to check.
 * @param {number} [length=MAX_SAFE_INTEGER] The upper bounds of a valid index.
 * @returns {boolean} Returns `true` if `value` is a valid index, else `false`.
 */
function isIndex(value, length) {
  var type = typeof value;
  length = length == null ? MAX_SAFE_INTEGER : length;

  return !!length &&
    (type == 'number' ||
      (type != 'symbol' && reIsUint.test(value))) &&
        (value > -1 && value % 1 == 0 && value < length);
}

module.exports = isIndex;


/***/ }),

/***/ 4539:
/***/ ((module) => {

/**
 * Checks if `value` is object-like. A value is object-like if it's not `null`
 * and has a `typeof` result of "object".
 *
 * @static
 * @memberOf _
 * @since 4.0.0
 * @category Lang
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is object-like, else `false`.
 * @example
 *
 * _.isObjectLike({});
 * // => true
 *
 * _.isObjectLike([1, 2, 3]);
 * // => true
 *
 * _.isObjectLike(_.noop);
 * // => false
 *
 * _.isObjectLike(null);
 * // => false
 */
function isObjectLike(value) {
  return value != null && typeof value == 'object';
}

module.exports = isObjectLike;


/***/ }),

/***/ 4753:
/***/ ((module) => {

/**
 * The base implementation of `_.times` without support for iteratee shorthands
 * or max array length checks.
 *
 * @private
 * @param {number} n The number of times to invoke `iteratee`.
 * @param {Function} iteratee The function invoked per iteration.
 * @returns {Array} Returns the array of results.
 */
function baseTimes(n, iteratee) {
  var index = -1,
      result = Array(n);

  while (++index < n) {
    result[index] = iteratee(index);
  }
  return result;
}

module.exports = baseTimes;


/***/ }),

/***/ 4808:
/***/ ((module) => {

/**
 * Checks if a `cache` value for `key` exists.
 *
 * @private
 * @param {Object} cache The cache to query.
 * @param {string} key The key of the entry to check.
 * @returns {boolean} Returns `true` if an entry for `key` exists, else `false`.
 */
function cacheHas(cache, key) {
  return cache.has(key);
}

module.exports = cacheHas;


/***/ }),

/***/ 4932:
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

var assocIndexOf = __webpack_require__(274);

/**
 * Sets the list cache `key` to `value`.
 *
 * @private
 * @name set
 * @memberOf ListCache
 * @param {string} key The key of the value to set.
 * @param {*} value The value to set.
 * @returns {Object} Returns the list cache instance.
 */
function listCacheSet(key, value) {
  var data = this.__data__,
      index = assocIndexOf(data, key);

  if (index < 0) {
    ++this.size;
    data.push([key, value]);
  } else {
    data[index][1] = value;
  }
  return this;
}

module.exports = listCacheSet;


/***/ }),

/***/ 4947:
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

var baseIsNative = __webpack_require__(7136),
    getValue = __webpack_require__(2979);

/**
 * Gets the native function at `key` of `object`.
 *
 * @private
 * @param {Object} object The object to query.
 * @param {string} key The key of the method to get.
 * @returns {*} Returns the function if it's native, else `undefined`.
 */
function getNative(object, key) {
  var value = getValue(object, key);
  return baseIsNative(value) ? value : undefined;
}

module.exports = getNative;


/***/ }),

/***/ 5038:
/***/ ((module) => {

/**
 * Checks if `value` is classified as an `Array` object.
 *
 * @static
 * @memberOf _
 * @since 0.1.0
 * @category Lang
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is an array, else `false`.
 * @example
 *
 * _.isArray([1, 2, 3]);
 * // => true
 *
 * _.isArray(document.body.children);
 * // => false
 *
 * _.isArray('abc');
 * // => false
 *
 * _.isArray(_.noop);
 * // => false
 */
var isArray = Array.isArray;

module.exports = isArray;


/***/ }),

/***/ 5074:
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

var baseIsTypedArray = __webpack_require__(7786),
    baseUnary = __webpack_require__(860),
    nodeUtil = __webpack_require__(8762);

/* Node.js helper references. */
var nodeIsTypedArray = nodeUtil && nodeUtil.isTypedArray;

/**
 * Checks if `value` is classified as a typed array.
 *
 * @static
 * @memberOf _
 * @since 3.0.0
 * @category Lang
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is a typed array, else `false`.
 * @example
 *
 * _.isTypedArray(new Uint8Array);
 * // => true
 *
 * _.isTypedArray([]);
 * // => false
 */
var isTypedArray = nodeIsTypedArray ? baseUnary(nodeIsTypedArray) : baseIsTypedArray;

module.exports = isTypedArray;


/***/ }),

/***/ 5331:
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

var baseGetTag = __webpack_require__(7259),
    isObjectLike = __webpack_require__(4539);

/** `Object#toString` result references. */
var argsTag = '[object Arguments]';

/**
 * The base implementation of `_.isArguments`.
 *
 * @private
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is an `arguments` object,
 */
function baseIsArguments(value) {
  return isObjectLike(value) && baseGetTag(value) == argsTag;
}

module.exports = baseIsArguments;


/***/ }),

/***/ 5428:
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

var ListCache = __webpack_require__(6642),
    stackClear = __webpack_require__(9375),
    stackDelete = __webpack_require__(1723),
    stackGet = __webpack_require__(1834),
    stackHas = __webpack_require__(1710),
    stackSet = __webpack_require__(5542);

/**
 * Creates a stack cache object to store key-value pairs.
 *
 * @private
 * @constructor
 * @param {Array} [entries] The key-value pairs to cache.
 */
function Stack(entries) {
  var data = this.__data__ = new ListCache(entries);
  this.size = data.size;
}

// Add methods to `Stack`.
Stack.prototype.clear = stackClear;
Stack.prototype['delete'] = stackDelete;
Stack.prototype.get = stackGet;
Stack.prototype.has = stackHas;
Stack.prototype.set = stackSet;

module.exports = Stack;


/***/ }),

/***/ 5470:
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

var Symbol = __webpack_require__(7930);

/** Used for built-in method references. */
var objectProto = Object.prototype;

/** Used to check objects for own properties. */
var hasOwnProperty = objectProto.hasOwnProperty;

/**
 * Used to resolve the
 * [`toStringTag`](http://ecma-international.org/ecma-262/7.0/#sec-object.prototype.tostring)
 * of values.
 */
var nativeObjectToString = objectProto.toString;

/** Built-in value references. */
var symToStringTag = Symbol ? Symbol.toStringTag : undefined;

/**
 * A specialized version of `baseGetTag` which ignores `Symbol.toStringTag` values.
 *
 * @private
 * @param {*} value The value to query.
 * @returns {string} Returns the raw `toStringTag`.
 */
function getRawTag(value) {
  var isOwn = hasOwnProperty.call(value, symToStringTag),
      tag = value[symToStringTag];

  try {
    value[symToStringTag] = undefined;
    var unmasked = true;
  } catch (e) {}

  var result = nativeObjectToString.call(value);
  if (unmasked) {
    if (isOwn) {
      value[symToStringTag] = tag;
    } else {
      delete value[symToStringTag];
    }
  }
  return result;
}

module.exports = getRawTag;


/***/ }),

/***/ 5542:
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

var ListCache = __webpack_require__(6642),
    Map = __webpack_require__(2994),
    MapCache = __webpack_require__(1538);

/** Used as the size to enable large array optimizations. */
var LARGE_ARRAY_SIZE = 200;

/**
 * Sets the stack `key` to `value`.
 *
 * @private
 * @name set
 * @memberOf Stack
 * @param {string} key The key of the value to set.
 * @param {*} value The value to set.
 * @returns {Object} Returns the stack cache instance.
 */
function stackSet(key, value) {
  var data = this.__data__;
  if (data instanceof ListCache) {
    var pairs = data.__data__;
    if (!Map || (pairs.length < LARGE_ARRAY_SIZE - 1)) {
      pairs.push([key, value]);
      this.size = ++data.size;
      return this;
    }
    data = this.__data__ = new MapCache(pairs);
  }
  data.set(key, value);
  this.size = data.size;
  return this;
}

module.exports = stackSet;


/***/ }),

/***/ 5697:
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

var baseGetAllKeys = __webpack_require__(8492),
    getSymbols = __webpack_require__(9971),
    keys = __webpack_require__(4195);

/**
 * Creates an array of own enumerable property names and symbols of `object`.
 *
 * @private
 * @param {Object} object The object to query.
 * @returns {Array} Returns the array of property names and symbols.
 */
function getAllKeys(object) {
  return baseGetAllKeys(object, keys, getSymbols);
}

module.exports = getAllKeys;


/***/ }),

/***/ 5803:
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

var trimmedEndIndex = __webpack_require__(3961);

/** Used to match leading whitespace. */
var reTrimStart = /^\s+/;

/**
 * The base implementation of `_.trim`.
 *
 * @private
 * @param {string} string The string to trim.
 * @returns {string} Returns the trimmed string.
 */
function baseTrim(string) {
  return string
    ? string.slice(0, trimmedEndIndex(string) + 1).replace(reTrimStart, '')
    : string;
}

module.exports = baseTrim;


/***/ }),

/***/ 5831:
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

var root = __webpack_require__(8454);

/**
 * Gets the timestamp of the number of milliseconds that have elapsed since
 * the Unix epoch (1 January 1970 00:00:00 UTC).
 *
 * @static
 * @memberOf _
 * @since 2.4.0
 * @category Date
 * @returns {number} Returns the timestamp.
 * @example
 *
 * _.defer(function(stamp) {
 *   console.log(_.now() - stamp);
 * }, _.now());
 * // => Logs the number of milliseconds it took for the deferred invocation.
 */
var now = function() {
  return root.Date.now();
};

module.exports = now;


/***/ }),

/***/ 5904:
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

var assocIndexOf = __webpack_require__(274);

/**
 * Gets the list cache value for `key`.
 *
 * @private
 * @name get
 * @memberOf ListCache
 * @param {string} key The key of the value to get.
 * @returns {*} Returns the entry value.
 */
function listCacheGet(key) {
  var data = this.__data__,
      index = assocIndexOf(data, key);

  return index < 0 ? undefined : data[index][1];
}

module.exports = listCacheGet;


/***/ }),

/***/ 5956:
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

var nativeCreate = __webpack_require__(953);

/** Used for built-in method references. */
var objectProto = Object.prototype;

/** Used to check objects for own properties. */
var hasOwnProperty = objectProto.hasOwnProperty;

/**
 * Checks if a hash value for `key` exists.
 *
 * @private
 * @name has
 * @memberOf Hash
 * @param {string} key The key of the entry to check.
 * @returns {boolean} Returns `true` if an entry for `key` exists, else `false`.
 */
function hashHas(key) {
  var data = this.__data__;
  return nativeCreate ? (data[key] !== undefined) : hasOwnProperty.call(data, key);
}

module.exports = hashHas;


/***/ }),

/***/ 6265:
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

var getMapData = __webpack_require__(628);

/**
 * Removes `key` and its value from the map.
 *
 * @private
 * @name delete
 * @memberOf MapCache
 * @param {string} key The key of the value to remove.
 * @returns {boolean} Returns `true` if the entry was removed, else `false`.
 */
function mapCacheDelete(key) {
  var result = getMapData(this, key)['delete'](key);
  this.size -= result ? 1 : 0;
  return result;
}

module.exports = mapCacheDelete;


/***/ }),

/***/ 6503:
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

var baseIsEqualDeep = __webpack_require__(7977),
    isObjectLike = __webpack_require__(4539);

/**
 * The base implementation of `_.isEqual` which supports partial comparisons
 * and tracks traversed objects.
 *
 * @private
 * @param {*} value The value to compare.
 * @param {*} other The other value to compare.
 * @param {boolean} bitmask The bitmask flags.
 *  1 - Unordered comparison
 *  2 - Partial comparison
 * @param {Function} [customizer] The function to customize comparisons.
 * @param {Object} [stack] Tracks traversed `value` and `other` objects.
 * @returns {boolean} Returns `true` if the values are equivalent, else `false`.
 */
function baseIsEqual(value, other, bitmask, customizer, stack) {
  if (value === other) {
    return true;
  }
  if (value == null || other == null || (!isObjectLike(value) && !isObjectLike(other))) {
    return value !== value && other !== other;
  }
  return baseIsEqualDeep(value, other, bitmask, customizer, baseIsEqual, stack);
}

module.exports = baseIsEqual;


/***/ }),

/***/ 6642:
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

var listCacheClear = __webpack_require__(4001),
    listCacheDelete = __webpack_require__(7641),
    listCacheGet = __webpack_require__(5904),
    listCacheHas = __webpack_require__(2036),
    listCacheSet = __webpack_require__(4932);

/**
 * Creates an list cache object.
 *
 * @private
 * @constructor
 * @param {Array} [entries] The key-value pairs to cache.
 */
function ListCache(entries) {
  var index = -1,
      length = entries == null ? 0 : entries.length;

  this.clear();
  while (++index < length) {
    var entry = entries[index];
    this.set(entry[0], entry[1]);
  }
}

// Add methods to `ListCache`.
ListCache.prototype.clear = listCacheClear;
ListCache.prototype['delete'] = listCacheDelete;
ListCache.prototype.get = listCacheGet;
ListCache.prototype.has = listCacheHas;
ListCache.prototype.set = listCacheSet;

module.exports = ListCache;


/***/ }),

/***/ 6907:
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

var isPrototype = __webpack_require__(9946),
    nativeKeys = __webpack_require__(3329);

/** Used for built-in method references. */
var objectProto = Object.prototype;

/** Used to check objects for own properties. */
var hasOwnProperty = objectProto.hasOwnProperty;

/**
 * The base implementation of `_.keys` which doesn't treat sparse arrays as dense.
 *
 * @private
 * @param {Object} object The object to query.
 * @returns {Array} Returns the array of property names.
 */
function baseKeys(object) {
  if (!isPrototype(object)) {
    return nativeKeys(object);
  }
  var result = [];
  for (var key in Object(object)) {
    if (hasOwnProperty.call(object, key) && key != 'constructor') {
      result.push(key);
    }
  }
  return result;
}

module.exports = baseKeys;


/***/ }),

/***/ 7136:
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

var isFunction = __webpack_require__(8079),
    isMasked = __webpack_require__(767),
    isObject = __webpack_require__(4420),
    toSource = __webpack_require__(1514);

/**
 * Used to match `RegExp`
 * [syntax characters](http://ecma-international.org/ecma-262/7.0/#sec-patterns).
 */
var reRegExpChar = /[\\^$.*+?()[\]{}|]/g;

/** Used to detect host constructors (Safari). */
var reIsHostCtor = /^\[object .+?Constructor\]$/;

/** Used for built-in method references. */
var funcProto = Function.prototype,
    objectProto = Object.prototype;

/** Used to resolve the decompiled source of functions. */
var funcToString = funcProto.toString;

/** Used to check objects for own properties. */
var hasOwnProperty = objectProto.hasOwnProperty;

/** Used to detect if a method is native. */
var reIsNative = RegExp('^' +
  funcToString.call(hasOwnProperty).replace(reRegExpChar, '\\$&')
  .replace(/hasOwnProperty|(function).*?(?=\\\()| for .+?(?=\\\])/g, '$1.*?') + '$'
);

/**
 * The base implementation of `_.isNative` without bad shim checks.
 *
 * @private
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is a native function,
 *  else `false`.
 */
function baseIsNative(value) {
  if (!isObject(value) || isMasked(value)) {
    return false;
  }
  var pattern = isFunction(value) ? reIsNative : reIsHostCtor;
  return pattern.test(toSource(value));
}

module.exports = baseIsNative;


/***/ }),

/***/ 7163:
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

var baseIsArguments = __webpack_require__(5331),
    isObjectLike = __webpack_require__(4539);

/** Used for built-in method references. */
var objectProto = Object.prototype;

/** Used to check objects for own properties. */
var hasOwnProperty = objectProto.hasOwnProperty;

/** Built-in value references. */
var propertyIsEnumerable = objectProto.propertyIsEnumerable;

/**
 * Checks if `value` is likely an `arguments` object.
 *
 * @static
 * @memberOf _
 * @since 0.1.0
 * @category Lang
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is an `arguments` object,
 *  else `false`.
 * @example
 *
 * _.isArguments(function() { return arguments; }());
 * // => true
 *
 * _.isArguments([1, 2, 3]);
 * // => false
 */
var isArguments = baseIsArguments(function() { return arguments; }()) ? baseIsArguments : function(value) {
  return isObjectLike(value) && hasOwnProperty.call(value, 'callee') &&
    !propertyIsEnumerable.call(value, 'callee');
};

module.exports = isArguments;


/***/ }),

/***/ 7199:
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

/** Detect free variable `global` from Node.js. */
var freeGlobal = typeof __webpack_require__.g == 'object' && __webpack_require__.g && __webpack_require__.g.Object === Object && __webpack_require__.g;

module.exports = freeGlobal;


/***/ }),

/***/ 7259:
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

var Symbol = __webpack_require__(7930),
    getRawTag = __webpack_require__(5470),
    objectToString = __webpack_require__(773);

/** `Object#toString` result references. */
var nullTag = '[object Null]',
    undefinedTag = '[object Undefined]';

/** Built-in value references. */
var symToStringTag = Symbol ? Symbol.toStringTag : undefined;

/**
 * The base implementation of `getTag` without fallbacks for buggy environments.
 *
 * @private
 * @param {*} value The value to query.
 * @returns {string} Returns the `toStringTag`.
 */
function baseGetTag(value) {
  if (value == null) {
    return value === undefined ? undefinedTag : nullTag;
  }
  return (symToStringTag && symToStringTag in Object(value))
    ? getRawTag(value)
    : objectToString(value);
}

module.exports = baseGetTag;


/***/ }),

/***/ 7330:
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

var hashClear = __webpack_require__(2369),
    hashDelete = __webpack_require__(8569),
    hashGet = __webpack_require__(9824),
    hashHas = __webpack_require__(5956),
    hashSet = __webpack_require__(8852);

/**
 * Creates a hash object.
 *
 * @private
 * @constructor
 * @param {Array} [entries] The key-value pairs to cache.
 */
function Hash(entries) {
  var index = -1,
      length = entries == null ? 0 : entries.length;

  this.clear();
  while (++index < length) {
    var entry = entries[index];
    this.set(entry[0], entry[1]);
  }
}

// Add methods to `Hash`.
Hash.prototype.clear = hashClear;
Hash.prototype['delete'] = hashDelete;
Hash.prototype.get = hashGet;
Hash.prototype.has = hashHas;
Hash.prototype.set = hashSet;

module.exports = Hash;


/***/ }),

/***/ 7493:
/***/ ((module, exports, __webpack_require__) => {

/* module decorator */ module = __webpack_require__.nmd(module);
var root = __webpack_require__(8454),
    stubFalse = __webpack_require__(2044);

/** Detect free variable `exports`. */
var freeExports =  true && exports && !exports.nodeType && exports;

/** Detect free variable `module`. */
var freeModule = freeExports && "object" == 'object' && module && !module.nodeType && module;

/** Detect the popular CommonJS extension `module.exports`. */
var moduleExports = freeModule && freeModule.exports === freeExports;

/** Built-in value references. */
var Buffer = moduleExports ? root.Buffer : undefined;

/* Built-in method references for those with the same name as other `lodash` methods. */
var nativeIsBuffer = Buffer ? Buffer.isBuffer : undefined;

/**
 * Checks if `value` is a buffer.
 *
 * @static
 * @memberOf _
 * @since 4.3.0
 * @category Lang
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is a buffer, else `false`.
 * @example
 *
 * _.isBuffer(new Buffer(2));
 * // => true
 *
 * _.isBuffer(new Uint8Array(2));
 * // => false
 */
var isBuffer = nativeIsBuffer || stubFalse;

module.exports = isBuffer;


/***/ }),

/***/ 7597:
/***/ ((module) => {

/** Used to stand-in for `undefined` hash values. */
var HASH_UNDEFINED = '__lodash_hash_undefined__';

/**
 * Adds `value` to the array cache.
 *
 * @private
 * @name add
 * @memberOf SetCache
 * @alias push
 * @param {*} value The value to cache.
 * @returns {Object} Returns the cache instance.
 */
function setCacheAdd(value) {
  this.__data__.set(value, HASH_UNDEFINED);
  return this;
}

module.exports = setCacheAdd;


/***/ }),

/***/ 7641:
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

var assocIndexOf = __webpack_require__(274);

/** Used for built-in method references. */
var arrayProto = Array.prototype;

/** Built-in value references. */
var splice = arrayProto.splice;

/**
 * Removes `key` and its value from the list cache.
 *
 * @private
 * @name delete
 * @memberOf ListCache
 * @param {string} key The key of the value to remove.
 * @returns {boolean} Returns `true` if the entry was removed, else `false`.
 */
function listCacheDelete(key) {
  var data = this.__data__,
      index = assocIndexOf(data, key);

  if (index < 0) {
    return false;
  }
  var lastIndex = data.length - 1;
  if (index == lastIndex) {
    data.pop();
  } else {
    splice.call(data, index, 1);
  }
  --this.size;
  return true;
}

module.exports = listCacheDelete;


/***/ }),

/***/ 7786:
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

var baseGetTag = __webpack_require__(7259),
    isLength = __webpack_require__(9459),
    isObjectLike = __webpack_require__(4539);

/** `Object#toString` result references. */
var argsTag = '[object Arguments]',
    arrayTag = '[object Array]',
    boolTag = '[object Boolean]',
    dateTag = '[object Date]',
    errorTag = '[object Error]',
    funcTag = '[object Function]',
    mapTag = '[object Map]',
    numberTag = '[object Number]',
    objectTag = '[object Object]',
    regexpTag = '[object RegExp]',
    setTag = '[object Set]',
    stringTag = '[object String]',
    weakMapTag = '[object WeakMap]';

var arrayBufferTag = '[object ArrayBuffer]',
    dataViewTag = '[object DataView]',
    float32Tag = '[object Float32Array]',
    float64Tag = '[object Float64Array]',
    int8Tag = '[object Int8Array]',
    int16Tag = '[object Int16Array]',
    int32Tag = '[object Int32Array]',
    uint8Tag = '[object Uint8Array]',
    uint8ClampedTag = '[object Uint8ClampedArray]',
    uint16Tag = '[object Uint16Array]',
    uint32Tag = '[object Uint32Array]';

/** Used to identify `toStringTag` values of typed arrays. */
var typedArrayTags = {};
typedArrayTags[float32Tag] = typedArrayTags[float64Tag] =
typedArrayTags[int8Tag] = typedArrayTags[int16Tag] =
typedArrayTags[int32Tag] = typedArrayTags[uint8Tag] =
typedArrayTags[uint8ClampedTag] = typedArrayTags[uint16Tag] =
typedArrayTags[uint32Tag] = true;
typedArrayTags[argsTag] = typedArrayTags[arrayTag] =
typedArrayTags[arrayBufferTag] = typedArrayTags[boolTag] =
typedArrayTags[dataViewTag] = typedArrayTags[dateTag] =
typedArrayTags[errorTag] = typedArrayTags[funcTag] =
typedArrayTags[mapTag] = typedArrayTags[numberTag] =
typedArrayTags[objectTag] = typedArrayTags[regexpTag] =
typedArrayTags[setTag] = typedArrayTags[stringTag] =
typedArrayTags[weakMapTag] = false;

/**
 * The base implementation of `_.isTypedArray` without Node.js optimizations.
 *
 * @private
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is a typed array, else `false`.
 */
function baseIsTypedArray(value) {
  return isObjectLike(value) &&
    isLength(value.length) && !!typedArrayTags[baseGetTag(value)];
}

module.exports = baseIsTypedArray;


/***/ }),

/***/ 7930:
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

var root = __webpack_require__(8454);

/** Built-in value references. */
var Symbol = root.Symbol;

module.exports = Symbol;


/***/ }),

/***/ 7977:
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

var Stack = __webpack_require__(5428),
    equalArrays = __webpack_require__(166),
    equalByTag = __webpack_require__(1221),
    equalObjects = __webpack_require__(9366),
    getTag = __webpack_require__(2014),
    isArray = __webpack_require__(5038),
    isBuffer = __webpack_require__(7493),
    isTypedArray = __webpack_require__(5074);

/** Used to compose bitmasks for value comparisons. */
var COMPARE_PARTIAL_FLAG = 1;

/** `Object#toString` result references. */
var argsTag = '[object Arguments]',
    arrayTag = '[object Array]',
    objectTag = '[object Object]';

/** Used for built-in method references. */
var objectProto = Object.prototype;

/** Used to check objects for own properties. */
var hasOwnProperty = objectProto.hasOwnProperty;

/**
 * A specialized version of `baseIsEqual` for arrays and objects which performs
 * deep comparisons and tracks traversed objects enabling objects with circular
 * references to be compared.
 *
 * @private
 * @param {Object} object The object to compare.
 * @param {Object} other The other object to compare.
 * @param {number} bitmask The bitmask flags. See `baseIsEqual` for more details.
 * @param {Function} customizer The function to customize comparisons.
 * @param {Function} equalFunc The function to determine equivalents of values.
 * @param {Object} [stack] Tracks traversed `object` and `other` objects.
 * @returns {boolean} Returns `true` if the objects are equivalent, else `false`.
 */
function baseIsEqualDeep(object, other, bitmask, customizer, equalFunc, stack) {
  var objIsArr = isArray(object),
      othIsArr = isArray(other),
      objTag = objIsArr ? arrayTag : getTag(object),
      othTag = othIsArr ? arrayTag : getTag(other);

  objTag = objTag == argsTag ? objectTag : objTag;
  othTag = othTag == argsTag ? objectTag : othTag;

  var objIsObj = objTag == objectTag,
      othIsObj = othTag == objectTag,
      isSameTag = objTag == othTag;

  if (isSameTag && isBuffer(object)) {
    if (!isBuffer(other)) {
      return false;
    }
    objIsArr = true;
    objIsObj = false;
  }
  if (isSameTag && !objIsObj) {
    stack || (stack = new Stack);
    return (objIsArr || isTypedArray(object))
      ? equalArrays(object, other, bitmask, customizer, equalFunc, stack)
      : equalByTag(object, other, objTag, bitmask, customizer, equalFunc, stack);
  }
  if (!(bitmask & COMPARE_PARTIAL_FLAG)) {
    var objIsWrapped = objIsObj && hasOwnProperty.call(object, '__wrapped__'),
        othIsWrapped = othIsObj && hasOwnProperty.call(other, '__wrapped__');

    if (objIsWrapped || othIsWrapped) {
      var objUnwrapped = objIsWrapped ? object.value() : object,
          othUnwrapped = othIsWrapped ? other.value() : other;

      stack || (stack = new Stack);
      return equalFunc(objUnwrapped, othUnwrapped, bitmask, customizer, stack);
    }
  }
  if (!isSameTag) {
    return false;
  }
  stack || (stack = new Stack);
  return equalObjects(object, other, bitmask, customizer, equalFunc, stack);
}

module.exports = baseIsEqualDeep;


/***/ }),

/***/ 8079:
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

var baseGetTag = __webpack_require__(7259),
    isObject = __webpack_require__(4420);

/** `Object#toString` result references. */
var asyncTag = '[object AsyncFunction]',
    funcTag = '[object Function]',
    genTag = '[object GeneratorFunction]',
    proxyTag = '[object Proxy]';

/**
 * Checks if `value` is classified as a `Function` object.
 *
 * @static
 * @memberOf _
 * @since 0.1.0
 * @category Lang
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is a function, else `false`.
 * @example
 *
 * _.isFunction(_);
 * // => true
 *
 * _.isFunction(/abc/);
 * // => false
 */
function isFunction(value) {
  if (!isObject(value)) {
    return false;
  }
  // The use of `Object#toString` avoids issues with the `typeof` operator
  // in Safari 9 which returns 'object' for typed arrays and other constructors.
  var tag = baseGetTag(value);
  return tag == funcTag || tag == genTag || tag == asyncTag || tag == proxyTag;
}

module.exports = isFunction;


/***/ }),

/***/ 8330:
/***/ ((module) => {

"use strict";
module.exports = /*#__PURE__*/JSON.parse('{"name":"browser-assistant","version":"1.4.8","apiVersion":"1","description":"AdGuard browser extension","author":"adguard@adguard.com","license":"LGPL-3.0","scripts":{"lint":"pnpm lint:code && pnpm lint:types","lint:code":"eslint --cache . --ext .jsx,.js,.tsx,.ts","lint:types":"tsc --noEmit","dev":"cross-env BUILD_ENV=dev ts-node scripts/bundle","beta":"cross-env BUILD_ENV=beta ts-node scripts/bundle","release":"cross-env BUILD_ENV=release ts-node scripts/bundle","test":"jest","test:watch":"jest --watch","locales":"ts-node scripts/translations","crx":"ts-node scripts/crx.ts","update-json":"ts-node scripts/update-json.ts","increment":"pnpm version patch --no-git-tag-version","artifacts:beta":"export BUILD_ENV=beta; pnpm beta && pnpm crx && ts-node scripts/version-info","artifacts:beta-firefox":"export BUILD_ENV=beta; pnpm beta firefox && pnpm update-json && ts-node scripts/version-info","artifacts:release":"export BUILD_ENV=release; pnpm release && pnpm crx && ts-node scripts/version-info"},"husky":{"hooks":{"pre-commit":"pnpm lint","pre-push":"pnpm test"}},"dependencies":{"@adguard/assistant":"^4.3.75","@adguard/translate":"^0.2.5","@babel/runtime":"^7.21.0","classnames":"^2.3.1","compare-versions":"^4.1.3","lodash":"^4.17.21","mobx":"^6.3.7","mobx-react":"7.2.1","nanoid":"^4.0.0","react":"16.13.0","react-dom":"16.13.0","react-intl":"3.12.0","react-modal":"3.11.2","webextension-polyfill":"^0.6.0"},"devDependencies":{"@babel/cli":"^7.21.0","@babel/core":"^7.21.4","@babel/plugin-proposal-class-properties":"^7.8.3","@babel/plugin-proposal-decorators":"^7.8.3","@babel/plugin-proposal-export-default-from":"^7.8.3","@babel/plugin-proposal-export-namespace-from":"^7.8.3","@babel/plugin-transform-private-methods":"^7.18.6","@babel/plugin-transform-private-property-in-object":"^7.20.5","@babel/plugin-transform-runtime":"^7.8.3","@babel/preset-env":"^7.10.1","@babel/preset-react":"^7.8.3","@babel/preset-typescript":"^7.18.6","@babel/register":"^7.12.1","@types/chrome":"^0.0.193","@types/classnames":"^2.3.1","@types/copy-webpack-plugin":"^5.0.3","@types/nanoid":"^3.0.0","@types/node":"^18.7.6","@types/react":"^19.1.1","@types/webextension-polyfill":"^0.9.0","@types/webpack":"^5.28.0","@typescript-eslint/eslint-plugin":"^5.30.7","@typescript-eslint/parser":"^5.30.7","axios":"^0.27.2","babel-eslint":"^10.1.0","babel-loader":"^8.0.6","chalk":"^4.1.0","clean-webpack-plugin":"^3.0.0","commander":"^6.1.0","copy-webpack-plugin":"^11.0.0","cross-env":"^7.0.3","crx":"^5.0.1","css-loader":"^3.4.2","eslint":"^7.32.0","eslint-config-airbnb":"^18.0.1","eslint-config-airbnb-typescript":"^17.0.0","eslint-import-resolver-typescript":"^3.6.1","eslint-plugin-import":"^2.29.0","eslint-plugin-import-newlines":"^1.3.4","eslint-plugin-jsx-a11y":"^6.2.3","eslint-plugin-react":"^7.18.3","form-data":"^3.0.0","html-webpack-plugin":"^5.5.1","husky":"^4.3.0","jest":"^25.1.0","npm-run-all":"^4.1.5","postcss-import":"^12.0.1","postcss-loader":"^3.0.0","postcss-nested":"^4.2.1","postcss-preset-env":"^6.7.0","postcss-svg":"^3.0.0","string-replace-loader":"^3.1.0","style-loader":"^1.1.3","ts-node":"^10.9.1","typescript":"^4.7.4","url-loader":"^3.0.0","webpack":"^5.80.0","webpack-cli":"^5.0.2","webpack-sources":"^3.2.3","zip-webpack-plugin":"^4.0.1"}}');

/***/ }),

/***/ 8373:
/***/ ((module) => {

/**
 * Performs a
 * [`SameValueZero`](http://ecma-international.org/ecma-262/7.0/#sec-samevaluezero)
 * comparison between two values to determine if they are equivalent.
 *
 * @static
 * @memberOf _
 * @since 4.0.0
 * @category Lang
 * @param {*} value The value to compare.
 * @param {*} other The other value to compare.
 * @returns {boolean} Returns `true` if the values are equivalent, else `false`.
 * @example
 *
 * var object = { 'a': 1 };
 * var other = { 'a': 1 };
 *
 * _.eq(object, object);
 * // => true
 *
 * _.eq(object, other);
 * // => false
 *
 * _.eq('a', 'a');
 * // => true
 *
 * _.eq('a', Object('a'));
 * // => false
 *
 * _.eq(NaN, NaN);
 * // => true
 */
function eq(value, other) {
  return value === other || (value !== value && other !== other);
}

module.exports = eq;


/***/ }),

/***/ 8454:
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

var freeGlobal = __webpack_require__(7199);

/** Detect free variable `self`. */
var freeSelf = typeof self == 'object' && self && self.Object === Object && self;

/** Used as a reference to the global object. */
var root = freeGlobal || freeSelf || Function('return this')();

module.exports = root;


/***/ }),

/***/ 8492:
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

var arrayPush = __webpack_require__(2513),
    isArray = __webpack_require__(5038);

/**
 * The base implementation of `getAllKeys` and `getAllKeysIn` which uses
 * `keysFunc` and `symbolsFunc` to get the enumerable property names and
 * symbols of `object`.
 *
 * @private
 * @param {Object} object The object to query.
 * @param {Function} keysFunc The function to get the keys of `object`.
 * @param {Function} symbolsFunc The function to get the symbols of `object`.
 * @returns {Array} Returns the array of property names and symbols.
 */
function baseGetAllKeys(object, keysFunc, symbolsFunc) {
  var result = keysFunc(object);
  return isArray(object) ? result : arrayPush(result, symbolsFunc(object));
}

module.exports = baseGetAllKeys;


/***/ }),

/***/ 8569:
/***/ ((module) => {

/**
 * Removes `key` and its value from the hash.
 *
 * @private
 * @name delete
 * @memberOf Hash
 * @param {Object} hash The hash to modify.
 * @param {string} key The key of the value to remove.
 * @returns {boolean} Returns `true` if the entry was removed, else `false`.
 */
function hashDelete(key) {
  var result = this.has(key) && delete this.__data__[key];
  this.size -= result ? 1 : 0;
  return result;
}

module.exports = hashDelete;


/***/ }),

/***/ 8608:
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

var getMapData = __webpack_require__(628);

/**
 * Gets the map value for `key`.
 *
 * @private
 * @name get
 * @memberOf MapCache
 * @param {string} key The key of the value to get.
 * @returns {*} Returns the entry value.
 */
function mapCacheGet(key) {
  return getMapData(this, key).get(key);
}

module.exports = mapCacheGet;


/***/ }),

/***/ 8635:
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

var baseGetTag = __webpack_require__(7259),
    isObjectLike = __webpack_require__(4539);

/** `Object#toString` result references. */
var symbolTag = '[object Symbol]';

/**
 * Checks if `value` is classified as a `Symbol` primitive or object.
 *
 * @static
 * @memberOf _
 * @since 4.0.0
 * @category Lang
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is a symbol, else `false`.
 * @example
 *
 * _.isSymbol(Symbol.iterator);
 * // => true
 *
 * _.isSymbol('abc');
 * // => false
 */
function isSymbol(value) {
  return typeof value == 'symbol' ||
    (isObjectLike(value) && baseGetTag(value) == symbolTag);
}

module.exports = isSymbol;


/***/ }),

/***/ 8762:
/***/ ((module, exports, __webpack_require__) => {

/* module decorator */ module = __webpack_require__.nmd(module);
var freeGlobal = __webpack_require__(7199);

/** Detect free variable `exports`. */
var freeExports =  true && exports && !exports.nodeType && exports;

/** Detect free variable `module`. */
var freeModule = freeExports && "object" == 'object' && module && !module.nodeType && module;

/** Detect the popular CommonJS extension `module.exports`. */
var moduleExports = freeModule && freeModule.exports === freeExports;

/** Detect free variable `process` from Node.js. */
var freeProcess = moduleExports && freeGlobal.process;

/** Used to access faster Node.js helpers. */
var nodeUtil = (function() {
  try {
    // Use `util.types` for Node.js 10+.
    var types = freeModule && freeModule.require && freeModule.require('util').types;

    if (types) {
      return types;
    }

    // Legacy `process.binding('util')` for Node.js < 10.
    return freeProcess && freeProcess.binding && freeProcess.binding('util');
  } catch (e) {}
}());

module.exports = nodeUtil;


/***/ }),

/***/ 8852:
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

var nativeCreate = __webpack_require__(953);

/** Used to stand-in for `undefined` hash values. */
var HASH_UNDEFINED = '__lodash_hash_undefined__';

/**
 * Sets the hash `key` to `value`.
 *
 * @private
 * @name set
 * @memberOf Hash
 * @param {string} key The key of the value to set.
 * @param {*} value The value to set.
 * @returns {Object} Returns the hash instance.
 */
function hashSet(key, value) {
  var data = this.__data__;
  this.size += this.has(key) ? 0 : 1;
  data[key] = (nativeCreate && value === undefined) ? HASH_UNDEFINED : value;
  return this;
}

module.exports = hashSet;


/***/ }),

/***/ 8929:
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

var Hash = __webpack_require__(7330),
    ListCache = __webpack_require__(6642),
    Map = __webpack_require__(2994);

/**
 * Removes all key-value entries from the map.
 *
 * @private
 * @name clear
 * @memberOf MapCache
 */
function mapCacheClear() {
  this.size = 0;
  this.__data__ = {
    'hash': new Hash,
    'map': new (Map || ListCache),
    'string': new Hash
  };
}

module.exports = mapCacheClear;


/***/ }),

/***/ 9097:
/***/ ((module) => {

/**
 * A specialized version of `_.some` for arrays without support for iteratee
 * shorthands.
 *
 * @private
 * @param {Array} [array] The array to iterate over.
 * @param {Function} predicate The function invoked per iteration.
 * @returns {boolean} Returns `true` if any element passes the predicate check,
 *  else `false`.
 */
function arraySome(array, predicate) {
  var index = -1,
      length = array == null ? 0 : array.length;

  while (++index < length) {
    if (predicate(array[index], index, array)) {
      return true;
    }
  }
  return false;
}

module.exports = arraySome;


/***/ }),

/***/ 9366:
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

var getAllKeys = __webpack_require__(5697);

/** Used to compose bitmasks for value comparisons. */
var COMPARE_PARTIAL_FLAG = 1;

/** Used for built-in method references. */
var objectProto = Object.prototype;

/** Used to check objects for own properties. */
var hasOwnProperty = objectProto.hasOwnProperty;

/**
 * A specialized version of `baseIsEqualDeep` for objects with support for
 * partial deep comparisons.
 *
 * @private
 * @param {Object} object The object to compare.
 * @param {Object} other The other object to compare.
 * @param {number} bitmask The bitmask flags. See `baseIsEqual` for more details.
 * @param {Function} customizer The function to customize comparisons.
 * @param {Function} equalFunc The function to determine equivalents of values.
 * @param {Object} stack Tracks traversed `object` and `other` objects.
 * @returns {boolean} Returns `true` if the objects are equivalent, else `false`.
 */
function equalObjects(object, other, bitmask, customizer, equalFunc, stack) {
  var isPartial = bitmask & COMPARE_PARTIAL_FLAG,
      objProps = getAllKeys(object),
      objLength = objProps.length,
      othProps = getAllKeys(other),
      othLength = othProps.length;

  if (objLength != othLength && !isPartial) {
    return false;
  }
  var index = objLength;
  while (index--) {
    var key = objProps[index];
    if (!(isPartial ? key in other : hasOwnProperty.call(other, key))) {
      return false;
    }
  }
  // Check that cyclic values are equal.
  var objStacked = stack.get(object);
  var othStacked = stack.get(other);
  if (objStacked && othStacked) {
    return objStacked == other && othStacked == object;
  }
  var result = true;
  stack.set(object, other);
  stack.set(other, object);

  var skipCtor = isPartial;
  while (++index < objLength) {
    key = objProps[index];
    var objValue = object[key],
        othValue = other[key];

    if (customizer) {
      var compared = isPartial
        ? customizer(othValue, objValue, key, other, object, stack)
        : customizer(objValue, othValue, key, object, other, stack);
    }
    // Recursively compare objects (susceptible to call stack limits).
    if (!(compared === undefined
          ? (objValue === othValue || equalFunc(objValue, othValue, bitmask, customizer, stack))
          : compared
        )) {
      result = false;
      break;
    }
    skipCtor || (skipCtor = key == 'constructor');
  }
  if (result && !skipCtor) {
    var objCtor = object.constructor,
        othCtor = other.constructor;

    // Non `Object` object instances with different constructors are not equal.
    if (objCtor != othCtor &&
        ('constructor' in object && 'constructor' in other) &&
        !(typeof objCtor == 'function' && objCtor instanceof objCtor &&
          typeof othCtor == 'function' && othCtor instanceof othCtor)) {
      result = false;
    }
  }
  stack['delete'](object);
  stack['delete'](other);
  return result;
}

module.exports = equalObjects;


/***/ }),

/***/ 9375:
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

var ListCache = __webpack_require__(6642);

/**
 * Removes all key-value entries from the stack.
 *
 * @private
 * @name clear
 * @memberOf Stack
 */
function stackClear() {
  this.__data__ = new ListCache;
  this.size = 0;
}

module.exports = stackClear;


/***/ }),

/***/ 9431:
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

var getNative = __webpack_require__(4947),
    root = __webpack_require__(8454);

/* Built-in method references that are verified to be native. */
var DataView = getNative(root, 'DataView');

module.exports = DataView;


/***/ }),

/***/ 9459:
/***/ ((module) => {

/** Used as references for various `Number` constants. */
var MAX_SAFE_INTEGER = 9007199254740991;

/**
 * Checks if `value` is a valid array-like length.
 *
 * **Note:** This method is loosely based on
 * [`ToLength`](http://ecma-international.org/ecma-262/7.0/#sec-tolength).
 *
 * @static
 * @memberOf _
 * @since 4.0.0
 * @category Lang
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is a valid length, else `false`.
 * @example
 *
 * _.isLength(3);
 * // => true
 *
 * _.isLength(Number.MIN_VALUE);
 * // => false
 *
 * _.isLength(Infinity);
 * // => false
 *
 * _.isLength('3');
 * // => false
 */
function isLength(value) {
  return typeof value == 'number' &&
    value > -1 && value % 1 == 0 && value <= MAX_SAFE_INTEGER;
}

module.exports = isLength;


/***/ }),

/***/ 9483:
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

var baseTrim = __webpack_require__(5803),
    isObject = __webpack_require__(4420),
    isSymbol = __webpack_require__(8635);

/** Used as references for various `Number` constants. */
var NAN = 0 / 0;

/** Used to detect bad signed hexadecimal string values. */
var reIsBadHex = /^[-+]0x[0-9a-f]+$/i;

/** Used to detect binary string values. */
var reIsBinary = /^0b[01]+$/i;

/** Used to detect octal string values. */
var reIsOctal = /^0o[0-7]+$/i;

/** Built-in method references without a dependency on `root`. */
var freeParseInt = parseInt;

/**
 * Converts `value` to a number.
 *
 * @static
 * @memberOf _
 * @since 4.0.0
 * @category Lang
 * @param {*} value The value to process.
 * @returns {number} Returns the number.
 * @example
 *
 * _.toNumber(3.2);
 * // => 3.2
 *
 * _.toNumber(Number.MIN_VALUE);
 * // => 5e-324
 *
 * _.toNumber(Infinity);
 * // => Infinity
 *
 * _.toNumber('3.2');
 * // => 3.2
 */
function toNumber(value) {
  if (typeof value == 'number') {
    return value;
  }
  if (isSymbol(value)) {
    return NAN;
  }
  if (isObject(value)) {
    var other = typeof value.valueOf == 'function' ? value.valueOf() : value;
    value = isObject(other) ? (other + '') : other;
  }
  if (typeof value != 'string') {
    return value === 0 ? value : +value;
  }
  value = baseTrim(value);
  var isBinary = reIsBinary.test(value);
  return (isBinary || reIsOctal.test(value))
    ? freeParseInt(value.slice(2), isBinary ? 2 : 8)
    : (reIsBadHex.test(value) ? NAN : +value);
}

module.exports = toNumber;


/***/ }),

/***/ 9524:
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

var MapCache = __webpack_require__(1538),
    setCacheAdd = __webpack_require__(7597),
    setCacheHas = __webpack_require__(3918);

/**
 *
 * Creates an array cache object to store unique values.
 *
 * @private
 * @constructor
 * @param {Array} [values] The values to cache.
 */
function SetCache(values) {
  var index = -1,
      length = values == null ? 0 : values.length;

  this.__data__ = new MapCache;
  while (++index < length) {
    this.add(values[index]);
  }
}

// Add methods to `SetCache`.
SetCache.prototype.add = SetCache.prototype.push = setCacheAdd;
SetCache.prototype.has = setCacheHas;

module.exports = SetCache;


/***/ }),

/***/ 9679:
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

var root = __webpack_require__(8454);

/** Built-in value references. */
var Uint8Array = root.Uint8Array;

module.exports = Uint8Array;


/***/ }),

/***/ 9715:
/***/ ((module) => {

/**
 * Checks if `value` is suitable for use as unique object key.
 *
 * @private
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is suitable, else `false`.
 */
function isKeyable(value) {
  var type = typeof value;
  return (type == 'string' || type == 'number' || type == 'symbol' || type == 'boolean')
    ? (value !== '__proto__')
    : (value === null);
}

module.exports = isKeyable;


/***/ }),

/***/ 9824:
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

var nativeCreate = __webpack_require__(953);

/** Used to stand-in for `undefined` hash values. */
var HASH_UNDEFINED = '__lodash_hash_undefined__';

/** Used for built-in method references. */
var objectProto = Object.prototype;

/** Used to check objects for own properties. */
var hasOwnProperty = objectProto.hasOwnProperty;

/**
 * Gets the hash value for `key`.
 *
 * @private
 * @name get
 * @memberOf Hash
 * @param {string} key The key of the value to get.
 * @returns {*} Returns the entry value.
 */
function hashGet(key) {
  var data = this.__data__;
  if (nativeCreate) {
    var result = data[key];
    return result === HASH_UNDEFINED ? undefined : result;
  }
  return hasOwnProperty.call(data, key) ? data[key] : undefined;
}

module.exports = hashGet;


/***/ }),

/***/ 9946:
/***/ ((module) => {

/** Used for built-in method references. */
var objectProto = Object.prototype;

/**
 * Checks if `value` is likely a prototype object.
 *
 * @private
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is a prototype, else `false`.
 */
function isPrototype(value) {
  var Ctor = value && value.constructor,
      proto = (typeof Ctor == 'function' && Ctor.prototype) || objectProto;

  return value === proto;
}

module.exports = isPrototype;


/***/ }),

/***/ 9971:
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

var arrayFilter = __webpack_require__(2639),
    stubArray = __webpack_require__(2962);

/** Used for built-in method references. */
var objectProto = Object.prototype;

/** Built-in value references. */
var propertyIsEnumerable = objectProto.propertyIsEnumerable;

/* Built-in method references for those with the same name as other `lodash` methods. */
var nativeGetSymbols = Object.getOwnPropertySymbols;

/**
 * Creates an array of the own enumerable symbols of `object`.
 *
 * @private
 * @param {Object} object The object to query.
 * @returns {Array} Returns the array of symbols.
 */
var getSymbols = !nativeGetSymbols ? stubArray : function(object) {
  if (object == null) {
    return [];
  }
  object = Object(object);
  return arrayFilter(nativeGetSymbols(object), function(symbol) {
    return propertyIsEnumerable.call(object, symbol);
  });
};

module.exports = getSymbols;


/***/ })

/******/ 	});
/************************************************************************/
/******/ 	// The module cache
/******/ 	var __webpack_module_cache__ = {};
/******/ 	
/******/ 	// The require function
/******/ 	function __webpack_require__(moduleId) {
/******/ 		// Check if module is in cache
/******/ 		var cachedModule = __webpack_module_cache__[moduleId];
/******/ 		if (cachedModule !== undefined) {
/******/ 			return cachedModule.exports;
/******/ 		}
/******/ 		// Create a new module (and put it into the cache)
/******/ 		var module = __webpack_module_cache__[moduleId] = {
/******/ 			id: moduleId,
/******/ 			loaded: false,
/******/ 			exports: {}
/******/ 		};
/******/ 	
/******/ 		// Execute the module function
/******/ 		__webpack_modules__[moduleId].call(module.exports, module, module.exports, __webpack_require__);
/******/ 	
/******/ 		// Flag the module as loaded
/******/ 		module.loaded = true;
/******/ 	
/******/ 		// Return the exports of the module
/******/ 		return module.exports;
/******/ 	}
/******/ 	
/************************************************************************/
/******/ 	/* webpack/runtime/compat get default export */
/******/ 	(() => {
/******/ 		// getDefaultExport function for compatibility with non-harmony modules
/******/ 		__webpack_require__.n = (module) => {
/******/ 			var getter = module && module.__esModule ?
/******/ 				() => (module['default']) :
/******/ 				() => (module);
/******/ 			__webpack_require__.d(getter, { a: getter });
/******/ 			return getter;
/******/ 		};
/******/ 	})();
/******/ 	
/******/ 	/* webpack/runtime/define property getters */
/******/ 	(() => {
/******/ 		// define getter functions for harmony exports
/******/ 		__webpack_require__.d = (exports, definition) => {
/******/ 			for(var key in definition) {
/******/ 				if(__webpack_require__.o(definition, key) && !__webpack_require__.o(exports, key)) {
/******/ 					Object.defineProperty(exports, key, { enumerable: true, get: definition[key] });
/******/ 				}
/******/ 			}
/******/ 		};
/******/ 	})();
/******/ 	
/******/ 	/* webpack/runtime/global */
/******/ 	(() => {
/******/ 		__webpack_require__.g = (function() {
/******/ 			if (typeof globalThis === 'object') return globalThis;
/******/ 			try {
/******/ 				return this || new Function('return this')();
/******/ 			} catch (e) {
/******/ 				if (typeof window === 'object') return window;
/******/ 			}
/******/ 		})();
/******/ 	})();
/******/ 	
/******/ 	/* webpack/runtime/hasOwnProperty shorthand */
/******/ 	(() => {
/******/ 		__webpack_require__.o = (obj, prop) => (Object.prototype.hasOwnProperty.call(obj, prop))
/******/ 	})();
/******/ 	
/******/ 	/* webpack/runtime/node module decorator */
/******/ 	(() => {
/******/ 		__webpack_require__.nmd = (module) => {
/******/ 			module.paths = [];
/******/ 			if (!module.children) module.children = [];
/******/ 			return module;
/******/ 		};
/******/ 	})();
/******/ 	
/************************************************************************/
var __webpack_exports__ = {};
// This entry needs to be wrapped in an IIFE because it needs to be in strict mode.
(() => {
"use strict";

// EXTERNAL MODULE: ./node_modules/.pnpm/webextension-polyfill@0.6.0/node_modules/webextension-polyfill/dist/browser-polyfill.js
var browser_polyfill = __webpack_require__(3919);
var browser_polyfill_default = /*#__PURE__*/__webpack_require__.n(browser_polyfill);
;// ./src/lib/logger.js
// TODO switch to a less verbose level later
const CURRENT_LEVEL = 'DEBUG';
const LEVELS = {
  ERROR: 1,
  WARN: 2,
  INFO: 3,
  DEBUG: 4
};
const print = (level, method, args) => {
  // check log level
  if (LEVELS[CURRENT_LEVEL] < LEVELS[level]) {
    return;
  }
  if (!args || args.length === 0 || !args[0]) {
    return;
  }
  const now = new Date();
  const formatted = `${now.toISOString()}:`;
  // eslint-disable-next-line no-console
  console[method](formatted, ...args);
};
const log = {
  debug(...args) {
    print('DEBUG', 'log', args);
  },
  info(...args) {
    print('INFO', 'info', args);
  },
  warn(...args) {
    print('WARN', 'warn', args);
  },
  error(...args) {
    print('ERROR', 'error', args);
  }
};
;// ./src/lib/tabs.js



/**
 * Extracts only usable data from tab
 * @param tab
 * @returns {{id: number, url: string}}
 */
const prepareTab = tab => {
  const {
    url,
    id,
    title
  } = tab;
  return {
    url,
    id,
    title
  };
};

/**
 * Returns current tab
 * Call from browser action popup in order to get correct tab
 */
const getCurrentTab = async () => {
  const tabs = await browser_polyfill_default().tabs.query({
    active: true,
    currentWindow: true
  });
  return prepareTab(tabs[0]);
};

/**
 * Returns all active tabs
 * @returns {Promise<{url: string, id: number}[]>}
 */
const getActiveTabs = async () => {
  const activeTabs = await browser_polyfill_default().tabs.query({
    active: true
  });
  return activeTabs.map(tab => prepareTab(tab));
};

/**
 * Returns active tab
 * @returns {Promise<{url: string, id: number}>}
 */
const getActiveTab = async () => {
  const [tab] = await getActiveTabs();
  return tab;
};

/**
 * Returns all tabs with hostname similar to current active tab
 * @returns {Promise<{url: string, id: number}[]>}
 */
const getActiveAndSimilarTabs = async () => {
  const [activeTab] = await browser_polyfill_default().tabs.query({
    active: true,
    currentWindow: true
  });
  if (!activeTab) {
    log.debug('Unable to get active tab');
    return [];
  }
  const {
    url
  } = activeTab;
  if (!url) {
    log.debug('Active tab has no url');
    return [];
  }
  const urlObject = new URL(url);
  const {
    origin
  } = urlObject;
  const allTabs = await browser_polyfill_default().tabs.query({});
  return allTabs.filter(tab => tab.url.startsWith(origin)).map(tab => prepareTab(tab));
};

/**
 * Opens required url
 * @param {string} url
 * @returns {Promise<void>}
 */
const openPage = async url => {
  if (!url) {
    throw new Error(`Open page requires url, received, ${url}`);
  }
  await browser_polyfill_default().tabs.create({
    url
  });
};

/**
 * Reloads required tab
 * @param tab
 * @returns {Promise<void>}
 */
const reloadTab = async tab => {
  try {
    await browser_polyfill_default().tabs.reload(tab.id);
  } catch (error) {
    log.error(error);
  }
};

/**
 * Opens postinstall page
 */
const openPostInstallPage = async () => {
  const postInstallPageUrl = browser_polyfill_default().runtime.getURL('post-install.html');
  await openPage(postInstallPageUrl);
};

/**
 * Closes post install page if founds
 * @returns {Promise<void>}
 */
const closePostInstall = async () => {
  const postInstallPageUrl = browser_polyfill_default().runtime.getURL('post-install.html');
  const tabs = await browser_polyfill_default().tabs.query({});
  const postInstallTabs = tabs.filter(tab => {
    var _tab$url;
    return (_tab$url = tab.url) === null || _tab$url === void 0 ? void 0 : _tab$url.includes(postInstallPageUrl);
  });
  postInstallTabs.forEach(tab => {
    browser_polyfill_default().tabs.remove(tab.id);
  });
};
const tabs = {
  prepareTab,
  getCurrentTab,
  getActiveTabs,
  getActiveTab,
  getActiveAndSimilarTabs,
  openPage,
  reloadTab,
  openPostInstallPage,
  closePostInstall
};
;// ./src/lib/browserApi/runtime.js


/**
 * This function moved into separate nativeHostApi file, in order to hide unhandled promise errors
 * @param args
 * @returns {Promise<void>}
 */
// eslint-disable-next-line consistent-return
const sendMessage = async (...args) => {
  try {
    return await browser_polyfill_default().runtime.sendMessage(...args);
  } catch (error) {
    // eslint-disable-next-line no-void
    void (browser_polyfill_default()).runtime.lastError;
  }
};
const getUrl = url => browser_polyfill_default().runtime.getURL(url);
const runtime = {
  sendMessage
};
;// ./src/popup/stores/consts.js
const PROTOCOL_TO_PORT_MAP = {
  HTTPS: 443,
  HTTP: 80,
  SECURED: 0
};
const ORIGINAL_CERT_STATUS = {
  VALID: 'VALID',
  INVALID: 'INVALID',
  BYPASSED: 'BYPASSED',
  NOTFOUND: 'NOTFOUND'
};
const CERT_STATES = {
  INVALID: 'cert_expired',
  BYPASSED: 'cert_absent',
  NOTFOUND: 'cert_absent'
};
const SWITCHER_IDS = {
  HTTPS_SWITCHER: 'https-switcher',
  GLOBAL_SWITCHER: 'global-switcher'
};
const SECURE_STATUS_MODAL_IDS = {
  SECURE: 'SECURE',
  NOT_SECURE: 'NOT_SECURE',
  BANK: 'BANK'
};
const SHOW_MODAL_TIME = {
  SHORT: 1000,
  LONG: 5000
};
const MODAL_STATES_NAMES = {
  isHovered: 'isHovered',
  isFocused: 'isFocused',
  isEntered: 'isEntered',
  isClicked: 'isClicked'
};
const DEFAULT_MODAL_STATE = Object.values(MODAL_STATES_NAMES).reduce((acc, name) => {
  acc[name] = false;
  return acc;
}, {});
const EVENT_TYPE_TO_MODAL_STATE_MAP = {
  mouseover: {
    [MODAL_STATES_NAMES.isHovered]: true
  },
  mouseout: {
    [MODAL_STATES_NAMES.isHovered]: false
  },
  focus: {
    [MODAL_STATES_NAMES.isFocused]: true
  },
  blur: {
    [MODAL_STATES_NAMES.isFocused]: false
  },
  keydown: {
    [MODAL_STATES_NAMES.isEntered]: true
  },
  mousedown: {
    [MODAL_STATES_NAMES.isClicked]: true
  }
};
const PROTOCOLS = {
  HTTPS: 'HTTPS',
  HTTP: 'HTTP',
  SECURED: 'SECURED'
};
const HTTP_FILTERING_STATUS = {
  ENABLED: 'ENABLED',
  DISABLED: 'DISABLED'
};
const FILTERING_STATES_MODAL_INFO = {
  [HTTP_FILTERING_STATUS.ENABLED]: {
    info: 'protection_is_enabled'
  },
  [HTTP_FILTERING_STATUS.DISABLED]: {
    info: 'protection_is_disabled'
  }
};
const SECURE_STATUS_MODAL_STATES = {
  [PROTOCOLS.HTTPS]: {
    [ORIGINAL_CERT_STATUS.INVALID]: {
      info: 'website_cert_is_expired'
    },
    [ORIGINAL_CERT_STATUS.NOTFOUND]: FILTERING_STATES_MODAL_INFO,
    [ORIGINAL_CERT_STATUS.BYPASSED]: FILTERING_STATES_MODAL_INFO,
    [ORIGINAL_CERT_STATUS.VALID]: FILTERING_STATES_MODAL_INFO
  },
  [PROTOCOLS.HTTP]: {
    modalId: SECURE_STATUS_MODAL_IDS.NOT_SECURE,
    message: 'site_not_using_private_protection',
    header: 'not_secure',
    info: 'not_secure'
  },
  [PROTOCOLS.SECURED]: {
    modalId: SECURE_STATUS_MODAL_IDS.SECURE,
    message: 'nothing_to_block_here',
    header: 'secure_page',
    info: 'secure_page'
  },
  DEFAULT: {
    modalId: SECURE_STATUS_MODAL_IDS.BANK,
    message: 'not_filtering_https',
    header: 'secure_page',
    info: 'protection_is_enabled'
  }
};
const SWITCHER_TRANSITION_TIME = 150;
;// ./src/lib/helpers.js


/**
 * @typedef {Object} urlObj
 * @property {number} x - The X Coordinate
 * @property {string} urlObj.hash
 * @property {string} urlObj.host
 * @property {string} urlObj.hostname
 * @property {string} urlObj.href
 * @property {string} urlObj.origin
 * @property {string} urlObj.password
 * @property {string} urlObj.pathname
 * @property {string} urlObj.port
 * @property {string} urlObj.protocol
 * @property {string} urlObj.search
 * @property {function} urlObj.searchParams
 * @property {string} urlObj.username
 */

/**
 * Returns hostname of url if it was correct, otherwise return input url
 * @param {string} url
 * @returns {urlObj | string}
 */
const getUrlProperties = url => {
  try {
    const urlObj = new URL(url);
    return urlObj;
  } catch (e) {
    return url;
  }
};

/**
 * Checks if string is chrome-extension: or moz-extension: protocol
 * @param {string} url
 * @returns {boolean}
 */
const isExtensionProtocol = protocol => /^(chrome|moz)-extension:/.test(protocol);

/**
 * @param {string} port
 * @param {'HTTPS' | 'HTTP' | 'SECURED'} protocol
 * @returns {number}
 */
const getFormattedPort = (port, protocol) => {
  const defaultPort = PROTOCOL_TO_PORT_MAP[protocol];
  return port === '' || !port ? defaultPort : Number(port);
};

/**
 * @param {string} protocol
 * @returns {'HTTPS' | 'HTTP' | 'SECURED'}
 */
const getFormattedProtocol = protocol => {
  const formattedProtocol = protocol && protocol.slice(0, -1).toUpperCase();
  return PROTOCOLS[formattedProtocol] || PROTOCOLS.SECURED;
};

/**
 * @param {string} url
 * @returns {{* protocol: string, hostname: string, port: number}}
 */
const getUrlProps = url => {
  const {
    hostname,
    port,
    protocol
  } = getUrlProperties(url);
  const formattedProtocol = getFormattedProtocol(protocol);
  const formattedPort = getFormattedPort(port, formattedProtocol);
  return {
    port: formattedPort,
    protocol,
    hostname
  };
};

/**
 * Checks if string is a valid url with http: or https: protocol
 * @param {string} str
 * @returns {boolean}
 */
const isHttp = str => {
  let url;
  try {
    url = new URL(str);
  } catch (e) {
    return false;
  }
  return /^https?:/.test(url.protocol);
};

/**
 * Returns the value of the property from the cache,
 * otherwise, calculates it using the callback, memoizes it, and returns the value
 * @param {object} obj
 * @param {string} prop
 * @param {function} func
 * @returns {any}
 */
const lazyGet = (obj, prop, func) => {
  const cachedProp = `_${prop}`;
  if (cachedProp in obj) {
    return obj[cachedProp];
  }
  const value = func.apply(obj);
  // eslint-disable-next-line no-param-reassign
  obj[cachedProp] = value;
  return value;
};

/**
 * Flattens the object by mapping it's key to the specified property of the nested object
 * @param {Object.<string,Object.<string,any>>} obj
 * @param {string} propName
 * @returns {Object.<string,any>}
 */
const flattenNestedObj = (obj, propName) => {
  return Object.entries(obj).reduce((acc, [key, value]) => {
    acc[key] = value[propName];
    return acc;
  }, {});
};

/**
 * Checks if at least one value of the object is strictly equal to true
 * @param {Object.<string, any>} states
 * @returns {boolean}
 */
const checkSomeIsTrue = states => {
  return Object.values(states).some(state => state === true);
};

/**
 * If the semver string a is greater than b, return 1.
 * If the semver string b is greater than a, return -1.
 * If a equals b, return 0;
 *
 * @param {string} a
 * @param {string} b
 * @returns {-1 | 0 | 1}
 */
const compareSemver = (a, b) => {
  const pa = a.split('.');
  const pb = b.split('.');
  for (let i = 0; i < 3; i += 1) {
    const na = Number(pa[i]);
    const nb = Number(pb[i]);
    if (na > nb) return 1;
    if (nb > na) return -1;
    const {
      isNaN
    } = Number;
    if (!isNaN(na) && isNaN(nb)) return 1;
    if (isNaN(na) && !isNaN(nb)) return -1;
  }
  return 0;
};
;// ./src/lib/browserApi/utils.js


const utils = {
  get browser() {
    return lazyGet(utils, 'browser', () => {
      let browser;
      let {
        userAgent
      } = navigator;
      userAgent = userAgent.toLowerCase();
      if (userAgent.indexOf('yabrowser') >= 0) {
        browser = 'YaBrowser';
      } else if (userAgent.indexOf('edg') >= 0) {
        browser = 'EdgeChromium';
      } else if (userAgent.indexOf('opera') >= 0 || userAgent.indexOf('opr') >= 0) {
        browser = 'Opera';
      } else if (userAgent.indexOf('firefox') >= 0) {
        browser = 'Firefox';
      } else {
        browser = 'Chrome';
      }
      return browser;
    });
  },
  get isFirefoxBrowser() {
    return this.browser === 'Firefox';
  },
  /**
   * Method to detect if browser is vivaldi.
   * @returns {Promise<boolean>}
   */
  async isVivaldiBrowser() {
    if (this.isVivaldiPromise === undefined) {
      this.isVivaldiPromise = new Promise(async resolve => {
        try {
          const tabs = await browser_polyfill_default().tabs.query({});
          if (tabs.length > 0 && Object.prototype.hasOwnProperty.call(tabs[0], 'vivExtData')) {
            resolve(true);
          } else {
            resolve(false);
          }
        } catch (error) {
          console.error('Error querying tabs:', error);
          resolve(false);
        }
      });
    }
    return this.isVivaldiPromise;
  }
};
;// ./src/lib/browserApi/action.ts


// This for support mv3 and mv2
const action = (browser_polyfill_default()).browserAction || (browser_polyfill_default()).action;
;// ./src/lib/browserApi/index.ts



const browserApi = {
  runtime: runtime,
  utils: utils,
  action: action
};
;// ./src/lib/types.js
const REQUEST_TYPES = {
  init: 'init',
  getCurrentAppState: 'getCurrentAppState',
  getCurrentFilteringState: 'getCurrentFilteringState',
  setProtectionStatus: 'setProtectionStatus',
  setFilteringStatus: 'setFilteringStatus',
  addRule: 'addRule',
  removeCustomRules: 'removeCustomRules',
  openOriginalCert: 'openOriginalCert',
  reportSite: 'reportSite',
  openFilteringLog: 'openFilteringLog',
  openSettings: 'openSettings',
  updateApp: 'updateApp',
  pauseFiltering: 'pauseFiltering'
};

// Browser action popup messages
const POPUP_MESSAGES = {
  STATE_UPDATED: 'popup.state.updated',
  GET_POPUP_DATA: 'popup.get.popup.data',
  GET_APP_LOCALE: 'popup.get.app.locale',
  GET_CURRENT_FILTERING_STATE: 'popup.get.current.filtering.state',
  GET_APP_STATE: 'popup.get.current.app.state',
  SET_PROTECTION_STATUS: 'popup.set.protection.status',
  REPORT_SITE: 'popup.report.site',
  RELOAD: 'popup.reload',
  REMOVE_CUSTOM_RULES: 'popup.remove.custom.rules',
  OPEN_FILTERING_LOG: 'popup.open.filtering.log',
  OPEN_SETTINGS: 'popup.open.settings',
  SET_FILTERING_STATUS: 'popup.set.filtering.status',
  OPEN_ORIGINAL_CERT: 'popup.open.original.cert',
  UPDATE_APP: 'popup.update.app',
  OPEN_PAGE: 'popup.open.page',
  INIT_ASSISTANT: 'popup.init.assistant',
  PAUSE_FILTERING: 'popup.pause.filtering',
  UPDATE_FILTERING_PAUSE_TIMEOUT: 'popup.update.filtering.pause.timeout',
  CONTACT_SUPPORT: 'popup.contact.support',
  GET_CONSENT_REQUIRED: 'popup.get.consent.required',
  GET_CURRENT_TAB: 'get.current.tab',
  GET_ACTIVE_AND_SIMILAR_TABS: 'get.active.and.similar.tabs'
};

// Content script messages
const CONTENT_MESSAGES = {
  GET_REFERRER: 'content.get.referrer',
  INIT_ASSISTANT: 'content.init.assistant',
  ADD_RULE: 'content.add.rule'
};
const POST_INSTALL_MESSAGES = {
  UNINSTALL_EXTENSION: 'postinstall.uninstall.extension',
  AGREE_WITH_CONDITIONS: 'postinstall.agree.with.conditions'
};
const OPTIONS_UI_MESSAGES = {
  SET_SETTING: 'options.ui.set.setting',
  GET_SETTING: 'options.ui.get.setting'
};
const ADG_PREFIX = 'ADG';
const CUSTOM_REQUEST_PREFIX = 'ADG_CUSTOM';
const ASSISTANT_TYPES = {
  nativeAssistant: 'nativeAssistant'
};
const HOST_TYPES = {
  browserExtensionHost: 'com.adguard.browser_extension_host.nm'
};
const SETTINGS = {
  CONTEXT_MENU_ENABLED: 'context_menu_enabled'
};
const BACKGROUND_MESSAGES = {
  CLOSE_POPUP: 'close.popup'
};
const FEEDBACK_ACTIONS = {
  UPDATE_FILTERING_STATUS: 'updateFilteringStatus',
  UPDATE_APPLICATION_APP_ONLY: 'updateApplicationAppOnly'
};
const APP_VERSION_KEY = 'update.service.app.version';
;// ./src/lib/consts.js
/**
 * We use a forwarder (link.adtidy.org) for outgoing links for the following reasons:
 *  1. Use mirror domains for some countries. AdGuard websites may be blocked in some countries (namely, Iran, Russia,
 *      China) and this way we can redirect the users to a working mirror.
 *  2. Keeping track of all website pages that were used in different versions AdGuard products in one place. Without
 *      that it's harder to figure out what pages are required by old apps & extensions versions.
 */
const DOWNLOAD_LINK = 'https://link.adtidy.org/forward.html?action=download&from=popup&app=browser_assistant';
const EXTENSION_DOWNLOAD_LINK = 'https://link.adtidy.org/forward.html?action=download_browser_assistant&from=popup&app=browser_assistant';
const SUPPORT_LINK = 'https://link.adtidy.org/forward.html?action=support&from=popup&app=browser_assistant';
const PURCHASE_TRIAL_EXPIRED = 'https://link.adtidy.org/forward.html?action=purchase&from=popup_trial_expired_screen&app=browser_assistant';
const PRIVACY_URL = 'https://link.adtidy.org/forward.html?action=privacy&from=consent&app=browser_assistant';
const TERMS_URL = 'https://link.adtidy.org/forward.html?action=eula&from=consent&app=browser_assistant';
const DESKTOP_APPS_URL = 'https://link.adtidy.org/forward.html?action=desktop_apps&from=consent&app=browser_assistant';
const CONTENT_SCRIPT_NAME = 'content-scripts.js';

// These urls would be updated during extension build
// Check webpack replace loader
const UPDATE_URL_FIREFOX = 'https://static.adtidy.org/extensions/browserassistant/release/firefox.xpi';
const UPDATE_URL_CHROME = 'https://static.adtidy.org/extensions/browserassistant/release/chrome.crx';
const PLATFORMS = {
  WINDOWS: 'windows',
  MAC: 'mac'
};
const FILTERING_PAUSE_VERSION_SUPPORT_SINCE = {
  WINDOWS: '7.5.0',
  MAC: '2.5.0'
};
;// ./src/lib/notifier.js
/**
 * Implements notifier which allows other modules to subscribe to events or notify about events
 */
class Notifier {
  getListenerId() {
    const id = this.listenerId;
    this.listenerId += 1;
    return id;
  }
  constructor(types) {
    this.types = {};
    this.events = {};
    this.listeners = {};
    this.listenersEvents = {};
    this.listenerId = 0;
    this.types = types;
    Object.entries(this.types).forEach(([key, value]) => {
      this.events[value] = key;
    });
  }

  /**
   * Subscribes listener to the specified events
   *
   * @param {string} events - List of event types listener will be notified of
   * @param {function} listener - Listener object
   * @returns {number} Index of the listener
   */
  addSpecifiedListener(events, listener) {
    if (typeof listener !== 'function') {
      throw new Error('Illegal listener');
    }
    const listenerId = this.getListenerId();
    this.listeners[listenerId] = listener;
    this.listenersEvents[listenerId] = events;
    return listenerId;
  }

  /**
   * Subscribe specified listener to all events
   *
   * @param {function} listener Listener
   * @returns {number} Index of the listener
   */
  addListener(listener) {
    if (typeof listener !== 'function') {
      throw new Error('Illegal listener');
    }
    const listenerId = this.getListenerId();
    this.listeners[listenerId] = listener;
    return listenerId;
  }

  /**
   * Unsubscribe listener
   * @param listenerId Index of listener to unsubscribe
   */
  removeListener(listenerId) {
    delete this.listeners[listenerId];
    delete this.listenersEvents[listenerId];
  }

  /**
   * Notifies listeners about the events passed as arguments of this function.
   */
  notifyListeners(event, ...args) {
    if (!event || !(event in this.events)) {
      throw new Error(`Illegal event: ${event}`);
    }
    // eslint-disable-next-line no-restricted-syntax
    for (const [listenerId, listener] of Object.entries(this.listeners)) {
      const events = this.listenersEvents[listenerId];
      if (events && events.length > 0 && events.indexOf(event) < 0) {
        // eslint-disable-next-line no-continue
        continue;
      }
      try {
        listener.apply(listener, args);
      } catch (ex) {
        const message = `Error invoking listener for event: "${event}" cause: ${ex}`;
        throw new Error(message);
      }
    }
  }
}
const types = {
  TAB_UPDATED: 'event.tab.updated',
  TAB_ACTIVATED: 'event.tab.activated',
  STATE_UPDATED: 'event.state.updated',
  SETTING_UPDATED: 'event.setting.updated'
};
const notifier = new Notifier(types);
/* harmony default export */ const lib_notifier = (notifier);
;// ./src/background/longLivedMessageService/LongLivedMessageService.js


let openedPort = null;

/**
 * Sets opened port
 * @param {object | null} value
 */
const setOpenedPort = value => {
  openedPort = value;
};
class LongLivedMessageService {
  init(port) {
    if (openedPort) {
      // close previously opened popup to avoid situation of two opened popups
      openedPort.postMessage({
        type: BACKGROUND_MESSAGES.CLOSE_POPUP,
        popupId: openedPort.name
      });
    }
    setOpenedPort(port);
    port.onDisconnect.addListener(async () => {
      log.debug(`Popup with id "${port.name}" closed`);
      if (port === openedPort) {
        setOpenedPort(null);
      }
    });
  }
  notifyPopupStateUpdated(appState, updateStatusInfo) {
    if (!openedPort) {
      return;
    }
    openedPort.postMessage({
      type: POPUP_MESSAGES.STATE_UPDATED,
      data: {
        appState,
        updateStatusInfo
      }
    });
  }
  notifyPopupFilteringPauseTimeout(hostnameToTimeoutMap) {
    if (!openedPort) {
      return;
    }
    openedPort.postMessage({
      type: POPUP_MESSAGES.UPDATE_FILTERING_PAUSE_TIMEOUT,
      data: {
        filteringPauseMap: hostnameToTimeoutMap
      }
    });
  }
}
;// ./src/background/longLivedMessageService/index.js

const longLivedMessageService = new LongLivedMessageService();
// EXTERNAL MODULE: ./node_modules/.pnpm/lodash@4.17.21/node_modules/lodash/isEqual.js
var isEqual = __webpack_require__(3087);
var isEqual_default = /*#__PURE__*/__webpack_require__.n(isEqual);
// EXTERNAL MODULE: ./node_modules/.pnpm/lodash@4.17.21/node_modules/lodash/throttle.js
var throttle = __webpack_require__(1099);
var throttle_default = /*#__PURE__*/__webpack_require__.n(throttle);
;// ./src/background/versions.js
const config = __webpack_require__(8330);
const versions = {
  version: config.version,
  apiVersion: config.apiVersion,
  userAgent: self.navigator.userAgent
};
/* harmony default export */ const background_versions = (versions);
;// ./node_modules/.pnpm/nanoid@4.0.2/node_modules/nanoid/index.browser.js

let random = bytes => crypto.getRandomValues(new Uint8Array(bytes))
let customRandom = (alphabet, defaultSize, getRandom) => {
  let mask = (2 << (Math.log(alphabet.length - 1) / Math.LN2)) - 1
  let step = -~((1.6 * mask * defaultSize) / alphabet.length)
  return (size = defaultSize) => {
    let id = ''
    while (true) {
      let bytes = getRandom(step)
      let j = step
      while (j--) {
        id += alphabet[bytes[j] & mask] || ''
        if (id.length === size) return id
      }
    }
  }
}
let customAlphabet = (alphabet, size = 21) =>
  customRandom(alphabet, size, random)
let nanoid = (size = 21) =>
  crypto.getRandomValues(new Uint8Array(size)).reduce((id, byte) => {
    byte &= 63
    if (byte < 36) {
      id += byte.toString(36)
    } else if (byte < 62) {
      id += (byte - 26).toString(36).toUpperCase()
    } else if (byte > 62) {
      id += '-'
    } else {
      id += '_'
    }
    return id
  }, '')

;// ./src/background/consent/ConsentAbstract.js
// !IMPORTANT!
// export './ConsentAbstract' is replaced during webpack compilation
// with NormalModuleReplacementPlugin to proper browser implementation
// from './ConsentChrome' or './ConsentFirefox'
/**
 * Abstract consent class
 */
class ConsentAbstract {
  /**
   * Returns true if consent is required
   * @returns {Promise<boolean>}
   */
  async isConsentRequired() {
    throw new Error('Not implemented');
  }

  /**
   * Sets consent value
   * @param {boolean} value
   * @returns {void}
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  setConsentRequired(value) {
    throw new Error('Not implemented');
  }
}
;// ./src/background/consent/ConsentChrome.js


/**
 * Manages user consent with policies
 */
class ConsentChrome extends ConsentAbstract {
  /**
   * Always returns false for chrome
   * @returns {boolean}
   */
  async isConsentRequired() {
    return false;
  }

  /**
   * Sets consent value
   * @param {boolean} value
   * @returns {void}
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  setConsentRequired(value) {}
}
;// ./src/background/consent/index.js
// !IMPORTANT!
// export './ConsentAbstract' is replaced during webpack compilation
// with NormalModuleReplacementPlugin to proper browser implementation
// from './ConsentChrome' or './ConsentFirefox'

const consent = new ConsentChrome();
;// ./src/lib/errors.ts
function isErrorWithMessage(error) {
  return typeof error === 'object' && error !== null && 'message' in error && typeof error.message === 'string';
}
function toErrorWithMessage(maybeError) {
  if (isErrorWithMessage(maybeError)) {
    return maybeError;
  }
  try {
    return new Error(JSON.stringify(maybeError));
  } catch {
    // fallback in case there's an error stringifying the maybeError
    // like with circular references for example.
    return new Error(String(maybeError));
  }
}
function getErrorMessage(error) {
  return toErrorWithMessage(error).message;
}
;// ./src/background/api/AbstractApi.js
/* eslint-disable @typescript-eslint/no-unused-vars */
const notImplemented = functionName => {
  return new Error(`Method "${functionName}" is not implemented`);
};

/**
 * Abstract class used to reflect methods used in the native host api
 */
class AbstractApi {
  constructor() {
    this.listeners = [];
    /**
     * Distributes messages to the listeners
     * @param incomingMessage
     * @returns {Promise<void>}
     */
    this.incomingMessageHandler = async incomingMessage => {
      throw notImplemented('incomingMessageHandler');
    };
    /**
     * Adds listener to the listeners list
     * @param {function} listener
     */
    this.addMessageListener = listener => {
      throw notImplemented('addMessageListener');
    };
    /**
     * Removes listener from listeners list
     * @param {function} listener
     */
    this.removeMessageListener = listener => {
      throw notImplemented('removeMessageListener');
    };
    /**
     * Is called on connection or reconnection
     * @param handler
     */
    this.addInitMessageHandler = handler => {
      throw notImplemented('addInitMessageHandler');
    };
    /**
     * Connect to the native host
     */
    this.connect = async () => {
      throw notImplemented('connect');
    };
    this.sendInitialRequest = async shouldReconnect => {
      throw notImplemented('sendInitialRequest');
    };
    /**
     * Disconnect from the native host
     */
    this.disconnect = () => {
      throw notImplemented('disconnect');
    };
    /**
     * Reconnect to the native host
     */
    this.reconnect = async () => {
      throw notImplemented('reconnect');
    };
    /**
     * Makes request
     * @param params
     * @param tryReconnect - by default function retries to reconnect
     * @returns {Promise<unknown>}
     */
    this.makeRequest = async (params, tryReconnect = true) => {
      throw notImplemented('makeRequest');
    };
    this.makeRequestOnce = async params => {
      throw notImplemented('makeRequestOnce');
    };
    /**
     * Sends initial request to the native host
     * @param version
     * @param userAgent
     * @param apiVersion
     * @param tryReconnect
     * @returns {Promise<*>}
     */
    this.init = ({
      version,
      userAgent,
      apiVersion
    }, tryReconnect = false) => {
      throw notImplemented('init');
    };
    /**
     * Returns current app state
     */
    this.getCurrentAppState = async () => {
      throw notImplemented('getCurrentAppState');
    };
    /**
     * Returns filtering state for url, used to get state of current tab
     * @param {string} url
     * @param {number} port
     * @param {boolean} forceStartApp
     */
    this.getCurrentFilteringState = (url, port, forceStartApp = false) => {
      throw notImplemented('getCurrentFilteringState');
    };
    /**
     * @param {boolean} isEnabled
     */
    this.setProtectionStatus = isEnabled => {
      throw notImplemented('setProtectionStatus');
    };
    /**
     * Sets filtering status
     * @param {boolean} isEnabled
     * @param {boolean} isHttpsEnabled
     * @param {string} url
     */
    this.setFilteringStatus = (isEnabled, isHttpsEnabled, url) => {
      throw notImplemented('setFilteringStatus');
    };
    /**
     * @param {string} ruleText
     * @returns {Promise<object>}
     */
    this.addRule = ruleText => {
      throw notImplemented('addRule');
    };
    /**
     * @param {string} url
     * @returns {Promise<object>}
     */
    this.removeCustomRules = url => {
      throw notImplemented('removeCustomRules');
    };
    /**
     * @param {string} domain
     * @param {number} port
     * @returns {Promise<object>}
     */
    this.openOriginalCert = (domain, port) => {
      throw notImplemented('openOriginalCert');
    };
    /**
     * @param {string} url
     * @param {string} referrer
     * @returns {Promise<object>}
     */
    this.reportSite = (url, referrer) => {
      throw notImplemented('reportSite');
    };
    /**
     * Sends message to open filtering log
     */
    this.openFilteringLog = () => {
      throw notImplemented('openFilteringLog');
    };
    /**
     * Sends message to open settings
     */
    this.openSettings = () => {
      throw notImplemented('openSettings');
    };
    /**
     * Sends message to update app
     */
    this.updateApp = () => {
      throw notImplemented('updateApp');
    };
    /**
     * Sends message to pause filtering
     * @param {string} url
     * @param {number} timeout
     * @returns {Promise<object>}
     */
    this.pauseFiltering = (url, timeout) => {
      throw notImplemented('pauseFiltering');
    };
  }
  async initModule() {
    throw notImplemented('initModule');
  }
}
;// ./src/background/api/nativeHostApi.js









/**
 * Module implements methods used to communicate with native host via native messaging
 * https://developer.chrome.com/apps/nativeMessaging
 */
class NativeHostApi extends AbstractApi {
  constructor(nativeHostMessagesHandler, initMessageHandler) {
    super();
    this.listeners = [];
    /**
     * Distributes messages to the listeners
     * @param incomingMessage
     * @returns {Promise<void>}
     */
    this.incomingMessageHandler = async incomingMessage => {
      log.debug(`Received response: ${incomingMessage.requestId}`, incomingMessage);

      // Ignore requests without identifying prefix ADG
      if (!incomingMessage.requestId.startsWith(ADG_PREFIX)) {
        return;
      }

      // Ignore requests with single request prefix, they have their own handlers
      if (incomingMessage.requestId.includes(CUSTOM_REQUEST_PREFIX)) {
        return;
      }

      // Call listener callbacks
      if (this.listeners.length > 0) {
        this.listeners.forEach(listener => {
          listener.call(null, incomingMessage);
        });
      }
    };
    /**
     * Adds listener to the listeners list
     * @param {function} listener
     */
    this.addMessageListener = listener => {
      this.listeners = [...this.listeners, listener];
    };
    /**
     * Removes listener from listeners list
     * @param {function} listener
     */
    this.removeMessageListener = listener => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
    /**
     * Is called on connection or reconnection
     * @param handler
     */
    this.addInitMessageHandler = handler => {
      this.initMessageHandler = handler;
    };
    /**
     * @param {object} port
     * @returns {string | null | undefined} chrome or firefox error
     */
    this.getError = port => {
      var _browser$runtime$last;
      return ((_browser$runtime$last = (browser_polyfill_default()).runtime.lastError) === null || _browser$runtime$last === void 0 ? void 0 : _browser$runtime$last.message) || port.error;
    };
    this.disconnectHandler = port => {
      const error = this.getError(port);
      if (error) {
        log.error(error);
      }
    };
    /**
     * Connect to the native host
     */
    this.connect = async () => {
      log.info('Connecting to the native host');
      // if the extension was connected to the native host in mv3 then it will not die after 30 seconds as usually
      this.port = browser_polyfill_default().runtime.connectNative(HOST_TYPES.browserExtensionHost);
      this.port.onMessage.addListener(this.incomingMessageHandler);
      this.port.onDisconnect.addListener(this.disconnectHandler);
      await this.sendInitialRequest(false);
    };
    this.sendInitialRequest = async shouldReconnect => {
      const {
        version,
        apiVersion,
        userAgent
      } = background_versions;
      const response = await this.init({
        version,
        userAgent,
        apiVersion
      }, shouldReconnect);
      this.initMessageHandler(response);
    };
    /**
     * Disconnect from the native host
     */
    this.disconnect = () => {
      log.debug('Disconnecting from native host');
      this.port.disconnect();
      this.port.onMessage.removeListener(this.incomingMessageHandler);
    };
    /**
     * Reconnect to the native host
     */
    this.reconnect = async () => {
      log.debug('Trying to reconnect to native host...');
      this.disconnect();
      await this.connect();
    };
    /**
     * Makes request with reconnection by default
     * @param params
     * @param tryReconnect - by default function retries to reconnect
     * @returns {Promise<*>}
     */
    this.makeRequest = async (params, tryReconnect = true) => {
      const isConsentRequired = await consent.isConsentRequired();
      if (isConsentRequired && params.type !== REQUEST_TYPES.init) {
        throw new Error('Requests to native host can be send only after consent agreement received');
      }
      try {
        return await this.makeRequestOnce(params);
      } catch (e) {
        // Prevent reconnection for init requests, to avoid infinite loop, since reconnect calls init request
        // https://github.com/AdguardTeam/BrowserAssistant/issues/115
        if (tryReconnect && params.type !== REQUEST_TYPES.init) {
          log.debug('Was unable to send request with params:', params, 'due to error:', getErrorMessage(e));
          try {
            await this.reconnect();
            // After reconnection, retry the request without attempting further reconnections.
            return await this.makeRequestOnce(params);
          } catch (e) {
            log.debug('Was unable to reconnect to the native host due to error:', getErrorMessage(e));
            throw e;
          }
        }
        throw e;
      }
    };
    this.makeRequestOnce = async params => {
      // Requests can be executed too long time on application launch
      const RESPONSE_TIMEOUT_MS = 1000 * 60 * 5;
      const HOST_RESPONSE_TYPES = {
        OK: 'ok',
        ERROR: 'error'
      };

      // Use CUSTOM_REQUEST_PREFIX in order to ignore this requests in the incomingMessageHandler
      const id = `${ADG_PREFIX}_${CUSTOM_REQUEST_PREFIX}_${nanoid()}`;
      log.info(`Sending request: ${id}`, params);
      return new Promise((resolve, reject) => {
        let timerId;
        const errorHandler = port => {
          const error = this.getError(port);
          if (error) {
            reject(error);
          }
        };
        const messageHandler = message => {
          const {
            requestId,
            result
          } = message;
          if (id === requestId) {
            this.port.onMessage.removeListener(messageHandler);
            this.port.onDisconnect.removeListener(errorHandler);
            clearTimeout(timerId);
            if (result === HOST_RESPONSE_TYPES.OK) {
              resolve(message);
              return;
            }
            if (result === HOST_RESPONSE_TYPES.ERROR) {
              reject(new Error(`Native host responded with message: ${message.data}.`));
            }
          }
        };
        this.port.onMessage.addListener(messageHandler);
        this.port.onDisconnect.addListener(errorHandler);
        timerId = setTimeout(() => {
          this.port.onMessage.removeListener(messageHandler);
          this.port.onDisconnect.removeListener(errorHandler);
          reject(new Error('Native host is not responding too long'));
        }, RESPONSE_TIMEOUT_MS);
        try {
          this.port.postMessage({
            id,
            ...params
          });
        } catch (e) {
          reject(e);
        }
      });
    };
    /**
     * Sends initial request to the native host
     * @param parameters
     * @param {string} parameters.version
     * @param {string} parameters.userAgent
     * @param {string} parameters.apiVersion
     * @param {boolean} tryReconnect
     * @returns {Promise<*>}
     */
    this.init = ({
      version,
      userAgent,
      apiVersion
    }, tryReconnect = false) => {
      return this.makeRequest({
        type: REQUEST_TYPES.init,
        parameters: {
          version,
          apiVersion,
          userAgent,
          type: ASSISTANT_TYPES.nativeAssistant
        }
      }, tryReconnect);
    };
    /**
     * Returns current app state
     */
    this.getCurrentAppState = async () => {
      const response = await this.makeRequest({
        type: REQUEST_TYPES.getCurrentAppState
      });
      return response.appState;
    };
    /**
     * Returns filtering state for url, used to get state of current tab
     * @param {string} url
     * @param {number} port
     * @param {boolean} forceStartApp
     */
    this.getCurrentFilteringState = (url, port, forceStartApp = false) => {
      return this.makeRequest({
        type: REQUEST_TYPES.getCurrentFilteringState,
        parameters: {
          url,
          port,
          forceStartApp
        }
      });
    };
    /**
     * Sets protections status of the app
     * @param {boolean} isEnabled
     */
    this.setProtectionStatus = isEnabled => this.makeRequest({
      type: REQUEST_TYPES.setProtectionStatus,
      parameters: {
        isEnabled
      }
    });
    /**
     * Sets filtering status
     * @param {boolean} isEnabled
     * @param {boolean} isHttpsEnabled
     * @param {string} url
     */
    this.setFilteringStatus = (isEnabled, isHttpsEnabled, url) => this.makeRequest({
      type: REQUEST_TYPES.setFilteringStatus,
      parameters: {
        isEnabled,
        isHttpsEnabled,
        url
      }
    });
    /**
     * @param {string} ruleText
     * @returns {Promise<object>}
     */
    this.addRule = ruleText => this.makeRequest({
      type: REQUEST_TYPES.addRule,
      parameters: {
        ruleText
      }
    });
    /**
     * @param {string} url
     * @returns {Promise<object>}
     */
    this.removeCustomRules = url => {
      return this.makeRequest({
        type: REQUEST_TYPES.removeCustomRules,
        parameters: {
          url
        }
      });
    };
    /**
     * @param {string} domain
     * @param {number} port
     * @returns {Promise<object>}
     */
    this.openOriginalCert = (domain, port) => this.makeRequest({
      type: REQUEST_TYPES.openOriginalCert,
      parameters: {
        domain,
        port
      }
    });
    /**
     * @param {string} url
     * @param {string} referrer
     * @returns {Promise<object>}
     */
    this.reportSite = (url, referrer) => this.makeRequest({
      type: REQUEST_TYPES.reportSite,
      parameters: {
        url,
        referrer,
        userAgent: background_versions.userAgent
      }
    });
    /**
     * Sends message to open filtering log
     */
    this.openFilteringLog = () => this.makeRequest({
      type: REQUEST_TYPES.openFilteringLog
    });
    /**
     * Sends message to open settings
     */
    this.openSettings = () => this.makeRequest({
      type: REQUEST_TYPES.openSettings
    });
    /**
     * Sends message to update app
     */
    this.updateApp = () => this.makeRequest({
      type: REQUEST_TYPES.updateApp
    });
    /**
     * Sends message to pause filtering
     * @param {string} url
     * @param {number} timeout
     * @returns {Promise<object>}
     */
    this.pauseFiltering = (url, timeout) => this.makeRequest({
      type: REQUEST_TYPES.pauseFiltering,
      parameters: {
        url,
        timeout
      }
    });
    this.initModule(nativeHostMessagesHandler, initMessageHandler);
  }
  async initModule(nativeHostMessagesHandler, initMessageHandler) {
    this.addMessageListener(nativeHostMessagesHandler);
    this.addInitMessageHandler(initMessageHandler);
    try {
      await this.connect();
    } catch (e) {
      log.debug(e);
    }
  }
}
;// ./src/background/api/index.js
/**
 * To enable stub host api
 * 1. comment import from nativeHostApi and Api declaration
 * 2. uncomment import from stubHostApi and Api declaration
 */

// import { StubHostApi } from './stubHostApi';
// const Api = StubHostApi;


const Api = NativeHostApi;

;// ./src/background/state.js












/**
 * This class handles app state
 * All requests to the native host should be made through this class
 */
class State {
  constructor() {
    this.appState = {
      /**
       * Required flag, that determines whether the AdGuard app is installed on the computer
       * @type {boolean}
       */
      isInstalled: false,
      /**
       * Required flag, that determines whether the AdGuard app is running
       * @type {boolean}
       */
      isRunning: false,
      /**
       * Required flag, that determines whether the protection is enabled
       * @type {boolean}
       */
      isProtectionEnabled: false,
      /**
       * Required flag determining whether the license has expired
       * @type {boolean}
       */
      isLicenseExpired: false,
      /**
       * Optional parameter from the app
       * @type {string|null}
       */
      locale: null,
      /**
       * Optional parameter from the app, consider true unless is set to the false
       * @type {boolean}
       */
      isAuthorized: true,
      /**
       *  String that determines what action application wants browser assistant to do
       *  @type {typeof FEEDBACK_ACTIONS}
       */
      feedbackAction: FEEDBACK_ACTIONS.UPDATE_APPLICATION_APP_ONLY
    };
    this.updateStatusInfo = {
      /**
       * Parameter that determines if the extension API version is up-to-date with the app API version
       * @type {boolean}
       */
      isAppUpToDate: true,
      /**
       * Flag that determines whether the extension's API, specified by request's parameters,
       * is successfully validated on the host's side
       * @type {boolean}
       */
      isValidatedOnHost: true
    };
    this.hostInfo = {
      platform: '',
      version: ''
    };
    this.urlInfo = {
      isHttpsFilteringEnabled: false,
      isFilteringEnabled: false,
      isSecured: false,
      canChangeFilteringStatus: true
    };
    this.updateSecured = currentUrl => {
      const {
        protocol
      } = getUrlProps(currentUrl);
      this.isSecured = getFormattedProtocol(protocol) === PROTOCOLS.SECURED;
    };
    /**
     * Handles init message response and updates app setup
     * @param response
     */
    this.initMessageHandler = response => {
      const {
        parameters,
        appState
      } = response;
      const {
        isValidatedOnHost,
        apiVersion,
        version,
        platform
      } = parameters;
      const isAppUpToDate = background_versions.apiVersion <= apiVersion;
      this.setAppState(appState);
      this.setUpdateStatusInfo(isAppUpToDate, isValidatedOnHost);
      this.setHostInfo(platform, version);
    };
    /**
     * Listens messages sent by native host without request
     */
    this.nativeHostMessagesHandler = async message => {
      if (!message || !message.appState) {
        return;
      }
      this.setAppState(message.appState);
    };
    this.init = () => {
      this.api = new Api(this.nativeHostMessagesHandler, this.initMessageHandler);
    };
    /**
     * Returns current app state
     */
    this.getAppState = () => {
      let {
        locale
      } = this.appState;
      // if no locale use browser locale
      if (!locale) {
        locale = browser_polyfill_default().i18n.getUILanguage();
      }
      return {
        ...this.appState,
        locale
      };
    };
    /**
     * Validates app state, sets app state and notifies external modules that state has changed
     * @param {*} appState
     */
    this.setAppState = (appState = {}) => {
      const {
        isInstalled,
        isRunning,
        isProtectionEnabled,
        isLicenseExpired,
        locale,
        isAuthorized
      } = appState;
      let {
        feedbackAction = FEEDBACK_ACTIONS.UPDATE_APPLICATION_APP_ONLY
      } = appState;
      if ([isInstalled, isRunning, isProtectionEnabled].some(state => state === undefined)) {
        // eslint-disable-next-line max-len
        const message = `isInstalled=${isInstalled}, isRunning=${isRunning}, isProtectionEnabled=${isProtectionEnabled}`;
        throw new Error(`All states should be defined: received ${message}`);
      }

      /**
       * Validate feedbackAction values, set to default if not found among known actions
       */
      if (!Object.values(FEEDBACK_ACTIONS).includes(feedbackAction)) {
        log.debug(`Extension doesn't know about this feedback action: ${feedbackAction}`);
        feedbackAction = FEEDBACK_ACTIONS.UPDATE_APPLICATION_APP_ONLY;
      }
      const nextAppState = {
        ...this.appState,
        isInstalled,
        isRunning,
        isProtectionEnabled,
        isLicenseExpired,
        feedbackAction
      };
      if (locale !== undefined) {
        nextAppState.locale = locale;
      }
      if (isAuthorized !== undefined) {
        nextAppState.isAuthorized = isAuthorized;
      }
      const appStateChanged = !isEqual_default()(this.appState, nextAppState);
      if (appStateChanged) {
        this.appState = {
          ...this.appState,
          ...nextAppState
        };
      }

      // Notify modules only when appState changes or feedbackAction asks
      // to update filtering state
      if (appStateChanged || feedbackAction === FEEDBACK_ACTIONS.UPDATE_FILTERING_STATUS) {
        this.notifyModules();
      }
    };
    this.NOTIFY_TIMEOUT_MS = 40;
    /**
     * Notifies modules about state changes
     * Throttle function, so we can call it whenever we want
     */
    this.notifyModules = throttle_default()(async tab => {
      // Notify browser action tab about changed state
      lib_notifier.notifyListeners(lib_notifier.types.STATE_UPDATED, tab);

      // Notify popup about changed state
      longLivedMessageService.notifyPopupStateUpdated(this.getAppState(), this.getUpdateStatusInfo());
    }, this.NOTIFY_TIMEOUT_MS, {
      leading: false
    });
    /**
     * Sets update status info and notifies external modules when it changes
     * @param isAppUpToDate
     * @param isValidatedOnHost
     */
    this.setUpdateStatusInfo = (isAppUpToDate, isValidatedOnHost) => {
      const nextUpdateStatusInfo = {
        isAppUpToDate,
        isValidatedOnHost
      };

      // Notify modules only when updateStatusInfo changes
      if (!isEqual_default()(this.updateStatusInfo, nextUpdateStatusInfo)) {
        this.updateStatusInfo = {
          ...this.updateStatusInfo,
          ...nextUpdateStatusInfo
        };
        this.notifyModules();
      }
    };
    /**
     * Sets host info
     * @param platform
     * @param version
     */
    this.setHostInfo = (platform, version) => {
      this.hostInfo = {
        platform,
        version
      };
    };
    /**
     * Returns current filtering state or null if url is not http
     * @param {chrome.tabs.Tab} tab
     * @param {boolean} forceStart
     * @returns {Promise<null|*>}
     */
    this.getCurrentFilteringState = async (tab, forceStart = false) => {
      const url = tab === null || tab === void 0 ? void 0 : tab.url;
      this.updateSecured(url);

      // Do not send empty urls or non http urls, see - AG-2360, except for forceStart
      if (!forceStart && !(url && isHttp(url))) {
        return null;
      }
      const {
        port
      } = getUrlProps(url);
      const response = await this.api.getCurrentFilteringState(url, port, forceStart);
      const {
        appState,
        parameters
      } = response;
      if (!parameters) {
        return null;
      }
      const {
        isFilteringEnabled,
        isHttpsFilteringEnabled
      } = parameters;
      let {
        canChangeFilteringStatus
      } = parameters;
      this.setAppState(appState);
      this.isFilteringEnabled = isFilteringEnabled;
      this.isHttpsFilteringEnabled = isHttpsFilteringEnabled;
      if (canChangeFilteringStatus === undefined) {
        canChangeFilteringStatus = true; // by default consider that this flag is true
      }
      this.canChangeFilteringStatus = canChangeFilteringStatus;
      return {
        ...parameters,
        canChangeFilteringStatus
      };
    };
    this.setProtectionStatus = async isEnabled => {
      const response = await this.api.setProtectionStatus(isEnabled);
      this.setAppState(response.appState);
      return response.appState;
    };
    this.getCurrentAppState = async () => {
      const appState = await this.api.getCurrentAppState();
      this.setAppState(appState);
      return appState;
    };
    this.setFilteringStatus = async (isEnabled, isHttpsEnabled, url) => {
      this.isEnabled = isEnabled;
      this.isHttpsFilteringEnabled = isHttpsEnabled;
      const response = await this.api.setFilteringStatus(isEnabled, isHttpsEnabled, url);
      this.setAppState(response.appState);
    };
    this.removeCustomRules = async url => {
      const response = await this.api.removeCustomRules(url);
      this.setAppState(response.appState);
    };
    this.openOriginalCert = async (domain, port) => {
      const response = await this.api.openOriginalCert(domain, port);
      this.setAppState(response.appState);
    };
    this.reportSite = async (url, referrer) => {
      const response = await this.api.reportSite(url, referrer);
      this.setAppState(response.appState);
      return response.parameters.reportUrl;
    };
    this.openFilteringLog = async () => {
      const response = await this.api.openFilteringLog();
      this.setAppState(response.appState);
    };
    this.openSettings = async () => {
      const response = await this.api.openSettings();
      this.setAppState(response.appState);
    };
    this.updateApp = async () => {
      const response = await this.api.updateApp();
      this.setAppState(response.appState);
    };
    this.addRule = async ruleText => {
      const response = await this.api.addRule(ruleText);
      this.setAppState(response.appState);
    };
    this.pauseFiltering = async (url, timeout) => {
      const response = await this.api.pauseFiltering(url, timeout);
      this.setAppState(response.appState);
    };
  }
  set isHttpsFilteringEnabled(isHttpsFilteringEnabled) {
    this.urlInfo.isHttpsFilteringEnabled = isHttpsFilteringEnabled;
  }
  set isFilteringEnabled(isFilteringEnabled) {
    this.urlInfo.isFilteringEnabled = isFilteringEnabled;
  }
  set isSecured(isSecured) {
    this.urlInfo.isSecured = isSecured;
  }
  set canChangeFilteringStatus(canChangeFilteringStatus) {
    this.urlInfo.canChangeFilteringStatus = canChangeFilteringStatus;
  }
  /**
   * Returns update status info
   */
  getUpdateStatusInfo() {
    return this.updateStatusInfo;
  }
  /**
   * Checks if app is working
   * @returns {boolean}
   */
  isAppWorking() {
    return [this.appState.isInstalled, this.appState.isRunning, this.appState.isProtectionEnabled, this.updateStatusInfo.isAppUpToDate, this.updateStatusInfo.isValidatedOnHost].every(state => state === true);
  }

  /**
   * Returns app locale key
   * @returns {string}
   */
  getLocale() {
    return this.appState.locale || browser_polyfill_default().i18n.getUILanguage();
  }
}
/* harmony default export */ const state = (new State());
;// ./src/background/filteringPause.js





const FILTERING_PAUSE_TIMEOUT_MS = 30000;
const FILTERING_PAUSE_TIMER_TICK_MS = 1000;

/**
 * Handles filtering pause after the popup button "Do not filter for 30 seconds" is clicked
 */
class FilteringPause {
  constructor() {
    this.hostnameToTimeoutMap = {};
    this.getUrlHostname = url => {
      return getUrlProperties(url).hostname;
    };
    this.setHostnameTimeout = (url, timeout) => {
      const hostname = this.getUrlHostname(url);
      this.hostnameToTimeoutMap[hostname] = timeout;
    };
    this.getHostnameTimeout = url => {
      const hostname = this.getUrlHostname(url);
      return this.hostnameToTimeoutMap[hostname];
    };
    this.deleteHostnameTimeout = url => {
      const hostname = this.getUrlHostname(url);
      delete this.hostnameToTimeoutMap[hostname];
    };
    this.resetHostnameTimeout = url => {
      this.setHostnameTimeout(url, 0);
    };
    this.resetAllHostnameTimeout = () => {
      this.hostnameToTimeoutMap = Object.keys(this.hostnameToTimeoutMap).reduce((acc, hostname) => {
        acc[hostname] = 0;
        return acc;
      }, {});
    };
    this.clearHostnameTimeout = async url => {
      this.resetHostnameTimeout(url);
      this.notifyPopup();
      this.deleteHostnameTimeout(url);
    };
    this.isFilteringPauseSupported = () => {
      const {
        version,
        platform
      } = state.hostInfo;
      if (!platform) {
        return false;
      }
      const minSupportVersion = FILTERING_PAUSE_VERSION_SUPPORT_SINCE[platform.toUpperCase()];
      return compareSemver(version, minSupportVersion) >= 0;
    };
    this.showReloadButtonFlag = url => {
      const timeout = this.getHostnameTimeout(url);
      if (timeout === undefined) {
        return false;
      }
      return timeout < 0;
    };
    this.notifyPopup = () => {
      longLivedMessageService.notifyPopupFilteringPauseTimeout(this.hostnameToTimeoutMap);
    };
    this.handleFilteringPause = async url => {
      if (!this.isFilteringPauseSupported()) {
        return;
      }
      this.setHostnameTimeout(url, FILTERING_PAUSE_TIMEOUT_MS);
      await state.pauseFiltering(url, (FILTERING_PAUSE_TIMEOUT_MS / 1000).toString());
      const timerId = setInterval(async () => {
        const timeout = this.getHostnameTimeout(url);
        if (timeout < 0) {
          // Notify to toggle the icon to the enabled state
          lib_notifier.notifyListeners(lib_notifier.types.STATE_UPDATED);
          clearTimeout(timerId);
        }
        if (timeout === undefined) {
          clearTimeout(timerId);
          return;
        }
        this.notifyPopup();
        this.setHostnameTimeout(url, timeout - FILTERING_PAUSE_TIMER_TICK_MS);
      }, FILTERING_PAUSE_TIMER_TICK_MS);
    };
  }
}
const filteringPause = new FilteringPause();
/* harmony default export */ const background_filteringPause = (filteringPause);
;// ./src/background/TabsService.js








/**
 * Manages interaction with tabs
 */
class TabsService {
  constructor() {
    /**
     * Sends message to the tab, previously executing there content script
     * @param tabId
     * @param type
     * @param data
     * @returns {Promise<*>}
     */
    this.sendMessage = async (tabId, type, data) => {
      await browser_polyfill_default().scripting.executeScript({
        target: {
          tabId
        },
        files: [CONTENT_SCRIPT_NAME]
      });
      const response = await browser_polyfill_default().tabs.sendMessage(tabId, {
        type,
        data
      });
      return response;
    };
    /**
     * Retrieves referrer from content script
     * @param tab
     * @returns {Promise<string>}
     */
    this.getReferrer = async tab => {
      try {
        const response = await this.sendMessage(tab.id, CONTENT_MESSAGES.GET_REFERRER);
        return response;
      } catch (e) {
        return '';
      }
    };
    /**
     * Sends message to init assistant on the page, and passes it callback name
     * @param tabId
     * @returns {Promise<void>}
     */
    this.initAssistant = async tabId => {
      const data = {
        addRuleCallbackName: CONTENT_MESSAGES.ADD_RULE
      };
      try {
        await this.sendMessage(tabId, CONTENT_MESSAGES.INIT_ASSISTANT, data);
      } catch (e) {
        log.debug(e.message);
      }
    };
    browser_polyfill_default().tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
      if (changeInfo.status === 'complete' || changeInfo.status === 'loading') {
        const hostname = background_filteringPause.getUrlHostname(tab.url);
        if (background_filteringPause.hostnameToTimeoutMap[hostname] < 0) {
          background_filteringPause.deleteHostnameTimeout(tab.url);
        }
        if (tab && tab.active) {
          lib_notifier.notifyListeners(lib_notifier.types.TAB_UPDATED, tabs.prepareTab(tab));
        }
      }
    });
    browser_polyfill_default().tabs.onActivated.addListener(async ({
      tabId
    }) => {
      let tab;
      try {
        tab = await browser_polyfill_default().tabs.get(tabId);
      } catch (e) {
        log.debug(e.message);
        return; // ignore errors happening when we try to get removed tabs
      }
      if (tab && tab.active) {
        lib_notifier.notifyListeners(lib_notifier.types.TAB_ACTIVATED, tabs.prepareTab(tab));
      }
    });
  }
}
const tabsService = new TabsService();
;// ./src/background/getPopupData.js



const getPopupData = async tab => {
  const {
    url
  } = tab;
  try {
    await state.getCurrentAppState();
  } catch (e) {
    return {
      appState: state.getAppState(),
      updateStatusInfo: state.getUpdateStatusInfo(),
      hostError: e.message,
      isFilteringPauseSupported: background_filteringPause.isFilteringPauseSupported(),
      showReloadButtonFlag: background_filteringPause.showReloadButtonFlag(url)
    };
  }

  // There is no need to check tab info if app is not working
  if (!state.isAppWorking()) {
    return {
      appState: state.getAppState(),
      updateStatusInfo: state.getUpdateStatusInfo(),
      isFilteringPauseSupported: background_filteringPause.isFilteringPauseSupported(),
      showReloadButtonFlag: background_filteringPause.showReloadButtonFlag(url)
    };
  }
  const referrer = await tabsService.getReferrer(tab);
  const updateStatusInfo = state.getUpdateStatusInfo();
  const appState = state.getAppState();
  let currentFilteringState;
  try {
    currentFilteringState = await state.getCurrentFilteringState(tab);
  } catch (e) {
    const updateStatusInfo = state.getUpdateStatusInfo();
    const appState = state.getAppState();
    return {
      referrer,
      updateStatusInfo,
      appState,
      hostError: e.message,
      isFilteringPauseSupported: background_filteringPause.isFilteringPauseSupported(),
      showReloadButtonFlag: background_filteringPause.showReloadButtonFlag(url)
    };
  }

  // For pages without http or https currentFilteringState would be null
  if (!currentFilteringState) {
    const updateStatusInfo = state.getUpdateStatusInfo();
    const appState = state.getAppState();
    return {
      referrer,
      updateStatusInfo,
      appState,
      isFilteringPauseSupported: background_filteringPause.isFilteringPauseSupported(),
      showReloadButtonFlag: background_filteringPause.showReloadButtonFlag(url)
    };
  }
  return {
    referrer,
    updateStatusInfo,
    appState,
    currentFilteringState,
    isFilteringPauseSupported: background_filteringPause.isFilteringPauseSupported(),
    showReloadButtonFlag: background_filteringPause.showReloadButtonFlag(url)
  };
};
/* harmony default export */ const background_getPopupData = (getPopupData);
;// ./src/background/storage/storage.js
class Storage {
  constructor(storage) {
    this.storage = storage;
  }
  async set(key, value) {
    await this.storage.set({
      [key]: value
    });
  }
  async get(key) {
    const storedValue = await this.storage.get(key);
    return storedValue[key];
  }
}
;// ./src/background/storage/index.js


const storage = new Storage((browser_polyfill_default()).storage.local);
;// ./src/background/settings/Settings.js


const DEFAULT_SETTINGS = {
  [SETTINGS.CONTEXT_MENU_ENABLED]: true
};
class Settings {
  constructor(storage) {
    this.STORAGE_KEY = 'settings';
    /**
     * In order to not call storage too often we throttle calls to it
     * @type {number}
     */
    this.SAVE_TIMEOUT = 500;
    this.persist = throttle_default()(async () => {
      await this.storage.set(this.STORAGE_KEY, this.settings);
    }, this.SAVE_TIMEOUT);
    this.storage = storage;
  }

  /**
   * Gets settings from storage and merges them with default settings
   */
  async init() {
    const settingsFromStorage = await this.storage.get(this.STORAGE_KEY);
    this.settings = settingsFromStorage ?? DEFAULT_SETTINGS;
  }
  setSetting(key, value) {
    this.settings[key] = value;
    this.persist();
  }
  getSetting(key) {
    return this.settings[key];
  }
  contextMenuEnabled() {
    return this.getSetting(SETTINGS.CONTEXT_MENU_ENABLED);
  }
}
;// ./src/background/settings/index.js


const settings = new Settings(storage);
;// ./src/background/messageHandler.js










/**
 * Handles incoming messages to the background page
 * @param message
 * @param {string} message.type
 * @param {*} message.data
 * @returns {Promise<*>}
 */
// eslint-disable-next-line consistent-return
const messageHandler = async message => {
  const {
    type,
    data
  } = message;
  switch (type) {
    // Message used to keep service worker awake
    case CONTENT_MESSAGES.PING:
      {
        break;
      }
    case POPUP_MESSAGES.GET_APP_LOCALE:
      {
        return state.getLocale();
      }
    case POPUP_MESSAGES.GET_POPUP_DATA:
      {
        const {
          tab
        } = data;
        const popupData = await background_getPopupData(tab);
        return popupData;
      }
    case POPUP_MESSAGES.GET_CURRENT_FILTERING_STATE:
      {
        const {
          tab,
          forceStart
        } = data;
        return state.getCurrentFilteringState(tab, forceStart);
      }
    case POPUP_MESSAGES.GET_APP_STATE:
      {
        return {
          appState: state.getAppState(),
          updateStatusInfo: state.getUpdateStatusInfo()
        };
      }
    case POPUP_MESSAGES.SET_PROTECTION_STATUS:
      {
        const {
          isEnabled
        } = data;
        const resultAppState = await state.setProtectionStatus(isEnabled);
        background_filteringPause.resetAllHostnameTimeout();
        await background_filteringPause.notifyPopup();
        return resultAppState;
      }
    case POPUP_MESSAGES.SET_FILTERING_STATUS:
      {
        const {
          isEnabled,
          isHttpsEnabled,
          url
        } = data;
        await state.setFilteringStatus(isEnabled, isHttpsEnabled, url);
        await background_filteringPause.clearHostnameTimeout(url);
        break;
      }
    case POPUP_MESSAGES.REMOVE_CUSTOM_RULES:
      {
        const {
          url
        } = data;
        await state.removeCustomRules(url);
        break;
      }
    case POPUP_MESSAGES.OPEN_ORIGINAL_CERT:
      {
        const {
          domain,
          port
        } = data;
        await state.openOriginalCert(domain, port);
        break;
      }
    case POPUP_MESSAGES.REPORT_SITE:
      {
        const {
          url,
          referrer
        } = data;
        const reportUrl = await state.reportSite(url, referrer);
        await tabs.openPage(reportUrl);
        break;
      }
    case POPUP_MESSAGES.OPEN_FILTERING_LOG:
      {
        await state.openFilteringLog();
        break;
      }
    case POPUP_MESSAGES.OPEN_SETTINGS:
      {
        await state.openSettings();
        break;
      }
    case POPUP_MESSAGES.UPDATE_APP:
      {
        await state.updateApp();
        break;
      }
    case POPUP_MESSAGES.INIT_ASSISTANT:
      {
        const {
          tabId
        } = data;
        await tabsService.initAssistant(tabId);
        break;
      }
    case CONTENT_MESSAGES.ADD_RULE:
      {
        const {
          ruleText
        } = data;
        await state.addRule(ruleText);
        break;
      }
    case POPUP_MESSAGES.PAUSE_FILTERING:
      {
        const {
          tab
        } = data;
        await background_filteringPause.handleFilteringPause(tab.url);
        await tabs.reloadTab(tab);
        break;
      }
    case POST_INSTALL_MESSAGES.UNINSTALL_EXTENSION:
      {
        browser_polyfill_default().management.uninstallSelf();
        break;
      }
    case POST_INSTALL_MESSAGES.AGREE_WITH_CONDITIONS:
      {
        await consent.setConsentRequired(false);
        await tabs.closePostInstall();
        break;
      }
    case POPUP_MESSAGES.GET_CONSENT_REQUIRED:
      {
        return consent.isConsentRequired();
      }
    case OPTIONS_UI_MESSAGES.GET_SETTING:
      {
        return settings.getSetting(data.key);
      }
    case OPTIONS_UI_MESSAGES.SET_SETTING:
      {
        return settings.setSetting(data.key, data.value);
      }
    default:
      {
        throw new Error(`Unknown message type was sent: ${type}`);
      }
  }
};
;// ./src/background/localStorage.js
// TODO remove local storage because there is no localStorage in the service worker
// Make it after a few versions after 1.4 released
const localStorageMock = {
  setItem: () => {},
  getItem: () => {}
};
/**
 * Wrapper around localStorage api
 * Used to set and get data from the storage
 */
class LocalStorage {
  constructor() {
    this.storage = localStorageMock;
  }

  /**
   * Saves data in the storage by key
   * @param key
   * @param data
   */
  set(key, data) {
    return this.storage.setItem(key, data);
  }

  /**
   * Returns data from the storage by key
   * @param key
   * @returns {string}
   */
  get(key) {
    return this.storage.getItem(key);
  }
}
const localStorage = new LocalStorage();
;// ./src/background/updateService.js






/**
 * Service with data about current app state
 */
class UpdateService {
  constructor() {
    this.WAIT_FROM_INSTALLED_EVENT_TIMEOUT_MS = 50;
    /**
     * onInstalled doesn't fire event on reload from developers tools
     * that is why we use fallback from storage
     */
    this.getVersionsFromInstalledEvent = async () => {
      return new Promise(resolve => {
        browser_polyfill_default().runtime.onInstalled.addListener(details => {
          const currentVersion = this.getAppVersionFromManifest();
          const {
            previousVersion
          } = details;
          resolve({
            currentVersion,
            previousVersion
          });
        });
        setTimeout(() => {
          resolve(null);
        }, this.WAIT_FROM_INSTALLED_EVENT_TIMEOUT_MS);
      });
    };
    this.getVersionInfoFromStorage = async () => {
      const previousVersion = await this.getAppVersionFromStorage();
      const currentVersion = this.getAppVersionFromManifest();
      return {
        currentVersion,
        previousVersion
      };
    };
    this.init = async onInstalled => {
      let versions = await this.getVersionsFromInstalledEvent();
      if (!versions) {
        versions = await this.getVersionInfoFromStorage();
        log.debug('Versions retrieved from storage', versions);
      } else {
        log.debug('Versions retrieved from installed event', versions);
      }
      this.currentVersion = versions.currentVersion;
      this.previousVersion = versions.previousVersion;
      this.isFirstRun = this.currentVersion !== this.previousVersion && !this.previousVersion;
      this.isUpdate = !!(this.currentVersion !== this.previousVersion && this.previousVersion);
      await this.setAppVersionInStorage(this.currentVersion);
      const runInfo = {
        currentVersion: this.currentVersion,
        previousVersion: this.previousVersion,
        isFirstRun: this.isFirstRun,
        isUpdate: this.isUpdate
      };
      onInstalled(runInfo);
    };
    this.getAppVersionFromStorage = async () => {
      // TODO remove localStorage fallback after some time,
      //  we use it because in the previous version 1.3.13 we used localStorage
      return (await storage.get(APP_VERSION_KEY)) ?? localStorage.get(APP_VERSION_KEY);
    };
    this.getAppVersionFromManifest = () => {
      return browser_polyfill_default().runtime.getManifest().version;
    };
    this.setAppVersionInStorage = async appVersion => {
      return storage.set(APP_VERSION_KEY, appVersion);
    };
  }
}
const updateService = new UpdateService();
;// ./node_modules/.pnpm/compare-versions@4.1.4/node_modules/compare-versions/index.mjs
function compareVersions(v1, v2) {
  // validate input and split into segments
  const n1 = validateAndParse(v1);
  const n2 = validateAndParse(v2);

  // pop off the patch
  const p1 = n1.pop();
  const p2 = n2.pop();

  // validate numbers
  const r = compareSegments(n1, n2);
  if (r !== 0) return r;

  // validate pre-release
  if (p1 && p2) {
    return compareSegments(p1.split('.'), p2.split('.'));
  } else if (p1 || p2) {
    return p1 ? -1 : 1;
  }

  return 0;
}

const validate = (v) =>
  typeof v === 'string' && /^[v\d]/.test(v) && semver.test(v);

const compare = (v1, v2, operator) => {
  // validate input operator
  assertValidOperator(operator);

  // since result of compareVersions can only be -1 or 0 or 1
  // a simple map can be used to replace switch
  const res = compareVersions(v1, v2);

  return operatorResMap[operator].includes(res);
};

const satisfies = (v, r) => {
  // if no range operator then "="
  const m = r.match(/^([<>=~^]+)/);
  const op = m ? m[1] : '=';

  // if gt/lt/eq then operator compare
  if (op !== '^' && op !== '~') return compare(v, r, op);

  // else range of either "~" or "^" is assumed
  const [v1, v2, v3] = validateAndParse(v);
  const [r1, r2, r3] = validateAndParse(r);
  if (compareStrings(v1, r1) !== 0) return false;
  if (op === '^') {
    return compareSegments([v2, v3], [r2, r3]) >= 0;
  }
  if (compareStrings(v2, r2) !== 0) return false;
  return compareStrings(v3, r3) >= 0;
};

// export CJS style for parity
compareVersions.validate = validate;
compareVersions.compare = compare;
compareVersions.satisfies = satisfies;

const semver =
  /^[v^~<>=]*?(\d+)(?:\.([x*]|\d+)(?:\.([x*]|\d+)(?:\.([x*]|\d+))?(?:-([\da-z\-]+(?:\.[\da-z\-]+)*))?(?:\+[\da-z\-]+(?:\.[\da-z\-]+)*)?)?)?$/i;

const validateAndParse = (v) => {
  if (typeof v !== 'string') {
    throw new TypeError('Invalid argument expected string');
  }
  const match = v.match(semver);
  if (!match) {
    throw new Error(`Invalid argument not valid semver ('${v}' received)`);
  }
  match.shift();
  return match;
};

const isWildcard = (s) => s === '*' || s === 'x' || s === 'X';

const tryParse = (v) => {
  const n = parseInt(v, 10);
  return isNaN(n) ? v : n;
};

const forceType = (a, b) =>
  typeof a !== typeof b ? [String(a), String(b)] : [a, b];

const compareStrings = (a, b) => {
  if (isWildcard(a) || isWildcard(b)) return 0;
  const [ap, bp] = forceType(tryParse(a), tryParse(b));
  if (ap > bp) return 1;
  if (ap < bp) return -1;
  return 0;
};

const compareSegments = (a, b) => {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const r = compareStrings(a[i] || 0, b[i] || 0);
    if (r !== 0) return r;
  }
  return 0;
};

const operatorResMap = {
  '>': [1],
  '>=': [0, 1],
  '=': [0],
  '<=': [-1, 0],
  '<': [-1],
};

const allowedOperators = Object.keys(operatorResMap);

const assertValidOperator = (op) => {
  if (typeof op !== 'string') {
    throw new TypeError(
      `Invalid operator type, expected string but got ${typeof op}`
    );
  }
  if (allowedOperators.indexOf(op) === -1) {
    throw new Error(
      `Invalid operator, expected one of ${allowedOperators.join('|')}`
    );
  }
};

;// ./src/background/migrationService/MigrationService.js







const FIREFOX_CONSENT_MIGRATION_VERSION = '1.2.2';
const STORAGE_DATA_MIGRATION_VERSION = '1.3.15';
class MigrationService {
  constructor() {
    /**
     * Migration from local storage to browser storage
     */
    this.storageMigrationForFirefox = async () => {
      const isConsentRequired = JSON.parse(localStorage.get(consent.CONSENT_REQUIRED_STORAGE_KEY));
      if (isConsentRequired !== undefined) {
        log.debug('Migrate consent setting from local storage to browser storage');
        await consent.setConsentRequired(isConsentRequired);
      }
    };
    /**
     * Migrates data from local storage to browser storage.
     * There is only app version data to migrate.
     */
    this.localStorageDataMigration = async () => {
      const appVersion = localStorage.get(APP_VERSION_KEY);
      await storage.set(APP_VERSION_KEY, appVersion);
      log.debug('App version data migrated from local storage to browser storage');
    };
  }
  async migrate(previousVersion) {
    // consent setting moved from local storage to
    // browser storage after version 1.2.2 in firefox only
    if (browserApi.utils.isFirefoxBrowser && compare(previousVersion, FIREFOX_CONSENT_MIGRATION_VERSION, '<=')) {
      await this.storageMigrationForFirefox();
    }
    if (compare(previousVersion, STORAGE_DATA_MIGRATION_VERSION, '<=')) {
      await this.localStorageDataMigration();
    }
  }
}
;// ./src/background/migrationService/index.js

const migrationService = new MigrationService();
;// ./src/background/contextMenu.ts
var _ContextMenu;









// Context menu items names and translation keys
var ContextMenuItem = /*#__PURE__*/function (ContextMenuItem) {
  ContextMenuItem["SiteProtectionDisabled"] = "context_site_protection_disabled";
  ContextMenuItem["SiteFilteringDisabled"] = "context_site_filtering_disabled";
  ContextMenuItem["SiteFilteringOn"] = "context_site_filtering_on";
  ContextMenuItem["SiteFilteringOff"] = "context_site_filtering_off";
  ContextMenuItem["BlockSiteAds"] = "context_block_site_ads";
  ContextMenuItem["ComplaintWebsite"] = "context_complaint_website";
  ContextMenuItem["EnableProtection"] = "context_enable_protection";
  ContextMenuItem["DisableProtection"] = "context_disable_protection";
  ContextMenuItem["OpenSettings"] = "context_open_settings";
  ContextMenuItem["OpenLog"] = "context_open_log";
  ContextMenuItem["PauseFiltering"] = "pause_filtering";
  return ContextMenuItem;
}(ContextMenuItem || {});
class ContextMenu {
  /**
   * Adds listeners, should be on the upper level
   */
  static init() {
    lib_notifier.addSpecifiedListener(
    // TODO fix types, convert notifier to typescript code
    // @ts-ignore
    lib_notifier.types.SETTING_UPDATED, ContextMenu.update);
    chrome.contextMenus.onClicked.addListener(ContextMenu.onClicked);
  }

  /**
   * Ensures sequential execution of the `update` method within the ContextMenu class, preventing concurrent updates.
   * If called while an update is in progress, it queues a single subsequent update for after the current one
   * completes, ensuring the latest request is processed.
   * Utilizes a closure to maintain state across invocations.
   */

  /**
   * Updates context menu
   */
  static async update() {
    // clear old menu items before updating
    await browser_polyfill_default().contextMenus.removeAll();
    if (settings.contextMenuEnabled()) {
      await ContextMenu.buildContextMenu();
    }
  }

  /**
   * Builds context menu
   */
  static async buildContextMenu() {
    if (!state.isAppWorking()) {
      await ContextMenu.addMenuItem(ContextMenuItem.EnableProtection);
      return;
    }
    if (!state.appState.isAuthorized) {
      await ContextMenu.addMenuItem(ContextMenuItem.OpenSettings);
      await ContextMenu.addSeparator();
      await ContextMenu.addMenuItem(ContextMenuItem.OpenLog);
      return;
    }
    if (!state.appState.isProtectionEnabled) {
      await ContextMenu.addMenuItem(ContextMenuItem.SiteProtectionDisabled, false);
      await ContextMenu.addSeparator();
      await ContextMenu.addMenuItem(ContextMenuItem.OpenLog);
      await ContextMenu.addMenuItem(ContextMenuItem.OpenSettings);
      await ContextMenu.addMenuItem(ContextMenuItem.EnableProtection);
    } else if (state.urlInfo.isSecured) {
      await ContextMenu.addMenuItem(ContextMenuItem.SiteFilteringDisabled);
      await ContextMenu.addSeparator();
      await ContextMenu.addMenuItem(ContextMenuItem.OpenLog);
      await ContextMenu.addMenuItem(ContextMenuItem.OpenSettings);
    } else {
      if (state.urlInfo.isFilteringEnabled && state.urlInfo.canChangeFilteringStatus) {
        await ContextMenu.addMenuItem(ContextMenuItem.SiteFilteringOff);
        await ContextMenu.addSeparator();
        await ContextMenu.addMenuItem(ContextMenuItem.PauseFiltering);
        await ContextMenu.addMenuItem(ContextMenuItem.BlockSiteAds);
      } else if (state.urlInfo.canChangeFilteringStatus) {
        await ContextMenu.addMenuItem(ContextMenuItem.SiteFilteringOn);
        await ContextMenu.addSeparator();
      }
      await ContextMenu.addMenuItem(ContextMenuItem.ComplaintWebsite);
      await ContextMenu.addSeparator();
      await ContextMenu.addMenuItem(ContextMenuItem.OpenSettings);
      await ContextMenu.addMenuItem(ContextMenuItem.OpenLog);
      await ContextMenu.addMenuItem(ContextMenuItem.DisableProtection);
    }
  }

  /**
   * Handles context menu item click with right handler
   * @param info
   * @param tab
   */
  static onClicked(info, tab) {
    const clickHandler = ContextMenu.clickHandlers[info.menuItemId];
    if (!clickHandler) {
      return;
    }
    clickHandler(info, tab);
  }

  /**
   * Creates context menu item
   * @param menuItemId - i18 key
   * @param enabled
   */

  /**
   * Promisifying wrapper for the browser.contextMenus.create method
   * @param props
   */
  static createMenu(props) {
    return new Promise((resolve, reject) => {
      browser_polyfill_default().contextMenus.create(props, () => {
        if ((browser_polyfill_default()).runtime.lastError) {
          reject((browser_polyfill_default()).runtime.lastError);
          return;
        }
        resolve();
      });
    });
  }
}
_ContextMenu = ContextMenu;
/**
 * Click handlers
 */
ContextMenu.clickHandlers = {
  [ContextMenuItem.BlockSiteAds]: async () => {
    const {
      id
    } = await tabs.getCurrentTab();
    await tabsService.initAssistant(id);
  },
  [ContextMenuItem.ComplaintWebsite]: async () => {
    const tab = await tabs.getCurrentTab();
    const referrer = await tabsService.getReferrer(tab);
    const reportUrl = await state.reportSite(tab.url, referrer);
    await tabs.openPage(reportUrl);
  },
  [ContextMenuItem.SiteFilteringOn]: async () => {
    const tabsToUpdate = await tabs.getActiveAndSimilarTabs();
    await Promise.all(tabsToUpdate.map(async tab => {
      await state.setFilteringStatus(true, state.urlInfo.isHttpsFilteringEnabled, tab.url);
      await background_filteringPause.clearHostnameTimeout(tab.url);
      await tabs.reloadTab(tab);
    }));
  },
  [ContextMenuItem.SiteFilteringOff]: async () => {
    const tabsToUpdate = await tabs.getActiveAndSimilarTabs();
    await Promise.all(tabsToUpdate.map(async tab => {
      await state.setFilteringStatus(false, state.urlInfo.isHttpsFilteringEnabled, tab.url);
      await background_filteringPause.clearHostnameTimeout(tab.url);
      await tabs.reloadTab(tab);
    }));
  },
  [ContextMenuItem.EnableProtection]: async (_, tab) => {
    if (!state.appState.isRunning && tab) {
      await state.getCurrentFilteringState(tab, true);
    } else if (!state.appState.isProtectionEnabled) {
      await state.setProtectionStatus(true);
    }
    const tabsToUpdate = await tabs.getActiveAndSimilarTabs();
    await Promise.all(tabsToUpdate.map(async tab => {
      await tabs.reloadTab(tab);
    }));
  },
  [ContextMenuItem.DisableProtection]: async () => {
    const tabsToUpdate = await tabs.getActiveAndSimilarTabs();
    await state.setProtectionStatus(false);
    await Promise.all(tabsToUpdate.map(async tab => {
      await tabs.reloadTab(tab);
    }));
  },
  [ContextMenuItem.OpenSettings]: async () => {
    await state.openSettings();
  },
  [ContextMenuItem.OpenLog]: async () => {
    await state.openFilteringLog();
  },
  [ContextMenuItem.PauseFiltering]: async () => {
    const tabsToUpdate = await tabs.getActiveAndSimilarTabs();
    await Promise.all(tabsToUpdate.map(async tab => {
      await background_filteringPause.handleFilteringPause(tab.url);
      await tabs.reloadTab(tab);
    }));
  }
};
ContextMenu.controlledUpdate = (() => {
  let hasPendingUpdate = false;
  let isUpdating = false;
  return async () => {
    if (isUpdating) {
      hasPendingUpdate = true;
      return;
    }
    isUpdating = true;
    try {
      await _ContextMenu.update();
    } finally {
      isUpdating = false;
      if (hasPendingUpdate) {
        hasPendingUpdate = false;
        _ContextMenu.controlledUpdate();
      }
    }
  };
})();
ContextMenu.addMenuItem = async (menuItemId, enabled = true) => {
  const menuItem = {
    id: menuItemId,
    contexts: ['all'],
    title: browser_polyfill_default().i18n.getMessage(menuItemId),
    enabled
  };
  await _ContextMenu.createMenu(menuItem);
};
/**
 * Creates a context menu separator unless the browser is Vivaldi, which does not support
 * separators in context menus triggered via the extension button.
 */
ContextMenu.addSeparator = async () => {
  const isVivaldi = await utils.isVivaldiBrowser();
  // Vivaldi browser does not support separators in context menus for browser actions, so we do not add them.
  if (isVivaldi) {
    return;
  }
  const menuItem = {
    id: nanoid(),
    contexts: ['all'],
    type: 'separator'
  };
  await _ContextMenu.createMenu(menuItem);
};
;// ./src/background/prefs.js


const ICONS_PATH = 'assets/images/icons';
const Prefs = {
  get ICONS() {
    return lazyGet(Prefs, 'ICON', () => ({
      ENABLED: {
        19: getUrl(`${ICONS_PATH}/green-19.png`),
        38: getUrl(`${ICONS_PATH}/green-38.png`),
        128: getUrl(`${ICONS_PATH}/green-128.png`)
      },
      DISABLED: {
        19: getUrl(`${ICONS_PATH}/grey-19.png`),
        38: getUrl(`${ICONS_PATH}/grey-38.png`)
      }
    }));
  },
  get platform() {
    return lazyGet(Prefs, 'platform', () => ({
      isWindowsOs() {
        return navigator.userAgent.toLowerCase().indexOf('win') >= 0;
      },
      isMacOs() {
        return navigator.platform.toUpperCase().indexOf('MAC') >= 0;
      }
    }));
  }
};
;// ./src/background/actions.ts




const setIcon = async details => {
  try {
    await browserApi.action.setIcon(details);
  } catch (e) {
    log.debug(getErrorMessage(e));
  }
};

/**
 * Sets icon enabled. In order to remove blinking, we set the icon twice:
 * 1. for general browser action
 * 2. for tab browser action if tabId is provided
 * @param {number} [tabId]
 * @returns {Promise<void>}
 */
const setIconEnabled = async tabId => {
  const details = {
    path: Prefs.ICONS.ENABLED
  };
  await setIcon(details);
  if (tabId) {
    details.tabId = tabId;
    await setIcon(details);
  }
};

/**
 * Sets browser cation icon disabled. In order to remove blinking, we set the icon twice:
 * 1. for general browser action
 * 2. for tab browser action if tabId is provided
 * @param {number} [tabId]
 * @returns {Promise<void>}
 */
const setIconDisabled = async tabId => {
  const details = {
    path: Prefs.ICONS.DISABLED
  };
  await setIcon(details);
  if (tabId) {
    details.tabId = tabId;
    await setIcon(details);
  }
};
const actions = {
  setIconEnabled,
  setIconDisabled
};
/* harmony default export */ const background_actions = (actions);
;// ./src/background/icon.js







/**
 * This class handles browser action icon updates
 */
class Icon {
  constructor() {
    /**
     * Updates icon according to the current app and tab state
     * @param tab
     * @returns {Promise<void>}
     */
    this.updateIcon = async tab => {
      if (!state.isAppWorking()) {
        await background_actions.setIconDisabled(tab.id);
        await ContextMenu.controlledUpdate();
        return;
      }
      const currentFilteringState = await state.getCurrentFilteringState(tab);
      await ContextMenu.controlledUpdate();
      const isFilteringEnabled = currentFilteringState ? currentFilteringState.isFilteringEnabled : true;
      if (isFilteringEnabled) {
        await background_actions.setIconEnabled(tab.id);
      } else {
        await background_actions.setIconDisabled(tab.id);
      }
    };
    // If updates of icon happen too often ignore them
    const ICON_THROTTLE_TIMEOUT_MS = 50;
    const throttledUpdater = throttle_default()(async tab => {
      if (tab) {
        await this.updateIcon(tab);
      }
      // There may be opened more than one window opened
      const activeTabs = await tabs.getActiveTabs();
      activeTabs.forEach(tab => {
        this.updateIcon(tab);
      });
    }, ICON_THROTTLE_TIMEOUT_MS);

    // Subscribe to events after which icon should update
    lib_notifier.addSpecifiedListener(lib_notifier.types.TAB_ACTIVATED, throttledUpdater);
    lib_notifier.addSpecifiedListener(lib_notifier.types.TAB_UPDATED, throttledUpdater);
    lib_notifier.addSpecifiedListener(lib_notifier.types.STATE_UPDATED, throttledUpdater);
  }
}
/* harmony default export */ const icon = (new Icon());
;// ./src/background/index.js














// add listener on the upper level
browser_polyfill_default().runtime.onMessage.addListener(messageHandler);
browser_polyfill_default().runtime.onConnect.addListener(longLivedMessageService.init);
const onInstalled = async runInfo => {
  if (runInfo.isUpdate) {
    await migrationService.migrate(runInfo.previousVersion);
  }
  if (runInfo.isFirstRun) {
    await consent.setConsentRequired(true);
  }
  const isConsentRequired = await consent.isConsentRequired();
  if (isConsentRequired && browserApi.utils.isFirefoxBrowser) {
    await tabs.openPostInstallPage();
  }
};
(async () => {
  try {
    await settings.init();
    await updateService.init(onInstalled);
    state.init();
    ContextMenu.init();
  } catch (error) {
    log.error(error);
  }
})();
})();

/******/ })()
;