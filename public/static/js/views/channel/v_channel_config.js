define([
  'underscore',
  'backbone'
  ], function(_, Backbone){

    var entityMap = {
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': '&quot;',
          "'": '&#39;',
          "/": '&#x2F;'
        };

    var ChannelConfigView = Backbone.View.extend({
      tplActionEntity : _.template($('#tpl-action-entity').html()),
      initialize: function(containerSelector) {
        _.bindAll(
          this,
          'serialize',
          '_htmlEnumDef',
          '_decodeEntities',
          '_attachChannelOptions',
          '_isTruthy'
          );
      },

      _htmlEnumDef : function(name, config, action, channel, namespace) {
        var optEntity,
          tokens,
          ptr,
          html = '',
          radioName,
          enumDefault,
          cConfig = channel.get('config');

        for (var i = 0; i < config.oneOf.length; i++) {
          optEntity = config.oneOf[i];
          if (optEntity['$ref']) {
            tokens = optEntity['$ref'].replace(/^#\//, '').split('/');

            for (var j = 0; j < tokens.length; j++) {
              ptr = ptr ? ptr[tokens[j]] : action[tokens[j]];

              //if ( name === tokens[j] ) {
              if ( j === tokens.length - 1 ) {
                html += '<div>' + this._encodeEntities(ptr.description) + '</div>';
                if (ptr && ptr['enum']) {
                  radioName = 'config#' + (namespace ? namespace + '/' + name : name);

                  html += '<div class="btn-group" data-toggle="buttons-radio">';

                  // hidden radio binding. ugh.
                  html += '<input type="hidden" name="' + radioName + '" id="' + radioName + '" value="' + (ptr['default'] || '') + '" />';

                  // setup 'radio's
                  for (var j = 0; j < ptr['enum'].length; j++) {
                    enumDefault = cConfig[name] ? cConfig[name] : ptr['default']

                    html += '<button type="button" name="' + radioName + '"' +
                    'class="btn btn-primary ' + ( (enumDefault && enumDefault == ptr['enum'][j]) ? 'active"' : '' ) +
                    '" data-selection="' + (ptr['enum'][j]) + '">' + (ptr['enum_label'][j] || '') + '</button>';
                  }
                  html += '</div>';
                }
              }
            }
          }
        }
        return html;
      },

      _encodeEntities : function(str) {        
        return String(str).replace(/[&<>"'\/]/g, function (s) {
          return entityMap[s];
        });
      },

      _decodeEntities : function() {
        var element = document.createElement('div');

        function decodeHTMLEntities (str) {
          if(str && typeof str === 'string') {
            // strip script/html tags
            str = str.replace(/<script[^>]*>([\S\s]*?)<\/script>/gmi, '');
            str = str.replace(/<\/?\w(?:[^"'>]|"[^"]*"|'[^']*')*>/gmi, '');
            element.innerHTML = str;
            str = element.textContent;
            element.textContent = '';
          }

          return str;
        }

        return decodeHTMLEntities;
      }(),

      _isTruthy : function(value) {
        var truthy = Number(value);        
        return isNaN(truthy) ? ('true' === value || true === value) : !!truthy;
      },

      // looks into the config schema and builds some friendly inputs based
      // on the json schema, adding to config.properties.{property_name}._html
      _attachChannelOptions : function(action, channel) {
        var config, defs = action.config.definitions,
        c, d;
        action.description = this._encodeEntities(action.description);
        action.description_long = this._encodeEntities(action.description_long);
        
        for (key in action.config.properties) {
          //if (action.singleton) {
          // continue;
          //}
          config = action.config.properties[key];
          config._html = '';
          if (config.type == 'string') {
            if (config.oneOf) {
              //config._html = this._htmlEnumDef(key, config, defs)
              config._html = this._htmlEnumDef(key, config, action, channel)
            } else {
              config._html = '<input id="channel_' + key + '" value="' + (channel.get('config')[key] || '') + '" type="text" name="config#' + key + '" placeholder="' + (config['default'] || '') + '"/>';
            }
          } else if (config.type == 'object') {

            config._html = '';
            for (objKey in config.properties) {
              config._html += '<span class="label">' + objKey + '</span>';
              config._html += this._htmlEnumDef(objKey, config, action, channel, key);
            }

          } else if (config.type == 'text') {
            config._html = '<textarea name="config#' + key + '" placeholder="' + (config['default'] || '') + '">' + this._decodeEntities(channel.get('config')[key] || '') + '</textarea>';

          } else if (config.type == 'boolean') {
            var radioName = 'config#' + key,
              cConfig = channel.get('config'),
              enumDefault = this._isTruthy(cConfig[key]) ? true : this._isTruthy(config['default']);

            config._html += '<div class="btn-group" data-toggle="buttons-radio">';

            // hidden radio binding. ugh.
            config._html += '<input type="hidden" name="' + radioName + '" value="' + (enumDefault || '') + '" />';

            config._html += '<button type="button" value="1" name="config#' + (key) + '"' +
            'class="btn btn-primary ' + (enumDefault ? 'active' : '') +
            '" data-selection="1">ON</button>';
          
            config._html += '<button type="button" value="0" name="config#' + (key) + '"' +
            'class="btn btn-primary ' + (!enumDefault ? 'active' : '') +
            '" data-selection="0">OFF</button>';
            config._html += '</div>';
          }
        }

        return action;
      },

      // renders the list container
      render: function(pod, actionName, actionSchema, channel, entityClass) {
        return this.tplActionEntity({
          name : pod.get('name') + '.' + actionName,
          schema : this._attachChannelOptions(actionSchema, channel),
          active_class : entityClass
        });
      },
      serialize : function() {
        var struct = {},          
          values = $('#share-form').serializeArray();

        var path, ref, value, name, tokens;

        for (var i = 0; i < values.length; i++) {
          value = values[i].value;
          tokens = values[i].name.split('#');

          // qualified object path
          if (tokens.length > 1) {
            name = tokens[0];
            if (!struct[name]) {
              struct[name] = {};
            }
            ref = struct[name];

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
            struct[name] = value;
          }
        }
        return struct;
      }
    });
    return ChannelConfigView;
});