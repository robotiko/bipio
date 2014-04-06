define([
  'underscore',
  'backbone',
  'bipclient',
  ], function(_, Backbone, BipClient){
    // Individual Domain
    var DomainAdminView = Backbone.View.extend({
      el : $('#domain-ctl'),
      tpl : _.template($('#tpl-domain-entity').html()),
      tplRenderers : _.template($('#tpl-domain-renderer').html()),
      events: {
        "click #domain-name-new-btn" : "publish",
        "click .btn-verify" : "verify",
        "click .btn-delete" : "remove",
        'click .select-renderer button' : 'selectRenderer',
        'click .btn-remove-renderer' : 'selectRenderer',
      },
      initialize: function(){
        _.bindAll(
          this,
          'render',
          'renderRow',
          'appendRow',
          'errTranslate',
          'remove',
          'removeRow',
          'updateRow',
          'publish',
          'verify',
          '_applySelectedRendererHTML',
          'selectRenderer'
          );
        this.collection.bind('reset', this.render);
      },
      renderRow : function(domain) {
        var struct = domain.toJSON(), html;
        struct.mode = domain.get('_available') ? 'verified' : 'unverified';

        if (/bip.io$/i.test(struct.name)) {
          struct.mode = 'system'
        }

        if (struct.mode == 'verified') {
          struct.alert_mode = 'success';

        } else if (struct.mode == 'unverified') {
          struct.alert_mode = 'warning';

        } else {
          struct.alert_mode = 'info';
        }

        return this.tpl(struct);
      },
      updateRow : function(domain) {
        var innerHTML = $('.well', this.renderRow(domain));
        $('#domain-entity-' + domain.id).html(innerHTML);
      },
      removeRow : function(domain) {
        $('#domain-entity-' + domain.id).remove();
      },

      appendRow : function(domain) {
        domain.rendererChannels = this.rendererChannels;

        var el = $('#domain-list', this.el),
        $row = $(this.renderRow(domain));

        // add renderers
        $('.domain-renderers', $row).html(this.tplRenderers(domain));


        this._applySelectedRendererHTML(
          $('.renderer-selected', $row),
          domain
          );

        el.append($row);
      },

      _applySelectedRendererHTML : function(el, domainModel) {
        var domainJSON = domainModel.toJSON(),
        html = '<i class="icon-ban-circle"></i> None Enabled',
        channel,
        pod,
        renderer;

        if (domainJSON.renderer && '' !== domainJSON.renderer) {
          channel = BipClient.getCollection('channel').get(domainJSON.renderer.channel_id);

          if (channel) {
            renderer = channel.get('_renderers')[domainJSON.renderer.renderer];
            if (renderer) {
              pod = channel.getPod();

              html = '<img class="hub-icon hub-icon-24" src="/static/img/channels/32/color/'+ pod.get('name') + '.png"> '
              + '<strong>' + pod.get('description') + ' : ' + channel.get('name') + '</strong>'
              + ' ' + renderer.description + '(' + renderer.contentType + ')'
              + '<button class="btn btn-mini btn-danger pull-right btn-remove-renderer">Remove</button>';
            }
          }
        }

        el.html(html);
      },

      selectRenderer : function(ev) {
        var $button = $(ev.currentTarget),
        parent = $button.parent(),
        cid = parent.attr('data-channel-id'),
        $group = $(ev.target).closest('.accordion-group'),
        did = $group.attr('data-domain-id'),
        renderer = parent.attr('data-renderer'),
        domain = this.collection.get(did),
        domainJSON = domain.toJSON(),
        save = false,
        $activeEl = $('.renderer-selected', $group);

        if ($button.hasClass('btn-enable-renderer')) {
          delete domainJSON.renderer;
          domainJSON.renderer = {
            renderer : renderer,
            channel_id : cid
          }

          domain.set('renderer', domainJSON.renderer);
          this._applySelectedRendererHTML($activeEl, domain);
          save = true;
          $('.bip-save-required').show();

        } else if ($button.hasClass('btn-remove-renderer')) {
          delete domainJSON.renderer;
          domain.set('renderer', domainJSON.renderer);

          this._applySelectedRendererHTML($activeEl, domain);

          $('.bip-save-required').show();
          save = true;
        } else if ($button.hasClass('btn-preview-renderer')) {

          BipClient.openRenderer(parent.attr('data-channel-id'), parent.attr('data-renderer'));
        }

        if (save) {
          domain.save(
          {
            renderer : domainJSON.renderer ? domainJSON.renderer : {}
          },
          {
            patch : true,
            wait : true,
            success : function(model) {
              BipClient.growl('Renderer Saved for ' + model.get('_repr'));
            },
            error : function(model, response) {
              BipClient.growl(model.get('_repr') + ' ' + response, 'error');
            }
          }
          );
        }

        ev.preventDefault();
        ev.stopPropagation();
      },

      render: function(){
        var self = this;

        this.rendererChannels = BipClient.getCollection('channel').getRenderable(true);

        $('#domain-list', this.$el).empty();

        this.collection.models.forEach( function (domain) {
          self.appendRow(domain);
        });
        return this;
      },

      // translates from a model attribute to form, and renders an error
      errTranslate: function(isErr, error) {
        var el = $('#domain-name-new', this.el).parent();
        if (isErr) {
          el.parent().addClass('error');
          el.children('.help-block').html(error);
        } else {
          el.parent().removeClass('error');
          el.children('.help-block').html('');
        }
      },
      publish : function(ev) {
        var domainName = $('#domain-name-new').val(),
        el = $(this.el),
        self = this,
        model;

        ev.preventDefault();
        this.errTranslate(false);

        if ('' == domainName) {
          this.errTranslate(true, 'Can not be empty');
        } else {
          // create domain
          model = this.collection.newModel();
          model.set('name', domainName);
          model.save(
            model.toJSON(),
            {
              silent  : false,
              sync    : false,
              success : function(model, res, xhr) {
                var available = model.get('_available');

                if (!available) {
                  BipClient.growl('Domain Saved - Verification Required', 'error');
                } else {
                  BipClient.growl('Domain Saved');
                }
                self.collection.push(model);
                self.appendRow(model);
                $('#domain-name-new').val('');
              },
              error: function(model, res) {
                // conflict
                if (res.status === 409) {
                  self.errTranslate(true, 'This domain is unavailable');

                // handle general errors
                } else {
                  var errStruct = BipClient.errParse(res),
                  msg = (errStruct.msg) ? errStruct.msg : 'Unknown Error';

                  self.errTranslate(true, msg);
                }
              }
            });
        }
      },
      verify : function(ev) {
        var src = $(ev.currentTarget),
        id = src.attr('data-model-id'),
        model = this.collection.get(id),
        self = this;

        ev.preventDefault();
        ev.stopPropagation();

        model.rpcVerify(function(err, domain) {
          var available = domain.get('_available');
          if (!err) {
            if (available) {
              self.updateRow(domain);
            } else {
              BipClient.growl(domain.get('name') + ' failed verification', 'error');
            }
          } else {
            console.log(err);
            BipClient.growl('An error occurred', 'error');
          }
        });
      },
      remove : function(ev) {
        var src = $(ev.currentTarget),
        id = src.attr('data-model-id'),
        model = this.collection.get(id),
        self = this;

        ev.preventDefault();
        model.destroy({
          success : function(domain, response) {
            self.removeRow(domain);
            BipClient.growl('Domain Deleted');
          },
          error : function(model, response) {
            console.log(reponse);
          }
        });
      }
    });

    return DomainAdminView;
  });