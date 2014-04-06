/**
 *
 * Bip Config
 *
 *
 */

/*jslint white: true, devel: true, onevar: true, browser: true, undef: true, nomen: true, regexp: true, plusplus: false, bitwise: true, newcap: true, maxerr: 50, indent: 4 */
var jsl = typeof jsl === 'undefined' ? {} : jsl;

/**
 * jsl.format - Provide json reformatting in a character-by-character approach, so that even invalid JSON may be reformatted (to the best of its ability).
 *
 **/
jsl.format = (function () {

  function repeat(s, count) {
    return new Array(count + 1).join(s);
  }

  function formatJson(json) {
    var i           = 0,
    il          = 0,
    tab         = "    ",
    newJson     = "",
    indentLevel = 0,
    inString    = false,
    currentChar = null;

    for (i = 0, il = json.length; i < il; i += 1) {
      currentChar = json.charAt(i);

      switch (currentChar) {
        case '{':
        case '[':
          if (!inString) {
            newJson += currentChar + "\n" + repeat(tab, indentLevel + 1);
            indentLevel += 1;
          } else {
            newJson += currentChar;
          }
          break;
        case '}':
        case ']':
          if (!inString) {
            indentLevel -= 1;
            newJson += "\n" + repeat(tab, indentLevel) + currentChar;
          } else {
            newJson += currentChar;
          }
          break;
        case ',':
          if (!inString) {
            newJson += ",\n" + repeat(tab, indentLevel);
          } else {
            newJson += currentChar;
          }
          break;
        case ':':
          if (!inString) {
            newJson += ": ";
          } else {
            newJson += currentChar;
          }
          break;
        case ' ':
        case "\n":
        case "\t":
          if (inString) {
            newJson += currentChar;
          }
          break;
        case '"':
          if (i > 0 && json.charAt(i - 1) !== '\\') {
            inString = !inString;
          }
          newJson += currentChar;
          break;
        default:
          newJson += currentChar;
          break;
      }
    }

    return newJson;
  }

  return {
    "formatJson": formatJson
  };

}());

define([
  'underscore',
  'backbone',
  'bipclient',
  'views/bip/v_bip_hub',
  'views/bip/v_bip_logs',
  'views/channel/v_channel_list',
  'moment'
  ], function(_, Backbone, BipClient, HubView, BipLogsView, ChannelListView){
    BipModalView = Backbone.View.extend({
      el: '#bip-setup',
      tplBipConfig: _.template($('#tpl-bip-select').html()),
      tplModal : _.template($('#tpl-modal-hub-channel-config').html()),
      tplChannelSelectModal : _.template($('#tpl-modal-channel-select').html()),
      hubView : null,
      events: {
        "click #bip-submit" : "publish",
        "click #bip-delete" : "remove",
        'keyup #bip_name' : 'reprUpdate',

        'click #bip-cancel' : 'modalClose',
        'click .pause-action' : 'pauseAction',
        'click .share-action' : 'shareAction',
        'click .dup-action' : 'dupAction',
        'change #auth' : 'toggleAuth',
        'click .select-renderer button' : 'selectRenderer',
        'click .btn-remove-renderer' : 'selectRenderer',
        'click #bip-repr-actual' : function(ev) {
          var el = ev.currentTarget;

          // firefox
          if(document.createRange) {
            rangeToSelect = document.createRange();
            rangeToSelect.selectNode(el.firstChild);
            curSelect = window.getSelection();
            curSelect.addRange(rangeToSelect);
            return false;
          }
          // ie
          if(document.body &&
            document.body.createTextRange) {
            range = document.body.createTextRange();
            range.moveToElementText(el);
            range.select();
            return false;
          }
        }
      },
      initialize:function (router) {
        _.bindAll(
          this,
          'render',
          'renderShared',
          'publish',
          'remove',
          'reprUpdate',
          'modalClose',
          'closeRefresh',
          'validatedPublish',
          'invalidModel',
          'errTranslate',
          'pauseAction',
          'dupAction',
          'toggleAuth',
          '_renderBip',
          '_renderDefault',
          '_triggerSelectModal',
          '_applySelectedRendererHTML',
          '_setupValidation',
          'selectRenderer'
          );
            
        this._router = router;
      },

      invalidModel : function(model, errors) {
        var attr, error;
        this.validatedPublish();

        for (key in errors) {
          attr = key;
          error = errors[key];
          if (/^hub/.test(attr) ) {
            var el = $('#hub').siblings('.control-group');
            el.addClass('error');
            el.find('.help-block').html(error);
          } else if (/^end_life/.test(attr) ) {
            this.errTranslate(true, attr.replace(/\..*/g, ''), error);
          } else {
            this.errTranslate(true, attr, error);
          }          
        }

        BipClient.growl('There were errors', 'error');
      },

      validatedPublish : function(model, attr) {
        var el = $('#hub').siblings('.control-group');
        el.removeClass('error');
        el.find('.help-block').html('');

        this.errTranslate(false, 'end_life');
        this.errTranslate(false, 'name');
        this.errTranslate(false, 'note');
      },

      render : function(id, mode) {
        var self = this;

        if (id && id !== 'new' && mode !== 'shared-install') {
          this.model = BipClient.getCollection('bip').get(id);
          
          // duplicate
          if (mode === 'dup') {
            var modelJSON = this.model.toJSON();
            
            delete modelJSON.id;
            modelJSON.name += ' - copy';
            modelJSON.dup = true;
            
            this.model = BipClient.getCollection('bip').factory(modelJSON);
          }

          if (this.model) {
            if ('delete' === mode) {
              this.remove();
            } else {
              this._renderBip();
            }
          } else {
            this.model = BipClient.getCollection('bip').factory({
              id : id
            });

            this.model.fetch({
              success : function(model) {
                self.model = model;
                self._renderBip();
              },
              error : function() {
                BipClient.growl('Bip Does Not Exist', 'error');
              }
            });
          }

        //} else if ( mode === 'shared-install' && id ) {
//          this._renderSharedBip(id);

        } else {
          this._renderDefault(mode);
        }
        
        this._setupValidation();
      },

      renderShared : function(struct) {
        struct.domain_id = userSettings.bip_domain_id;
        this.model = BipClient.getCollection('bip').factory(struct);
        this._setupValidation();
        this._renderBip(true);
      },

      dupAction : function() {
        this._router.navigate('/bips/' + this.model.get('id') + '/dup', { trigger : true });
      },

      _setupValidation : function() {
        var self = this;
        Backbone.Validation.bind(this, {
          model : this.model,
          invalid :  function(view, attr, error) {
            if (/^hub/.test(attr) ) {
              var el = $('#hub').siblings('.control-group');
              el.addClass('error');
              el.find('.help-block').html(error);

            } else if (/^end_life/.test(attr) ) {
              self.errTranslate(true, attr.replace(/\..*/g, ''), error);
            } else {
              this.errTranslate(true, attr, error);
            }
            
            BipClient.growl('There were errors', 'error');
          },
          valid : function(view, attr, error) {
            if (/^hub/.test(attr) ) {
              var el = $('#hub').siblings('.control-group');
              el.removeClass('error');
              el.find('.help-block').html('');

            } else if (/^end_life/.test(attr) ) {
              self.errTranslate(false, attr.replace(/\..*/g, ''), error);
            }
          }
        })
      },

      _renderDefault : function(mode) {
        // create bip with default settings
        var data = {
          type : mode,
          domain_id : userSettings.bip_domain_id
        };
        this.model = BipClient.getCollection('bip').factoryDefault(data);
        this._renderBip();
      },

      _renderBip: function(sharedCreation, modalSelect) {
        var dict = this.model.toJSON(),
        el = $(this.el),
        endLife = this.model.get('end_life'),
        expireTime,
        type = dict.type,
        self = this;

        dict.shared = sharedCreation;
        dict.isNew = (undefined == this.model.id);

        if (!dict._repr) {
          dict._repr = '';
        }

        if (!dict.app_id) {
          dict.app_id = '';
        }

        // apply end_life account default
        if (dict.isNew) {
          dict.end_life = _.clone(userSettings.bip_end_life);
        }

        // apply default behavior if none set
        if (!dict.end_life.action || '' === dict.end_life.action) {
          dict.end_life.action = userSettings.bip_expire_behaviour;
        }

        dict.rendererChannels = {};

        // setup type definition
        switch (type) {
          case 'http' :
            dict._label = 'Web Hook (HTTPS)';
            dict._icon = 'icon-cloud';
            dict._description = 'Processes incoming requests to your domain via HTTPS';
            dict.rendererChannels = BipClient.getCollection('channel').getRenderable(true);
            break;
          case 'smtp' :
            dict._label = 'Email Address';
            dict._icon = 'icon-envelope-alt';
            dict._description = 'Accept messages with an Email Address on your domain';
            break;
          case 'trigger' :
            dict._label = 'Trigger';
            dict._icon = 'icon-fire';
            dict._description = 'Detect when a Channel emits and event';
            break;
          case 'default' :
            break;
        }

        dict.domainCollection = BipClient.getCollection('domain').toJSON();

        // translate expiry to something UI friendly
        dict.expiry_imp = parseInt(endLife.imp);
        if (isNaN(dict.expiry_imp) || dict.expiry_imp == 0) {
          dict.expiry_imp = '';
        }

        dict.explicitDate = false;
        dict.time_zone = userSettings.timezone;

        dict.expiry_time_period = '';
        if (endLife.time != 0 && endLife.time != '') {
          // if its an account default calculation
          if (endLife.time.match) {

            var timeTokens = endLife.time.match(/(\d+)(d|m|y)/);
            // ghetto
            if (timeTokens && timeTokens[1] && timeTokens[2]) {
              dict.expiry_time = timeTokens[1];
              dict.expiry_time_period = timeTokens[2];
            } else {
              dict.expiry_time = endLife.time;
            // else what?
            }
          // otherwise it has been translated to a date
          } else {
            dict.explicitDate = true;
            //var expireDate = new Date(endLife.time * 1000);
            //dict.expiry_time = expireDate.toString('dd-MM-yyyy');
            dict.expiry_time = moment(endLife.time * 1000).format('MM/DD/YY');
          }
        } else {
          dict.expiry_time = '';
        }

        el.fadeOut(300, function() {
          dict.trigger = null;
          dict.pod = null;

          if (dict.type == 'trigger' ) {
            var preamble = 'Trigger Bips fire when a Channel generates an event';
            if (!dict.shared && dict.isNew && !modalSelect) {
              dict.isNewTrigger = true;
              self._triggerSelectModal();
            } else {
              dict.isNewTrigger = false;

              // attach trigger and pod to template
              var channel = BipClient.getCollection('channel').get(dict.config.channel_id);
              dict.trigger = channel.toJSON();
              dict.pod = channel.getPod().toJSON();

            }
          }

          el.html(self.tplBipConfig(dict));

          if ('http' === dict.type) {
            self._applySelectedRendererHTML($('.renderer-selected', el));
          }

          // explicitly set popover
          $('.map-action h3 small label').popover();

          // pass a shallow copy of the bip source into the hub view
          self.hubView = new HubView(self.model);
          self.hubView.render(dict.hub);

          // general decorators
          if (!dict.isNew) {
            $('#bip_expiry_date').datepicker(dict.expiry_time).on('changeDate', function(ev) {
              // ?
              $(this).datepicker('hide');
            });
          }

          $('#bip-config-tabs a').click(function (e) {
            e.preventDefault();

            $(this).tab().on('shown', function(e) {
              if (e.target.hash === '#bip-logs-panel') {
                var target = $('#log-body', e.target.hash);

                // load the log
                if (!target.html()) {
                  new BipLogsView(target, self.model.id);
                }
              } else if (e.target.hash === '#bip-data-panel') {
                $('#bip-data-panel pre').html(
                  jsl.format.formatJson(JSON.stringify(self.model.toJSON()))
                  );
              }
            }).tab('show');
          })

          $('.tooltipped').tooltip();

          el.fadeIn(1000);
        });

        this.model.on('validated:invalid', this.invalidModel, this);
        /*
        this.model.on('validated:invalid', function() {
          debugger;
        }, this);
        */
        this.model.on('validated:valid', this.validatedPublish, this);
        Backbone.Validation.bind(this);

        return this;
      },

      _applySelectedRendererHTML : function(el) {
        var config = this.model.get('config'),
        html,
        channel,
        pod,
        renderer;

        if (!config.renderer || '' === config.renderer) {
          html = '<i class="icon-ban-circle"></i> No Renderers Enabled';
        } else {
          channel = BipClient.getCollection('channel').get(config.renderer.channel_id),
          renderer = channel.get('_renderers')[config.renderer.renderer];

          if (channel && renderer) {
            pod = channel.getPod();

            html = '<img class="hub-icon hub-icon-24" src="/static/img/channels/32/color/'+ pod.get('name') + '.png"> '
            + '<strong>' + pod.get('description') + ' : ' + channel.get('name') + '</strong>'
            + ' ' + renderer.description + '(' + renderer.contentType + ')'
            + '<button class="btn btn-mini btn-danger pull-right btn-remove-renderer">Remove</button>';
          }
        }

        el.html(html);
      },

      selectRenderer : function(ev) {
        var $button = $(ev.currentTarget),
        parent = $button.parent(),
        cid = parent.attr('data-channel-id'),
        renderer = parent.attr('data-renderer'),
        config = this.model.get('config'),
        $activeEl = $('#bip-render-panel .renderer-selected');

        if ($button.hasClass('btn-enable-renderer')) {
          delete config.renderer;
          config.renderer = {
            renderer : renderer,
            channel_id : cid
          }
          this.model.set('config', _.clone(config));
          this._applySelectedRendererHTML($activeEl);

          $('.bip-save-required').show();

        } else if ($button.hasClass('btn-remove-renderer')) {
          delete config.renderer;
          this.model.set('config', _.clone(config));
          this._applySelectedRendererHTML($activeEl);

          $('.bip-save-required').show();

        } else if ($button.hasClass('btn-preview-renderer')) {
          
          BipClient.openRenderer(parent.attr('data-channel-id'), parent.attr('data-renderer'));        
        }

        ev.preventDefault();
        ev.stopPropagation();
      },

      _triggerSelectModal : function() {
        var self = this,
        //channels = BipClient.getCollection('channel');
        channels = BipClient.getCollection('channel').updateFilter();

        var tpl = {
          selected : undefined,
          channels : channels,
          getChannel : function(id) {
            return this.channels[id] || null;
          },
          modal_title : 'Select An Emitter',
          modal_subtitle : 'Select which Channel should trigger this event'
        };

        $('#emitterSelectModal').html(self.tplModal());

        // modal content
        self._activeModal = $('#emitterSelectModal div:first-child').first();

        $('.modal-content', self._activeModal).html(self.tplChannelSelectModal(tpl));

        // render channel list into modal body
        var channelList = new ChannelListView(
          self._activeModal, // container
          null, // router
          '.ag-list-results', // target subcontainer
          false, // widgetised (manage channels)
          'emitters', // search by type filter
          {}, // exclusions
          (function(self) {
            return function(ev) {

              var cid = $(this).attr('data-channel-id'),
              channel = channels.get(cid).toJSON();

              $('#bip_channel_id', self.$el).val(cid);

              ev.preventDefault();
              ev.stopPropagation();

              // update the source bip model in the hub view
              // trigger bip type binding
              self.model.set({
                name : channel.name + ' (' + channel._repr + ')',
                note : channel.note,
                type : 'trigger',
                config : {
                  channel_id : cid
                },
                hub : {
                  source : {
                    edges : []
                  }
                }
              }, {
                silent : true
              }); // skip 'set' validation

              self.hubView._bindBipSource(self.model);
              self._activeModal.modal('hide');
              self._renderBip(false, true);
            }
          })(self));

        channelList.render();

        $('#channel-search-form').focus();

        self._activeModal.modal({
          keyboard : true
        }).show().on('hidden', function() {
          if (!self.model.get('config').channel_id) {
            self.closeRefresh();
          }
        })

        $('.modal-close', self._activeModal).on('click', function(ev) {
          self._activeModal.modal('hide');          
        });
      },

      saveRefresh : function(id, isNew) {
        var self = this;

        BipClient.getCollection('bip').fetch(
        {
          reset : true,
          success : function() {
            //self.trigger('modal-update', { id : id });
            //self.trigger('modal-destroy');
            self.modalClose();
          }
        }
        );
      },

      closeRefresh : function() {
        BipClient.getCollection('bip').fetch( {
          reset : true
        } );
        this.modalClose();
      },

      remove : function(e) {
        var self = this;
        this.model.destroy({
          success : function(model, response) {
            BipClient.growl('Bip <strong>' + self.model.get('name') + '</strong> Deleted');
            self.closeRefresh();
          },
          error : function(model, response) {
            console.log(response);
          }
        });
      },

      // translates from a model attribute to form, and renders an error
      errTranslate : function(isErr, attribute, error) {
        var el = $('#bip_' + attribute, self.el).parent();
        var ctlGroup = $('#bip_' + attribute, self.el).closest('.control-group');
        if (isErr) {
          ctlGroup.addClass('error');
          el.children('.help-block').html(error);
        } else {
          el.removeClass('error');
          ctlGroup.children('.help-block').html('');
        }
      },

      publish : function(e) {
        var id,
        name,
        domain_id,
        type,
        config,
        hub,
        note,
        end_life,
        paused,
        self = this,
        endLife,
        isNew = this.model.isNew(),
        cid = $.trim($('#channel_id_selected').val());

        e.preventDefault();

        var end_life = {
          imp : $.trim($('#bip_expiry_imp').val()),
          time : "",
          action : $('#bip_expire_behaviour :button.active').attr('data-selection')
        }

        var expiryDate = $('#bip_expiry_date').val();
        if (expiryDate) {
          var modelEndLife = this.model.get('end_life');

          // if date changed...
          var modelExpireDate = new Date(modelEndLife.time * 1000);
          if (expiryDate != modelExpireDate.toString('dd-MM-yyyy')) {
            end_life.time = expiryDate;
          } else {
            end_life.time = modelEndLife.time;
          }
        } else {
          // assemble save str
          var expiryTime = $.trim($('#bip_expiry_time').val());
          if (expiryTime != '' && expiryTime != 0) {
            end_life.time = '+' + expiryTime + $.trim($('#bip_expiry_time_resolution').find(':selected').val())
          }
        }

        var bipStruct = {
          name : $.trim($('#bip_name').val()),
          domain_id : $.trim($('#domain_id :selected').val()),
          note : $.trim($('#bip_note').val()),
          end_life : end_life
        }

        if (this.model.get('type') === 'http') {
          bipStruct.config = this.model.get('config');
          bipStruct.config.auth = $('#auth').find(':selected').val();
          bipStruct.config.username = $('#auth_username').val();
          bipStruct.config.password = $('#auth_password').val();
        }

        this.model.set(bipStruct);

        if (this.model.isValid(true)) {
          this.model.save(
          {},
          {
            silent  : false,
            sync    : false,
            success : function(model, res, xhr) {
              if (res && res.errors) {
                that.renderErrMsg(res.errors);
              } else {
                BipClient.growl('Bip <strong>' + res.name + '</strong> Saved');

                // set checked
                if ($('#bip_default').is(':checked')) {
                  BipClient.setDefaultBip(model.get('id'));
                }

                self.saveRefresh(model.get('id'), isNew);
              }
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
                    }
                  }
                }
              }
              BipClient.growl('There were errors', 'error');
            }
          });
        }
      },
      reprUpdate : function(ev) {
        var bipname = $(ev.currentTarget).val(),
        domain = $('#domain_id :selected').html(),
        type = this.model.get('type'),
        repr;

        switch (type) {
          case 'http' :
            // @todo custom domains not https
            repr = 'https://' + domain + '/bip/http/' + bipname;
            break;
          case 'smtp' :
            repr = bipname + '@' + domain;
            break;
          case 'trigger' :
            repr = bipname;
            break;
          case 'default' :
            break;
        }

        $('#bip-repr-actual', this.el).html(repr);
      },

      modalClose : function() {
        this.trigger('modal-destroy');
      },

      pauseAction : function(ev) {
        var action = $(ev.currentTarget).attr('data-action'),
        self = this;
        ev.preventDefault();

        // patch
        this.model.save({
          paused : (action == 'play') ? false : true
        }, {
          patch : true,
          success : function() {
            BipClient.growl('Bip <strong>' + self.model.get('name') + '</strong> is ' + ((action === 'play') ? 'Unpaused' : 'Paused'));
            //self._renderBip();
            self.closeRefresh();
          }
        });
      },

      shareAction : function(ev) {
        var self = this,
        description = this.model.get('note');

        if (description && '' !== description) {
          BipClient.share(this.model, function(err, resp) {
            if (err) {
              BipClient.growl(resp, 'error');
            } else {
              BipClient.growl('Bip Is Shared');
            }
            BipClient.getCollection('bip_shares').fetch();
          });
        } else {
          BipClient.growl('<strong>' + this.model.get('name') + '</strong> needs a saved description', 'error');
        }
      },

      toggleAuth : function(ev) {
        var src = $(ev.currentTarget),
        selected = src.find(':selected').val();
        ev.preventDefault();

        if ('basic' === selected) {
          $('#auth-control').css('display', 'block');
        } else {
          $('#auth-control').css('display', 'none');
        }
      }
    });

    return BipModalView;

  });