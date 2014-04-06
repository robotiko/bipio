define([
  'underscore',
  'backbone',
  'bipclient',
  'models/m_channel',
  'models/m_bip',
  'views/channel/v_channel_bip_list',
  'views/channel/v_channel_config',
  'views/channel/v_channel_logs'
  ], function(_, Backbone, BipClient, ChannelModel, BipModel, ChannelBipList, ChannelConfigView, ChannelLogsView){
    // Individual Pod
    var PodListView = Backbone.View.extend({
      el : '#channel-setup',

      tplModal : _.template($('#tpl-modal-auth').html()),
      tplAuthIsuuerToken : _.template($('#tpl-auth-issuer-token').html()),

      tplPodSelect : _.template($('#tpl-pod-select').html()),
      tplPodEntity : _.template($('#tpl-pod-entity').html()),

      tplActionSelect : _.template($('#tpl-action-select').html()),
      //tplActionEntity : _.template($('#tpl-action-entity').html()),

      tplPostSave : _.template($('#tpl-post-save-dialog').html()),

      events: {
        "click .btn-verify" : "verify",
        "click .pod-select" : "podSelect",
        "click .cancel-channel" : "_renderPods",
        "click .save-channel" : "saveChannel",
        // "click .remove-channel" : "remove"
        "click #channel-delete-confirm" : "remove"
      },

      model : null,
      _router : null,
      configView : null,

      initialize: function(container, router){
        _.bindAll(
          this,
          'render',
          'renderRow',
          'updateRow',
          'verify',
          'verifyIssuerToken',
          'podSelect',
          'saveChannel',
          'remove',

          //
          '_setupExtra',

          // validation
          'validatedPublish',
          'invalidModel',
          'errTranslate',
          '_credentialError',

          '_renderPods',
          '_renderChannel'
          //'_attachChannelOptions'
          );

        this.collection = BipClient.getCollection('pod');
        this.collection.bind('reset', this.render);
        this.collection.bind('change', this.render);
        this._router = router;
        this._configView = new ChannelConfigView();
      },

      render: function(id) {
        if (id) {
          var model = BipClient.getCollection('channel').get(id),
          podTokens;

          if (model) {
            podTokens = model.get('action').split('.');

            this._renderChannel(model, this.collection.get(podTokens[0]));
            this.model = model;

          } else {
            BipClient.growl('Channel Does Not Exist', 'error');
            this._renderPods();
          }
        } else {
          this._renderPods();
        }
      },

      _renderPods : function() {
        var self = this;

        this.model = new ChannelModel();
        this.$el.html(this.tplPodSelect());

        var renderInto = $('#pod-list', this.$el);
        this.trigger('podSelected');

        this.collection.models.forEach( function (pod) {
          self.renderRow(pod, renderInto);
        });

        return this;
      },

      _renderChannel : function(channel, pod, cb, noconfig) {
        var actionList,
        actionJSON,
        actions = pod.get('actions'),
        activeClass = '',
        actionHTML,
        selectedAction = false,
        model = {
          'pod' : pod.toJSON(),
          'channel' : channel.toJSON(),
          'configure' : !noconfig, // just browsing mode
          'remainingActions' : Object.keys(actions).length
        },
        availableActions = {},
        self = this,
        haveAction;

        for (action in actions) {
          haveAction = BipClient.getCollection('channel').where({
            action : pod.get('name') + '.' + action
          } ).length > 0;
          if (channel.id && channel.get('action') == pod.get('name') + '.' + action) {
            selectedAction = true;
            activeClass = 'active';
          } else {
            selectedAction = false;
          }

          if (!noconfig &&
            (
              (actions[action].singleton && !channel.id && haveAction)
              || (channel.id && !selectedAction)
              )) {
            model.remainingActions--;
          } else {
            availableActions[action] = actions[action];
          }
        }

        model.configure = model.configure && model.remainingActions;
        this.trigger('podSelected', {
          pod : pod,
          channel : channel
        });

        this.$el.html(this.tplActionSelect(model));

        if (channel.id) {
          $('#renderers li').click(function() {
            var el = $(this);
            BipClient.openRenderer(el.attr('data-cid'), el.attr('data-renderer'));
            return false;
          });
        }

        actionList = $('.action-list', this.$el);

        if (model.remainingActions > 0) {
          actionList.empty();
        }

        for (action in availableActions) {
          if (channel.id && channel.get('action') == pod.get('name') + '.' + action) {
            selectedAction = true;
            activeClass = 'active';
          } else {
            selectedAction = false;
          }

          /*
                    if (!noconfig && ((availableActions[action].singleton && !channel.id) || (channel.id && !selectedAction))) {
                        continue;
                    }
*/
          actionList.append(
            this._configView.render(
              pod,
              action,
              availableActions[action],
              channel,
              activeClass
            )
          );

          activeClass = '';
        }

        $('.btn-group button').on('click', function(ev) {
          $(this).siblings("input[type=hidden]").val($(this).attr('data-selection'));
        });


        // action selected
        $('.action-list .action').click(function() {

          $('.action-list .action').prop('checked', false).trigger('change').removeClass('active');
          $('.action-list .action input').attr('disabled', true);

          var schema = BipClient.getCollection('pod').getActionSchema( $('input', $(this)).attr('value')  );
          if (self.model.isNew()) {
            $('#channel_name').val(schema.description);
          }

          $(this).find('input[name="action"]').prop('checked', true).trigger('change');
          $(this).addClass('active');
          $(this).find('input').removeAttr('disabled')
          //$('.save-channel').removeClass('disabled');
          $('.hidden', self.$el).removeClass('hidden');
          $('.action-selectable').not('.active').hide();

        });

        this.$el.tab().on('shown', function(e) {
          if (e.target.hash === '#channel_bips') {
            var target = $('#channel_bip_list', e.target.hash);
            // load the log
            if ('' === target.html()) {
              var cbl = new ChannelBipList(target, channel.id, self._router);
            }
          } else if (e.target.hash === '#channel-data-panel') {
            $('#channel-data-panel pre').html(
              jsl.format.formatJson(JSON.stringify(self.model.toJSON()))
              );
          } else if (e.target.hash === '#channel-logs-panel') {
            var target = $('#log-body', e.target.hash);

            // load the log
            if (!target.html()) {
              new ChannelLogsView(target, self.model.id);
            }
          }
          
          
        }).tab('show');

        if (cb) {
          cb();
        }
      },

      // translates from a model attribute to form, and renders an error
      errTranslate: function(isErr, attribute, error) {
        var el = $('#channel_' + attribute.replace('config.', ''), self.el).closest('.control-group');

        if (isErr) {
          el.addClass('error');
          el.find('.help-block').html(error);
        } else {
          el.removeClass('error');
          el.find('.help-block').empty();
        }
      },

      invalidModel : function(model, errors) {
        this.validatedPublish();

        this.errTranslate(false, 'name');
        this.errTranslate(false, 'note');

        for (key in errors) {
          this.errTranslate(true, key, errors[key]);
        }
      },

      // clear all validation errors
      validatedPublish : function(model, attr) {
        $('.control-group').removeClass('error');
        $('.help-block').empty();
      },

      _setupExtra : function(cid, create) {
        var self = this,
        modal,
        modalPreamble,
        bipStruct,
        channels =  BipClient.getCollection('channel'),
        channel;

        channel = channels.get(cid);
        var tokens = channel.getPodTokens(),
        pod = tokens[0],
        action = tokens[1];

        if ('syndication' === pod) {
          if ('subscribe' === action) {
            var cidSelect = '<select id="feed-target-cid" class="input input-medium">',
            // get first feed channel
            feedChannels = channels.where({
              action : pod + '.feed'
            });

            _.each(feedChannels, function(channel) {
              cidSelect += '<option value="' + channel.get('id') +'">' + channel.get('name') + '</option>';
            });

            cidSelect += '</select> or ';

            modalPreamble = 'Start Tracking';
            modal = $(this.tplPostSave({
              preamble : modalPreamble,
              body : 'This syndication can be tracked right away to one of your existing feed channels '
              + (feedChannels.length ? cidSelect : '')
              + ' New Private Container <input style="width:230px" class="input pull-right" type="text" id="new-feed-name" placeholder="Container Name" />'
            }));

            $('#channel-post-confirm', modal).on('click', function(ev) {
              ev.stopPropagation();
              ev.preventDefault();

              // get first feed channel
              var feedChannels = channels.where({
                action : pod + '.feed'
              });

              var newFeedName = $('#new-feed-name').val();

              function _createBip(targetChannel, sourceCid) {
                var targetCid = targetChannel.get('id'),
                sourceChannel = channels.get(sourceCid);

                // create new syndication trigger
                bipStruct = {
                  type : 'trigger',
                  config : {
                    channel_id : sourceCid
                  },
                  hub : {
                    source : {
                      edges : [ targetCid ],
                      transforms : {}
                    }
                  },
                  name : sourceChannel.get('name') + ' (Subscribe to Feed)',
                  note : 'Automatically Installed',
                  end_life : {
                    imp : 0,
                    time : 0
                  }
                };

                bipStruct.hub.source.transforms[targetCid] = 'default';

                // create bip
                var bipModel = new BipModel(bipStruct);
                bipModel.save(
                {},
                {
                  silent  : false,
                  sync    : true,
                  success : function(model, res, xhr) {
                    BipClient.getCollection('bip').fetch({
                      reset : true
                    });
                    BipClient.growl('Bip <strong>' + res.name + '</strong> Saved');
                  },
                  error: function(model, res, xhr) {
                    // conflict
                    if (res.status === 409) {
                      self.errTranslate(true, 'name', 'This name is already in use');

                    // handle general errors
                    } else {
                      if ('' !== res.responseText) {
                        var err = JSON.parse(res.responseText);
                        if (err && err.status === 400) {
                          for (var key in err.errors) {
                            self.errTranslate(true, key, err.errors[key].type);
                          //errTranslate : function(isErr, attribute, error) {
                          }
                        }
                      }
                    }
                  }
                });
              }

              function createFeedChannel(name) {
                // create new feed container with matched name
                var feedChannel = new ChannelModel({
                  action : 'syndication.feed',
                  name : name,
                  note : 'Automatically Installed'
                });

                feedChannel.save(
                {},
                {
                  silent  : false,
                  sync    : false,
                  success : function(model, res, xhr) {
                    BipClient.getCollection('channel').fetch({
                      success : function() {
                        BipClient.decorateChannels();
                        self.trigger('refresh');
                      }
                    });

                    BipClient.growl('Channel <strong>' + self.model.get('name') + '</strong> Created');

                    _createBip(model, cid);
                  },
                  error: function(model, res) {
                    var resp = JSON.parse(res.responseText);
                    // conflict
                    if (res.status === 409) {
                      self.errTranslate(true, 'name', 'Channel Name is already in use');

                    // handle general errors
                    } else {
                      if (resp.message) {
                        BipClient.growl(resp.message, 'error');
                      } else {
                        BipClient.growl('An Error Occurred', 'error');
                      }
                    }
                  }
                });
              }

              if (newFeedName) {
                createFeedChannel(newFeedName);
              //} else if (feedChannels.length === 0) {
              //  _createBip(feedChannels[0], cid);
              } else if (feedChannels.length) {
                _createBip(channels.get($('#feed-target-cid :selected', modal).val()), cid);
              } else {
                createFeedChannel(channel.get('name') + ' Container');
              }

              modal.modal('hide');
            });

            $('#channel-modal-post-container').html(modal);

            modal.modal('show');
          }
        }
      },

      saveChannel : function(ev) {
        var src = $(ev.currentTarget),
        self = this,
        parentForm,
        values, model = {};

        ev.preventDefault();

        if (!src.hasClass('disabled')) {
          // get active action content
          parentForm = $('.create-new-channel');
          values = parentForm.serializeArray();

          var path, ref, value, name, tokens;

          for (var i = 0; i < values.length; i++) {
            value = values[i].value;
            tokens = values[i].name.split('#');

            // qualified object path
            if (tokens.length > 1) {
              name = tokens[0];
              if (!model[name]) {
                model[name] = {};
              }
              ref = model[name];

              path = tokens[1].split('/');

              //
              for (var j = 0; j < path.length; j++) {
                name = path[j];
                if (j === (path.length - 1)) {
                  ref[name] = value;
                } else {
                  if (!ref[name]) {
                    ref[name] = {};
                  }
                  ref = ref[name];
                }
              }

            // literal attribute
            } else {
              name = values[i].name;
              model[name] = value;
            }
          }

          if (this.model && !this.model.isNew()) {
            this.model.set(model);
          } else {
            this.model = new ChannelModel(model);
          }

          this.model.on('validated:invalid', this.invalidModel, this);
          this.model.on('validated:valid', this.validatedPublish, this);
          Backbone.Validation.bind(this);

          // inject config validation rules from the pod schema into
          // the model
          var tokens = this.model.get('action').split('.'),
          pod = BipClient.getCollection('pod').get(tokens[0]),
          actionConfig = pod.get('actions')[tokens[1]].config.properties,
          vStruct, c;

          for (key in actionConfig) {
            c = actionConfig[key];
            vStruct = [];
            if (!c.optional) {
              vStruct.push({
                'required' : true,
                'msg' : 'Required'
              });
            }

            if (c.validate) {
              for (var k = 0; k < c.validate.length; k++) {
                vStruct.push(c.validate[k]);
              }
            }
          // nested validation isn't working? why?
          //                        this.model.validation['config.' + key] = vStruct;
          }

          this.model.validate();

          if (this.model.isValid(true)) {
            var newModel = this.model.isNew();
            this.model.save(
              this.model.toJSON(),
              {
                silent  : false,
                sync    : false,
                success : function(model, res, xhr) {
                  // clear search
                  //$('#channel-search-form').val('');
                  //BipClient.getCollection('channel').resetSearch().fetch({
                  BipClient.getCollection('channel').fetch({
                    reset : true,
                    success : function() {
                      BipClient.decorateChannels();

                      if (newModel) {
                        self._setupExtra(model.get('id'));
                      }

                      self.trigger('refresh');
                    }
                  });

                  self._router.navigate('channels');
                  self._renderPods();

                  BipClient.growl('Channel <strong>' + self.model.get('name') + '</strong> Saved');



                },
                error: function(model, res) {
                  var resp = JSON.parse(res.responseText);
                  // conflict
                  if (res.status === 409) {
                    self.errTranslate(true, 'name', 'Channel Name is already in use');

                  // handle general errors
                  } else {
                    if (resp.message) {
                      BipClient.growl(resp.message, 'error');
                    } else {
                      BipClient.growl('An Error Occurred', 'error');
                    }
                  }
                }
              });
          }
        }
      },

      remove : function(e) {
        var self = this;
        e.stopPropagation();
        e.preventDefault();
        $('#channel-delete-dialog').modal('hide');
        this.model.destroy({
          success : function(model, response) {
            BipClient.growl('Channel <strong>' + self.model.get('name') + '</strong> Deleted');
            self._renderPods();
          },
          error : function(model, response) {
            var message = 'An Error Occorred';
            if (409 === response.status) {
              message = "<strong>" + model.get('name') + "</strong> is in use";
            }

            BipClient.growl(message, 'error');
          },
          wait : true
        });
      },

      renderRow : function(pod, appendTo) {
        var struct = pod.toJSON(), html;
        struct.auth_status_class = (struct.auth.status == 'accepted') ? 'alert-info' : '';
        appendTo.append(this.tplPodEntity(struct));
      },

      // if pod isn't available then spawn modal, otherwise pass through to
      // channel setup
      podSelect : function(ev) {
        ev.preventDefault();
        var self = this,
        src = $(ev.currentTarget),
        model = this.collection.get(src.attr('data-pod'));

        if (model.get('auth').status == 'accepted' || model.get('auth') == 'none') {
          self._renderChannel(BipClient.getCollection('channel').newModel(), model);
        } else {
          var modal = $('#authModal'),
          modelJSON = model.toJSON(),
          podAuth = modelJSON.auth;

          if ('issuer_token' === podAuth.type) {
            var entities = [];
            for (var k in podAuth.authMap) {
              if (podAuth.authMap.hasOwnProperty(k)) {
                entities.push(podAuth.authMap[k]);
              }
            }
            modelJSON.authEntities = '<strong>' + entities.join('</strong> and <strong>') + '</strong>';
          } else if ('oauth' === podAuth.type && podAuth.scopes.length) {
            var normedScopes = [];
            for (var a = 0; a < podAuth.scopes.length; a++) {
              normedScopes.push(podAuth.scopes[a].replace(/.*\/(.*)$/, '$1'));
            }
            podAuth.scopes = normedScopes;
          }

          modal.html(this.tplModal(modelJSON));

          $('.modal-continue', modal).click(function(ev) {
            ev.preventDefault();
            $('.modal-close').trigger('click');
            self._renderChannel(BipClient.getCollection('channel').newModel(), model, undefined, true);
          });

          $('.modal-authenticate', modal).click(function(ev) {
            ev.preventDefault();
            var formVars = $('.modal-authenticate').closest('.modal').find('form').serializeArray();
            self.verify(ev, false, formVars, model );
          });

          $('div:first-child', modal).first().modal();

          $('i', modal).popover();
        }
      },

      updateRow : function(domain) {
        var innerHTML = $('.well', this.renderRow(domain));
        $('#domain-entity-' + domain.id).html(innerHTML);
      },

      _credentialError : function(error, name, message) {
        var el = $('#authModal #' + name),
        ctl = el.closest('.control-group'),
        helper = ctl.find('.help-block');

        helper.html(message);
        if (error) {
          ctl.addClass('error');
        } else {
          ctl.removeClass('error');
        }
      },

      verifyIssuerToken : function(formVars) {
        var self = this,
          userCtl = $('#authModal #username'),
          passwordCtl = $('#authModal #password'),
          err = false,
          username, password;
          
        _.each(formVars, function(v) {
          if ('username' === v.name) {
            self._credentialError(false, 'username');
            if (v.value && '' !== v.value) {
              username = v.value;
            } else {
              self._credentialError(true, 'username', 'required');
              err = true;
            }
          } else if ('password' === v.name) {
            self._credentialError(false, 'password');
            if (v.value && '' !== v.value) {
              password = v.value;
            } else {
              self._credentialError(true, 'password', 'required');
              err = true;
            }
          }
        });

        if (err) {
          return;
        } else {
          return [ username, password ];
        }
      },

      verify : function(ev, noClose, formVars, model) {
        ev.preventDefault();

        var src = $(ev.currentTarget),
        id = src.attr('data-model-id'),
        self = this, authType, url, username, password;        
        
        model = model || this.collection.get(id);
        
        authType = model.get('auth').type,
        url = model.get('auth')._href;

        // if issuer_token, then validate form
        if ('issuer_token' === authType) {         
          var tokens = self.verifyIssuerToken(formVars),
            username = tokens[0],
            password = tokens[1];          

          if (!tokens) {
            return true;
          }
        }

        // ask who
        $.ajax('/auth/who', {
          'success' : (function(model, url, username, password) {
            return function(data, status, xhr) {
              var payload = $.parseJSON(data), authURL;
              if (payload.pfx) {
                authURL = url.replace('://', '://' + payload.pfx);
              }

              if (!noClose) {
                $('.modal-close').trigger('click');
              }

              if (model.get('auth').type === 'issuer_token') {
                var provider = model.get('name');
                $.ajax({
                  url : authURL,
                  type : 'GET',
                  data : {
                    username : username,
                    password : password
                  },
                  dataType : 'jsonp',
                  success : function() {
                    BipClient.growl(provider + ' pod enabled', 'success' );
                    BipClient.authStatusChange(provider, 'accepted');
                  },
                  error : function() {
                    BipClient.growl('An Error Occurred', 'error' );
                    BipClient.authStatusChange(provider, 'accepted');
                  }
                });
              } else {
                // start oauth in new window
                /*
                if (formVars) {
                  for (var i = 0; i < formVars.length; i++) {
                    authURL += '&' + formVars[i].name + '=' + formVars[i].value;
                  }
                }*/
                window.open(authURL, 'BipIO - Negotiating OAuth Token');
              }
            }
          })(model, url, username, password)
        });
      }
    });

    return PodListView;
  });