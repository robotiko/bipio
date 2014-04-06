/**
 *
 * Shared Bips list
 *
 */
define([
  'underscore',
  'backbone',
  'bipclient',
  'views/channel/v_channel_pod_list',
  'views/channel/v_channel_config'
  ], function(_, Backbone, BipClient, PodListView, ChannelConfigView){
    BipSharedView = Backbone.View.extend({
      el: '#bip-setup',

      tplSharedContainer : _.template($('#tpl-shared-bips').html()),
      tplSharedEntity : _.template($('#tpl-shared-bip-entity').html()),
      tplPaginate :  _.template($('#tpl-pagination').html()), // paginator
      tplActionEntity : _.template($('#tpl-action-entity').html()),

      manifestPending : [],
      manifestDup : {},
      manifestResolved : {},
      shareModal : null,
      podSetupView : null,
      channelConfigView : null,

      _configStep : false,

      _activeChannel : null,
      _activeShare : null,
      channelQueue : {},
      channelConfigs : {},

      tplModal : _.template($('#tpl-modal-share-setup').html()),
      channelSelectView : null,
      hubView : null,
      events: {
        'click button' : 'buttonClick',
        'click a.prev' : 'previous',
        'click a.next' : 'next'
      },
      initialize:function () {
        var self = this;
        _.bindAll(
          this,
          'render',
          'previous',
          'next',
          'buttonClick',
          'setShare',
          '_setupStart',
          '_createChannel',
          '_resolveManifest',
          '_unpackManifest',
          '_normalizeTransform'
          );
        this.collection = BipClient.getCollection('bip_shares');
        this.collection.bind('reset', this.render);

        this.podSetupView = new PodListView();
        this.channelConfigView = new ChannelConfigView();

        BipClient.authStatusChangeEvent.on(function(args) {
          var c, channels;
          if ('accepted' === args.newstatus && self.channelQueue[args.provider] && self.channelQueue[args.provider].length > 0) {
            for (var i = 0; i < self.channelQueue[args.provider].length; i++) {
              c = self.channelQueue[args.provider][i];
              // check if action was auto-installed
              channels = BipClient.getCollection('channel').where({
                action : args.provider + '.' + c.action
              } );
              
              // config is inline with issuer token auth, so skip config step
              var isToken = BipClient.getCollection('pod').get(args.provider).get('auth').type === 'issuer_token';
              
              if (channels.length === 0) {
                if (!isToken) {
                  if (Object.keys(c.config).length) {
                    self._configStep = true;
                  }
                  self._setupStep();
                } else {
                  self._configStep = false;
                  self._createChannel(args.provider, c.action, c.config, c.description, function(channel) {
                    self._resolveManifest(channel);  
                  });
                }
              } else {
                self._resolveManifest(channels[0]);
              }
            }
          } else {
            self._setupStep(args);
          }
        });
      },

      setShare : function(id) {
        this._activeShare = this.collection.get(id);
        return this._activeShare;
      },

      render : function(id, mode) {
        var dict,
        tokens,
        pods = BipClient.getCollection('pod'),
        action,
        self = this,
        skipManifest;

        this.$el.fadeOut(200, function() {

          self.$el.html(self.tplSharedContainer());
          var el = $('#bips-list-shared', self.$el);

          for (var i = 0; i < self.collection.models.length; i++) {
            dict = self.collection.models[i].toJSON();
            dict.type_description = '';
            switch (dict.type) {
              case 'http' :
                dict.type_description = 'HTTPS Endpoint';
                dict.type_icon = 'bip_http.png';
                break;
              case 'smtp' :
                dict.type_description = 'Email Address';
                dict.type_icon = 'bip_smtp.png';
                break;
              case 'trigger' :
                skipManifest = dict.config.channel_id;
                tokens = dict.config.channel_id.split('.');
                action = pods.get(tokens[0]).get('actions')[tokens[1]]
                dict.type_description = 'Event Trigger - ' + action.description;
                dict.type_icon = tokens[0] +  '.png';
                break;
              default :
                break;
            }

            dict.normedManifest = [];
            // normalize actions
            for (var j = 0; j < dict.manifest.length; j++) {
              if (dict.manifest[j] !== 'source' && skipManifest !== dict.manifest[j]) {
                tokens = dict.manifest[j].split('.');
                action = pods.get(tokens[0]).get('actions')[tokens[1]];
                dict.normedManifest.push({
                  pod : tokens[0],
                  action : tokens[1],
                  description : action.description,
                  description_long : action.description_long
                });
              }
            }
            el.append(self.tplSharedEntity(dict));
            $('.tooltipped').tooltip();
          }

          listPaginate = $('.shared-list-pagination');
          listPaginate.html(self.tplPaginate(self.collection.pageInfo()));

          $('a.prev', listPaginate).on('click', this.previous);
          $('a.next', listPaginate).on('click', this.next);

          self.$el.fadeIn(200);
        });
      },

      previous: function(ev) {
        ev.preventDefault();
        if ($(ev.currentTarget).hasClass('disabled')) {
          return;
        }
        this.collection.prevPage();
        return false;
      },

      next: function(ev) {
        ev.preventDefault();
        if ($(ev.currentTarget).hasClass('disabled')) {
          return;
        }
        this.collection.nextPage();
        return false;
      },

      _actionTranslate : function(action) {
        return BipClient.getCollection('channel').getChannelJSONAction(action.replace('-', '.'));
      },

      // given a template denormalized by pod action, tries to interpolate channel id's
      _normalizeTransform : function(template) {
        return template;
      },

      // assemble the share.  Here we interpolate the active accounts
      // matching actions channel id's into the hub config and
      // push it into a new bip setup for final approval.
      _unpackManifest : function() {
        // config, name, hub and note are all we care about
        var share = this._activeShare.toJSON(),
        struct = {
          config : {},
          name : share.name,
          note : share.note,
          type : '',
          hub : {}
        },
        hub = share.hub,
        edges,
        cid, hubCid;

        struct.type = share.type;

        if (struct.type === 'trigger' && share.config.channel_id) {
          struct.config.channel_id = this._actionTranslate(share.config.channel_id);
        }

        for (var src in hub) {
          if (hub.hasOwnProperty(src)) {
            hubCid = (src === 'source') ? src : this._actionTranslate(src);

            struct.hub[hubCid] = {
              edges : [],
              transforms : {}
            };

            // translate edges
            for (var i = 0; i < hub[src].edges.length; i++)  {
              struct.hub[hubCid].edges.push(
                this._actionTranslate(hub[src].edges[i])
                );
            }

            // translate transforms
            for (var key in hub[src].transforms) {
              if (hub[src].transforms.hasOwnProperty(key)) {
                for (var transformCID in hub[src].transforms) {
                  if (hub[src].transforms.hasOwnProperty(transformCID)) {
                    cid = this._actionTranslate(transformCID);
                    struct.hub[hubCid].transforms[cid] = {}
                    for (var localImport in hub[src].transforms[transformCID]) {
                      if (hub[src].transforms[transformCID].hasOwnProperty(localImport)) {
                        struct.hub[hubCid].transforms[cid][localImport] = this._normalizeTransform(hub[src].transforms[transformCID][localImport]);
                      }
                    }
                  }
                }
              }
            }
          }
        }

        return struct;
      },

      _setupStart : function(description) {
        var dict = {
          normedManifest : [],
          description : description,
          authRequired : false,
          configRequired : false
        },
        tokens,
        pods = BipClient.getCollection('pod'),
        pod,
        action,
        self = this;

        this.shareModal = $('#sharedModal');

        // pending channel creates
        for (var i = 0; i < this.manifestPending.length; i++) {
          tokens = this.manifestPending[i].split('.');
          pod = pods.get(tokens[0]);

          action = pod.get('actions')[tokens[1]];
          dict.normedManifest.push({
            pod : tokens[0],
            action : tokens[1],
            description : action.description,
            description_long : action.description_long,
            schema : action
          });

          if (!dict.authRequired) {
            var auth = pod.get('auth');
            if (auth && auth.type !== 'none' && auth.status !== 'accepted') {
              dict.authRequired = true;
            }
          }

          if (!dict.configRequired &&
            action.config.properties && Object.keys(action.config.properties).length) {
            dict.configRequired = true;
          }
        }

        this.shareModal.html(this.tplModal(dict));
        $('.tooltipped').tooltip();

        $('.modal-continue', this.shareModal).click(function(ev) {
          ev.preventDefault();
          self._setupStep();
        });

        $('div:first-child', this.shareModal).first().modal();
      },

      _createChannel : function(pod, action, config, name, cb) {
        var self = this,
        payload = {
          action : pod + '.' + action,
          config : config,
          name : name
        },
        model = BipClient.getCollection('channel').newModel();

        model.save(payload, {
          success : function(model, response, options) {
            BipClient.getCollection('channel').fetch({
              reset : true,
              success : function() {
                cb(model);
              }
            });
          },
          error : function(model, xhr, options) {
            BipClient.growl('An Irrecoverable Error Occurred', 'error');
          }
        });
      },

      _resolveManifest : function(channel) {
        this.manifestResolved[channel.get('action')] = channel;
        this._setupStep();
      },

      /**
      * where
      *      pending needs auth - supply auth,
      *      pending needs config - supply config
      *      dups exist - select preference
      *
      */
      _setupStep : function() {
        var template = {},
        self = this;

        if (this._configStep) {
          this._configStep = false;
          $('#action', this.shareModal).prop('checked', true);

          //
          var config = self.channelConfigView.serialize(),
          tokens = config.action.split('.'),
          podName = tokens[0], action = tokens[1],
          pod =  BipClient.getCollection('pod').get(podName);

          this._createChannel(
            podName,
            action,
            config.config,
            pod.get('actions')[action].description,
            this._resolveManifest
            );

        // pop the first pending step
        } else if (this.manifestPending.length > 0) {
          var tokens = this.manifestPending.shift().split('.'),
          podName = tokens[0],
          action = tokens[1],
          pod = BipClient.getCollection('pod').get(podName),
          activeClass = '',
          config;


          template.type = 'pod_enable';
          template.pod = pod.toJSON();
          template.action = pod.get('actions')[action];
          config = template.action.config;

          template.reqConfig = config.properties.length > 0;

          // look for non-optional configs
          var optional = true;
          for (var i = 0; i < config.properties.length; i++) {
            if ( config.properties[i].optional === false ) {
              optional = false;
            }
          }

          if (!optional || template.pod.auth.status != 'accepted' ) {

            this._activeChannel = BipClient.getCollection('channel').newModel();

            var innerContent = self.channelConfigView.render(
              pod,
              action,
              template.action,
              BipClient.getCollection('channel').newModel({
                action : pod + '.' + action
              }),
              activeClass
              );

            // inject token setter
            if (template.pod.auth.type === 'issuer_token') {
              innerContent += self.podSetupView.tplAuthIsuuerToken(pod.toJSON());
            }

            $('#share-setup-content', this.shareModal).html(innerContent);

            $('#share-setup-content h4', this.shareModal).
            prepend('<img class="mini" data-placement="top" title="' + pod.get('description') + '" src="/static/img/channels/32/color/' + podName + '.png"/> ');

            $('#share-setup-action', this.shareModal).
            removeClass('modal-continue').
            addClass('modal-authenticate').
            html('Activate').
            attr('data-model-id', podName);

            $('.modal-authenticate', this.shareModal).unbind('click').click(function(ev) {
              if (!self.channelQueue[podName]) {
                self.channelQueue[podName] = [];
              }

              self.channelQueue[podName].push({
                action : action,
                config : self.channelConfigView.serialize().config,
                description : template.action.description
              });

              var model;
              if (template.pod.auth.type === 'issuer_token') {
                model = BipClient.getCollection('pod').get('pod');
                self._configStep = false;
              }

              self.podSetupView.verify(
                ev, 
                true, 
                $('.modal-authenticate').closest('.modal').find('form').serializeArray(), 
                model
              );

            });
          } else {
            if (Object.keys(config).length && !self.channelConfigs[podName + '.' + action]) {
              var innerContent = self.channelConfigView.render(
                pod,
                action,
                template.action,
                BipClient.getCollection('channel').newModel({
                  action : pod + '.' + action
                })
                );

              $('#share-setup-content', self.shareModal).html(innerContent);

              this._configStep = true;

            } else {

              this._createChannel(
                podName,
                action,
                self.channelConfigs[podName + '.' + action],
                template.action.description,
                this._resolveManifest
                );
            }
          }
        } else if (Object.keys(this.manifestDup).length > 0) {
          template.type = 'action_dedup';
        } else {
          //this._unpackManifest();
          setTimeout(function() {
            $('.modal', this.shareModal).modal('hide');
          }, 1000);

          this.trigger('shared-install', this._activeShare.id);
        }

        //
        $('.tooltipped').tooltip();
      },

      buttonClick : function(ev) {
        var src = $(ev.currentTarget),
        type = src.attr('data-action'),
        self = this,
        shareId = src.attr('data-share-id');

        this.setShare(shareId);

        if (type === 'install') {
          var manifest = this._activeShare.get('manifest'),
          channels = BipClient.getCollection('channel'),
          channelActions = {},
          c, action;

          this.manifestPending = [];
          this.manifestDup = {};
          this.manifestResolved = {};

          for (var i = 0; i < channels.models.length; i++) {
            c = channels.models[i];
            action = c.get('action');
            if (!channelActions[action]) {
              channelActions[action] = [];
            }
            channelActions[action].push(c);
          }

          for (i = 0; i < manifest.length; i++ ) {
            action = manifest[i];
            if (action !== 'source') {
              if (!channelActions[manifest[i]]) {
                this.manifestPending.push(action);
              //} else if (channelActions[action].length > 1) {
              //this.manifestDup[action] = channelActions[action]
              } else {
                this.manifestResolved[action] = channelActions[action][0]
              }
            }
          }

          if (this.manifestPending.length > 0 || Object.keys(this.manifestDup).length > 0) {
            this._setupStart(this._activeShare.get('note'));
          } else {
            this.trigger('shared-install', this._activeShare.id);
          }
        } else if (type === 'uninstall') {
          BipClient.unShare(this._activeShare.get('id'), function(err, resp) {
            if (err) {
              BipClient.growl(resp, 'error');
            } else {
              BipClient.growl('Bip UnShared');
            }
            self.collection.fetch({
              reset : true
            });
          });
        }
      }
    });

    return BipSharedView;
  });