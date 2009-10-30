var multipart = require('/multipart.js');

exports.Request = function(req, res) {
  node.EventEmitter.call(this);

  this.req = req;
  this.res = res;

  this.method = this.req.method.toLowerCase();
  this.uri = this.req.uri;
  this.body = {};

  this.response = null;
};
node.inherits(exports.Request, node.EventEmitter);

exports.Request.prototype.respond = function(code, response) {
  this.response = {code: code, response: response};

  response = JSON.stringify(response);

  var jsonp = this.req.uri.params.callback;
  if (jsonp) {
    response = jsonp + '('+response+')';
    this.res.sendHeader(200, {'Content-Type': 'text/javascript'});
  } else {
    this.res.sendHeader(code, {'Content-Type': 'text/javascript'});
  }
  
  this.res.sendBody(response);
  this.res.finish();
};

exports.Request.prototype.parse = function() {
  var promise = new node.Promise();

  if (this.method === 'get') {
    setTimeout(function() {
      promise.emitSuccess();
    });
    return promise;
  }

  var self = this, parser = new multipart.parse(this.req);
  parser
    .addErrback(function() {
      promise.emitError();
    })
    .addCallback(function(parts) {
      self.body = parts;
      if ('json' in self.body) {
        try {
          self.body = JSON.parse(self.body.json);
        } catch (e) {
          return promise.emitError();
        }
      }
      promise.emitSuccess();
    });
  return promise;
};