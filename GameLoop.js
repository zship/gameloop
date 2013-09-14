//slightly modified from https://github.com/zship/joss/blob/develop/src/jossx/GameLoop.js
//MIT license

/*
 * Implements a fixed-timestep game loop
 * http://gafferongames.com/game-physics/fix-your-timestep/
 */
(function(ns) {

  // requestAnimationFrame polyfill by Erik Möller
  // fixes from Paul Irish and Tino Zijdel
  (function () {

    var lastTime = 0;
    var vendors = [ 'ms', 'moz', 'webkit', 'o' ];

    for ( var x = 0; x < vendors.length && !window.requestAnimationFrame; ++ x ) {
      window.requestAnimationFrame = window[ vendors[ x ] + 'RequestAnimationFrame' ];
      window.cancelAnimationFrame = window[ vendors[ x ] + 'CancelAnimationFrame' ] || window[ vendors[ x ] + 'CancelRequestAnimationFrame' ];
    }

    if ( !window.requestAnimationFrame ) {
      window.requestAnimationFrame = function (callback) {
        var currTime = Date.now(), timeToCall = Math.max( 0, 16 - ( currTime - lastTime ) );
        var id = window.setTimeout( function() { callback( currTime + timeToCall ); }, timeToCall );
        lastTime = currTime + timeToCall;
        return id;
      };
    }

    if ( !window.cancelAnimationFrame ) {
      window.cancelAnimationFrame = function ( id ) { window.clearTimeout( id ); };
    }

  }());


  //basic performance.now polyfill (simplify code below)
  window.performance = window.performance || {};
  window.performance.timing = window.performance.timing || {};
  window.performance.timing.navigationStart =
    window.performance.timing.navigationStart ||
    new Date().getTime();

  window.performance.now =
    window.performance.now ||
    window.performance.mozNow ||
    window.performance.msNow ||
    window.performance.oNow ||
    window.performance.webkitNow ||
    function() { return new Date().getTime() - window.performance.timing.navigationStart; };


  var GameLoop = function(opts) {

    opts = $.extend(true, {
      logic: null, //function(prevState, t, dt)
      interpolate: null, //function(prevState, currState, alpha)
      draw: null, //function(state)
      dt: 1/60
    }, opts);

    this._interpolateCallbackDefined = !!opts.interpolate || this['gameloop.interpolate'];

    //if subclassing, allow callbacks to be defined as members of the subclass
    this._logicCallback = opts.logic || this['gameloop.logic'];
    this._interpolateCallback = opts.interpolate || this['gameloop.interpolate'];
    this._drawCallback = opts.draw || this['gameloop.draw'];
    this._dt = opts.dt;
    this._t = 0;

    this._events = [];
    this._eventSync = {};

    this._killed = false;
    this._running = false;

  };


  GameLoop.prototype.start = function() {

    this._killed = false;
    this._running = true;
    this._accumulator = 0;

    var currentTime = window.performance.now();
    var previousState = null;
    var currentState = null;

    var loop = function() {

      if (this._killed) {
        this._running = false;
        return;
      }

      var changed = false;
      var now = window.performance.now();
      var frameTime = (now - currentTime) / 1000;
      currentTime = now;

      //max frame time to avoid spiral of death
      if (frameTime > this._dt * 25) {
        frameTime = this._dt * 25;
      }

      this._accumulator += frameTime;

      while (this._accumulator >= this._dt) {
        previousState = currentState;
        currentState = this._logicCallback(previousState, this._t, this._dt);
        this._t += this._dt;
        this._accumulator -= this._dt;
        changed = true;

        this._eventSync.internal = this._t;
        this._eventSync.external = window.performance.now();

        //console.time('sync t: ' + this._eventSync.internal + ', sync ext: ' + this._eventSync.external);
        //console.timeEnd('sync t: ' + this._eventSync.internal + ', sync ext: ' + this._eventSync.external);
      }

      //reminder: mutating state in below callbacks will carry over
      //into this._logicCallback's previousState arg
      if (this._interpolateCallbackDefined && currentState && previousState) {
        var state = this._interpolateCallback(previousState, currentState, this._accumulator/this._dt);
        this._drawCallback(state);
      }
      //if interpolation is not being used, don't render partial time steps
      else if (changed) {
        this._drawCallback(currentState);
      }

      window.requestAnimationFrame(loop);

    }.bind(this);

    loop(currentTime);

  };


  GameLoop.prototype.stop = function() {
    //set kill flag, wait for the current tick to finish
    var deferred = $.Deferred();
    this._killed = true;
    var interval = window.setInterval(function() {
      if (!this._running) {
        window.clearInterval(interval);
        deferred.resolve();
      }
    }.bind(this), 0);
    return deferred;
  };


  GameLoop.prototype.pushEvent = function(obj) {
    var now = window.performance.now();
    var dt = (now - this._eventSync.external) / 1000;
    var t = this._eventSync.internal + dt;
    /*
     *console.time('pushEvent t: ' + t + ', ext:' + now);
     *console.timeEnd('pushEvent t: ' + t + ', ext:' + now);
     */

    this._events.push({
      t: t,
      obj: obj
    });
  };


  GameLoop.prototype.consumeEvents = function() {
    var ret = [];
    var events = [];
    var isLastLogicRun = (this._accumulator - this._dt < this._dt);

    for (var i = 0; i < this._events.length; i++) {
      if (this._events[i].t <= this._t + this._dt || isLastLogicRun) {
        /*
         *if (this._events[i].obj.x) {
         *  console.time('t: ' + this._events[i].t + ', consumed: ' + this._events[i].obj.x + ', count: ' + events.length);
         *  console.timeEnd('t: ' + this._events[i].t + ', consumed: ' + this._events[i].obj.x + ', count: ' + events.length);
         *}
         */
        ret.push(this._events[i].obj);
      }
      else {
        events.push(this._events[i]);
      }
    }

    this._events = events;
    return ret;
  };


  ns.GameLoop = GameLoop;

})(window);
