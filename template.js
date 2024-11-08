// API declarations, alphabetical order
const createRegex = require('createRegex');
const encodeUriComponent = require('encodeUriComponent');
const eventData = require('getAllEventData')();
const getContainerVersion = require('getContainerVersion');
const getRequestHeader = require('getRequestHeader');
const getType = require('getType');
const JSON = require('JSON');
const logToConsole = require('logToConsole');
const makeNumber = require('makeNumber');
const makeString = require('makeString');
const Object = require('Object');
const sendHttpRequest = require('sendHttpRequest');
const setResponseHeader = require('setResponseHeader');
const setResponseStatus = require('setResponseStatus');
const sha256Sync = require('sha256Sync');
const testRegex = require('testRegex');

// Template constants
const ENDPOINT = 'https://' + data.instanceName + '.piwik.pro/ppms.php';
const HEADERS = {
  'content-type': 'application/x-www-form-urlencoded'
};
const LIBRARY_NAME = 'sgtm';
const LIBRARY_VERSION = '1.0.3';
const LOGGING_ENABLED = isLoggingEnabled();
const TRACE_ID = LOGGING_ENABLED ? getRequestHeader('trace-id') : undefined;

/**
 * Returns if logging is enabled based on the logType value and the container version.
 *
 * @returns {boolean}
 */
function isLoggingEnabled() {
  const containerVersion = getContainerVersion();
  const isDebug = !!(
      containerVersion &&
      (containerVersion.debugMode || containerVersion.previewMode)
  );

  if (!data.logType) {
    return isDebug;
  }

  if (data.logType === 'no') {
    return false;
  }

  if (data.logType === 'debug') {
    return isDebug;
  }

  return data.logType === 'always';
}

/**
 * Checks if Client ID is already a 16 character hexadecimal hash.
 * If it isn't, the hash is generated and returned.
 */
const getClientIdHash = () => {
  const clientId = eventData.client_id;
  if (!clientId) return;
  const clientIdRegex = createRegex('^[0-9a-fA-F]{16}$');
  return testRegex(clientIdRegex, clientId) ? clientId : sha256Sync(clientId, {outputEncoding: 'hex'}).substring(0,16);
};

/**
 * Returns an array of trimmed strings.
 *
 * @param {String} str - the string to be split and trimmed.
 */
const stringToArrayAndTrim = str => str.split(',').map(item => item.trim());

/**
 * Returns an object with top-level undefined/null keys removed.
 *
 * @param {Object} obj - the object to be cleaned.
 */
const cleanObject = (obj) => {
  const target = {};
  Object.keys(obj).forEach((k) => {
    if (obj[k] != null) target[k] = obj[k];
  });
  return target;
};

/**
 * Converts a GA4 ecommerce array into Piwik Pro format.
 *
 * @param {Array} itemArr - A valid GA4 items array.
 * @returns {Array} – An array of Piwik PRO product arrays.
 */
const convertEcommerce = itemArr => {
  if (getType(itemArr) !== 'array') return;
  return itemArr
      .filter(item => getType(item) === 'object')
      .map(item => {
        return [
          makeString(item.item_id),
          item.item_name,
          [item.item_category, item.item_category2, item.item_category3, item.item_category4, item.item_category5].filter(category => category),
          item.price,
          item.quantity,
          item.item_brand,
          item.item_variant,
          Object.keys(item).reduce((acc, cur) => {
            if (cur.slice(0,9) === 'dimension') acc[cur.slice(9)] = item[cur];
            return acc;
          }, {})
        ];
      });
};

// Build a map of all params defined in the UI
const uiParamMap = {
  idsite: data.websiteId,
  rec: 1,
  uia: data.anonymous === 'uia' ? 1 : eventData['x-pp-uia'] || 0,
  rmip: data.anonymous === 'rmip' ? 1 : eventData['x-pp-rmip'] || 0,
  action_name: data.action_name || eventData['x-pp-action_name'] || (data.eventType === 'pageview' || eventData.event_name === 'page_view' ? eventData.page_title : undefined),
  url: data.url || eventData.page_location,
  urlref: data.urlref || eventData.page_referrer,
  search: data.search || eventData['x-pp-search'],
  search_cats: JSON.stringify(data.search_cats ? stringToArrayAndTrim(data.search_cats) : eventData['x-pp-search_cats']),
  search_count: data.search_count ? makeNumber(data.search_count) : eventData['x-pp-search_count'],
  link: data.link || eventData['x-pp-link'],
  download: data.download || eventData['x-pp-download'],
  e_c: data.e_c || eventData['x-pp-e_c'],
  e_a: data.e_a || eventData['x-pp-e_a'],
  e_n: data.e_n || eventData['x-pp-e_n'],
  e_v: data.e_v || eventData['x-pp-e_v'],
  _id: data._id || getClientIdHash(),
  uid: data.uid || eventData.user_id,
  cip: data.cip || eventData.ip_override,
  e_t: data.e_t || eventData['x-pp-e_t'],
  ec_id: data.ec_id || eventData['x-pp-ec_id'] || eventData.transaction_id,
  revenue: data.revenue || eventData.value,
  ec_st: data.ec_st || eventData['x-pp-ec_st'],
  ec_sh: data.ec_sh || eventData['x-pp-ec_sh'],
  ec_tx: data.ec_tx || eventData['x-pp-ec_tx'],
  ec_dt: data.ec_dt || eventData['x-pp-ec_dt'],
  ec_products: JSON.stringify(convertEcommerce(data.ec_products)) || JSON.stringify(eventData['x-pp-ec_products']) || JSON.stringify(convertEcommerce(eventData.items))
};

// Set the common event data params
uiParamMap.ua = eventData.user_agent;
uiParamMap.lang = eventData.language;
uiParamMap.res = eventData.screen_resolution;

// Add Custom Dimensions to the map
(data.custom_dims || []).forEach(dim => {
  uiParamMap['dimension' + dim.index] = dim.value;
});

// Add cvar to the map
uiParamMap.cvar = JSON.stringify(
    data.cvars_event && data.cvars_event.length ?
        data.cvars_event.reduce((acc, cur) => {
          acc[cur.id] = [cur.name, cur.value];
          return acc;
        }, {}) :
        eventData['x-pp-cvar']
);

// Add _cvar to the map
uiParamMap._cvar = JSON.stringify(
    data.cvars_session && data.cvars_session.length ?
        data.cvars_session.reduce((acc, cur) => {
          acc[cur.id] = [cur.name, cur.value];
          return acc;
        }, {}) :
        eventData['x-pp-_cvar']
);

// Overwrite any keys in the map with those set in Additional Parameters
(data.additionalParameters || []).forEach(param => {
  uiParamMap[param.key] = param.value;
});

let requestBody = {};

// Get all Piwik-specific parameters from eventData
Object.keys(eventData)
    .filter(key => key.slice(0,5) === 'x-pp-')
    .forEach(key => requestBody[key.replace('x-pp-', '')] = eventData[key]);

// Overwrite the base request body with values from uiParamMap
Object.keys(uiParamMap)
    .forEach(key => requestBody[key] = uiParamMap[key]);

// Add the library name and version
requestBody.ts_n = LIBRARY_NAME;
requestBody.ts_v = LIBRARY_VERSION;

requestBody = cleanObject(requestBody);

if (LOGGING_ENABLED) {
  logToConsole(
      JSON.stringify({
        Name: 'PiwikPro',
        Type: 'Request',
        TraceId: TRACE_ID,
        EventName: requestBody.action_name || 'page_view',
        RequestMethod: 'POST',
        RequestUrl: ENDPOINT,
        RequestHeaders: HEADERS,
        RequestBody: requestBody
      })
  );
}

// Build the query string
const postBody = Object.keys(requestBody)
    .reduce((acc, cur) => {
      acc += cur + '=' + encodeUriComponent(requestBody[cur]) + '&';
      return acc;
    }, '')
    .slice(0, -1);

sendHttpRequest(ENDPOINT, {
  headers: HEADERS,
  method: 'POST',
  timeout: 1000
}, postBody).then(response => {
  if (LOGGING_ENABLED) {
    logToConsole(
        JSON.stringify({
          Name: 'PiwikPro',
          Type: 'Response',
          TraceId: TRACE_ID,
          EventName: requestBody.action_name || 'page_view',
          ResponseStatusCode: response.statusCode,
          ResponseHeaders: response.headers,
          ResponseBody: response.body,
        })
    );
  }

  setResponseStatus(response.statusCode);
  setResponseHeader('cache-control', response.headers['cache-control']);
  if (response.statusCode < 400) {
    data.gtmOnSuccess();
  } else {
    data.gtmOnFailure();
  }
});
