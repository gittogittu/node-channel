var http = require('/http.js');
var multipart = require('/multipart.js');
var utils = require('/utils.js');

var _ = require('/dep/underscore.js');
var uuid = require('misc.js').uuid;
var Request = require('request.js').Request;
var Channel = require('channel.js').Channel;

var Server = exports.Server = function() {
  node.EventEmitter.call(this);

  this.channels = {};
  this.responses = {};

  this.httpServer = http.createServer(_.bind(this._handleRequest, this));
}
node.inherits(Server, node.EventEmitter);

Server.prototype._handleRequest = function(req, res) {
  var request = new Request(req, res), self = this;

  request
    .parse()
    .addErrback(function() {
      request.respond(400, {error: 'Could not parse request.'});
    })
    .addCallback(function() {
      var route = _.detect(self.routes, _.bind(self.router, self, request))[2];
      route.call(self, request);

      // Store iframe submit responses so they can be fetched later on
      if (request.body._request_id) {
        self.responses[request.body._request_id] = request.response;
      }
    });
};

Server.prototype.routes = [
  ['get', '/:channel-id', function(request) {
    if (request.uri.params._exists) {
      return request.respond(200, {ok: true});
    }

    var since = parseInt(request.uri.params.since || 0, 10);
    request.channel.onHistory(since, function(history) {
      request.respond(200, {
        ok: true,
        since: since,
        history: history
      });
    });
  }],
  ['post', '/:channel-id', function(request) {
    var events = request.body;
    for (var i = 0; i < events.length; i++) {
      var event = events[i], args = event.args;
      args.unshift(event.name);
      request.channel.emit.apply(request.channel, args);
    }

    request.respond(200, {
      ok: true
    });
  }],
  ['get', '/', function(request) {
    request.respond(200, {ok: true, welcome: 'node-channel'})
  }],
  ['get', '/_response', function(request) {
    var request_id = request.uri.params._request_id;
    if (!request_id) {
      return request.respond(400, {error: 'No "_request_id" was given'});
    }

    var response = this.responses[request_id];
    if (!response) {
      return request.respond(404, {
        error: 'Unknown "_request_id": '+JSON.stringify(request_id)
      });
    }

    request.respond(response.code, response.response);
  }],
  ['post', '/_create_channel', function(request) {
    var id = uuid();
    var channel = this.createChannel(id);

    request.respond(200, {
      ok: true,
      id: id
    });
  }],
  [/.*/, /.*/, function(request) {
    request.respond(404, {error: 'Unknown route or channel'})
  }]
];

Server.prototype.router = function(request, route) {
  var method = route[0], url = route[1];

  if (typeof method == 'string' && request.method !== method) {
    return false;
  } else if (method.constructor == RegExp && !request.method.match(method)) {
    return false;
  }

  if (url == '/:channel-id') {
    var id = request.uri.path.substr(1);
    if (id in this.channels) {
      request.channel = this.channels[id];
      return true;
    }
    return false;
  }

  if (typeof url == 'string' && request.uri.path !== url) {
    return false;
  } else if (url.constructor == RegExp && !request.uri.path.match(url)) {
    return false;
  }

  return true;
};

Server.prototype.listen = function(port) {
  this.httpServer.listen(port);
};

Server.prototype.createChannel = function(id) {
  var channel = new Channel(id);
  return this.channels[id] = channel;
};