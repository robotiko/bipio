define([
  'underscore',
  'backbone',
  'bipclient',
  'c_bip'
  ], function(_, Backbone, BipClient, BipCollection) {

    // http://stackoverflow.com/questions/3455931/extracting-text-from-a-contenteditable-div
    function getContentEditableText($el) {
      var ce = $("<pre />").html($el.html());      
      ce.find("div").replaceWith(function() {
          return "\n" + this.innerHTML;
        });
      ce.find("p").replaceWith(function() {
          return this.innerHTML + "<br>";
        });
        
      ce.find("br").replaceWith("\n");

      return ce.text();
    }

    var OutboxView = Backbone.View.extend({
      el : '#outbox-container',
      _container : null,
      _router : null,

      modalView : null,
      editor : null,

      initialize: function(container, router) {
        _.bindAll(
          this,
          'render',
          '_renderEndpoints',
          '_buttonHandler',
          '_obGet',
          '_obSet',
          '_toggleEditor'
          );

        this.collection = BipClient.getCollection('bip');        
        this._renderEndpoints(this.collection.where({ type : 'http' } ));
        this._container = container;
        this._router = router;

        this.lsPrefix = 'BIP_OUTBOX_';

        // don't set editor on every render
        this.editor = new MediumEditor('.editable');
      },

      events: {
        'click button' : '_buttonHandler'
      },

      _obSet : function(key, value) {
        value = value.replace(/<(\/?)script>/g, '');
        localStorage.setItem(this.lsPrefix + key, value);
      },

      _obGet : function(key) {
        return localStorage.getItem(this.lsPrefix + key);
      },

      _toggleEditor : function(setContent) {
        var mode = this._obGet('MODE'),
        $el = $('.editable');

        if ('h' === mode) {
          $el.removeClass('text-mode');
          this.editor.activate();
        } else {
          if (setContent) {
            //$el.html('<p>' + $el.text().replace(/\n/g, '<br/>') + '</p>');
            $el.html(getContentEditableText($el));
          } else {
            $el.html(getContentEditableText($el).replace(/\n/g, '<br/>'));
          }
          this.editor.deactivate();
          $el.attr('contenteditable', true);
          $el.addClass('text-mode');
        }
      },

      render: function() {
        var self = this;

        $('#outbox-title') .val(this._obGet('TITLE'));
        var body = this._obGet('BODY');
        if (body) {
          $('#outbox-body').html(body);
        };

        var mode = this._obGet('MODE');
        if (!mode) {
          mode = 'h';
          this._obSet('MODE', mode);
        }

        if (mode === 'h') {
          $('#outbox-mode').attr('checked', 'checked');
        }

        this._toggleEditor(false);

        $('#outbox-title').on('blur', function() {
          self._obSet('TITLE', $(this).val());
        });

        $('.editable').on('blur', function() {
          self._obSet('BODY', $(this).html());
        });

        $('#outbox-mode').on('click', function() {
          self._obSet('MODE', $(this).is(':checked') ? 'h' : 't');
          self._toggleEditor();
        });
      },

      _buttonHandler : function(ev) {
        var url,
        $select = $('#outbox-bip-id', this.$el),
        config,
        title,
        body;

        ev.preventDefault();
        if (ev.currentTarget.id == 'outbox-send') {
          var bip = this.collection.get(
            $select.find(':selected').attr('value')
            );

          if (bip) {
            var emptyText = $('.editable').text() === '';

            if (!emptyText) {
              body = this._obGet('MODE') === 'h' ?
                $('#outbox-body').html() :
                getContentEditableText($('.editable'));
            }

            title = $('#outbox-title').val();

            BipClient.callHTTPBip(
              bip,
              {
                body : body,
                title : title
              },
              function(err) {
                if (!err) {
                  BipClient.growl('Message Sent');
                } else {
                  BipClient.growl('Server Error', 'error');
                }
              }
              );
          }
        }
      },

      _renderEndpoints : function(httpModels) {
        var $select = $('#outbox-bip-id', this.$el);
        $select.empty();

        if (httpModels.length === 0) {
          $('#outbox-controls').html('<div class="alert alert-warning pull-right"><i class="icon-exclamation-sign"></i> No Web Hooks Found <a class="btn btn-mini btn-primary" href="#bips/new/http">Create One Now</a></div>');
        } else {
          _.each(httpModels, function(bip) {
            $select.append('<option value="' + bip.get('id') + '">' + bip.get('name') + '</option>');
          });
        }
      }
    });
    return OutboxView;
  });