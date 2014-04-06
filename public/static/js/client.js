/**
 *
 * Client frontend for the BIP REST API
 *
 * Requires jQuery
 *
 *
 */
define([
  'jquery',
  'jquery_b64',
  'c_mount_local',
  ],
  function($, b64, MountLocalCollection ) {

    function ClientEvent(type) {
      this._evListeners = [];
      this.type = type;
    }

    // basic event bridge
    ClientEvent.prototype = {
      on : function (fn) {
        this._evListeners.push(fn);
      },

      unbind : function (fn) {
        var index;
        index = this._evListeners.indexOf(fn);
        if (index > -1) {
          this._evListeners.splice(index, 1);
        }
      },

      trigger : function () {
        var listeners = this._evListeners,
        len = listeners.length,
        i;
        for (i = 0; i < len; ++i) {
          listeners[i].apply(null, arguments);
        }
      }
    }

    var BIPClient = {
      // static registry.  inject bipclient as a dependency to access
      // these collection
      _collections: {
        'bip' : undefined,
        'channel' : undefined,
        'domain' : undefined,
        'pod' : undefined,
        'bip_descriptions' : undefined
      },

      _auth : null,
      _transformCache : {},
      _params : undefined,
      _token : undefined,
      _mounted : false,
      
      login : function(username, password, next) {        
        this.setCredentials(username, password);
        this._request(
          null,
          BIPClient.getEndpoint() + '/login',
          'GET',
          function(resData, payload) {
            next(false, resData);
          },
          function(xhr_status, status, errText, payload) {
            next(true, errText);
          },
          true
          );
      },
      
      setCollection: function(target, collection) {
        this._collections[target] = collection;
      },
      getCollection: function( target ){
        return this._collections[target];
      },

      decorateChannels : function() {
        var tokens, self = this;
        if (this._collections.pod.length > 0 && this._collections.channel.length > 0) {
          this._collections.channel.each(function(channel) {
            //channel.set({ '_emitter' : self._collections.pod.getActionSchema(channel.get('action')).trigger });
            channel.attributes._emitter = self._collections.pod.getActionSchema(channel.get('action')).trigger;
          });
        }
      },

      getChannel : function(cid) {
        var channel = this._collections.channel.get(cid);
        if (channel) {
          channel._action = this._collections.pod.getActionSchema(channel.get('action'));
        }
        return channel;
      },

      setCredentials : function(username, password, endpoint) {
        var self = this;
        if (!username && !password && !endpoint) {
          self._mounted = false;
          this._params.endpoint_override = null;
          $.ajaxSetup({
            xhrFields: {
              withCredentials: true
            },
            crossDomain: true,
            beforeSend: function (xhr) {
              //xhr.withCredentials = true;
              xhr.setRequestHeader('Authorization', 'Basic ' +
                self._auth.api_token_web);
              return xhr;
            }
          });
        } else {
          this._params.endpoint_override = endpoint;
          self._mounted = true;
          $.ajaxSetup({
            xhrFields: {
              withCredentials: true
            },
            crossDomain: true,
            beforeSend: function (xhr) {
              //xhr.withCredentials = true;
              xhr.setRequestHeader('Authorization', "Basic " + $.base64.encode(username + ':' + password));
              return xhr;
            }
          });
        }
      },

      init: function(clientParams) {
        var self = this,
        deferred = $.Deferred();
        this._params = clientParams;

        this.authStatusChangeEvent = new ClientEvent('auth_status');
        
        window.addEventListener(
          'bip.authstatus.change', 
          function(ev) { 
            var d = ev.detail;            
            self.authStatusChange(d.provider, d.status);            
            if ('accepted' === d.status) {
              self.growl(d.provider + ' pod enabled');
            } else {
              self.growl('Access Denied', 'error');
            }
          }
        );
       
        return deferred;
      },

      // lots of weird oatuh vectors, subscribe to the newsletter.
      authStatusChange : function (provider, newstatus, next) {
        var model = this._collections['pod'].get(provider),
        self = this;

        model.attributes.auth.status = newstatus;
        model.trigger('change');
        if (next) {
          next(model);
        }
        this._collections['channel'].fetch({
          success : function() {
            self.authStatusChangeEvent.trigger({
              provider : provider,
              newstatus : newstatus
            });
          }
        });
      },

      setDefaultBip : function(bipId, next) {
        this._request(
          null,
          BIPClient.getEndpoint() + '/rpc/bip/set_default/' + bipId,
          'GET',
          function(resData, payload) {
            next(false, resData);
          },
          function(xhr_status, status, errText, payload) {
            next(true, errText);
          },
          true
          );
      },

      callHTTPBip : function(httpBip, payload, next) {
        var url = httpBip.get('_repr'),
          config = httpBip.get('config');

        for (var k in payload) {
          if (payload.hasOwnProperty(k)) {
            if (!payload[k]) {
              delete payload[k];
            }
          }
        }

        if (config.auth && config.auth !== 'none') {
          url = url.replace(
            /^(http(s?):\/\/)/,
            '$1' + (
              config.auth.type === 'basic' ?
              (config.auth.username + ':' + config.auth.password)
              :  $.base64.decode(this._auth.api_token_web)
              ) + '@'
            );
        }
              
        $.ajax(
          {
            url : url,
            data : payload,
            success : function() {
              next(false);
            },
            error : function() {
              next(true);
            }
          });
        
      },

      //createRenderer(el.attr('data-cid'), el.attr('data-renderer'));
      openRenderer : function(cid, renderer) {
        var channel = this.getCollection('channel').get(cid),
          url;
        
        if (channel) {
          url = channel.get('_renderers')[renderer]._href;
          window.open(
            url.replace(
              /^(http(s?):\/\/)/,
              '$1' + $.base64.decode(this._auth.api_token_web) + '@'
            )
          );
        }
      },

      getRendererURI : function(cid, renderer) {
        var channel = this.getCollection('channel').get(cid),
          url;
        
        if (channel) {
          url = channel.get('_renderers')[renderer]._href.replace(
            /^(http(s?):\/\/)/,
            '$1' + $.base64.decode(this._auth.api_token_web) + '@'
          );          
        }
        return url;
      },

      /**
         *
         */
      getEndpoint : function() {
        return this._params.endpoint_override ? this._params.endpoint_override  : this._params.endpoint;
      },

      //  request handler
      _request : function(payload, methodAPI, methodHTTP, onSuccess, onFail, useToken) {
        var self = this;
        var payload = null == payload ? payload : JSON.stringify(payload);

        if (undefined == useToken || true == useToken) {
          useToken = true;
        } else {
          useToken = false;
        }

        // @todo fix.  proxied puts are broken wtf.
        /*
            if (methodHTTP == 'PUT') {
                methodAPI += '&munge=PUT';
                methodHTTP = 'POST';
            }*/

        var reqStruct = {
          type: methodHTTP,
          contentType: 'application/json',
          dataType: 'json',
          url: methodAPI,
          success: function(resData, status, xhr) {
            if (undefined != onSuccess) {
              onSuccess(resData, payload);
            }
          },
          error: function(xhr, status, errText) {
            if (undefined !== onFail) {
              onFail(xhr.status, status, errText, payload);
            }
          }
        };

        if (null !== payload) {
          reqStruct.data = payload;
        }

        $.ajax(reqStruct);
      },

      getResourceURL: function(name, modelRef) {
        var urlStr = BIPClient.getEndpoint() + '/rest/' + name;
        if (undefined != modelRef.id) {
          urlStr += '/' + modelRef.id;
        }

        return urlStr;
      },

      getPodDescriptions : function() {
        return BIPClient.getEndpoint() + '/rpc/describe/pod';
      },

      getBipDescriptions : function() {
        return BIPClient.getEndpoint() + '/rpc/describe/bip';
      },

      defEnumeratorUnpack : function(props) {
        var c, p, ret = [], ptr, defs = props.definitions;

        for (p in props.properties) {
          ptr = {
            'id'  : p,
            'label' : props.properties[p].description,
            data : []
          };

          if (props.properties[p].oneOf) {
            for (var i = 0; i < props.properties[p].oneOf.length; i++) {
              c = props.properties[p].oneOf[i];
              if (c['$ref']) {
                // extract properties
                if (/^#\/definitions\//.test(c['$ref'])) {
                  var def = c['$ref'].replace('#/definitions/', '');
                  d = defs[def];
                  if (d && d['enum']) {
                    for (var j = 0; j < d['enum'].length; j++) {
                      ptr.data.push({
                        label : d['enum'][j],
                        value : d['enum'][j]
                      });
                    }
                  }
                }
              }
            }
            ret.push(ptr);
          }
        }
        return ret;
      },

      getExports : function(domain, id) {
        var desc, channel, pod, triggerExports;

        // channel id export lookup
        if ('channel' === domain || 'trigger' === domain) {
          // get channel by channelId
          channel = this.getCollection('channel').get(id);

          // get action or emitter exports by channel pod.action path
          desc = this.getCollection('pod').getActionSchema(channel.get('action')).exports;

          if ('trigger' === domain) {

            triggerExports = this.getCollection('bip_descriptions').get(domain).get('exports');
            for (var key in triggerExports) {
              /*
                        for (var attrib in triggerExports[key]) {
                            if (!desc[attrib]) {
                                desc[attrib] = {};
                            }
                            desc[attrib][key] = triggerExports[key][attrib];
                        }*/
              }

          }

        } else if ('http' === domain) {
          desc = this.getCollection('bip_descriptions').get(domain).get('exports');

        // get configured exports


        } else {
          desc = this.getCollection('bip_descriptions').get(domain).get('exports');
        }

        // debugger;
        return desc;
      },

      //
      // Retrieves transform hints from action->action
      //
      // @param next callback(error, response)
      getTransformHint : function(from, to, next) {
        var cacheKey = from + '_' + to,
        self = this;
        if (!this._transformCache[cacheKey]) {
          this._request(
            null,
            BIPClient.getEndpoint() + '/rpc/bip/get_transform_hint?from=' + from + '&to=' + to,
            'GET',
            function(resp) {
              self._transformCache[cacheKey] = resp.transform;
              next(false, self._transformCache[cacheKey]);
            },
            function(xhrStat, status, errText) {
              next(true, {});
            }
            );
        } else {
          next(false, this._transformCache[cacheKey]);
        }
      },

      getResourceName: function(name, page, page_size, order_by, search_by, mode) {
        if (!mode) {
          mode = 'rest';
        }

        var urlStr = BIPClient.getEndpoint() + '/' + mode + '/' + name,
        params,
        filter = '';

        if (undefined == page) {
          page = 1;
        }

        if (undefined == page_size) {
          page_size = 10;
        }

        if (undefined == order_by) {
          order_by = 'recent';
        }

        params = {
          page: page,
          page_size: page_size,
          order_by : order_by
        };

        if (undefined != search_by) {
          for (key in search_by) {
            if ('' != filter) {
              filter += ',';
            }
            filter += key + ':' + search_by[key];
          }
          params.filter = filter;
        }

        return urlStr + '?' + $.param(params);
      },

      getSettingsUrl : function() {
        return this.getResourceURL('account_option', {
          id : this.getSettings().id
        });
      },

      getSettingsId : function() {
        return BIPClientParams.settings.id;
      },

      getSettings : function() {
        return userSettings;
      },

      domainVerify : function(domainID, cb) {
        this._request(
          null,
          BIPClient.getEndpoint() + '/rpc/domain/confirm/' + domainID,
          'GET',
          function(resData, payload) {
            cb(false, resData);
          },
          function(xhr_status, status, errText, payload) {
            cb(true, errText);
          },
          true
          );
      },

      share : function(model, cb) {
        this._request(
          null,
          BIPClient.getEndpoint() + '/rpc/bip/share/' + model.id ,
          'GET',
          function(resData, payload) {
            cb(false, resData);
          },
          function(xhr_status, status, errText, payload) {
            cb(true, errText);
          },
          true
          );
      },

      // @todo this whole interface is crap.  After the RPC create, it should
      // be treated as a restful service.
      unShare : function(id, cb) {
        this._request(
          null,
          BIPClient.getEndpoint() + '/rpc/bip/unshare/' + id,
          'GET',
          function(resData, payload) {
            cb(false, resData);
          },
          function(xhr_status, status, errText, payload) {
            cb(true, errText);
          },
          true
          );
      },

      getShares : function() {
        this._request(
          null,
          BIPClient.getEndpoint() + '/rpc/bip/share/' + model.id ,
          'GET',
          function(resData, payload) {
            cb(false, resData);
          },
          function(xhr_status, status, errText, payload) {
            cb(true, errText);
          },
          true
          );
      },

      errParse : function(res) {
        var errStruct = {};
        if (res.responseText) {
          var struct = $.parseJSON(res.responseText)
          if (struct.errors) {
            errStruct.status = struct.status;
            errStruct.msg = struct.errors.name.message;
          }
        }
        return errStruct;
      },

      growl : function(message, level) {
        level = level || 'success';
        $.bootstrapGrowl(
          ('error' === level ? '<i class="icon-exclamation-sign"></i> ' : '')+ message,
          {
            //ele : '#subnavbar',
            ele : 'body',
            offset: {
              from: 'top',
              amount: 53
            },
            type : level || 'success',
            delay : 3000,
            allow_dismiss : true,
            align : 'left'
          }
          );
      },

      flattenObject : function(obj, delimiter, includePrototype, container, key) {
        container = container || {};
        key = key || "";
        delmiter = delimiter || '/';

        for (var k in obj) {
          if (includePrototype || obj.hasOwnProperty(k)) {
            var prop = obj[k];
            if (prop && this.isObject(prop)) {
              this.flattenObject(prop, delimiter, includePrototype, container, key + k + delimiter);
            }
            else {
              container[key + k] = prop;
            }
          }
        }

        return container;
      }
    };

    //BIPClient.init();
    //window.BIPClient = BIPClient;
    return BIPClient;
  });