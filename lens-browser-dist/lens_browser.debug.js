(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
window.LensBrowser = require("./src/lens_browser");

},{"./src/lens_browser":25}],2:[function(require,module,exports){
"use strict";

var Application = require("./src/application");
Application.View = require("./src/view");
Application.Controller = require("./src/controller");

if (typeof window !== 'undefined') {
  Application.Router = require("./src/router");
  Application.DefaultRouter = require("./src/default_router");
  Application.ElementRenderer = require("./src/renderers/element_renderer");
  Application.$$ = Application.ElementRenderer.$$;
}

module.exports = Application;

},{"./src/application":3,"./src/controller":4,"./src/default_router":5,"./src/renderers/element_renderer":6,"./src/router":7,"./src/view":8}],3:[function(require,module,exports){
"use strict";

var View = require("./view");
var util = require("substance-util");
var _ = require("underscore");

// Substance.Application
// ==========================================================================
//
// Application abstraction suggesting strict MVC

// TODO: does this really need to be a View?
// It would be better to have controller to create view which
// is used has top level view.
var Application = function(config) {
  View.call(this);

  this.config = config || {};
  this.__controller__ = null;
};

Application.Prototype = function() {

  this.setRouter = function(router) {
    this.router = router;
  };

  // Start Application
  // ----------
  //

  this.start = function(options) {
    // NOTE: we have to import jquery this way as this class is used also used in a node context
    var $ = window.$;

    options = options || {};
    // First setup the top level view
    if (options.el) {
      this.el = options.el;
      this.$el = $(this.el);
    } else {
      // Defaults to body element
      this.$el = $('body');
      this.el = this.$el[0];
    }

    if (this.initialize) this.initialize();
    if (this.render) this.render();

    // Now the normal app lifecycle can begin
    // Because app state changes require the main view to be present
    // Triggers an initial app state change according to url hash fragment
    if (this.router) this.router.start();
  };

  // Switches the application state
  // --------
  // appState: a list of state objects

  var DEFAULT_SWITCH_OPTIONS = {
    updateRoute: true,
    replace: false
  };

  this.switchState = function(appState, options, cb) {
    // Just to be save let's make a deep copy of the new state provided,
    // because it could share references with oldState
    appState = JSON.parse(JSON.stringify(appState));

    var self = this;
    options = _.extend({}, DEFAULT_SWITCH_OPTIONS, options || {});

    // keep the old state for afterTransition-handler
    var oldAppState = this.getState();

    this.controller.__switchState__(appState, options, function(error) {
      if (error) {
        if (cb) {
          cb(error);
        } else {
          console.error(error.message);
          util.printStackTrace(error);
        }
        return;
      }
      if (options["updateRoute"]) {
        self.updateRoute(options);
      }

      if (self.afterTransition) {
        try {
          self.afterTransition(appState, oldAppState);
        } catch (err) {
          if (cb) {
            cb(err);
          } else {
            console.error(err.message);
            util.printStackTrace(err);
          }
          return;
        }
      }

      if (cb) cb(null);
    });
  };

  this.stateFromFragment = function(fragment) {
    function _createState(stateNames) {
      var state = [];
      for (var i = 0; i < stateNames.length; i++) {
        state.push({id: stateNames[i]});
      }
      return state;
    }

    var state;
    var params = fragment.split(";");

    var i, pair;
    var values = [];
    for (i=0; i<params.length; i++) {
      pair = params[i].split("=");
      var key = pair[0];
      var val = pair[1];
      if (!key || val === undefined) {
        continue;
      }
      if (key === "state") {
        var stateNames = val.split(".");
        state = _createState(stateNames);
      } else {
        pair = key.split(".");
        values.push({state: pair[0], key: pair[1], value: val});
      }
    }

    for (i=0; i<values.length; i++) {
      var item = values[i];
      var data = state[item.state];
      var valAsString = item.value;
      valAsString = window.decodeURIComponent(valAsString);
      var val = JSON.parse(valAsString);
      data[item.key] = val;
    }

    return state;
  };

  this.getState = function() {
    if (!this.controller.state) return null;

    var appState = [];
    var controller = this.controller;
    while(controller) {
      appState.push(controller.state);
      controller = controller.childController;
    }
    return appState;
  };

  this.updateRoute = function(options) {
    if (!this.router && !this.config["headless"]) {
      throw new Error("Application.updateRoute(): application has no router.");
    }

    options = options || {};

    var appState = this.getState();
    var stateIds = [];
    var stateParams = [];
    for (var i = 0; i < appState.length; i++) {
      var s = appState[i];
      if (!s) continue;
      var stateId = s.id || 'default';
      stateIds.push(stateId);
      for (var key in s) {
        if (key === "id" || key === "__id__" || key === "options") {
          continue;
        }
        // Note: currently only String variables are allowed as state variables
        var valAsString = JSON.stringify(s[key]);
        var val = window.encodeURIComponent(valAsString);
        stateParams.push(i+"."+key+"="+val);
      }
    }
    var stateString = "state="+stateIds.join(".") + ";" + stateParams.join(";");
    this.router.navigate(stateString, {trigger: false, replace: options.replace});
  };

  // Called by a sub controller when a sub-state has been changed
  this.stateChanged = function(controller, oldState, options) {
    if (options["updateRoute"]) {
      this.updateRoute(options);
    }
  };

  this.sendError = function(err) {
    throw err;
  };
};

Application.Prototype.prototype = View.prototype;
Application.prototype = new Application.Prototype();

// TODO: this is dangerous as it obscures the underlying mechanism.
// Try to switch to a more explicit approach.
Object.defineProperty(Application.prototype, "controller", {
  set: function(controller) {
    controller.setChangeListener(this);
    this.__controller__ = controller;
  },
  get: function() {
    return this.__controller__;
  }
});

module.exports = Application;

},{"./view":8,"substance-util":11,"underscore":19}],4:[function(require,module,exports){
"use strict";

var util = require("substance-util");
var _ = require("underscore");

// Substance.Application.Controller
// ==========================================================================
//
// Application Controller abstraction suggesting strict MVC

var Controller = function() {

  // an object that has a method 'stateChanged()'
  this.changeListener = null;

  // the state is represented by a unique name
  this.state = {id: "uninitialized"};

  // Each controller can have a single (active) child controller
  this.__childController__ = null;

  this.__parentController__ = null;
};

Controller.Prototype = function() {

  // A built-in transition function for switching to an initial state
  // --------
  //

  this.intitialize = function(/*state, cb*/) {};

  // A built-in transition function which is the opposite to `initialize`
  // ----
  this.dispose = function() {
    if (this.__childController__) this.__childController__.dispose();
    this.__childController__ = null;
    this.state = {id: "uninitialized"};
  };

  // State transition
  // ----
  // A typical transition implementation consists of 3 blocks:
  //
  // 1. Reflexive transitions (idem-potent checks):
  //    You have to check if a transition is actually necessary.
  //    If not call `cb(null, skipTransition=true)`
  //
  // 2. Disposal
  //    Clean up anything left from the old state
  //
  // 3. New state
  //    Create anything necessary for the new state
  //
  // Note: to provide additional run-time information you can access
  //       the options with `newState.options`
  //       However, when the state is loaded e.g. from the URL
  //       this information is not available.

  this.transition = function(newState, cb) {
    cb(null);
  };

  this.switchState = function(state, options, cb) {
    // Just to be save let's make a deep copy of the new state provided,
    // because it could share references with oldState
    state = JSON.parse(JSON.stringify(state));

    if (!cb && _.isFunction(options)) cb = options;
    var self = this;

    if (arguments.length === 1 && _.isFunction(options)) {
      cb = options;
      options = {};
    }

    options = options || {updateRoute: true, replace: false};

    cb = cb || function(err) {
      if (err) {
        console.error("Error during switch state", state, options);
        util.printStackTrace(err);
        throw new Error(err);
      }
    };

    var oldState = this.state;
    this.__switchState__(state, options, function(error) {
      if (error) return cb(error);
      if (self.changeListener) self.changeListener.stateChanged(this, oldState, options);
      cb(null);
    });
  };

  this.__switchState__ = function(appState, options, cb) {
    // console.log("Controller.switchState", JSON.stringify(state));
    var self = this;

    cb = cb || function(err) {
      if (err) throw new Error(err);
    };

    if (!_.isArray(appState)) {
      appState = [appState];
    }

    var _state = appState.shift();

    // Note: adding the options here to allow to provide custom dynamic data.
    //       However, you should use that rarely, as dynamic state information
    //       is not serialized. E.g., when loading the state from URL this information
    //       will not be available.
    _state.options = options || {};

    var _skipped;

    var _afterTransition = function() {
      if (!_skipped) {
        var oldState = self.state;
        self.state = _state;
        self.afterTransition(oldState);
        // clear the options as they should only be valid during transition
        self.state.options = {};
      }
      cb(null);
    };

    var _transition = function() {
      // console.log("Transition to", _state);
      try {
        self.transition(_state, function(error, options) {
          if (error) return cb(error);

          // legacy: using an object {skip: true} now
          if (_.isBoolean(options)) {
            _skipped = options;
          } else {
            if (options) {
              _skipped = options.skip;
            }
          }

          // The transition has been done in this level, i.e., child controllers
          // might have been created.
          // If a child controller exists we recurse into the next level.
          // After that the controller gets triggered about the finished transition.

          if (self.childController) {
            if (appState.length > 0) {
              self.childController.__switchState__(appState, options, function(error) {
                if (error) return cb(error);
                _afterTransition();
              });
            }
            else if (self.childController.DEFAULT_STATE) {
              self.childController.__switchState__(self.childController.DEFAULT_STATE, options, function(error){
                if (error) return cb(error);
                _afterTransition();
              });
            }
            else {
              throw new Error("Unsufficient state data provided! Child controller needs a transition!");
            }

          } else {
            _afterTransition();
          }
        });
      } catch (err) {
        cb(err);
      }
    };

    // If no transitions are given we still can use dispose/initialize
    // to reach the new state
    if (!this.state) {
      // console.log("Initializing...", _state);
      this.initialize(_state, function(error) {
        if (error) return cb(error);
        self.state = {id: "initialized"};
        _transition();
      });
    } else {
      _transition();
    }
  };

  this.afterTransition = function() {};

  this.setChildController = function(childController, options) {
    options = options || {};
    if (this.__childController__ && this.__childController__.state && !options.nowarn) {
      console.error("The child controller has not been disposed. Call 'disposeChildController()' first.");
      // this.__childController__.dispose();
    }
    if (!childController) {
      return;
    }
    if (!this.changeListener) {
      // We need to establish a consistent connection between (Sub-)Controllers and the Application
      // instance to be able to notify the app about changes in the sub state
      // For now, I decided to propagate the application when sub-controllers are attached
      // to parent controllers.
      // This makes sense w.r.t the current mechanism of state transitions which
      // works from top to down. I.e., a parent controller is either the top-level controller
      // or itself a child of an already attached controller.
      // A global/singleton Application instance would be possible, however I reject introducing
      // such an evil thing. It breaks modularity and makes testing harder.
      // Alternatively one could require this to be given when constructing Controllers,
      // however, this would require to change all constructors.
      console.error("This controller does not have a changeListener attached, so the child controller will not trigger corresponding application state changes.");
    } else {
      childController.changeListener = this.changeListener;
    }

    childController.__parentController__ = this;
    this.__childController__ = childController;
  };

  this.disposeChildController = function() {
    if (this.__childController__) {
      this.__childController__.dispose();
      this.__childController__ = null;
    }
  };

  // changelistener = parentController
  this.setChangeListener = function(changeListener) {
    this.changeListener = changeListener;
  };

  this.sendError = function(err) {
    if (this.__parentController__) this.__parentController__.sendError(err);
  };

};

Controller.Prototype.prototype = util.Events;
Controller.prototype = new Controller.Prototype();

Controller.State = function(id) {
  if (_.isString(id)) {
    this.__id__ = id;
  } else {
    var obj = arguments[0];
    this.__id__ = obj["id"];
    _.each(obj, function(val, key) {
      if (key === "id") return;
      this[key] = val;
    }, this);
  }
};

Object.defineProperty(Controller.State.prototype, "id", {
  set: function() {
    throw new Error("Property 'id' is immutable");
  },
  get: function() {
    return this.__id__;
  }
});

Object.defineProperty(Controller.prototype, "childController", {
  set: function(childController) {
    this.setChildController(childController);
  },
  get: function() {
    return this.__childController__;
  }
});

module.exports = Controller;

},{"substance-util":11,"underscore":19}],5:[function(require,module,exports){
"use strict";

var _ = require("underscore");
var Router = require("./router");

var DefaultRouter = function(app) {
  Router.call(this);

  this.app = app;
  _.each(DefaultRouter.routes, function(route) {
    if (!this[route.command]) {
      console.error("Unknown route handler: ", route.command);
    } else {
      this.route(route.route, route.name, _.bind(this[route.command], this));
    }
  }, this);

  this.route(/^state=.*$/, "state", _.bind(this.openState, this));
};

DefaultRouter.Prototype = function() {

  this.start = function() {
    Router.history.start();
  };

  var DEFAULT_OPTIONS = {
    updateRoute: false,
    replace: false
  };

  this.openState = function() {
    var fragment = Router.history.getFragment();
    var state = this.app.stateFromFragment(fragment);
    console.log('state change triggerd by router', JSON.stringify(state));
    this.app.switchState(state, DEFAULT_OPTIONS);
  };

  this.navigate = function(route, options) {
    Router.history.navigate(route, options);
  };
};

DefaultRouter.Prototype.prototype = Router.prototype;
DefaultRouter.prototype = new DefaultRouter.Prototype();

module.exports = DefaultRouter;

},{"./router":7,"underscore":19}],6:[function(require,module,exports){
"use strict";

var util = require("substance-util");
var SRegExp = require("substance-regexp");

// Substance.Application.ElementRenderer
// ==========================================================================
//
// This is just a simple helper that allows us to create DOM elements
// in a data-driven way

var ElementRenderer = function(attributes) {
  this.attributes = attributes;

  // Pull off preserved properties from attributes
  // --------

  this.tagName = attributes.tag;
  this.children = attributes.children || [];
  this.text = attributes.text || "";
  this.html = attributes.html;

  delete attributes.children;
  delete attributes.text;
  delete attributes.html;
  delete attributes.tag;

  return this.render();
};


ElementRenderer.Prototype = function() {

  // Do the actual rendering
  // --------

  this.render = function() {
    var el = window.document.createElement(this.tagName);
    if (this.html) {
      el.innerHTML = this.html;
    } else {
      el.textContent = this.text;
    }

    // Set attributes based on element spec
    for(var attrName in this.attributes) {
      var val = this.attributes[attrName];
      el.setAttribute(attrName, val);
    }

    // Append childs
    for (var i=0; i<this.children.length; i++) {
      var child = this.children[i];
      el.appendChild(child);
    }

    // Remember element
    // Probably we should ditch this
    this.el = el;
    return el;
  };
};


// Provides a shortcut syntax interface to ElementRenderer
// --------

var $$ = function(descriptor, options) {
  options = options  || {};

  // Extract tagName, defaults to 'div'
  var tagName = /^([a-zA-Z0-9]*)/.exec(descriptor);
  options.tag = tagName && tagName[1] ? tagName[1] : 'div';

  // Any occurence of #some_chars
  var id = /#([a-zA-Z0-9_]*)/.exec(descriptor);
  if (id && id[1]) options.id = id[1];

  // Any occurence of .some-chars
  // if (!options.class) {
  //   var re = new RegExp(/\.([a-zA-Z0-9_-]*)/g);
  //   var classes = [];
  //   var classMatch;
  //   while (classMatch = re.exec(descriptor)) {
  //     classes.push(classMatch[1]);
  //   }
  //   options.class = classes.join(' ');
  // }

  // Any occurence of .some-chars
  var matchClasses = new SRegExp(/\.([a-zA-Z0-9_-]*)/g);
  // options.class = options.class ? options.class+' ' : '';
  if (!options.class) {
    options.class = matchClasses.match(descriptor).map(function(m) {
      return m.match[1];
    }).join(' ');
  }

  return new ElementRenderer(options);
};



ElementRenderer.$$ = $$;

// Setup prototype chain
ElementRenderer.Prototype.prototype = util.Events;
ElementRenderer.prototype = new ElementRenderer.Prototype();

module.exports = ElementRenderer;
},{"substance-regexp":9,"substance-util":11}],7:[function(require,module,exports){
"use strict";

var util = require("substance-util");
var _ = require("underscore");

// NOTE: a bit nasty but we have to import jquery this way as this class is used also used in a node context
// TODO: try to avoid that this gets required when in node
var $;
if (typeof window !== 'undefined') {
  $ = window.$;
} else {
  console.error("FIXME: require router.js only when you are in a window context.");
  $ = null;
}

// Application.Router
// ---------------
//
// Implementation borrowed from Backbone.js

// Routers map faux-URLs to actions, and fire events when routes are
// matched. Creating a new one sets its `routes` hash, if not set statically.
var Router = function(options) {
  options = options || {};
  if (options.routes) this.routes = options.routes;
  this._bindRoutes();
  this.initialize.apply(this, arguments);
};

// Cached regular expressions for matching named param parts and splatted
// parts of route strings.
var optionalParam = /\((.*?)\)/g;
var namedParam    = /(\(\?)?:\w+/g;
var splatParam    = /\*\w+/g;
var escapeRegExp  = /[\-{}\[\]+?.,\\\^$|#\s]/g;

// Set up all inheritable **Application.Router** properties and methods.
_.extend(Router.prototype, util.Events, {

  // Initialize is an empty function by default. Override it with your own
  // initialization logic.
  initialize: function(){},

  // Manually bind a single named route to a callback. For example:
  //
  //     this.route('search/:query/p:num', 'search', function(query, num) {
  //       ...
  //     });
  //
  route: function(route, name, callback) {
    if (!_.isRegExp(route)) route = this._routeToRegExp(route);
    if (_.isFunction(name)) {
      callback = name;
      name = '';
    }
    if (!callback) callback = this[name];
    var router = this;
    Router.history.route(route, function(fragment) {
      var args = router._extractParameters(route, fragment);
      if (callback) callback.apply(router, args);
      router.trigger.apply(router, ['route:' + name].concat(args));
      router.trigger('route', name, args);
      Router.history.trigger('route', router, name, args);
    });
    return this;
  },

  // Simple proxy to `Router.history` to save a fragment into the history.
  navigate: function(fragment, options) {
    Router.history.navigate(fragment, options);
    return this;
  },

  // Bind all defined routes to `Router.history`. We have to reverse the
  // order of the routes here to support behavior where the most general
  // routes can be defined at the bottom of the route map.
  _bindRoutes: function() {
    if (!this.routes) return;
    this.routes = _.result(this, 'routes');
    var route, routes = _.keys(this.routes);
    while ((route = routes.pop()) !== null) {
      this.route(route, this.routes[route]);
    }
  },

  // Convert a route string into a regular expression, suitable for matching
  // against the current location hash.
  _routeToRegExp: function(route) {
    route = route.replace(escapeRegExp, '\\$&')
                 .replace(optionalParam, '(?:$1)?')
                 .replace(namedParam, function(match, optional){
                   return optional ? match : '([^\/]+)';
                 })
                 .replace(splatParam, '(.*?)');
    return new RegExp('^' + route + '$');
  },

  // Given a route, and a URL fragment that it matches, return the array of
  // extracted decoded parameters. Empty or unmatched parameters will be
  // treated as `null` to normalize cross-browser behavior.
  _extractParameters: function(route, fragment) {
    var params = route.exec(fragment).slice(1);
    return _.map(params, function(param) {
      return param ? decodeURIComponent(param) : null;
    });
  }
});




// Router.History
// ----------------

// Handles cross-browser history management, based on either
// [pushState](http://diveintohtml5.info/history.html) and real URLs, or
// [onhashchange](https://developer.mozilla.org/en-US/docs/DOM/window.onhashchange)
// and URL fragments. If the browser supports neither (old IE, natch),
// falls back to polling.
var History = Router.History = function() {
  this.handlers = [];
  _.bindAll(this, 'checkUrl');

  // Ensure that `History` can be used outside of the browser.
  if (typeof window !== 'undefined') {
    this.location = window.location;
    this.history = window.history;
  }
};

// Cached regex for stripping a leading hash/slash and trailing space.
var routeStripper = /^[#\/]|\s+$/g;

// Cached regex for stripping leading and trailing slashes.
var rootStripper = /^\/+|\/+$/g;

// Cached regex for detecting MSIE.
var isExplorer = /msie [\w.]+/;

// Cached regex for removing a trailing slash.
var trailingSlash = /\/$/;

// Has the history handling already been started?
History.started = false;

// Set up all inheritable **Router.History** properties and methods.
_.extend(History.prototype, util.Events, {

  // The default interval to poll for hash changes, if necessary, is
  // twenty times a second.
  interval: 50,

  // Gets the true hash value. Cannot use location.hash directly due to bug
  // in Firefox where location.hash will always be decoded.
  getHash: function(_window) {
    var match = (_window || window).location.href.match(/#(.*)$/);
    return match ? match[1] : '';
  },

  // Get the cross-browser normalized URL fragment, either from the URL,
  // the hash, or the override.
  getFragment: function(fragment, forcePushState) {
    if (fragment === null || fragment === undefined) {
      if (this._hasPushState || !this._wantsHashChange || forcePushState) {
        fragment = this.location.pathname;
        var root = this.root.replace(trailingSlash, '');
        if (!fragment.indexOf(root)) fragment = fragment.substr(root.length);
      } else {
        fragment = this.getHash();
      }
    }
    return fragment.replace(routeStripper, '');
  },

  // Start the hash change handling, returning `true` if the current URL matches
  // an existing route, and `false` otherwise.
  start: function(options) {
    if (History.started) throw new Error("Router.history has already been started");
    History.started = true;

    // Figure out the initial configuration. Do we need an iframe?
    // Is pushState desired ... is it available?
    this.options          = _.extend({}, {root: '/'}, this.options, options);
    this.root             = this.options.root;
    this._wantsHashChange = this.options.hashChange !== false;
    this._wantsPushState  = !!this.options.pushState;
    this._hasPushState    = !!(this.options.pushState && this.history && this.history.pushState);
    var fragment          = this.getFragment();
    var docMode           = window.document.documentMode;
    var oldIE             = (isExplorer.exec(window.navigator.userAgent.toLowerCase()) && (!docMode || docMode <= 7));

    // Normalize root to always include a leading and trailing slash.
    this.root = ('/' + this.root + '/').replace(rootStripper, '/');

    if (oldIE && this._wantsHashChange) {
      this.iframe = $('<iframe src="javascript:0" tabindex="-1" />').hide().appendTo('body')[0].contentWindow;
      this.navigate(fragment);
    }

    // Depending on whether we're using pushState or hashes, and whether
    // 'onhashchange' is supported, determine how we check the URL state.
    if (this._hasPushState) {
      $(window).on('popstate', this.checkUrl);
    } else if (this._wantsHashChange && ('onhashchange' in window) && !oldIE) {
      $(window).on('hashchange', this.checkUrl);
    } else if (this._wantsHashChange) {
      this._checkUrlInterval = setInterval(this.checkUrl, this.interval);
    }

    // Determine if we need to change the base url, for a pushState link
    // opened by a non-pushState browser.
    this.fragment = fragment;
    var loc = this.location;
    var atRoot = loc.pathname.replace(/[^\/]$/, '$&/') === this.root;

    // If we've started off with a route from a `pushState`-enabled browser,
    // but we're currently in a browser that doesn't support it...
    if (this._wantsHashChange && this._wantsPushState && !this._hasPushState && !atRoot) {
      this.fragment = this.getFragment(null, true);
      this.location.replace(this.root + this.location.search + '#' + this.fragment);
      // Return immediately as browser will do redirect to new url
      return true;

    // Or if we've started out with a hash-based route, but we're currently
    // in a browser where it could be `pushState`-based instead...
    } else if (this._wantsPushState && this._hasPushState && atRoot && loc.hash) {
      this.fragment = this.getHash().replace(routeStripper, '');
      this.history.replaceState({}, window.document.title, this.root + this.fragment + loc.search);
    }

    if (!this.options.silent) return this.loadUrl();
  },

  // Disable Router.history, perhaps temporarily. Not useful in a real app,
  // but possibly useful for unit testing Routers.
  stop: function() {
    $(window).off('popstate', this.checkUrl).off('hashchange', this.checkUrl);
    clearInterval(this._checkUrlInterval);
    History.started = false;
  },

  // Add a route to be tested when the fragment changes. Routes added later
  // may override previous routes.
  route: function(route, callback) {
    this.handlers.unshift({route: route, callback: callback});
  },

  // Checks the current URL to see if it has changed, and if it has,
  // calls `loadUrl`, normalizing across the hidden iframe.
  checkUrl: function() {
    var current = this.getFragment();
    if (current === this.fragment && this.iframe) {
      current = this.getFragment(this.getHash(this.iframe));
    }
    if (current === this.fragment) return false;
    if (this.iframe) this.navigate(current);
    if (!this.loadUrl()) this.loadUrl(this.getHash());
  },

  // Attempt to load the current URL fragment. If a route succeeds with a
  // match, returns `true`. If no defined routes matches the fragment,
  // returns `false`.
  loadUrl: function(fragmentOverride) {
    var fragment = this.fragment = this.getFragment(fragmentOverride);
    var matched = _.any(this.handlers, function(handler) {
      if (handler.route.test(fragment)) {
        handler.callback(fragment);
        return true;
      }
    });
    return matched;
  },

  // Save a fragment into the hash history, or replace the URL state if the
  // 'replace' option is passed. You are responsible for properly URL-encoding
  // the fragment in advance.
  //
  // The options object can contain `trigger: true` if you wish to have the
  // route callback be fired (not usually desirable), or `replace: true`, if
  // you wish to modify the current URL without adding an entry to the history.
  navigate: function(fragment, options) {
    if (!History.started) return false;
    if (!options || options === true) options = {trigger: options};
    fragment = this.getFragment(fragment || '');
    if (this.fragment === fragment) return;
    this.fragment = fragment;
    var url = this.root + fragment;

    // If pushState is available, we use it to set the fragment as a real URL.
    if (this._hasPushState) {
      this.history[options.replace ? 'replaceState' : 'pushState']({}, window.document.title, url);

    // If hash changes haven't been explicitly disabled, update the hash
    // fragment to store history.
    } else if (this._wantsHashChange) {
      this._updateHash(this.location, fragment, options.replace);
      if (this.iframe && (fragment !== this.getFragment(this.getHash(this.iframe)))) {
        // Opening and closing the iframe tricks IE7 and earlier to push a
        // history entry on hash-tag change.  When replace is true, we don't
        // want this.
        if(!options.replace) this.iframe.document.open().close();
        this._updateHash(this.iframe.location, fragment, options.replace);
      }

    // If you've told us that you explicitly don't want fallback hashchange-
    // based history, then `navigate` becomes a page refresh.
    } else {
      return this.location.assign(url);
    }
    if (options.trigger) this.loadUrl(fragment);
  },

  // Update the hash location, either replacing the current entry, or adding
  // a new one to the browser history.
  _updateHash: function(location, fragment, replace) {
    if (replace) {
      var href = location.href.replace(/(javascript:|#).*$/, '');
      location.replace(href + '#' + fragment);
    } else {
      // Some browsers require that `hash` contains a leading #.
      location.hash = '#' + fragment;
    }
  }
});

Router.history = new History();


module.exports = Router;
},{"substance-util":11,"underscore":19}],8:[function(require,module,exports){
"use strict";

var util = require("substance-util");

// Substance.View
// ==========================================================================
//
// Application View abstraction, inspired by Backbone.js

var View = function() {
  // Either use the provided element or make up a new element
  this.$el = window.$('<div/>');
  this.el = this.$el[0];

  this.dispatchDOMEvents();
};


View.Prototype = function() {

  // Default dispose function
  // --------
  //

  this.dispose = function() {
    this.stopListening();
  };

  // Shorthand for selecting elements within the view
  // ----------
  //

  this.$ = function(selector) {
    return this.$el.find(selector);
  };

  // Dispatching DOM events (like clicks)
  // ----------
  //

  this.dispatchDOMEvents = function() {

    var that = this;

    // showReport(foo) => ["showReport(foo)", "showReport", "foo"]
    // showReport(12) => ["showReport(12)", "showReport", "12"]
    function extractFunctionCall(str) {
      var match = /(\w+)\((.*)\)/.exec(str);
      if (!match) throw new Error("Invalid click handler '"+str+"'");

      return {
        "method": match[1],
        "args": match[2].split(',')
      };
    }

    this.$el.delegate('[sbs-click]', 'click', function(e) {

      // Matches things like this
      // showReport(foo) => ["showReport(foo)", "showReport", "foo"]
      // showReport(12) => ["showReport(12)", "showReport", "12"]
      var fnCall = extractFunctionCall(window.$(e.currentTarget).attr('sbs-click'));

      // Event bubbles up if there is no handler
      var method = that[fnCall.method];
      if (method) {
        method.apply(that, fnCall.args);
        return false;
      }
    });
  };

  this.updateTitle = function(newTitle) {
    window.document.title = newTitle;
    window.history.replaceState({}, window.document.title, window.location.href);
  };

};


View.Prototype.prototype = util.Events;
View.prototype = new View.Prototype();

module.exports = View;

},{"substance-util":11}],9:[function(require,module,exports){
"use strict";

module.exports = require("./src/regexp");

},{"./src/regexp":10}],10:[function(require,module,exports){
"use strict";

// Substanc.RegExp.Match
// ================
//
// Regular expressions in Javascript they way they should be.

var Match = function(match) {
  this.index = match.index;
  this.match = [];

  for (var i=0; i < match.length; i++) {
    this.match.push(match[i]);
  }
};

Match.Prototype = function() {

  // Returns the capture groups
  // --------
  //

  this.captures = function() {
    return this.match.slice(1);
  };

  // Serialize to string
  // --------
  //

  this.toString = function() {
    return this.match[0];
  };
};

Match.prototype = new Match.Prototype();

// Substance.RegExp
// ================
//

var RegExp = function(exp) {
  this.exp = exp;
};

RegExp.Prototype = function() {

  this.match = function(str) {
    if (str === undefined) throw new Error('No string given');
    
    if (!this.exp.global) {
      return this.exp.exec(str);
    } else {
      var matches = [];
      var match;
      // Reset the state of the expression
      this.exp.compile(this.exp);

      // Execute until last match has been found

      while ((match = this.exp.exec(str)) !== null) {
        matches.push(new Match(match));
      }
      return matches;
    }
  };
};

RegExp.prototype = new RegExp.Prototype();

RegExp.Match = Match;


// Export
// ========

module.exports = RegExp;

},{}],11:[function(require,module,exports){
"use strict";

var util = require("./src/util");

util.async = require("./src/async");
util.errors = require("./src/errors");
util.html = require("./src/html");
util.dom = require("./src/dom");
util.RegExp = require("./src/regexp");
util.Fragmenter = require("./src/fragmenter");

module.exports = util;

},{"./src/async":12,"./src/dom":13,"./src/errors":14,"./src/fragmenter":15,"./src/html":16,"./src/regexp":17,"./src/util":18}],12:[function(require,module,exports){
"use strict";

var _ = require("underscore");
var util = require("./util.js");

// Helpers for Asynchronous Control Flow
// --------

var async = {};

function callAsynchronousChain(options, cb) {
  var _finally = options["finally"] || function(err, data) { cb(err, data); };
  _finally = _.once(_finally);
  var data = options.data || {};
  var functions = options.functions;

  if (!_.isFunction(cb)) {
    return cb("Illegal arguments: a callback function must be provided");
  }

  var index = 0;
  var stopOnError = (options.stopOnError===undefined) ? true : options.stopOnError;
  var errors = [];

  function process(data) {
    var func = functions[index];

    // stop if no function is left
    if (!func) {
      if (errors.length > 0) {
        return _finally(new Error("Multiple errors occurred.", data));
      } else {
        return _finally(null, data);
      }
    }

    // A function that is used as call back for each function
    // which does the progression in the chain via recursion.
    // On errors the given callback will be called and recursion is stopped.
    var recursiveCallback = _.once(function(err, data) {
      // stop on error
      if (err) {
        if (stopOnError) {
          return _finally(err, null);
        } else {
          errors.push(err);
        }
      }

      index += 1;
      process(data);
    });

    // catch exceptions and propagat
    try {
      if (func.length === 0) {
        func();
        recursiveCallback(null, data);
      }
      else if (func.length === 1) {
        func(recursiveCallback);
      }
      else {
        func(data, recursiveCallback);
      }
    } catch (err) {
      console.log("util.async caught error:", err);
      util.printStackTrace(err);
      _finally(err);
    }
  }

  // start processing
  process(data);
}

// Calls a given list of asynchronous functions sequentially
// -------------------
// options:
//    functions:  an array of functions of the form f(data,cb)
//    data:       data provided to the first function; optional
//    finally:    a function that will always be called at the end, also on errors; optional

async.sequential = function(options, cb) {
  // allow to call this with an array of functions instead of options
  if(_.isArray(options)) {
    options = { functions: options };
  }
  callAsynchronousChain(options, cb);
};

function asynchronousIterator(options) {
  return function(data, cb) {
    // retrieve items via selector if a selector function is given
    var items = options.selector ? options.selector(data) : options.items;
    var _finally = options["finally"] || function(err, data) { cb(err, data); };
    _finally = _.once(_finally);

    // don't do nothing if no items are given
    if (!items) {
      return _finally(null, data);
    }

    var isArray = _.isArray(items);

    if (options.before) {
      options.before(data);
    }

    var funcs = [];
    var iterator = options.iterator;

    // TODO: discuss convention for iterator function signatures.
    // trying to achieve a combination of underscore and node.js callback style
    function arrayFunction(item, index) {
      return function(data, cb) {
        if (iterator.length === 2) {
          iterator(item, cb);
        } else if (iterator.length === 3) {
          iterator(item, index, cb);
        } else {
          iterator(item, index, data, cb);
        }
      };
    }

    function objectFunction(value, key) {
      return function(data, cb) {
        if (iterator.length === 2) {
          iterator(value, cb);
        } else if (iterator.length === 3) {
          iterator(value, key, cb);
        } else {
          iterator(value, key, data, cb);
        }
      };
    }

    if (isArray) {
      for (var idx = 0; idx < items.length; idx++) {
        funcs.push(arrayFunction(items[idx], idx));
      }
    } else {
      for (var key in items) {
        funcs.push(objectFunction(items[key], key));
      }
    }

    //console.log("Iterator:", iterator, "Funcs:", funcs);
    var chainOptions = {
      functions: funcs,
      data: data,
      finally: _finally,
      stopOnError: options.stopOnError
    };
    callAsynchronousChain(chainOptions, cb);
  };
}

// Creates an each-iterator for util.async chains
// -----------
//
//     var func = util.async.each(items, function(item, [idx, [data,]] cb) { ... });
//     var func = util.async.each(options)
//
// options:
//    items:    the items to be iterated
//    selector: used to select items dynamically from the data provided by the previous function in the chain
//    before:   an extra function called before iteration
//    iterator: the iterator function (item, [idx, [data,]] cb)
//       with item: the iterated item,
//            data: the propagated data (optional)
//            cb:   the callback

// TODO: support only one version and add another function
async.iterator = function(options_or_items, iterator) {
  var options;
  if (arguments.length == 1) {
    options = options_or_items;
  } else {
    options = {
      items: options_or_items,
      iterator: iterator
    };
  }
  return asynchronousIterator(options);
};

async.each = function(options, cb) {
  // create the iterator and call instantly
  var f = asynchronousIterator(options);
  f(null, cb);
};

module.exports = async;

},{"./util.js":18,"underscore":19}],13:[function(require,module,exports){
"use strict";

var _ = require("underscore");

// Helpers for working with the DOM

var dom = {};

dom.ChildNodeIterator = function(arg) {
  if(_.isArray(arg)) {
    this.nodes = arg;
  } else {
    this.nodes = arg.childNodes;
  }
  this.length = this.nodes.length;
  this.pos = -1;
};

dom.ChildNodeIterator.prototype = {
  hasNext: function() {
    return this.pos < this.length - 1;
  },

  next: function() {
    this.pos += 1;
    return this.nodes[this.pos];
  },

  back: function() {
    if (this.pos >= 0) {
      this.pos -= 1;
    }
    return this;
  }
};

// Note: it is not safe regarding browser in-compatibilities
// to access el.children directly.
dom.getChildren = function(el) {
  if (el.children !== undefined) return el.children;
  var children = [];
  var child = el.firstElementChild;
  while (child) {
    children.push(child);
    child = child.nextElementSibling;
  }
  return children;
};

dom.getNodeType = function(el) {
  if (el.nodeType === window.Node.TEXT_NODE) {
    return "text";
  } else if (el.nodeType === window.Node.COMMENT_NODE) {
    return "comment";
  } else if (el.tagName) {
    return el.tagName.toLowerCase();
  } else {
    console.error("Can't get node type for ", el);
    return "unknown";
  }
};

module.exports = dom;

},{"underscore":19}],14:[function(require,module,exports){
"use strict";

var util = require('./util');

var errors = {};

// The base class for Substance Errors
// -------
// We have been not so happy with the native error as it is really poor with respect to
// stack information and presentation.
// This implementation has a more usable stack trace which is rendered using `err.printStacktrace()`.
// Moreover, it provides error codes and error chaining.
var SubstanceError = function(message, rootError) {

  // If a root error is given try to take over as much information as possible
  if (rootError) {
    Error.call(this, message, rootError.fileName, rootError.lineNumber);

    if (rootError instanceof SubstanceError) {
      this.__stack = rootError.__stack;
    } else if (rootError.stack) {
      this.__stack = util.parseStackTrace(rootError);
    } else {
      this.__stack = util.callstack(1);
    }

  }

  // otherwise create a new stacktrace
  else {
    Error.call(this, message);
    this.__stack = util.callstack(1);
  }

  this.message = message;
};

SubstanceError.Prototype = function() {

  this.name = "SubstanceError";
  this.code = -1;

  this.toString = function() {
    return this.name+":"+this.message;
  };

  this.toJSON = function() {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      stack: this.stack
    };
  };

  this.printStackTrace = function() {
    util.printStackTrace(this);
  };
};

SubstanceError.Prototype.prototype = Error.prototype;
SubstanceError.prototype = new SubstanceError.Prototype();

Object.defineProperty(SubstanceError.prototype, "stack", {
  get: function() {
    var str = [];
    for (var idx = 0; idx < this.__stack.length; idx++) {
      var s = this.__stack[idx];
      str.push(s.file+":"+s.line+":"+s.col+" ("+s.func+")");
    }
    return str.join("\n");
  },
  set: function() { throw new Error("SubstanceError.stack is read-only."); }
});

errors.SubstanceError = SubstanceError;


var createSubstanceErrorSubclass = function(parent, name, code) {
  return function(message) {
    parent.call(this, message);
    this.name = name;
    this.code = code;
  };
};

errors.define = function(className, code, parent) {
  if (!className) throw new SubstanceError("Name is required.");
  if (code === undefined) code = -1;

  parent = parent || SubstanceError;
  var ErrorClass = createSubstanceErrorSubclass(parent, className, code);
  var ErrorClassPrototype = function() {};
  ErrorClassPrototype.prototype = parent.prototype;
  ErrorClass.prototype = new ErrorClassPrototype();
  ErrorClass.prototype.constructor = ErrorClass;

  errors[className] = ErrorClass;
  return ErrorClass;
};

module.exports = errors;

},{"./util":18}],15:[function(require,module,exports){
"use strict";

var _ = require("underscore");

var ENTER = 1;
var EXIT = -1;

// Fragmenter
// --------
//
// An algorithm that is used to fragment overlapping structure elements
// following a priority rule set.
// E.g., we use this for creating DOM elements for annotations. The annotations
// can partially be overlapping. However this is not allowed in general for DOM elements
// or other hierarchical structures.
//
// Example: For the Annotation use casec consider a 'comment' spanning partially
// over an 'emphasis' annotation.
// 'The <comment>quick brown <bold>fox</comment> jumps over</bold> the lazy dog.'
// We want to be able to create a valid XML structure:
// 'The <comment>quick brown <bold>fox</bold></comment><bold> jumps over</bold> the lazy dog.'
//
// For that one would choose
//
//     {
//        'comment': 0,
//        'bold': 1
//     }
//
// as priority levels.
// In case of structural violations as in the example, elements with a higher level
// would be fragmented and those with lower levels would be preserved as one piece.
//
// TODO: If a violation for nodes of the same level occurs an Error should be thrown.
// Currently, in such cases the first element that is opened earlier is preserved.

var Fragmenter = function(levels) {
  this.levels = levels || {};
};

Fragmenter.Prototype = function() {

  // This is a sweep algorithm wich uses a set of ENTER/EXIT entries
  // to manage a stack of active elements.
  // Whenever a new element is entered it will be appended to its parent element.
  // The stack is ordered by the annotation types.
  //
  // Examples:
  //
  // - simple case:
  //
  //       [top] -> ENTER(idea1) -> [top, idea1]
  //
  //   Creates a new 'idea' element and appends it to 'top'
  //
  // - stacked ENTER:
  //
  //       [top, idea1] -> ENTER(bold1) -> [top, idea1, bold1]
  //
  //   Creates a new 'bold' element and appends it to 'idea1'
  //
  // - simple EXIT:
  //
  //       [top, idea1] -> EXIT(idea1) -> [top]
  //
  //   Removes 'idea1' from stack.
  //
  // - reordering ENTER:
  //
  //       [top, bold1] -> ENTER(idea1) -> [top, idea1, bold1]
  //
  //   Inserts 'idea1' at 2nd position, creates a new 'bold1', and appends itself to 'top'
  //
  // - reordering EXIT
  //
  //       [top, idea1, bold1] -> EXIT(idea1)) -> [top, bold1]
  //
  //   Removes 'idea1' from stack and creates a new 'bold1'
  //

  // Orders sweep events according to following precedences:
  //
  // 1. pos
  // 2. EXIT < ENTER
  // 3. if both ENTER: ascending level
  // 4. if both EXIT: descending level

  var _compare = function(a, b) {
    if (a.pos < b.pos) return -1;
    if (a.pos > b.pos) return 1;

    if (a.mode < b.mode) return -1;
    if (a.mode > b.mode) return 1;

    if (a.mode === ENTER) {
      if (a.level < b.level) return -1;
      if (a.level > b.level) return 1;
    }

    if (a.mode === EXIT) {
      if (a.level > b.level) return -1;
      if (a.level < b.level) return 1;
    }

    return 0;
  };

  var extractEntries = function(annotations) {
    var entries = [];
    _.each(annotations, function(a) {
      // use a weak default level when not given
      var l = this.levels[a.type] || 1000;

      // ignore annotations that are not registered
      if (l === undefined) {
        return;
      }

      entries.push({ pos : a.range[0], mode: ENTER, level: l, id: a.id, type: a.type, node: a });
      entries.push({ pos : a.range[1], mode: EXIT, level: l, id: a.id, type: a.type, node: a });
    }, this);
    return entries;
  };

  this.onText = function(/*context, text*/) {};

  // should return the created user context
  this.onEnter = function(/*entry, parentContext*/) {
    return null;
  };
  this.onExit = function(/*entry, parentContext*/) {};

  this.enter = function(entry, parentContext) {
    return this.onEnter(entry, parentContext);
  };

  this.exit = function(entry, parentContext) {
    this.onExit(entry, parentContext);
  };

  this.createText = function(context, text) {
    this.onText(context, text);
  };

  this.start = function(rootContext, text, annotations) {
    var entries = extractEntries.call(this, annotations);
    entries.sort(_compare.bind(this));

    var stack = [{context: rootContext, entry: null}];

    var pos = 0;

    for (var i = 0; i < entries.length; i++) {
      var entry = entries[i];

      // in any case we add the last text to the current element
      this.createText(stack[stack.length-1].context, text.substring(pos, entry.pos));

      pos = entry.pos;
      var level = 1;

      var idx;

      if (entry.mode === ENTER) {
        // find the correct position and insert an entry
        for (; level < stack.length; level++) {
          if (entry.level < stack[level].entry.level) {
            break;
          }
        }
        stack.splice(level, 0, {entry: entry});
      }
      else if (entry.mode === EXIT) {
        // find the according entry and remove it from the stack
        for (; level < stack.length; level++) {
          if (stack[level].entry.id === entry.id) {
            break;
          }
        }
        for (idx = level; idx < stack.length; idx++) {
          this.exit(stack[idx].entry, stack[idx-1].context);
        }
        stack.splice(level, 1);
      }

      // create new elements for all lower entries
      for (idx = level; idx < stack.length; idx++) {
        stack[idx].context = this.enter(stack[idx].entry, stack[idx-1].context);
      }
    }

    // Finally append a trailing text node
    this.createText(rootContext, text.substring(pos));
  };

};
Fragmenter.prototype = new Fragmenter.Prototype();

module.exports = Fragmenter;

},{"underscore":19}],16:[function(require,module,exports){
"use strict";

var html = {};
var _ = require("underscore");

html.templates = {};

// html.compileTemplate = function(tplName) {
//   var rawTemplate = $('script[name='+tplName+']').html();
//   html.templates[tplName] = Handlebars.compile(rawTemplate);
// };

html.renderTemplate = function(tplName, data) {
  return html.templates[tplName](data);
};

// Handlebars.registerHelper('ifelse', function(cond, textIf, textElse) {
//   textIf = Handlebars.Utils.escapeExpression(textIf);
//   textElse  = Handlebars.Utils.escapeExpression(textElse);
//   return new Handlebars.SafeString(cond ? textIf : textElse);
// });

if (typeof window !== "undefined") {
  // A fake console to calm down some browsers.
  if (!window.console) {
    window.console = {
      log: function() {
        // No-op
      }
    };
  }
}

// Render Underscore templates
html.tpl = function (tpl, ctx) {
  ctx = ctx || {};
  var source = window.$('script[name='+tpl+']').html();
  return _.template(source, ctx);
};

// Exports
// ====

module.exports = html;

},{"underscore":19}],17:[function(require,module,exports){
"use strict";

// Substanc.RegExp.Match
// ================
//
// Regular expressions in Javascript they way they should be.

var Match = function(match) {
  this.index = match.index;
  this.match = [];

  for (var i=0; i < match.length; i++) {
    this.match.push(match[i]);
  }
};

Match.Prototype = function() {

  // Returns the capture groups
  // --------
  //

  this.captures = function() {
    return this.match.slice(1);
  };

  // Serialize to string
  // --------
  //

  this.toString = function() {
    return this.match[0];
  };
};

Match.prototype = new Match.Prototype();

// Substance.RegExp
// ================
//

var RegExp = function(exp) {
  this.exp = exp;
};

RegExp.Prototype = function() {

  this.match = function(str) {
    if (str === undefined) throw new Error('No string given');

    if (!this.exp.global) {
      return this.exp.exec(str);
    } else {
      var matches = [];
      var match;
      // Reset the state of the expression
      this.exp.compile(this.exp);

      // Execute until last match has been found

      while ((match = this.exp.exec(str)) !== null) {
        matches.push(new Match(match));
      }
      return matches;
    }
  };
};

RegExp.prototype = new RegExp.Prototype();

RegExp.Match = Match;


// Export
// ========

module.exports = RegExp;

},{}],18:[function(require,module,exports){
"use strict";

// Imports
// ====

var _ = require('underscore');

// Module
// ====

var util = {};

// UUID Generator
// -----------------

/*!
Math.uuid.js (v1.4)
http://www.broofa.com
mailto:robert@broofa.com

Copyright (c) 2010 Robert Kieffer
Dual licensed under the MIT and GPL licenses.
*/

util.uuid = function (prefix, len) {
  var chars = '0123456789abcdefghijklmnopqrstuvwxyz'.split(''),
      uuid = [],
      radix = 16,
      idx;
  len = len || 32;

  if (len) {
    // Compact form
    for (idx = 0; idx < len; idx++) uuid[idx] = chars[0 | Math.random()*radix];
  } else {
    // rfc4122, version 4 form
    var r;

    // rfc4122 requires these characters
    uuid[8] = uuid[13] = uuid[18] = uuid[23] = '-';
    uuid[14] = '4';

    // Fill in random data.  At i==19 set the high bits of clock sequence as
    // per rfc4122, sec. 4.1.5
    for (idx = 0; idx < 36; idx++) {
      if (!uuid[idx]) {
        r = 0 | Math.random()*16;
        uuid[idx] = chars[(idx == 19) ? (r & 0x3) | 0x8 : r];
      }
    }
  }
  return (prefix ? prefix : "") + uuid.join('');
};

// creates a uuid function that generates counting uuids
util.uuidGen = function(defaultPrefix) {
  var id = 1;
  defaultPrefix = (defaultPrefix !== undefined) ? defaultPrefix : "uuid_";
  return function(prefix) {
    prefix = prefix || defaultPrefix;
    return prefix+(id++);
  };
};


// Events
// ---------------

// Taken from Backbone.js
//
// A module that can be mixed in to *any object* in order to provide it with
// custom events. You may bind with `on` or remove with `off` callback
// functions to an event; `trigger`-ing an event fires all callbacks in
// succession.
//
//     var object = {};
//     _.extend(object, util.Events);
//     object.on('expand', function(){ alert('expanded'); });
//     object.trigger('expand');
//

// A difficult-to-believe, but optimized internal dispatch function for
// triggering events. Tries to keep the usual cases speedy (most internal
// Backbone events have 3 arguments).
var triggerEvents = function(events, args) {
  var ev, i = -1, l = events.length, a1 = args[0], a2 = args[1], a3 = args[2];
  switch (args.length) {
    case 0: while (++i < l) (ev = events[i]).callback.call(ev.ctx); return;
    case 1: while (++i < l) (ev = events[i]).callback.call(ev.ctx, a1); return;
    case 2: while (++i < l) (ev = events[i]).callback.call(ev.ctx, a1, a2); return;
    case 3: while (++i < l) (ev = events[i]).callback.call(ev.ctx, a1, a2, a3); return;
    default: while (++i < l) (ev = events[i]).callback.apply(ev.ctx, args);
  }
};

// Regular expression used to split event strings.
var eventSplitter = /\s+/;

// Implement fancy features of the Events API such as multiple event
// names `"change blur"` and jQuery-style event maps `{change: action}`
// in terms of the existing API.
var eventsApi = function(obj, action, name, rest) {
  if (!name) return true;

  // Handle event maps.
  if (typeof name === 'object') {
    for (var key in name) {
      obj[action].apply(obj, [key, name[key]].concat(rest));
    }
    return false;
  }

  // Handle space separated event names.
  if (eventSplitter.test(name)) {
    var names = name.split(eventSplitter);
    for (var i = 0, l = names.length; i < l; i++) {
      obj[action].apply(obj, [names[i]].concat(rest));
    }
    return false;
  }

  return true;
};

util.Events = {

  // Bind an event to a `callback` function. Passing `"all"` will bind
  // the callback to all events fired.
  on: function(name, callback, context) {
    if (!eventsApi(this, 'on', name, [callback, context]) || !callback) return this;
    this._events =  this._events || {};
    var events = this._events[name] || (this._events[name] = []);
    events.push({callback: callback, context: context, ctx: context || this});
    return this;
  },

  // Bind an event to only be triggered a single time. After the first time
  // the callback is invoked, it will be removed.
  once: function(name, callback, context) {
    if (!eventsApi(this, 'once', name, [callback, context]) || !callback) return this;
    var self = this;
    var once = _.once(function() {
      self.off(name, once);
      callback.apply(this, arguments);
    });
    once._callback = callback;
    return this.on(name, once, context);
  },

  // Remove one or many callbacks. If `context` is null, removes all
  // callbacks with that function. If `callback` is null, removes all
  // callbacks for the event. If `name` is null, removes all bound
  // callbacks for all events.
  off: function(name, callback, context) {
    var retain, ev, events, names, i, l, j, k;
    if (!this._events || !eventsApi(this, 'off', name, [callback, context])) return this;
    if (!name && !callback && !context) {
      this._events = {};
      return this;
    }

    names = name ? [name] : _.keys(this._events);
    for (i = 0, l = names.length; i < l; i++) {
      name = names[i];
      events = this._events[name];
      if (events) {
        this._events[name] = retain = [];
        if (callback || context) {
          for (j = 0, k = events.length; j < k; j++) {
            ev = events[j];
            if ((callback && callback !== ev.callback && callback !== ev.callback._callback) ||
                (context && context !== ev.context)) {
              retain.push(ev);
            }
          }
        }
        if (!retain.length) delete this._events[name];
      }
    }

    return this;
  },

  // Trigger one or many events, firing all bound callbacks. Callbacks are
  // passed the same arguments as `trigger` is, apart from the event name
  // (unless you're listening on `"all"`, which will cause your callback to
  // receive the true name of the event as the first argument).
  trigger: function(name) {
    if (!this._events) return this;
    var args = Array.prototype.slice.call(arguments, 1);
    if (!eventsApi(this, 'trigger', name, args)) return this;
    var events = this._events[name];
    var allEvents = this._events.all;
    if (events) triggerEvents(events, args);
    if (allEvents) triggerEvents(allEvents, arguments);
    return this;
  },

  triggerLater: function() {
    var self = this;
    var _arguments = arguments;
    window.setTimeout(function() {
      self.trigger.apply(self, _arguments);
    }, 0);
  },

  // Tell this object to stop listening to either specific events ... or
  // to every object it's currently listening to.
  stopListening: function(obj, name, callback) {
    var listeners = this._listeners;
    if (!listeners) return this;
    var deleteListener = !name && !callback;
    if (typeof name === 'object') callback = this;
    if (obj) (listeners = {})[obj._listenerId] = obj;
    for (var id in listeners) {
      listeners[id].off(name, callback, this);
      if (deleteListener) delete this._listeners[id];
    }
    return this;
  }

};

var listenMethods = {listenTo: 'on', listenToOnce: 'once'};

// Inversion-of-control versions of `on` and `once`. Tell *this* object to
// listen to an event in another object ... keeping track of what it's
// listening to.
_.each(listenMethods, function(implementation, method) {
  util.Events[method] = function(obj, name, callback) {
    var listeners = this._listeners || (this._listeners = {});
    var id = obj._listenerId || (obj._listenerId = _.uniqueId('l'));
    listeners[id] = obj;
    if (typeof name === 'object') callback = this;
    obj[implementation](name, callback, this);
    return this;
  };
});

// Aliases for backwards compatibility.
util.Events.bind   = util.Events.on;
util.Events.unbind = util.Events.off;

util.Events.Listener = {

  listenTo: function(obj, name, callback) {
    if (!_.isFunction(callback)) {
      throw new Error("Illegal argument: expecting function as callback, was: " + callback);
    }

    // initialize container for keeping handlers to unbind later
    this._handlers = this._handlers || [];

    obj.on(name, callback, this);

    this._handlers.push({
      unbind: function() {
        obj.off(name, callback);
      }
    });

    return this;
  },

  stopListening: function() {
    if (this._handlers) {
      for (var i = 0; i < this._handlers.length; i++) {
        this._handlers[i].unbind();
      }
    }
  }

};

util.propagate = function(data, cb) {
  if(!_.isFunction(cb)) {
    throw "Illegal argument: provided callback is not a function";
  }
  return function(err) {
    if (err) return cb(err);
    cb(null, data);
  };
};

// shamelessly stolen from backbone.js:
// Helper function to correctly set up the prototype chain, for subclasses.
// Similar to `goog.inherits`, but uses a hash of prototype properties and
// class properties to be extended.
var ctor = function(){};
util.inherits = function(parent, protoProps, staticProps) {
  var child;

  // The constructor function for the new subclass is either defined by you
  // (the "constructor" property in your `extend` definition), or defaulted
  // by us to simply call the parent's constructor.
  if (protoProps && protoProps.hasOwnProperty('constructor')) {
    child = protoProps.constructor;
  } else {
    child = function(){ parent.apply(this, arguments); };
  }

  // Inherit class (static) properties from parent.
  _.extend(child, parent);

  // Set the prototype chain to inherit from `parent`, without calling
  // `parent`'s constructor function.
  ctor.prototype = parent.prototype;
  child.prototype = new ctor();

  // Add prototype properties (instance properties) to the subclass,
  // if supplied.
  if (protoProps) _.extend(child.prototype, protoProps);

  // Add static properties to the constructor function, if supplied.
  if (staticProps) _.extend(child, staticProps);

  // Correctly set child's `prototype.constructor`.
  child.prototype.constructor = child;

  // Set a convenience property in case the parent's prototype is needed later.
  child.__super__ = parent.prototype;

  return child;
};

// Util to read seed data from file system
// ----------

util.getJSON = function(resource, cb) {
  if (typeof window === 'undefined' || typeof nwglobal !== 'undefined') {
    var fs = require('fs');
    var obj = JSON.parse(fs.readFileSync(resource, 'utf8'));
    cb(null, obj);
  } else {
    //console.log("util.getJSON", resource);
    var $ = window.$;
    $.getJSON(resource)
      .done(function(obj) { cb(null, obj); })
      .error(function(err) { cb(err, null); });
  }
};

util.prototype = function(that) {
  /*jshint proto: true*/ // supressing a warning about using deprecated __proto__.
  return Object.getPrototypeOf ? Object.getPrototypeOf(that) : that.__proto__;
};

util.inherit = function(Super, Self) {
  var super_proto = _.isFunction(Super) ? new Super() : Super;
  var proto;
  if (_.isFunction(Self)) {
    Self.prototype = super_proto;
    proto = new Self();
  } else {
    var TmpClass = function(){};
    TmpClass.prototype = super_proto;
    proto = _.extend(new TmpClass(), Self);
  }
  return proto;
};

util.pimpl = function(pimpl) {
  var Pimpl = function(self) {
    this.self = self;
  };
  Pimpl.prototype = pimpl;
  return function(self) { self = self || this; return new Pimpl(self); };
};

util.parseStackTrace = function(err) {
  var SAFARI_STACK_ELEM = /([^@]*)@(.*):(\d+)/;
  var CHROME_STACK_ELEM = /\s*at ([^(]*)[(](.*):(\d+):(\d+)[)]/;

  var idx;
  var stackTrace = err.stack.split('\n');

  // parse the stack trace: each line is a tuple (function, file, lineNumber)
  // Note: unfortunately this is interpreter specific
  // safari: "<function>@<file>:<lineNumber>"
  // chrome: "at <function>(<file>:<line>:<col>"

  var stack = [];
  for (idx = 0; idx < stackTrace.length; idx++) {
    var match = SAFARI_STACK_ELEM.exec(stackTrace[idx]);
    if (!match) match = CHROME_STACK_ELEM.exec(stackTrace[idx]);
    var entry;
    if (match) {
      entry = {
        func: match[1],
        file: match[2],
        line: match[3],
        col: match[4] || 0
      };
      if (entry.func === "") entry.func = "<anonymous>";
    } else {
      entry = {
        func: "",
        file: stackTrace[idx],
        line: "",
        col: ""
      };
    }
    stack.push(entry);
  }

  return stack;
};

util.callstack = function(k) {
  var err;
  try { throw new Error(); } catch (_err) { err = _err; }
  var stack = util.parseStackTrace(err);
  k = k || 0;
  return stack.splice(k+1);
};

util.stacktrace = function (err) {
  var stack = (arguments.length === 0) ? util.callstack().splice(1) : util.parseStackTrace(err);
  var str = [];
  _.each(stack, function(s) {
    str.push(s.file+":"+s.line+":"+s.col+" ("+s.func+")");
  });
  return str.join("\n");
};

util.printStackTrace = function(err, N) {
  if (!err.stack) return;

  var stack;

  // Substance errors have a nice stack already
  if (err.__stack !== undefined) {
    stack = err.__stack;
  }
  // built-in errors have the stack trace as one string
  else if (_.isString(err.stack)) {
    stack = util.parseStackTrace(err);
  }
  else return;

  N = N || stack.length;
  N = Math.min(N, stack.length);

  for (var idx = 0; idx < N; idx++) {
    var s = stack[idx];
    console.log(s.file+":"+s.line+":"+s.col, "("+s.func+")");
  }
};

// computes the difference of obj1 to obj2
util.diff = function(obj1, obj2) {
  var diff;
  if (_.isArray(obj1) && _.isArray(obj2)) {
    diff = _.difference(obj2, obj1);
    // return null in case of equality
    if (diff.length === 0) return null;
    else return diff;
  }
  if (_.isObject(obj1) && _.isObject(obj2)) {
    diff = {};
    _.each(Object.keys(obj2), function(key) {
      var d = util.diff(obj1[key], obj2[key]);
      if (d) diff[key] = d;
    });
    // return null in case of equality
    if (_.isEmpty(diff)) return null;
    else return diff;
  }
  if(obj1 !== obj2) return obj2;
};

// Deep-Clone a given object
// --------
// Note: this is currently done via JSON.parse(JSON.stringify(obj))
//       which is in fact not optimal, as it depends on `toJSON` implementation.
util.deepclone = function(obj) {
  if (obj === undefined) return undefined;
  if (obj === null) return null;
  return JSON.parse(JSON.stringify(obj));
};

// Clones a given object
// --------
// Calls obj's `clone` function if available,
// otherwise clones the obj using `util.deepclone()`.
util.clone = function(obj) {
  if (obj === null || obj === undefined) {
    return obj;
  }
  if (_.isFunction(obj.clone)) {
    return obj.clone();
  }
  return util.deepclone(obj);
};

util.freeze = function(obj) {
  var idx;
  if (_.isObject(obj)) {
    if (Object.isFrozen(obj)) return obj;

    var keys = Object.keys(obj);
    for (idx = 0; idx < keys.length; idx++) {
      var key = keys[idx];
      obj[key] = util.freeze(obj[key]);
    }
    return Object.freeze(obj);
  } else if (_.isArray(obj)) {
    var arr = obj;
    for (idx = 0; idx < arr.length; idx++) {
      arr[idx] = util.freeze(arr[idx]);
    }
    return Object.freeze(arr);
  } else {
    return obj; // Object.freeze(obj);
  }
};

util.later = function(f, context) {
  return function() {
    var _args = arguments;
    window.setTimeout(function() {
      f.apply(context, _args);
    }, 0);
  };
};


// Returns true if a string doesn't contain any real content

util.isEmpty = function(str) {
  return !str.match(/\w/);
};

// Create a human readable, but URL-compatible slug from a string

util.slug = function(str) {
  str = str.replace(/^\s+|\s+$/g, ''); // trim
  str = str.toLowerCase();

  // remove accents, swap ñ for n, etc
  var from = "àáäâèéëêìíïîòóöôùúüûñç·/_,:;";
  var to   = "aaaaeeeeiiiioooouuuunc------";
  for (var i=0, l=from.length ; i<l ; i++) {
    str = str.replace(new RegExp(from.charAt(i), 'g'), to.charAt(i));
  }

  str = str.replace(/[^a-z0-9 -]/g, '') // remove invalid chars
    .replace(/\s+/g, '-') // collapse whitespace and replace by -
    .replace(/-+/g, '-'); // collapse dashes

  return str;
};


util.getReadableFileSizeString = function(fileSizeInBytes) {

    var i = -1;
    var byteUnits = [' kB', ' MB', ' GB', ' TB', 'PB', 'EB', 'ZB', 'YB'];
    do {
        fileSizeInBytes = fileSizeInBytes / 1024;
        i++;
    } while (fileSizeInBytes > 1024);

    return Math.max(fileSizeInBytes, 0.1).toFixed(1) + byteUnits[i];
};

// Export
// ====

module.exports = util;

},{"fs":31,"underscore":19}],19:[function(require,module,exports){
//     Underscore.js 1.5.2
//     http://underscorejs.org
//     (c) 2009-2013 Jeremy Ashkenas, DocumentCloud and Investigative Reporters & Editors
//     Underscore may be freely distributed under the MIT license.

(function() {

  // Baseline setup
  // --------------

  // Establish the root object, `window` in the browser, or `exports` on the server.
  var root = this;

  // Save the previous value of the `_` variable.
  var previousUnderscore = root._;

  // Establish the object that gets returned to break out of a loop iteration.
  var breaker = {};

  // Save bytes in the minified (but not gzipped) version:
  var ArrayProto = Array.prototype, ObjProto = Object.prototype, FuncProto = Function.prototype;

  // Create quick reference variables for speed access to core prototypes.
  var
    push             = ArrayProto.push,
    slice            = ArrayProto.slice,
    concat           = ArrayProto.concat,
    toString         = ObjProto.toString,
    hasOwnProperty   = ObjProto.hasOwnProperty;

  // All **ECMAScript 5** native function implementations that we hope to use
  // are declared here.
  var
    nativeForEach      = ArrayProto.forEach,
    nativeMap          = ArrayProto.map,
    nativeReduce       = ArrayProto.reduce,
    nativeReduceRight  = ArrayProto.reduceRight,
    nativeFilter       = ArrayProto.filter,
    nativeEvery        = ArrayProto.every,
    nativeSome         = ArrayProto.some,
    nativeIndexOf      = ArrayProto.indexOf,
    nativeLastIndexOf  = ArrayProto.lastIndexOf,
    nativeIsArray      = Array.isArray,
    nativeKeys         = Object.keys,
    nativeBind         = FuncProto.bind;

  // Create a safe reference to the Underscore object for use below.
  var _ = function(obj) {
    if (obj instanceof _) return obj;
    if (!(this instanceof _)) return new _(obj);
    this._wrapped = obj;
  };

  // Export the Underscore object for **Node.js**, with
  // backwards-compatibility for the old `require()` API. If we're in
  // the browser, add `_` as a global object via a string identifier,
  // for Closure Compiler "advanced" mode.
  if (typeof exports !== 'undefined') {
    if (typeof module !== 'undefined' && module.exports) {
      exports = module.exports = _;
    }
    exports._ = _;
  } else {
    root._ = _;
  }

  // Current version.
  _.VERSION = '1.5.2';

  // Collection Functions
  // --------------------

  // The cornerstone, an `each` implementation, aka `forEach`.
  // Handles objects with the built-in `forEach`, arrays, and raw objects.
  // Delegates to **ECMAScript 5**'s native `forEach` if available.
  var each = _.each = _.forEach = function(obj, iterator, context) {
    if (obj == null) return;
    if (nativeForEach && obj.forEach === nativeForEach) {
      obj.forEach(iterator, context);
    } else if (obj.length === +obj.length) {
      for (var i = 0, length = obj.length; i < length; i++) {
        if (iterator.call(context, obj[i], i, obj) === breaker) return;
      }
    } else {
      var keys = _.keys(obj);
      for (var i = 0, length = keys.length; i < length; i++) {
        if (iterator.call(context, obj[keys[i]], keys[i], obj) === breaker) return;
      }
    }
  };

  // Return the results of applying the iterator to each element.
  // Delegates to **ECMAScript 5**'s native `map` if available.
  _.map = _.collect = function(obj, iterator, context) {
    var results = [];
    if (obj == null) return results;
    if (nativeMap && obj.map === nativeMap) return obj.map(iterator, context);
    each(obj, function(value, index, list) {
      results.push(iterator.call(context, value, index, list));
    });
    return results;
  };

  var reduceError = 'Reduce of empty array with no initial value';

  // **Reduce** builds up a single result from a list of values, aka `inject`,
  // or `foldl`. Delegates to **ECMAScript 5**'s native `reduce` if available.
  _.reduce = _.foldl = _.inject = function(obj, iterator, memo, context) {
    var initial = arguments.length > 2;
    if (obj == null) obj = [];
    if (nativeReduce && obj.reduce === nativeReduce) {
      if (context) iterator = _.bind(iterator, context);
      return initial ? obj.reduce(iterator, memo) : obj.reduce(iterator);
    }
    each(obj, function(value, index, list) {
      if (!initial) {
        memo = value;
        initial = true;
      } else {
        memo = iterator.call(context, memo, value, index, list);
      }
    });
    if (!initial) throw new TypeError(reduceError);
    return memo;
  };

  // The right-associative version of reduce, also known as `foldr`.
  // Delegates to **ECMAScript 5**'s native `reduceRight` if available.
  _.reduceRight = _.foldr = function(obj, iterator, memo, context) {
    var initial = arguments.length > 2;
    if (obj == null) obj = [];
    if (nativeReduceRight && obj.reduceRight === nativeReduceRight) {
      if (context) iterator = _.bind(iterator, context);
      return initial ? obj.reduceRight(iterator, memo) : obj.reduceRight(iterator);
    }
    var length = obj.length;
    if (length !== +length) {
      var keys = _.keys(obj);
      length = keys.length;
    }
    each(obj, function(value, index, list) {
      index = keys ? keys[--length] : --length;
      if (!initial) {
        memo = obj[index];
        initial = true;
      } else {
        memo = iterator.call(context, memo, obj[index], index, list);
      }
    });
    if (!initial) throw new TypeError(reduceError);
    return memo;
  };

  // Return the first value which passes a truth test. Aliased as `detect`.
  _.find = _.detect = function(obj, iterator, context) {
    var result;
    any(obj, function(value, index, list) {
      if (iterator.call(context, value, index, list)) {
        result = value;
        return true;
      }
    });
    return result;
  };

  // Return all the elements that pass a truth test.
  // Delegates to **ECMAScript 5**'s native `filter` if available.
  // Aliased as `select`.
  _.filter = _.select = function(obj, iterator, context) {
    var results = [];
    if (obj == null) return results;
    if (nativeFilter && obj.filter === nativeFilter) return obj.filter(iterator, context);
    each(obj, function(value, index, list) {
      if (iterator.call(context, value, index, list)) results.push(value);
    });
    return results;
  };

  // Return all the elements for which a truth test fails.
  _.reject = function(obj, iterator, context) {
    return _.filter(obj, function(value, index, list) {
      return !iterator.call(context, value, index, list);
    }, context);
  };

  // Determine whether all of the elements match a truth test.
  // Delegates to **ECMAScript 5**'s native `every` if available.
  // Aliased as `all`.
  _.every = _.all = function(obj, iterator, context) {
    iterator || (iterator = _.identity);
    var result = true;
    if (obj == null) return result;
    if (nativeEvery && obj.every === nativeEvery) return obj.every(iterator, context);
    each(obj, function(value, index, list) {
      if (!(result = result && iterator.call(context, value, index, list))) return breaker;
    });
    return !!result;
  };

  // Determine if at least one element in the object matches a truth test.
  // Delegates to **ECMAScript 5**'s native `some` if available.
  // Aliased as `any`.
  var any = _.some = _.any = function(obj, iterator, context) {
    iterator || (iterator = _.identity);
    var result = false;
    if (obj == null) return result;
    if (nativeSome && obj.some === nativeSome) return obj.some(iterator, context);
    each(obj, function(value, index, list) {
      if (result || (result = iterator.call(context, value, index, list))) return breaker;
    });
    return !!result;
  };

  // Determine if the array or object contains a given value (using `===`).
  // Aliased as `include`.
  _.contains = _.include = function(obj, target) {
    if (obj == null) return false;
    if (nativeIndexOf && obj.indexOf === nativeIndexOf) return obj.indexOf(target) != -1;
    return any(obj, function(value) {
      return value === target;
    });
  };

  // Invoke a method (with arguments) on every item in a collection.
  _.invoke = function(obj, method) {
    var args = slice.call(arguments, 2);
    var isFunc = _.isFunction(method);
    return _.map(obj, function(value) {
      return (isFunc ? method : value[method]).apply(value, args);
    });
  };

  // Convenience version of a common use case of `map`: fetching a property.
  _.pluck = function(obj, key) {
    return _.map(obj, function(value){ return value[key]; });
  };

  // Convenience version of a common use case of `filter`: selecting only objects
  // containing specific `key:value` pairs.
  _.where = function(obj, attrs, first) {
    if (_.isEmpty(attrs)) return first ? void 0 : [];
    return _[first ? 'find' : 'filter'](obj, function(value) {
      for (var key in attrs) {
        if (attrs[key] !== value[key]) return false;
      }
      return true;
    });
  };

  // Convenience version of a common use case of `find`: getting the first object
  // containing specific `key:value` pairs.
  _.findWhere = function(obj, attrs) {
    return _.where(obj, attrs, true);
  };

  // Return the maximum element or (element-based computation).
  // Can't optimize arrays of integers longer than 65,535 elements.
  // See [WebKit Bug 80797](https://bugs.webkit.org/show_bug.cgi?id=80797)
  _.max = function(obj, iterator, context) {
    if (!iterator && _.isArray(obj) && obj[0] === +obj[0] && obj.length < 65535) {
      return Math.max.apply(Math, obj);
    }
    if (!iterator && _.isEmpty(obj)) return -Infinity;
    var result = {computed : -Infinity, value: -Infinity};
    each(obj, function(value, index, list) {
      var computed = iterator ? iterator.call(context, value, index, list) : value;
      computed > result.computed && (result = {value : value, computed : computed});
    });
    return result.value;
  };

  // Return the minimum element (or element-based computation).
  _.min = function(obj, iterator, context) {
    if (!iterator && _.isArray(obj) && obj[0] === +obj[0] && obj.length < 65535) {
      return Math.min.apply(Math, obj);
    }
    if (!iterator && _.isEmpty(obj)) return Infinity;
    var result = {computed : Infinity, value: Infinity};
    each(obj, function(value, index, list) {
      var computed = iterator ? iterator.call(context, value, index, list) : value;
      computed < result.computed && (result = {value : value, computed : computed});
    });
    return result.value;
  };

  // Shuffle an array, using the modern version of the 
  // [Fisher-Yates shuffle](http://en.wikipedia.org/wiki/Fisher–Yates_shuffle).
  _.shuffle = function(obj) {
    var rand;
    var index = 0;
    var shuffled = [];
    each(obj, function(value) {
      rand = _.random(index++);
      shuffled[index - 1] = shuffled[rand];
      shuffled[rand] = value;
    });
    return shuffled;
  };

  // Sample **n** random values from an array.
  // If **n** is not specified, returns a single random element from the array.
  // The internal `guard` argument allows it to work with `map`.
  _.sample = function(obj, n, guard) {
    if (arguments.length < 2 || guard) {
      return obj[_.random(obj.length - 1)];
    }
    return _.shuffle(obj).slice(0, Math.max(0, n));
  };

  // An internal function to generate lookup iterators.
  var lookupIterator = function(value) {
    return _.isFunction(value) ? value : function(obj){ return obj[value]; };
  };

  // Sort the object's values by a criterion produced by an iterator.
  _.sortBy = function(obj, value, context) {
    var iterator = lookupIterator(value);
    return _.pluck(_.map(obj, function(value, index, list) {
      return {
        value: value,
        index: index,
        criteria: iterator.call(context, value, index, list)
      };
    }).sort(function(left, right) {
      var a = left.criteria;
      var b = right.criteria;
      if (a !== b) {
        if (a > b || a === void 0) return 1;
        if (a < b || b === void 0) return -1;
      }
      return left.index - right.index;
    }), 'value');
  };

  // An internal function used for aggregate "group by" operations.
  var group = function(behavior) {
    return function(obj, value, context) {
      var result = {};
      var iterator = value == null ? _.identity : lookupIterator(value);
      each(obj, function(value, index) {
        var key = iterator.call(context, value, index, obj);
        behavior(result, key, value);
      });
      return result;
    };
  };

  // Groups the object's values by a criterion. Pass either a string attribute
  // to group by, or a function that returns the criterion.
  _.groupBy = group(function(result, key, value) {
    (_.has(result, key) ? result[key] : (result[key] = [])).push(value);
  });

  // Indexes the object's values by a criterion, similar to `groupBy`, but for
  // when you know that your index values will be unique.
  _.indexBy = group(function(result, key, value) {
    result[key] = value;
  });

  // Counts instances of an object that group by a certain criterion. Pass
  // either a string attribute to count by, or a function that returns the
  // criterion.
  _.countBy = group(function(result, key) {
    _.has(result, key) ? result[key]++ : result[key] = 1;
  });

  // Use a comparator function to figure out the smallest index at which
  // an object should be inserted so as to maintain order. Uses binary search.
  _.sortedIndex = function(array, obj, iterator, context) {
    iterator = iterator == null ? _.identity : lookupIterator(iterator);
    var value = iterator.call(context, obj);
    var low = 0, high = array.length;
    while (low < high) {
      var mid = (low + high) >>> 1;
      iterator.call(context, array[mid]) < value ? low = mid + 1 : high = mid;
    }
    return low;
  };

  // Safely create a real, live array from anything iterable.
  _.toArray = function(obj) {
    if (!obj) return [];
    if (_.isArray(obj)) return slice.call(obj);
    if (obj.length === +obj.length) return _.map(obj, _.identity);
    return _.values(obj);
  };

  // Return the number of elements in an object.
  _.size = function(obj) {
    if (obj == null) return 0;
    return (obj.length === +obj.length) ? obj.length : _.keys(obj).length;
  };

  // Array Functions
  // ---------------

  // Get the first element of an array. Passing **n** will return the first N
  // values in the array. Aliased as `head` and `take`. The **guard** check
  // allows it to work with `_.map`.
  _.first = _.head = _.take = function(array, n, guard) {
    if (array == null) return void 0;
    return (n == null) || guard ? array[0] : slice.call(array, 0, n);
  };

  // Returns everything but the last entry of the array. Especially useful on
  // the arguments object. Passing **n** will return all the values in
  // the array, excluding the last N. The **guard** check allows it to work with
  // `_.map`.
  _.initial = function(array, n, guard) {
    return slice.call(array, 0, array.length - ((n == null) || guard ? 1 : n));
  };

  // Get the last element of an array. Passing **n** will return the last N
  // values in the array. The **guard** check allows it to work with `_.map`.
  _.last = function(array, n, guard) {
    if (array == null) return void 0;
    if ((n == null) || guard) {
      return array[array.length - 1];
    } else {
      return slice.call(array, Math.max(array.length - n, 0));
    }
  };

  // Returns everything but the first entry of the array. Aliased as `tail` and `drop`.
  // Especially useful on the arguments object. Passing an **n** will return
  // the rest N values in the array. The **guard**
  // check allows it to work with `_.map`.
  _.rest = _.tail = _.drop = function(array, n, guard) {
    return slice.call(array, (n == null) || guard ? 1 : n);
  };

  // Trim out all falsy values from an array.
  _.compact = function(array) {
    return _.filter(array, _.identity);
  };

  // Internal implementation of a recursive `flatten` function.
  var flatten = function(input, shallow, output) {
    if (shallow && _.every(input, _.isArray)) {
      return concat.apply(output, input);
    }
    each(input, function(value) {
      if (_.isArray(value) || _.isArguments(value)) {
        shallow ? push.apply(output, value) : flatten(value, shallow, output);
      } else {
        output.push(value);
      }
    });
    return output;
  };

  // Flatten out an array, either recursively (by default), or just one level.
  _.flatten = function(array, shallow) {
    return flatten(array, shallow, []);
  };

  // Return a version of the array that does not contain the specified value(s).
  _.without = function(array) {
    return _.difference(array, slice.call(arguments, 1));
  };

  // Produce a duplicate-free version of the array. If the array has already
  // been sorted, you have the option of using a faster algorithm.
  // Aliased as `unique`.
  _.uniq = _.unique = function(array, isSorted, iterator, context) {
    if (_.isFunction(isSorted)) {
      context = iterator;
      iterator = isSorted;
      isSorted = false;
    }
    var initial = iterator ? _.map(array, iterator, context) : array;
    var results = [];
    var seen = [];
    each(initial, function(value, index) {
      if (isSorted ? (!index || seen[seen.length - 1] !== value) : !_.contains(seen, value)) {
        seen.push(value);
        results.push(array[index]);
      }
    });
    return results;
  };

  // Produce an array that contains the union: each distinct element from all of
  // the passed-in arrays.
  _.union = function() {
    return _.uniq(_.flatten(arguments, true));
  };

  // Produce an array that contains every item shared between all the
  // passed-in arrays.
  _.intersection = function(array) {
    var rest = slice.call(arguments, 1);
    return _.filter(_.uniq(array), function(item) {
      return _.every(rest, function(other) {
        return _.indexOf(other, item) >= 0;
      });
    });
  };

  // Take the difference between one array and a number of other arrays.
  // Only the elements present in just the first array will remain.
  _.difference = function(array) {
    var rest = concat.apply(ArrayProto, slice.call(arguments, 1));
    return _.filter(array, function(value){ return !_.contains(rest, value); });
  };

  // Zip together multiple lists into a single array -- elements that share
  // an index go together.
  _.zip = function() {
    var length = _.max(_.pluck(arguments, "length").concat(0));
    var results = new Array(length);
    for (var i = 0; i < length; i++) {
      results[i] = _.pluck(arguments, '' + i);
    }
    return results;
  };

  // Converts lists into objects. Pass either a single array of `[key, value]`
  // pairs, or two parallel arrays of the same length -- one of keys, and one of
  // the corresponding values.
  _.object = function(list, values) {
    if (list == null) return {};
    var result = {};
    for (var i = 0, length = list.length; i < length; i++) {
      if (values) {
        result[list[i]] = values[i];
      } else {
        result[list[i][0]] = list[i][1];
      }
    }
    return result;
  };

  // If the browser doesn't supply us with indexOf (I'm looking at you, **MSIE**),
  // we need this function. Return the position of the first occurrence of an
  // item in an array, or -1 if the item is not included in the array.
  // Delegates to **ECMAScript 5**'s native `indexOf` if available.
  // If the array is large and already in sort order, pass `true`
  // for **isSorted** to use binary search.
  _.indexOf = function(array, item, isSorted) {
    if (array == null) return -1;
    var i = 0, length = array.length;
    if (isSorted) {
      if (typeof isSorted == 'number') {
        i = (isSorted < 0 ? Math.max(0, length + isSorted) : isSorted);
      } else {
        i = _.sortedIndex(array, item);
        return array[i] === item ? i : -1;
      }
    }
    if (nativeIndexOf && array.indexOf === nativeIndexOf) return array.indexOf(item, isSorted);
    for (; i < length; i++) if (array[i] === item) return i;
    return -1;
  };

  // Delegates to **ECMAScript 5**'s native `lastIndexOf` if available.
  _.lastIndexOf = function(array, item, from) {
    if (array == null) return -1;
    var hasIndex = from != null;
    if (nativeLastIndexOf && array.lastIndexOf === nativeLastIndexOf) {
      return hasIndex ? array.lastIndexOf(item, from) : array.lastIndexOf(item);
    }
    var i = (hasIndex ? from : array.length);
    while (i--) if (array[i] === item) return i;
    return -1;
  };

  // Generate an integer Array containing an arithmetic progression. A port of
  // the native Python `range()` function. See
  // [the Python documentation](http://docs.python.org/library/functions.html#range).
  _.range = function(start, stop, step) {
    if (arguments.length <= 1) {
      stop = start || 0;
      start = 0;
    }
    step = arguments[2] || 1;

    var length = Math.max(Math.ceil((stop - start) / step), 0);
    var idx = 0;
    var range = new Array(length);

    while(idx < length) {
      range[idx++] = start;
      start += step;
    }

    return range;
  };

  // Function (ahem) Functions
  // ------------------

  // Reusable constructor function for prototype setting.
  var ctor = function(){};

  // Create a function bound to a given object (assigning `this`, and arguments,
  // optionally). Delegates to **ECMAScript 5**'s native `Function.bind` if
  // available.
  _.bind = function(func, context) {
    var args, bound;
    if (nativeBind && func.bind === nativeBind) return nativeBind.apply(func, slice.call(arguments, 1));
    if (!_.isFunction(func)) throw new TypeError;
    args = slice.call(arguments, 2);
    return bound = function() {
      if (!(this instanceof bound)) return func.apply(context, args.concat(slice.call(arguments)));
      ctor.prototype = func.prototype;
      var self = new ctor;
      ctor.prototype = null;
      var result = func.apply(self, args.concat(slice.call(arguments)));
      if (Object(result) === result) return result;
      return self;
    };
  };

  // Partially apply a function by creating a version that has had some of its
  // arguments pre-filled, without changing its dynamic `this` context.
  _.partial = function(func) {
    var args = slice.call(arguments, 1);
    return function() {
      return func.apply(this, args.concat(slice.call(arguments)));
    };
  };

  // Bind all of an object's methods to that object. Useful for ensuring that
  // all callbacks defined on an object belong to it.
  _.bindAll = function(obj) {
    var funcs = slice.call(arguments, 1);
    if (funcs.length === 0) throw new Error("bindAll must be passed function names");
    each(funcs, function(f) { obj[f] = _.bind(obj[f], obj); });
    return obj;
  };

  // Memoize an expensive function by storing its results.
  _.memoize = function(func, hasher) {
    var memo = {};
    hasher || (hasher = _.identity);
    return function() {
      var key = hasher.apply(this, arguments);
      return _.has(memo, key) ? memo[key] : (memo[key] = func.apply(this, arguments));
    };
  };

  // Delays a function for the given number of milliseconds, and then calls
  // it with the arguments supplied.
  _.delay = function(func, wait) {
    var args = slice.call(arguments, 2);
    return setTimeout(function(){ return func.apply(null, args); }, wait);
  };

  // Defers a function, scheduling it to run after the current call stack has
  // cleared.
  _.defer = function(func) {
    return _.delay.apply(_, [func, 1].concat(slice.call(arguments, 1)));
  };

  // Returns a function, that, when invoked, will only be triggered at most once
  // during a given window of time. Normally, the throttled function will run
  // as much as it can, without ever going more than once per `wait` duration;
  // but if you'd like to disable the execution on the leading edge, pass
  // `{leading: false}`. To disable execution on the trailing edge, ditto.
  _.throttle = function(func, wait, options) {
    var context, args, result;
    var timeout = null;
    var previous = 0;
    options || (options = {});
    var later = function() {
      previous = options.leading === false ? 0 : new Date;
      timeout = null;
      result = func.apply(context, args);
    };
    return function() {
      var now = new Date;
      if (!previous && options.leading === false) previous = now;
      var remaining = wait - (now - previous);
      context = this;
      args = arguments;
      if (remaining <= 0) {
        clearTimeout(timeout);
        timeout = null;
        previous = now;
        result = func.apply(context, args);
      } else if (!timeout && options.trailing !== false) {
        timeout = setTimeout(later, remaining);
      }
      return result;
    };
  };

  // Returns a function, that, as long as it continues to be invoked, will not
  // be triggered. The function will be called after it stops being called for
  // N milliseconds. If `immediate` is passed, trigger the function on the
  // leading edge, instead of the trailing.
  _.debounce = function(func, wait, immediate) {
    var timeout, args, context, timestamp, result;
    return function() {
      context = this;
      args = arguments;
      timestamp = new Date();
      var later = function() {
        var last = (new Date()) - timestamp;
        if (last < wait) {
          timeout = setTimeout(later, wait - last);
        } else {
          timeout = null;
          if (!immediate) result = func.apply(context, args);
        }
      };
      var callNow = immediate && !timeout;
      if (!timeout) {
        timeout = setTimeout(later, wait);
      }
      if (callNow) result = func.apply(context, args);
      return result;
    };
  };

  // Returns a function that will be executed at most one time, no matter how
  // often you call it. Useful for lazy initialization.
  _.once = function(func) {
    var ran = false, memo;
    return function() {
      if (ran) return memo;
      ran = true;
      memo = func.apply(this, arguments);
      func = null;
      return memo;
    };
  };

  // Returns the first function passed as an argument to the second,
  // allowing you to adjust arguments, run code before and after, and
  // conditionally execute the original function.
  _.wrap = function(func, wrapper) {
    return function() {
      var args = [func];
      push.apply(args, arguments);
      return wrapper.apply(this, args);
    };
  };

  // Returns a function that is the composition of a list of functions, each
  // consuming the return value of the function that follows.
  _.compose = function() {
    var funcs = arguments;
    return function() {
      var args = arguments;
      for (var i = funcs.length - 1; i >= 0; i--) {
        args = [funcs[i].apply(this, args)];
      }
      return args[0];
    };
  };

  // Returns a function that will only be executed after being called N times.
  _.after = function(times, func) {
    return function() {
      if (--times < 1) {
        return func.apply(this, arguments);
      }
    };
  };

  // Object Functions
  // ----------------

  // Retrieve the names of an object's properties.
  // Delegates to **ECMAScript 5**'s native `Object.keys`
  _.keys = nativeKeys || function(obj) {
    if (obj !== Object(obj)) throw new TypeError('Invalid object');
    var keys = [];
    for (var key in obj) if (_.has(obj, key)) keys.push(key);
    return keys;
  };

  // Retrieve the values of an object's properties.
  _.values = function(obj) {
    var keys = _.keys(obj);
    var length = keys.length;
    var values = new Array(length);
    for (var i = 0; i < length; i++) {
      values[i] = obj[keys[i]];
    }
    return values;
  };

  // Convert an object into a list of `[key, value]` pairs.
  _.pairs = function(obj) {
    var keys = _.keys(obj);
    var length = keys.length;
    var pairs = new Array(length);
    for (var i = 0; i < length; i++) {
      pairs[i] = [keys[i], obj[keys[i]]];
    }
    return pairs;
  };

  // Invert the keys and values of an object. The values must be serializable.
  _.invert = function(obj) {
    var result = {};
    var keys = _.keys(obj);
    for (var i = 0, length = keys.length; i < length; i++) {
      result[obj[keys[i]]] = keys[i];
    }
    return result;
  };

  // Return a sorted list of the function names available on the object.
  // Aliased as `methods`
  _.functions = _.methods = function(obj) {
    var names = [];
    for (var key in obj) {
      if (_.isFunction(obj[key])) names.push(key);
    }
    return names.sort();
  };

  // Extend a given object with all the properties in passed-in object(s).
  _.extend = function(obj) {
    each(slice.call(arguments, 1), function(source) {
      if (source) {
        for (var prop in source) {
          obj[prop] = source[prop];
        }
      }
    });
    return obj;
  };

  // Return a copy of the object only containing the whitelisted properties.
  _.pick = function(obj) {
    var copy = {};
    var keys = concat.apply(ArrayProto, slice.call(arguments, 1));
    each(keys, function(key) {
      if (key in obj) copy[key] = obj[key];
    });
    return copy;
  };

   // Return a copy of the object without the blacklisted properties.
  _.omit = function(obj) {
    var copy = {};
    var keys = concat.apply(ArrayProto, slice.call(arguments, 1));
    for (var key in obj) {
      if (!_.contains(keys, key)) copy[key] = obj[key];
    }
    return copy;
  };

  // Fill in a given object with default properties.
  _.defaults = function(obj) {
    each(slice.call(arguments, 1), function(source) {
      if (source) {
        for (var prop in source) {
          if (obj[prop] === void 0) obj[prop] = source[prop];
        }
      }
    });
    return obj;
  };

  // Create a (shallow-cloned) duplicate of an object.
  _.clone = function(obj) {
    if (!_.isObject(obj)) return obj;
    return _.isArray(obj) ? obj.slice() : _.extend({}, obj);
  };

  // Invokes interceptor with the obj, and then returns obj.
  // The primary purpose of this method is to "tap into" a method chain, in
  // order to perform operations on intermediate results within the chain.
  _.tap = function(obj, interceptor) {
    interceptor(obj);
    return obj;
  };

  // Internal recursive comparison function for `isEqual`.
  var eq = function(a, b, aStack, bStack) {
    // Identical objects are equal. `0 === -0`, but they aren't identical.
    // See the [Harmony `egal` proposal](http://wiki.ecmascript.org/doku.php?id=harmony:egal).
    if (a === b) return a !== 0 || 1 / a == 1 / b;
    // A strict comparison is necessary because `null == undefined`.
    if (a == null || b == null) return a === b;
    // Unwrap any wrapped objects.
    if (a instanceof _) a = a._wrapped;
    if (b instanceof _) b = b._wrapped;
    // Compare `[[Class]]` names.
    var className = toString.call(a);
    if (className != toString.call(b)) return false;
    switch (className) {
      // Strings, numbers, dates, and booleans are compared by value.
      case '[object String]':
        // Primitives and their corresponding object wrappers are equivalent; thus, `"5"` is
        // equivalent to `new String("5")`.
        return a == String(b);
      case '[object Number]':
        // `NaN`s are equivalent, but non-reflexive. An `egal` comparison is performed for
        // other numeric values.
        return a != +a ? b != +b : (a == 0 ? 1 / a == 1 / b : a == +b);
      case '[object Date]':
      case '[object Boolean]':
        // Coerce dates and booleans to numeric primitive values. Dates are compared by their
        // millisecond representations. Note that invalid dates with millisecond representations
        // of `NaN` are not equivalent.
        return +a == +b;
      // RegExps are compared by their source patterns and flags.
      case '[object RegExp]':
        return a.source == b.source &&
               a.global == b.global &&
               a.multiline == b.multiline &&
               a.ignoreCase == b.ignoreCase;
    }
    if (typeof a != 'object' || typeof b != 'object') return false;
    // Assume equality for cyclic structures. The algorithm for detecting cyclic
    // structures is adapted from ES 5.1 section 15.12.3, abstract operation `JO`.
    var length = aStack.length;
    while (length--) {
      // Linear search. Performance is inversely proportional to the number of
      // unique nested structures.
      if (aStack[length] == a) return bStack[length] == b;
    }
    // Objects with different constructors are not equivalent, but `Object`s
    // from different frames are.
    var aCtor = a.constructor, bCtor = b.constructor;
    if (aCtor !== bCtor && !(_.isFunction(aCtor) && (aCtor instanceof aCtor) &&
                             _.isFunction(bCtor) && (bCtor instanceof bCtor))) {
      return false;
    }
    // Add the first object to the stack of traversed objects.
    aStack.push(a);
    bStack.push(b);
    var size = 0, result = true;
    // Recursively compare objects and arrays.
    if (className == '[object Array]') {
      // Compare array lengths to determine if a deep comparison is necessary.
      size = a.length;
      result = size == b.length;
      if (result) {
        // Deep compare the contents, ignoring non-numeric properties.
        while (size--) {
          if (!(result = eq(a[size], b[size], aStack, bStack))) break;
        }
      }
    } else {
      // Deep compare objects.
      for (var key in a) {
        if (_.has(a, key)) {
          // Count the expected number of properties.
          size++;
          // Deep compare each member.
          if (!(result = _.has(b, key) && eq(a[key], b[key], aStack, bStack))) break;
        }
      }
      // Ensure that both objects contain the same number of properties.
      if (result) {
        for (key in b) {
          if (_.has(b, key) && !(size--)) break;
        }
        result = !size;
      }
    }
    // Remove the first object from the stack of traversed objects.
    aStack.pop();
    bStack.pop();
    return result;
  };

  // Perform a deep comparison to check if two objects are equal.
  _.isEqual = function(a, b) {
    return eq(a, b, [], []);
  };

  // Is a given array, string, or object empty?
  // An "empty" object has no enumerable own-properties.
  _.isEmpty = function(obj) {
    if (obj == null) return true;
    if (_.isArray(obj) || _.isString(obj)) return obj.length === 0;
    for (var key in obj) if (_.has(obj, key)) return false;
    return true;
  };

  // Is a given value a DOM element?
  _.isElement = function(obj) {
    return !!(obj && obj.nodeType === 1);
  };

  // Is a given value an array?
  // Delegates to ECMA5's native Array.isArray
  _.isArray = nativeIsArray || function(obj) {
    return toString.call(obj) == '[object Array]';
  };

  // Is a given variable an object?
  _.isObject = function(obj) {
    return obj === Object(obj);
  };

  // Add some isType methods: isArguments, isFunction, isString, isNumber, isDate, isRegExp.
  each(['Arguments', 'Function', 'String', 'Number', 'Date', 'RegExp'], function(name) {
    _['is' + name] = function(obj) {
      return toString.call(obj) == '[object ' + name + ']';
    };
  });

  // Define a fallback version of the method in browsers (ahem, IE), where
  // there isn't any inspectable "Arguments" type.
  if (!_.isArguments(arguments)) {
    _.isArguments = function(obj) {
      return !!(obj && _.has(obj, 'callee'));
    };
  }

  // Optimize `isFunction` if appropriate.
  if (typeof (/./) !== 'function') {
    _.isFunction = function(obj) {
      return typeof obj === 'function';
    };
  }

  // Is a given object a finite number?
  _.isFinite = function(obj) {
    return isFinite(obj) && !isNaN(parseFloat(obj));
  };

  // Is the given value `NaN`? (NaN is the only number which does not equal itself).
  _.isNaN = function(obj) {
    return _.isNumber(obj) && obj != +obj;
  };

  // Is a given value a boolean?
  _.isBoolean = function(obj) {
    return obj === true || obj === false || toString.call(obj) == '[object Boolean]';
  };

  // Is a given value equal to null?
  _.isNull = function(obj) {
    return obj === null;
  };

  // Is a given variable undefined?
  _.isUndefined = function(obj) {
    return obj === void 0;
  };

  // Shortcut function for checking if an object has a given property directly
  // on itself (in other words, not on a prototype).
  _.has = function(obj, key) {
    return hasOwnProperty.call(obj, key);
  };

  // Utility Functions
  // -----------------

  // Run Underscore.js in *noConflict* mode, returning the `_` variable to its
  // previous owner. Returns a reference to the Underscore object.
  _.noConflict = function() {
    root._ = previousUnderscore;
    return this;
  };

  // Keep the identity function around for default iterators.
  _.identity = function(value) {
    return value;
  };

  // Run a function **n** times.
  _.times = function(n, iterator, context) {
    var accum = Array(Math.max(0, n));
    for (var i = 0; i < n; i++) accum[i] = iterator.call(context, i);
    return accum;
  };

  // Return a random integer between min and max (inclusive).
  _.random = function(min, max) {
    if (max == null) {
      max = min;
      min = 0;
    }
    return min + Math.floor(Math.random() * (max - min + 1));
  };

  // List of HTML entities for escaping.
  var entityMap = {
    escape: {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#x27;'
    }
  };
  entityMap.unescape = _.invert(entityMap.escape);

  // Regexes containing the keys and values listed immediately above.
  var entityRegexes = {
    escape:   new RegExp('[' + _.keys(entityMap.escape).join('') + ']', 'g'),
    unescape: new RegExp('(' + _.keys(entityMap.unescape).join('|') + ')', 'g')
  };

  // Functions for escaping and unescaping strings to/from HTML interpolation.
  _.each(['escape', 'unescape'], function(method) {
    _[method] = function(string) {
      if (string == null) return '';
      return ('' + string).replace(entityRegexes[method], function(match) {
        return entityMap[method][match];
      });
    };
  });

  // If the value of the named `property` is a function then invoke it with the
  // `object` as context; otherwise, return it.
  _.result = function(object, property) {
    if (object == null) return void 0;
    var value = object[property];
    return _.isFunction(value) ? value.call(object) : value;
  };

  // Add your own custom functions to the Underscore object.
  _.mixin = function(obj) {
    each(_.functions(obj), function(name) {
      var func = _[name] = obj[name];
      _.prototype[name] = function() {
        var args = [this._wrapped];
        push.apply(args, arguments);
        return result.call(this, func.apply(_, args));
      };
    });
  };

  // Generate a unique integer id (unique within the entire client session).
  // Useful for temporary DOM ids.
  var idCounter = 0;
  _.uniqueId = function(prefix) {
    var id = ++idCounter + '';
    return prefix ? prefix + id : id;
  };

  // By default, Underscore uses ERB-style template delimiters, change the
  // following template settings to use alternative delimiters.
  _.templateSettings = {
    evaluate    : /<%([\s\S]+?)%>/g,
    interpolate : /<%=([\s\S]+?)%>/g,
    escape      : /<%-([\s\S]+?)%>/g
  };

  // When customizing `templateSettings`, if you don't want to define an
  // interpolation, evaluation or escaping regex, we need one that is
  // guaranteed not to match.
  var noMatch = /(.)^/;

  // Certain characters need to be escaped so that they can be put into a
  // string literal.
  var escapes = {
    "'":      "'",
    '\\':     '\\',
    '\r':     'r',
    '\n':     'n',
    '\t':     't',
    '\u2028': 'u2028',
    '\u2029': 'u2029'
  };

  var escaper = /\\|'|\r|\n|\t|\u2028|\u2029/g;

  // JavaScript micro-templating, similar to John Resig's implementation.
  // Underscore templating handles arbitrary delimiters, preserves whitespace,
  // and correctly escapes quotes within interpolated code.
  _.template = function(text, data, settings) {
    var render;
    settings = _.defaults({}, settings, _.templateSettings);

    // Combine delimiters into one regular expression via alternation.
    var matcher = new RegExp([
      (settings.escape || noMatch).source,
      (settings.interpolate || noMatch).source,
      (settings.evaluate || noMatch).source
    ].join('|') + '|$', 'g');

    // Compile the template source, escaping string literals appropriately.
    var index = 0;
    var source = "__p+='";
    text.replace(matcher, function(match, escape, interpolate, evaluate, offset) {
      source += text.slice(index, offset)
        .replace(escaper, function(match) { return '\\' + escapes[match]; });

      if (escape) {
        source += "'+\n((__t=(" + escape + "))==null?'':_.escape(__t))+\n'";
      }
      if (interpolate) {
        source += "'+\n((__t=(" + interpolate + "))==null?'':__t)+\n'";
      }
      if (evaluate) {
        source += "';\n" + evaluate + "\n__p+='";
      }
      index = offset + match.length;
      return match;
    });
    source += "';\n";

    // If a variable is not specified, place data values in local scope.
    if (!settings.variable) source = 'with(obj||{}){\n' + source + '}\n';

    source = "var __t,__p='',__j=Array.prototype.join," +
      "print=function(){__p+=__j.call(arguments,'');};\n" +
      source + "return __p;\n";

    try {
      render = new Function(settings.variable || 'obj', '_', source);
    } catch (e) {
      e.source = source;
      throw e;
    }

    if (data) return render(data, _);
    var template = function(data) {
      return render.call(this, data, _);
    };

    // Provide the compiled function source as a convenience for precompilation.
    template.source = 'function(' + (settings.variable || 'obj') + '){\n' + source + '}';

    return template;
  };

  // Add a "chain" function, which will delegate to the wrapper.
  _.chain = function(obj) {
    return _(obj).chain();
  };

  // OOP
  // ---------------
  // If Underscore is called as a function, it returns a wrapped object that
  // can be used OO-style. This wrapper holds altered versions of all the
  // underscore functions. Wrapped objects may be chained.

  // Helper function to continue chaining intermediate results.
  var result = function(obj) {
    return this._chain ? _(obj).chain() : obj;
  };

  // Add all of the Underscore functions to the wrapper object.
  _.mixin(_);

  // Add all mutator Array functions to the wrapper.
  each(['pop', 'push', 'reverse', 'shift', 'sort', 'splice', 'unshift'], function(name) {
    var method = ArrayProto[name];
    _.prototype[name] = function() {
      var obj = this._wrapped;
      method.apply(obj, arguments);
      if ((name == 'shift' || name == 'splice') && obj.length === 0) delete obj[0];
      return result.call(this, obj);
    };
  });

  // Add all accessor Array functions to the wrapper.
  each(['concat', 'join', 'slice'], function(name) {
    var method = ArrayProto[name];
    _.prototype[name] = function() {
      return result.call(this, method.apply(this._wrapped, arguments));
    };
  });

  _.extend(_.prototype, {

    // Start chaining a wrapped Underscore object.
    chain: function() {
      this._chain = true;
      return this;
    },

    // Extracts the result from a wrapped and chained object.
    value: function() {
      return this._wrapped;
    }

  });

}).call(this);

},{}],20:[function(require,module,exports){
var AVAILABLE_FACETS = {
  "article_type": {
    "doc_count_error_upper_bound": 0,
    "sum_other_doc_count": 0,
    "buckets": [
      {
        "key": "Research article",
        "doc_count": 838
      },
      {
        "key": "Insight",
        "doc_count": 186
      },
      {
        "key": "Correction",
        "doc_count": 44
      },
      {
        "key": "Feature article",
        "doc_count": 41
      },
      {
        "key": "Short report",
        "doc_count": 32
      },
      {
        "key": "Editorial",
        "doc_count": 11
      },
      {
        "key": "Research advance",
        "doc_count": 13
      },
      {
        "key": "Registered report",
        "doc_count": 8
      },
      {
        "key": "Feature Article",
        "doc_count": 1
      }
    ]
  },
  "subjects": {
    "doc_count_error_upper_bound": 0,
    "sum_other_doc_count": 0,
    "buckets": [
      {
        "key": "Cell biology",
        "doc_count": 286
      },
      {
        "key": "Neuroscience",
        "doc_count": 251
      },
      {
        "key": "Biophysics and structural biology",
        "doc_count": 215
      },
      {
        "key": "Biochemistry",
        "doc_count": 183
      },
      {
        "key": "Developmental biology and stem cells",
        "doc_count": 162
      },
      {
        "key": "Genomics and evolutionary biology",
        "doc_count": 152
      },
      {
        "key": "Genes and chromosomes",
        "doc_count": 123
      },
      {
        "key": "Microbiology and infectious disease",
        "doc_count": 124
      },
      {
        "key": "Human biology and medicine",
        "doc_count": 88
      },
      {
        "key": "Immunology",
        "doc_count": 62
      },
      {
        "key": "Plant biology",
        "doc_count": 51
      },
      {
        "key": "Ecology",
        "doc_count": 33
      },
      {
        "key": "Epidemiology and global health",
        "doc_count": 21
      },
      {
        "key": "Computational and systems biology",
        "doc_count": 2
      }
    ]
  },
  "organisms": {
    "doc_count_error_upper_bound": 0,
    "sum_other_doc_count": 246,
    "buckets": [
      {
        "key": "mouse",
        "doc_count": 195
      },
      {
        "key": "human",
        "doc_count": 182
      },
      {
        "key": "Mouse",
        "doc_count": 128
      },
      {
        "key": "Human",
        "doc_count": 114
      },
      {
        "key": "other",
        "doc_count": 116
      },
      {
        "key": "D. melanogaster",
        "doc_count": 113
      },
      {
        "key": "S. cerevisiae",
        "doc_count": 98
      },
      {
        "key": "E. coli",
        "doc_count": 81
      },
      {
        "key": "Other",
        "doc_count": 51
      },
      {
        "key": "Arabidopsis",
        "doc_count": 39
      }
    ]
  },
  "authors": {
    "doc_count_error_upper_bound": 4,
    "sum_other_doc_count": 6627,
    "buckets": [
      {
        "key": "Randy Schekman",
        "doc_count": 14
      },
      {
        "key": "Eve Marder",
        "doc_count": 9
      },
      {
        "key": "Detlef Weigel",
        "doc_count": 9
      },
      {
        "key": "Bill S Hansson",
        "doc_count": 7
      },
      {
        "key": "Chris P Ponting",
        "doc_count": 6
      },
      {
        "key": "Fiona M Watt",
        "doc_count": 5
      },
      {
        "key": "Peter Walter",
        "doc_count": 6
      },
      {
        "key": "Alma L Burlingame",
        "doc_count": 4
      },
      {
        "key": "Irene Farabella",
        "doc_count": 4
      },
      {
        "key": "Maya Topf",
        "doc_count": 4
      }
    ]
  }
};


// var AVAILABLE_FACETS = {
//   "subjects": {
//     "name": "Subjects",
//     "entries": [
//       {"name": "Biochemistry", "frequency": 0},
//       {"name": "Biophysics and structural biology", "frequency": 0},
//       {"name": "Cancer biology", "frequency": 0},
//       {"name": "Cell biology", "frequency": 0},
//       {"name": "Computational and systems biology", "frequency": 0},
//       {"name": "Developmental biology and stem cells", "frequency": 0},
//       {"name": "Ecology", "frequency": 0},
//       {"name": "Epidemiology and global health", "frequency": 0},
//       {"name": "Genes and chromosomes", "frequency": 0},
//       {"name": "Genomics and evolutionary biology", "frequency": 0},
//       {"name": "Human biology and medicine", "frequency": 0},
//       {"name": "Immunology", "frequency": 0},
//       {"name": "Microbiology and infectious disease", "frequency": 0},
//       {"name": "Neuroscience", "frequency": 0},
//       {"name": "Plant biology", "frequency": 0}
//     ]
//   },
//   "article_type": {
//     "name": "Content Type",
//     "entries": [
//       {"name": "Editorial", "frequency": 0},
//       {"name": "Feature article", "frequency": 0},
//       {"name": "Insight", "frequency": 0},
//       {"name": "Research article", "frequency": 0},
//       {"name": "Short report", "frequency": 0},
//       {"name": "Research advance", "frequency": 0},
//       {"name": "Registered report", "frequency": 0},
//       {"name": "Correction", "frequency": 0}
//     ]
//   },
//   "organisms": {
//     "name": "Research organism",
//     "entries": [
//       {"name": "Mouse", "frequency": 0},
//       {"name": "Human", "frequency": 0},
//       {"name": "Rat", "frequency": 0},
//       {"name": "Zebrafish", "frequency": 0},
//       {"name": "C. elegans", "frequency": 0},
//       {"name": "D. melanogaster", "frequency": 0}
//     ]
//   },
//   "authors": {
//     "name": "Author",
//     "entries": [
//     ]
//   }
// };



module.exports = AVAILABLE_FACETS;
},{}],21:[function(require,module,exports){
var AVAILABLE_KEYWORDS = [
	"synaptic plasticity",
	"STDP",
	"visual cortex",
	"circuits",
	"in vivo",
	"spiking patterns",
	"mouse",
	"Circadian rhythms",
	"transcription",
	"nascent RNA",
	"high-throughput sequencing", 
	"RNA processing",
	"post-transcriptional regulation",
	"Methanothermobacter marburgensis",
	"cryo-electron microscopy",
	"methanogenesis",
	"hydrogenase"
];

module.exports = AVAILABLE_KEYWORDS;
},{}],22:[function(require,module,exports){
"use strict";

var _ = require("underscore");
var util = require("substance-util");
var Controller = require("substance-application").Controller;
var BrowserView = require("./browser_view");

var SearchQuery = require("./search_query");
var SearchResult = require("./search_result");

var AVAILABLE_FACETS = require("./available_facets");
var AVAILABLE_KEYWORDS = require("./available_keywords");

// Used to initialize the SearchQuery model
var EMPTY_QUERY = {
  searchStr: "",
  filters: {}
};

// BrowserController
// =============================

var BrowserController = function(app, config) {
  Controller.call(this, app);
  this.config = config;

  this.searchQuery = new SearchQuery(EMPTY_QUERY);
  this.createView();

  this.searchQuery.on('query:changed', _.bind(this.startSearch, this));
};

BrowserController.Prototype = function() {

  this.initialize = function(newState, cb) {
    cb(null);
  };

  this.DEFAULT_STATE = {
    id: "main"
  };

  // Initiate a new search by making a state change
  // ------------------

  this.startSearch = function() {
    // console.log('query changed', this.searchQuery);
    ga('send', 'event', 'search:'+this.searchQuery.searchStr, 'search', 'search');

    this.switchState({
      id: "main",
      searchQuery: this.searchQuery.toJSON()
    });
  };

  this.getSuggestions = function(searchStr) {
    var suggestions = [];
    _.each(AVAILABLE_KEYWORDS, function(keyword) {
      if (keyword.toLowerCase().match(searchStr.toLowerCase())) {
        suggestions.push({
          value: keyword.replace(searchStr, "<b>"+searchStr+"</b>"),
          rawValue: keyword
        });
      }
    });

    return suggestions;
  };

  this.createView = function() {
    if (!this.view) {
      this.view = new BrowserView(this);
    }
    return this.view;
  };

  this.transition = function(newState, cb) {
    console.log("BrowserController.transition(%s -> %s)", this.state.id, newState.id);

    // idem-potence
    // if (newState.id === this.state.id) {
    //   var skip = false;
    //   // TODO
    //   skip = true;
    //   if (skip) return cb(null, {skip: true});
    // }

    if (newState.id === "main") {

      if (this.state.id === "uninitialized") {
        // Set the initial search query from app state
        // TODO: this could be done in a onInitialize hook?
        console.log('setting initial query', newState.searchQuery);

        var query;
        if (newState.searchQuery) {
          query = JSON.parse(JSON.stringify(newState.searchQuery));
        } else {
          query = EMPTY_QUERY;
          newState.searchQuery = JSON.parse(JSON.stringify(query));
        }
        this.searchQuery.setQuery(query);
      }
      if (!_.isEqual(newState.searchQuery, this.state.searchQuery)) {
        // Search query has changed
        this.loadSearchResult(newState, cb);
      } else {
        console.log('no state change detected, skipping', this.state, newState);
        return cb(null, {skip: true});
      }
    } else {
      console.log('state not explicitly handled', this.state, newState);
      return cb(null);
      // cb(null);
    }
  };

  // Load preview
  // -----------------------
  // 

  this.loadPreview = function(documentId, searchStr, cb) {
    var self = this;

    $.ajax({
      url: self.config.api_url+"/search/document?documentId="+encodeURIComponent(documentId)+"&searchString="+encodeURIComponent(searchStr),
      dataType: 'json',
      success: function(data) {
        var elifeID = _.last(documentId.split("."));
        data.document.id = documentId;
        data.document.url = "http://lens.elifesciences.org/" + elifeID;
        data.document.pdf_url = "http://cdn.elifesciences.org/elife-articles/"+elifeID+"/pdf/elife"+elifeID+".pdf";
        data.searchStr = searchStr;
        self.previewData = data;
        cb(null);
      },
      error: function(err) {
        console.error(err.responseText);
        cb(err.responseText);
      }
    });
  };

  // Search result gets loaded
  // -----------------------
  // 
  // TODO: error handling

  this.loadSearchResult = function(newState, cb) {
    this.view.showLoading();

    // Get filters from app state    
    var searchQuery = newState.searchQuery;
    var documentId = newState.documentId;
    var self = this;

    $.ajax({
      url: this.config.api_url+"/search?searchQuery="+encodeURIComponent(JSON.stringify(searchQuery)),
      dataType: 'json',
      success: function(result) {

        console.log('search result:', result);
        // console.log(JSON.stringify(result.aggregations, null, "  "));

        // Patching docs
        _.each(result.hits.hits, function(doc) {
          var elifeID = _.last(doc._id.split("."));
          doc._source.url = "http://lens.elifesciences.org/" + elifeID;
        }, this);

        self.searchResult = new SearchResult({
          searchQuery: self.searchQuery,
          result: result
        }, {});

        self.previewData = null;
        cb(null);
      },
      error: function(err) {
        console.error(err.responseText);
        cb(err.responseText);
      }
    });
  };

  this.afterTransition = function(oldState) {
    var newState = this.state;
    this.view.afterTransition(oldState, newState);
  };
};

BrowserController.Prototype.prototype = Controller.prototype;
BrowserController.prototype = new BrowserController.Prototype();

BrowserController.Controller = BrowserController;

module.exports = BrowserController;
},{"./available_facets":20,"./available_keywords":21,"./browser_view":23,"./search_query":27,"./search_result":28,"substance-application":2,"substance-util":11,"underscore":19}],23:[function(require,module,exports){
"use strict";

var _ = require("underscore");
var View = require("substance-application").View;
var $$ = require("substance-application").$$;
var SearchbarView = require("./searchbar_view");
var PreviewView = require("./preview_view");
var FacetsView = require("./facets_view");
var util = require("./util");

var ARTICLE_TYPES = {
  "Research article": "research-article",
  "Feature article": "feature-article",
  "Insight": "insight",
  "Correction": "correction",
  "Short report": "short-report",
  "Editorial": "editorial",
  "Research advance": "research-advance",
  "Registered report": "registered-report",
};


// Browser.View Constructor
// ========
//

var BrowserView = function(controller) {
  View.call(this);

  this.controller = controller;
  this.$el.attr({id: "container"});

  // Elements
  // --------

  // Search bar
  // ------------

  this.searchbarView = new SearchbarView(this.controller.searchQuery, {
    getSuggestions: _.bind(this.controller.getSuggestions, this.controller)
  });

  // List of found documents
  // ------------
  // 

  this.facetsEl = $$('#facets');
  this.documentsEl = $$('#documents');
  this.documentsEl.appendChild($$('.no-result', {text: "Loading documents ..."}));

  this.previewEl = $$('#preview');


  // Wrap what we have into a panel wrapper
  this.panelWrapperEl = $$('.panel-wrapper');
  this.panelWrapperEl.appendChild(this.facetsEl);
  this.panelWrapperEl.appendChild(this.documentsEl);
  this.panelWrapperEl.appendChild(this.previewEl);
  
  // Loading spinner
  this.progressbarEl = $$('.progress-bar', {
    html: '<div class="progress loading"></div>'
  });

  // Event handlers
  // ------------

  this.$el.on('click', '.available-facets .value', _.bind(this.toggleFilter, this));
  this.$el.on('click', '.document .toggle-preview', _.bind(this.togglePreview, this));

  this.$el.on('click', '.show-more', _.bind(this._preventDefault, this));

  // Each time the search query changes we re-render the facets panel
  this.controller.searchQuery.on('query:changed', _.bind(this.renderFacets, this));
};

BrowserView.Prototype = function() {

  this._preventDefault = function(e) {
    e.preventDefault();
  };

  this.togglePreview = function(e) {
    e.preventDefault();

    var searchQuery = this.controller.searchQuery;
    var $documentEl = $(e.currentTarget).parent();
    var documentId = $documentEl.attr('data-id');
    var self = this;

    ga('send', 'event', 'preview', 'click', 'preview');

    var $preview = $documentEl.find('.preview');
    if ($preview.length > 0) {
      $preview.toggle();
    } else {
      this.showLoading();
      this.controller.loadPreview(documentId, searchQuery.searchStr, function(err) {
        self.renderPreview();
        self.hideLoading();
      });
    }
  };

  this.toggleFilter = function(e) {
    e.preventDefault();
    var facet = $(e.currentTarget).attr("data-facet");
    var facetValue = $(e.currentTarget).attr("data-value");

    ga('send', 'event', 'filter:'+facet+':'+facetValue, 'click', 'filters');

    this.controller.searchQuery.toggleFilter(facet, facetValue);
  };

  // Show the loading indicator
  this.showLoading = function() {
    $('.progress-bar').removeClass('done loading').show();
    _.delay(function() {
      $('.progress-bar').addClass('loading');
    }, 10);
  };

  // Hide the loading indicator
  this.hideLoading = function() {
    $(this.loadingEl).hide();
    $('.progress-bar').addClass('done');

    _.delay(function() {
      $('.progress-bar').hide();
    }, 1000);
  };

  // Rendering
  // ==========================================================================
  //

  // After state transition
  // --------------
  // 

  this.afterTransition = function(oldState, newState) {
    if (newState.id === "main") {
      if (!_.isEqual(newState.searchQuery, oldState.searchQuery)) {
        this.renderSearchResult();
        this.hideLoading();
      }
    }
  };

  this.renderPreview = function() {
    var previewData = this.controller.previewData;
    var documentId = previewData.document.id;

    if (this.controller.previewData) {
      var previewEl = new PreviewView(previewData);

      // Highlight previewed document in result list
      this.$('.document').each(function() {
        if (documentId === this.dataset.id) {
          this.appendChild(previewEl.render().el);
        }
      });
    }
  };

  this.renderFacets = function() {
    this.facetsView = new FacetsView(this.controller.searchResult.getFacets());
    this.facetsEl.innerHTML = "";
    this.facetsEl.appendChild(this.facetsView.render().el);
  };

  // Display initial search result
  this.renderSearchResult = function() {
    var searchStr = this.controller.state.searchQuery.searchStr;
    var filters = this.controller.state.searchQuery.filters;

    // Check if there's an actual search result
    if (!this.controller.searchResult) return;

    this.documentsEl.innerHTML = "";

    // Get filtered documents
    var documents = this.controller.searchResult.getDocuments();
    var searchMetrics = this.controller.searchResult.getSearchMetrics();
    
    if (documents.length > 0) {

      this.documentsEl.appendChild($$('.no-result', {text: searchMetrics.hits + " articles found"}));

      _.each(documents, function(doc, index) {
        var authors = [];

        // _.each(doc.authors, function(author) {
        //   var authorEl = $$('span.author.facet-occurence', {text: author});
        //   authors.push(authorEl);
        // }, this);

        // Matching filters
        // --------------

        var filtersEl = $$('.filters');
        _.each(filters, function(filterVals, key) {
          var docVals = doc[key];
          if (!_.isArray(docVals)) docVals = [docVals];

          _.each(filterVals, function(filterVal) {
            if (_.include(docVals, filterVal)) {
              var filterEl = $$('.filter', {text: filterVal});
              filtersEl.appendChild(filterEl);
            }
          });
        });

        var elems = [
          $$('.meta-info', {
            children: [
              $$('.article-type.'+ARTICLE_TYPES[doc.article_type], {html: doc.article_type+" "}),
              $$('.doi', {html: doc.doi+" "}),

              $$('.published-on', {text: "published on "+ util.formatDate(doc.published_on)})
            ]
          }),
          $$('.title', {
            children: [
              $$('a', { href: doc.url, target: "_blank", html: doc.title })
            ]
          }),
        ];

        if (doc.intro) {
          elems.push($$('.intro', {
            html: doc.intro
          }));
        }

        elems.push($$('.authors', {
          html: doc.authors_string
        }));

        // console.log('FILTERS', filtersEl.childNodes);
        if (filtersEl.childNodes.length > 0) {
          elems.push(filtersEl);  
        }

        var documentEl = $$('.document', {
          "data-id": doc.id,
          children: elems
        });


        // Render preview
        // -----------

        // var previewData = doc.fragments;
        // var documentId = previewData.document.id;

        if (doc.fragments) {
          var previewEl = new PreviewView({
            document: doc,
            fragments: doc.fragments,
            searchStr: searchStr
          });

          // Highlight previewed document in result list
          documentEl.appendChild(previewEl.render().el);
        }

        // // TODO: replace this with check doc.matches_count > 0
        // if (searchStr) {
        //   var togglePreviewEl = $$('a.toggle-preview', {href: "#", html: '<i class="fa fa-eye"></i> Show matches for "'+searchStr+'"'});
        //   documentEl.appendChild(togglePreviewEl);
        // }

        this.documentsEl.appendChild(documentEl);
      }, this);

    } else {
      // Render no search result
      this.documentsEl.appendChild($$('.no-result', {text: "Your search did not match any documents"}));
    }

    this.renderFacets();
  };

  this.render = function() {
    this.el.innerHTML = "";
    this.el.appendChild(this.searchbarView.render().el);
    this.el.appendChild(this.panelWrapperEl);
    this.el.appendChild(this.progressbarEl);
    return this;
  };

  this.dispose = function() {
    this.stopListening();
    if (this.mainView) this.mainView.dispose();
  };
};

// Export
// --------

BrowserView.Prototype.prototype = View.prototype;
BrowserView.prototype = new BrowserView.Prototype();

module.exports = BrowserView;

},{"./facets_view":24,"./preview_view":26,"./searchbar_view":29,"./util":30,"substance-application":2,"underscore":19}],24:[function(require,module,exports){
"use strict";

var _ = require("underscore");
var View = require("substance-application").View;
var $$ = require("substance-application").$$;

// FacetsView
// ========
//

var FacetsView = function(facets, options) {
  View.call(this);

  this.facets = facets;
  this.$el.addClass('facets');
};

FacetsView.Prototype = function() {

  // Rendering
  // ==========================================================================
  //

  this.render = function() {
    this.el.innerHTML = "";
    this.renderFacets();
    return this;
  };

  this.renderFacets = function() {
    this.availableFacets = $$('.available-facets');

    // Render facets
    _.each(this.facets, function(facet) {
      var facetEl = $$('.facet.'+facet.property);

      // Filter name
      facetEl.appendChild($$('.facet-name', { text: facet.name }));
      var facetValuesEl = $$('.facet-values');

      // Filter values + frequency in doc corpus
      _.each(facet.entries, function(facetEntry) {
        var icon;
        if (facetEntry.selected) {
          icon = 'fa-check-square-o';
        } else {
          icon = 'fa-square-o';
        }

        var label = facetEntry.name;

        var frequency = facetEntry.frequency;
        var scopedFrequency = facetEntry.scoped_frequency;
        var percentage = (scopedFrequency*100)/frequency;

        var facetValueEl = $$('a.value'+(facetEntry.selected ? '.selected' : '')+(scopedFrequency == 0 ? '.not-included' : ''), {
          href: "#",
          "data-facet": facet.property,
          "data-value": facetEntry.name,
          "children": [
            // $$('.label', {html: '<i class="fa '+icon+'"></i> '+label}),
            $$('.icon', {html: '<i class="fa '+icon+'"></i>'}),
            $$('.label', {html: label}),
            $$('.frequency',{
              children: [
                $$('.scoped-frequency-label', {text: facetEntry.scoped_frequency}),
                $$('.total-frequency-label', {text: facetEntry.frequency}),
                $$('.total-frequency-bar'),
                $$('.scoped-frequency-bar', {
                  style: "width: "+percentage+"%"
                })
              ]
            })
          ]
        });

        facetValuesEl.appendChild(facetValueEl);
      }, this);

      facetEl.appendChild(facetValuesEl);
      this.availableFacets.appendChild(facetEl);
    }, this);
    
    this.el.appendChild(this.availableFacets);

    // this.$('.facet.authors .facet-values').append($('<a class="show-more" href="#">Show 20 more</a>'));
    // this.updateFrequency();
  };

  this.dispose = function() {
    this.stopListening();
  };

};

// Export
// --------

FacetsView.Prototype.prototype = View.prototype;
FacetsView.prototype = new FacetsView.Prototype();

module.exports = FacetsView;
},{"substance-application":2,"underscore":19}],25:[function(require,module,exports){
"use strict";

var _ = require("underscore");
var Application = require("substance-application");
var BrowserController = require("./browser_controller");
var DefaultRouter = require("substance-application").DefaultRouter;

var LensBrowserApplication = function(config) {
  Application.call(this);
  this.controller = new BrowserController(this, config);
  var router = new DefaultRouter(this);
  this.setRouter(router);
};

LensBrowserApplication.Prototype = function() {
  var __super__ = Application.prototype;

  this.start = function(options) {
    __super__.start.call(this, options);

    // Inject main view
    this.el.appendChild(this.controller.view.render().el);

    if (!window.location.hash) {
      this.switchState([{ id: "main" }], { updateRoute: true, replace: true });
    }
  };
};

LensBrowserApplication.Prototype.prototype = Application.prototype;
LensBrowserApplication.prototype = new LensBrowserApplication.Prototype();

module.exports = LensBrowserApplication;

},{"./browser_controller":22,"substance-application":2,"underscore":19}],26:[function(require,module,exports){
"use strict";

var _ = require("underscore");
var View = require("substance-application").View;
var $$ = require("substance-application").$$;

// PreviewView
// ========
//

var PreviewView = function(model, options) {
  View.call(this);

  this.model = model;

  // Elements
  // --------

  this.$el.addClass('preview');
};

PreviewView.Prototype = function() {

  // Rendering
  // ==========================================================================
  //

  this.render = function() {
    this.renderPreview();
    return this;
  };

  this.renderPreview = function() {
    this.el.innerHTML = "";  
    var fragmentsEl = $$('.fragments');

    // if (this.model.fragments.length > 0) {
    //   var fragmentsIntroEl = $$('.intro', {html: this.model.fragments.length+' matches for "'+this.model.searchStr+'"'});
    //   fragmentsEl.appendChild(fragmentsIntroEl);
    // } else {
    //   var fragmentsIntroEl = $$('.intro', {html: 'No matches found'});
    //   fragmentsEl.appendChild(fragmentsIntroEl);
    // }

    _.each(this.model.fragments, function(fragment) {
      fragmentsEl.appendChild($$('.fragment', {
        children: [
          $$('.separator'),
          $$('.content', {html: fragment.content}),
          // $$('.links', {
          //   children: [
          //     $$('a', { href: this.model.document.url+"#content/"+fragment.id, html: '<i class="fa fa-external-link-square"></i> Read more', target: '_blank' })
          //   ]
          // })
        ]
      }));
    }, this);

    this.el.appendChild(fragmentsEl);
  };


  this.dispose = function() {
    this.stopListening();
  };
};

// Export
// --------

PreviewView.Prototype.prototype = View.prototype;
PreviewView.prototype = new PreviewView.Prototype();

module.exports = PreviewView;
},{"substance-application":2,"underscore":19}],27:[function(require,module,exports){
var _ = require("underscore");
var util = require("substance-util");

// Search Query Model
// =============================
// 
// An model abstraction for a search query, that is manipulated by a browser's searchbar

var SearchQuery = function(data, options) {
  this.searchStr = data.searchStr;
  this.filters = data.filters;
};

SearchQuery.Prototype = function() {

  this.addFilter = function(facet, value) {
    if (!this.filters[facet]) this.filters[facet] = [];
    this.filters[facet].push(value);
    this.trigger("query:changed");
  };

  this.removeFilter = function(facet, value) {
    var values = this.filters[facet];
    this.filters[facet] = _.without(values, value);
    if (values.length === 0) {
      delete this.filters[facet];
    }
    this.trigger("query:changed");
  };

  this.clearFilters = function() {
    this.filters = {};
    this.trigger("query:changed");
  };

  this.hasFilter = function(facet, value) {
    var values = this.filters[facet];
    if (!values) return false;
    return values.indexOf(value) >= 0;
  };

  this.toggleFilter = function(facet, value) {
    if (this.hasFilter(facet, value)) {
      this.removeFilter(facet, value);
    } else {
      this.addFilter(facet, value);
    }
  };

  this.removeLastFilter = function() {
    console.log('TODO: Implement.');
  };

  this.updateSearchStr = function(searchStr) {
    this.searchStr = searchStr;
    this.trigger("query:changed");
  };

  // Set new query data without triggering a change
  this.setQuery = function(query) {
    this.searchStr = query.searchStr;
    this.filters = query.filters;
  };

  // Get plain JSON version of the query
  this.toJSON = function() {
    return {
      searchStr: this.searchStr,
      filters: this.filters
    };
  };
};

SearchQuery.Prototype.prototype = util.Events;
SearchQuery.prototype = new SearchQuery.Prototype();

module.exports = SearchQuery;

},{"substance-util":11,"underscore":19}],28:[function(require,module,exports){
var _ = require("underscore");

// Search Result
// =============================
// 
// An model abstraction for the search result that the controller can operate on

var AVAILABLE_FACETS = require("./available_facets");

var LABEL_MAPPING = {
  subjects: "Subjects",
  article_type: "Article Type",
  organisms: "Organisms",
  authors: "Top Authors"
};

var SearchResult = function(data) {
  this.rawResult = data.result;
  this.searchQuery = data.searchQuery;
};

SearchResult.Prototype = function() {

  this.getSearchMetrics = function() {
    return {
      hits: this.rawResult.hits.total
    };
  };

  // Set of documents according to search result and set filters
  // ------------

  this.getDocuments = function() {
    var documents = [];
    _.each(this.rawResult.hits.hits, function(rawDoc) {
      var doc = JSON.parse(JSON.stringify(rawDoc._source));
      documents.push(_.extend(doc, {
        id: rawDoc._id,
        fragments: rawDoc.fragments,
        _score: rawDoc._score,
        title: rawDoc.highlight && rawDoc.highlight.title ? rawDoc.highlight.title[0] : rawDoc._source.title,
        authors_string: rawDoc.highlight && rawDoc.highlight.authors_string ? rawDoc.highlight.authors_string[0] : rawDoc._source.authors_string,
        intro: rawDoc.highlight && rawDoc.highlight.intro ? rawDoc.highlight.intro[0] : rawDoc._source.intro,
        doi: rawDoc.highlight && rawDoc.highlight.doi ? rawDoc.highlight.doi[0] : rawDoc._source.doi,
      }));
    });
    return documents;
  };

  this.getScopedFrequency = function(facet, value) {
    var facet = this.rawResult.aggregations[facet];

    if (!facet) return "0";
    var bucket = _.select(facet.buckets, function(bucket) {
      return bucket.key === value;
    });

    return bucket.length > 0 ? bucket[0].doc_count : "0";
  };

  this.getFacets = function() {
    var facets = [];
    var self = this;
    var aggregations = this.rawResult.aggregations;

    // console.log(JSON.stringify(this.rawResult.aggregations, null, "  "));

    _.each(LABEL_MAPPING, function(label, property) {
      var entries = [];

      if (AVAILABLE_FACETS[property]) {
        _.each(AVAILABLE_FACETS[property].buckets, function(bucket) {
          entries.push({
            name: bucket.key,
            frequency: bucket.doc_count,
            scoped_frequency: self.getScopedFrequency(property, bucket.key),
            selected: self.isSelected(property, bucket.key)
          });
        });
      } else if (property === "authors") {
        _.each(aggregations["authors"].buckets, function(bucket) {
          entries.push({
            name: bucket.key,
            frequency: bucket.doc_count,
            scoped_frequency: self.getScopedFrequency(property, bucket.key),
            selected: self.isSelected(property, bucket.key)
          });
        });
      }

      facets.push({
        name: label,
        property: property,
        entries: entries
      });
    });

    return facets;
  };

  // Returns true when a given facet value is set as a filter
  // ------------

  this.isSelected = function(facetName, value) {
    var filter = this.searchQuery.filters[facetName];
    if (!filter) return false;
    return filter.indexOf(value) >= 0;
  };
};

SearchResult.prototype = new SearchResult.Prototype();

module.exports = SearchResult;

},{"./available_facets":20,"underscore":19}],29:[function(require,module,exports){
"use strict";

var _ = require("underscore");
var View = require("substance-application").View;
var $$ = require("substance-application").$$;

var ICON_MAPPING = {
  "subjects": "fa-tags",
  "article_type": "fa-align-left",
  "organisms": "fa-leaf"
};

// SearchbarView Constructor
// ========
//

var SearchbarView = function(searchQuery, options) {
  View.call(this);

  // Model contains the search query
  this.searchQuery = searchQuery;
  this.options = options;

  // Elements
  // --------

  this.$el.addClass('searchbar');
  this.searchFieldEl = $$('.search-field');
  

  // Filters
  this.searchFieldFilters = $$('.search-field-filters');
  this.searchFieldEl.appendChild(this.searchFieldFilters);

  this.searchFieldInputEl = $$('input.search-field-input', {type: "text", placeholder: "Enter search term"});
  this.searchFieldEl.appendChild(this.searchFieldInputEl);

  this.searchButton = $$('a.search-button' , {href: "#", text: 'Search'});
  this.searchFieldEl.appendChild(this.searchButton);

  // Suggestions
  this.searchFieldSuggestionsEl = $$('.search-field-suggestions');
  $(this.searchFieldSuggestionsEl).hide();

  this.searchFieldEl.appendChild(this.searchFieldSuggestionsEl);

  // Search button
  this.el.appendChild(this.searchFieldEl);
  
  // Event handlers
  // ------------

  $(this.searchFieldInputEl).keyup(_.bind(this._updateSuggestions, this));
  $(this.searchFieldInputEl).keydown(_.bind(this._interpretKey, this));
  $(this.searchFieldInputEl).blur(_.bind(this._hideSuggestions, this));

  $(this.el).click(_.bind(this._hideSuggestions, this));
  this.$el.on('click', '.search-field-suggestion', _.bind(this._useKeyword, this));

  this.$el.on('click', '.remove-filter', _.bind(this._removeFilter, this));
  this.$el.on('click', '.clear-filters', _.bind(this._clearFilters, this));

  $(this.searchFieldInputEl).change(_.bind(this._updateSearchStr, this));

  this.searchQuery.on('query:changed', _.bind(this.updateView, this));
};

SearchbarView.Prototype = function() {

  this._updateSearchStr = function(e) {
    var searchStr = $(this.searchFieldInputEl).val();
    this.searchQuery.updateSearchStr(searchStr);

    e.preventDefault();
    console.log('updating searchstr');
  };

  this._removeFilter = function(e) {
    e.preventDefault();
    var facet = $(e.currentTarget).attr("data-facet");
    var filterVal = $(e.currentTarget).attr("data-value");
    this.searchQuery.removeFilter(facet, filterVal);
  };

  this._clearFilters = function(e) {
    e.preventDefault();
    this.searchQuery.clearFilters();
  };

  // Event handlers
  // --------
  //

  this._interpretKey = function(e) {
    var searchStr = $(e.currentTarget).val();
    if (e.keyCode === 40) {
      // arrow down
      this.nextSuggestion();
      e.preventDefault();
    } else if (e.keyCode === 38) {
      // arrow up
      this.prevSuggestion();
      e.preventDefault();
    } else if (e.keyCode === 13) {
      this.chooseSuggestion();
    }
  };

  this._updateSuggestions = function(e) {
    var searchStr = $(e.currentTarget).val();

    // ignore keyup/keydown/enter
    if (_.include([40, 38, 13],e.keyCode)) return;
    this.renderSuggestions(searchStr);
  };

  // Delay a bit so click handlers can be triggered on suggested elements
  this._hideSuggestions = function(e) {
    var el = this.searchFieldSuggestionsEl;
    _.delay(function() {
      $(el).hide();
    }, 200, this);
  };

  this._useKeyword = function(e) {
    var $el = $(e.currentTarget);
    // var facet = $el.attr('data-facet');
    var value = $el.attr('data-value');

    // this.searchQuery.addFilter(facet, value);
    this._hideSuggestions();
    // reset searchfield
    $(this.searchFieldInputEl).val(value).focus();

    this._updateSearchStr(e);
    e.preventDefault();
  };

  this.chooseSuggestion = function() {
    // when enter has been pressed
    var $activeSuggestion = this.$('.search-field-suggestion.active');

    if ($activeSuggestion.length > 0) {
      $activeSuggestion.trigger('click');
    } else {
      this._hideSuggestions();
    }
  };

  // Rendering
  // ==========================================================================
  //

  this.render = function() {
    this.updateView();
    return this;
  };

  // Render currently chosen filters
  // ------------------

  this.renderFilters = function() {
    this.searchFieldFilters.innerHTML = "";

    var filterCount = 0;
    _.each(this.searchQuery.filters, function(filterValues, facet) {
      _.each(filterValues, function(filterVal) {
        var filterEl = $$('.search-field-filter', {
          html: filterVal
        });
        if (filterCount<3) {
          this.searchFieldFilters.appendChild(filterEl);  
        }
        filterCount += 1;
      }, this);
    }, this);

    if (filterCount>3) {
      var andMoreEl = $$('.search-field-filter', {text: "and "+(filterCount-3)+" more"});
      this.searchFieldFilters.appendChild(andMoreEl);
    }

    if (filterCount>0) {
      var clearFiltersEl = $$('.search-field-filter', {
        children: [$$('a.clear-filters', {href: "#", text: "Clear Filters"})]
      });
      this.searchFieldFilters.appendChild(clearFiltersEl);      
    }
  };

  // Update the current view according to new data
  // ------------------

  this.updateView = function() {
    console.log('query changed... updating the view');

    // Set search string
    $(this.searchFieldInputEl).val(this.searchQuery.searchStr);

    // Re-render filters
    this.renderFilters();
  };

  // TODO: find simpler implementation for keyboard nav

  this.prevSuggestion = function() {
    var suggestionEls = this.searchFieldSuggestionsEl.childNodes;

    if (suggestionEls.length > 0) {
      var $activeEl = this.$('.search-field-suggestion.active');
      if ($activeEl.length === 0) {
        // select last element
        $(_.last(suggestionEls)).addClass('active');
      } else {
        $activeEl.removeClass('active');
        $activeEl.prev().addClass('active');
      }
    }
  };

  this.nextSuggestion = function() {
    var suggestionEls = this.searchFieldSuggestionsEl.childNodes;

    if (suggestionEls.length > 0) {
      var $activeEl = this.$('.search-field-suggestion.active');
      if ($activeEl.length === 0) {
        // select first element
        $(suggestionEls[0]).addClass('active');
      } else {
        $activeEl.removeClass('active');
        $activeEl.next().addClass('active');
      }
    }
  };

  // Render suggestions
  // ------------------

  this.renderSuggestions = function(searchStr) {
    var suggestions = this.options.getSuggestions(searchStr);
    
    if (suggestions.length === 0) {
      $(this.searchFieldSuggestionsEl).hide();
      return;
    }

    this.searchFieldSuggestionsEl.innerHTML = "";
    _.each(suggestions, function(suggestion) {
      var suggestionEl = $$('a.search-field-suggestion', {
        html: '<i class="fa '+ICON_MAPPING[suggestion.facet]+'"></i> '+ suggestion.value,
        href: "#",
        "data-value": suggestion.rawValue,
        "data-facet": suggestion.facet
      });
      this.searchFieldSuggestionsEl.appendChild(suggestionEl);
    }, this);

    $(this.searchFieldSuggestionsEl).show();
  };

  this.dispose = function() {
    this.stopListening();
  };
};


// Export
// --------

SearchbarView.Prototype.prototype = View.prototype;
SearchbarView.prototype = new SearchbarView.Prototype();

module.exports = SearchbarView;
},{"substance-application":2,"underscore":19}],30:[function(require,module,exports){
var MONTH_MAPPING = {
  "1": "January",
  "2": "February",
  "3": "March",
  "4": "April",
  "5": "May",
  "6": "June",
  "7": "July",
  "8": "August",
  "9": "September",
  "10": "October",
  "11": "November",
  "12": "December"
};

var util = {};

util.formatDate = function (pubDate) {
  var parts = pubDate.split("-");
  if (parts.length >= 3) {
    // new Date(year, month [, day [, hours[, minutes[, seconds[, ms]]]]])
    // Note: months are 0-based
    var localDate = new Date(parts[0], parts[1]-1, parts[2]);
    return localDate.toUTCString().slice(0, 16);
  } else if (parts.length === 2) {
    var month = parts[1].replace(/^0/, "");
    var year = parts[0];
    return MONTH_MAPPING[month]+" "+year;
  } else {
    return year;
  }
};

module.exports = util;
},{}],31:[function(require,module,exports){

},{}]},{},[1]);
