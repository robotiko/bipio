define([
  'underscore',
  'backbone',
  'bipclient'
  ], function(_, Backbone, BipClient) {
    _.extend(Backbone.Model.prototype, Backbone.Validator);
    MBip = Backbone.Model.extend({
      get: function (attr) {
        var ret;
        if (typeof this[attr] == 'function') {
          return this[attr]();
        } else if ('_repr' === attr) {
          if ('' === this.attributes._repr) {
            switch (this.attributes.type) {
              case 'http' :
                ret = 'Web Hook';
                break;
              case 'smtp' :
                ret = 'Incoming Email'
                break;
              case 'trigger' :
                ret = 'Channel Trigger'
                break;
              default :
                break;
            }
            return ret;
          }

        // pseudo-action
        } else if ('action' === attr) {
          return 'bip.' + this.attributes.type;
        }

        return Backbone.Model.prototype.get.call(this, attr);
      },
      addEdge : function(source, channelId, transforms) {

      },
      // drops an edge from this bips hub
      removeEdge : function(source, channelId) {
        var hub = this.get('hub');
        if (hub[source]) {
          hub[source].edges = _.filter(
            hub[source].edges,
            function(edge) {
              return edge !== channelId
            }
            );
          if (hub[source].transforms && hub[source].transforms[channelId]) {
            delete hub[source].transforms[channelId];
          }
        }

        if (hub[channelId]) {
          delete hub[channelId];
        }

        return;
      },

      getChannelIds : function() {
        // create channel index
        var channels = [],
          attrs = this.toJSON();
          
        if ('trigger' === attrs.type && attrs.config.channel_id && '' !== attrs.config.channel_id) {
          channels.push(attrs.config.channel_id);
        }

        for (var k in attrs.hub) {
          if (attrs.hub.hasOwnProperty(k)) {
            if (attrs.hub[k].edges) {
              channels = channels.concat(attrs.hub[k].edges);
            }
          }
        }

        if ('http' === attrs.type && $.isPlainObject(attrs.config.renderer)
          && attrs.config.renderer.channel_id
          && attrs.config.renderer.renderer) {

          channels.push(attrs.config.renderer.channel_id);
        }

        return _.uniq(channels);
      },

      defaults: function() {
        return {
          'id' : null,
          'name' : '',
          'domain_id' : userSettings.bip_domain_id,
          'type' : userSettings.bip_type,
          // mongo hack. yuck.
          'config' : ( Object.prototype.toString.call( userSettings.bip_config ) === '[object Array]'  ?
          {} :
            userSettings.bip_config),
          'hub' : userSettings.bip_hub,
          'icon' : null,
          'note' : '',
          'end_life' : userSettings.bip_end_life,
          'paused' : 0,
          '_repr' : ''
        }
      },
      validation : {
        /*
                'hub.source.edges' : {
                    required : true,
                    msg : 'This Bip needs some actions before it can be saved.  See the Instructions for how to configure a Bip'
                },
                */
        'hub.source.edges' : {
          fn : function(value, attr, computedState) {
            var haveValue = (value && value.length > 0);
            var haveRenderer = (computedState.config.renderer && computedState.config.renderer.renderer);

            return ((haveRenderer && !haveValue) || haveValue) ?
            '' :
            'This Bip needs some actions before it can be saved.  See the Instructions for how to configure a Bip';
          }
        },
        note : [
        {
          required : false
        },
        {
          maxLength : 1024,
          msg : 'note cannot exceed 1024 characters'
        }
        ],
        config : [
        {
          required : false
        }
        ],
        'end_life.imp' : {
          fn : function(value, attr, computedState) {
            var err;
            if ( '' !== value && 0 !== value && (isNaN(Number(value)) || (parseInt(value) % 1 !== 0) ) ) {
              err = 'Expiry Impressions must be a whole number greater than 0';
            }

            return err;
          }
        },
        'end_life.time' : {
          fn : function(value, attr, computedState) {
            var err;
            if ( '' !== value && !moment(value).isValid() ) {
              err = 'Expiry Date must be a valid date';
            }

            return err;
          }
        }
      },
      url: function() {
        var self = this;
        return BipClient.getResourceURL('bip', self);
      }
    });

    return MBip;
  });


