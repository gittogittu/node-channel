function Chat(ui, home) {
  this.init(home);
  this.bindUi(ui);
}

Chat.prototype.init = function(home) {
  this.server = home.server;
  this.channel = null;
  this.user = null;
  this.users = [];
};

Chat.prototype.createRoom = function() {
  var name = $.cookie('pastechat.name');
  var prompt = this.ui.joinModal('Create Room');
  var self = this;

  prompt.addCallback(function(prompt) {
    prompt.activity('Creating Room');

    self.server.createChannel()
      .addErrback(function(e) {
        prompt.error(e);
      })
      .addCallback(function(channel) {
        prompt.close();
        self.bindChannel(channel);

        self.user = new User({
          name: prompt.name,
          _client_id: self.server.options.client_id
        });
        self.channel.emit('join', {name: prompt.name});
        $.cookie('pastechat.name', prompt.name, {expires: 365});
      });
  });

  if (name) {
    prompt.emitName(name);
  }
};

Chat.prototype.joinRoom = function(id) {
  var name = $.cookie('pastechat.name');
  var prompt = this.ui.joinModal('Join Room'), self = this;

  prompt.addCallback(function(prompt) {
    prompt.close();

    var channel = self.server.connectChannel(id);
    channel.since = 0;
    self.bindChannel(channel);

    self.user = new User({
      name: prompt.name,
      _client_id: self.server.options.client_id
    });
    self.channel.emit('join', {name: prompt.name});
    $.cookie('pastechat.name', prompt.name, {expires: 365});
  });

  if (name) {
    prompt.emitName(name);
  }
};

Chat.prototype.connectRoom = function(id) {
  var promise = new node.Promise();

  var modal = this.ui.modal({
    type: 'wait',
    vars: {text: 'Looking for chat room ..'}
  });

  var request = this.server.request('get', '/'+id, {_exists: true}), self = this;
  request
    .addCallback(function() {
      modal.overlay.close();
      promise.emitSuccess();
      self.joinRoom(id);
    })
    .addErrback(function() {
      modal.overlay.close();
      promise.emitError();
    });

  return promise;
};

Chat.prototype.bindChannel = function(channel) {
  var self = this;

  this.channel = channel;

  channel
    .addListener('join', _.bind(this._handleJoin, this))
    .addListener('leave', _.bind(this._handleLeave, this))
    .addListener('message', _.bind(this._handleMessage, this))
    .addListener('topic', _.bind(this._handleTopic, this))
    .addListener('rename', _.bind(this._handleRename, this));

  channel.monitor
    .addListener('error', function(e) {
      if (e.error == 'error') {
        e.error = 'Oh no, the server just went down : (';
      }
      self.ui.errorModal(e);
    });

  channel.listen();

  window.location.hash = '#'+channel.id;
};

Chat.prototype.bindUi = function(ui) {
  this.ui = ui;

  var self = this;
  ui
    .addListener('message', function(text) {
      self.send(text);
    })
    .addListener('editTopic', function() {
      var prompt = self.ui.topicModal();
      prompt.addCallback(function(topic) {
        self.channel.emit('topic', {user: self.user.name, text: topic});
      });
    })
    .addListener('editName', function() {
      var prompt = self.ui.joinModal('Rename');
      prompt.addCallback(function(prompt) {
        prompt.close();
        $.cookie('pastechat.name', prompt.name, {expires: 365});
        self.channel.emit('rename', {
          oldUser: self.user.name,
          newUser: prompt.name
        });
      });
    });
};

Chat.prototype._handleJoin = function(user) {
  user = new User(user);
  this.users.push(user);

  user.isSelf = false;
  if (user.client_id == this.user.client_id) {
    user.isSelf = true;
  }

  this.ui.userJoin(user);
  return user;
};

Chat.prototype._handleLeave = function(leaver) {
  leaver = _.detect(this.users, function(user) {
    return user.client_id == leaver._client_id;
  });

  if (!leaver) {
    return;
  }

  this.users = _.reject(this.users, function(user) {
    return user === leaver;
  });
  this.ui.userLeave(leaver);
};

Chat.prototype._handleMessage = function(message) {
  // Ignore messages we send ourselves unless this is request #1 (history fetch)
  var ignore = (message._client_id == this.user.client_id)
            && (this.channel.requestNum > 0);

  if (ignore) {
    return false;
  }
  this.ui.userMessage(message);
};

Chat.prototype._handleTopic = function(topic) {
  this.ui.updateTopic(topic);
};

Chat.prototype._handleRename = function(rename) {
  var renamer = _.detect(this.users, function(user) {
    return user.client_id == rename._client_id;
  });

  renamer.name = rename.newUser;

  if (renamer.client_id == this.user.client_id) {
    this.user = renamer;
  }

  this.ui.userRename(renamer, rename.oldUser);
};

Chat.prototype.send = function(message) {
  message = {user: this.user.name, text: message};
  this.channel.emit('message', message);
  this.ui.userMessage(message);
};