/**
 *
 * The Bipio API Server
 *
 * @author Michael Pearson <michael@cloudspark.com.au>
 * Copyright (c) 2010-2013 CloudSpark pty ltd http://www.cloudspark.com.au
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public Licenpse
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 *
 * A Bipio Commercial OEM License may be obtained via enquiries@cloudspark.com.au
 */
/**
 *
 * ExpressJS REST API front-end routing wrapper
 *
 */
app = module.parent.exports.app;

var dao,
bastion,
util        = require('util'),
express     = require('express'),
connect     = require('connect'),
helper      = require('./lib/helper'),
uuid            = require('node-uuid'),
utils = require(__dirname + '/../node_modules/connect/lib/utils.js'),
cdn      = require('./lib/cdn'),
// restful models
restResources = ['bip', 'channel', 'domain', 'account_option'],
modelPublicFilter;

// @todo deprecate - should be handled by DAO
function filterModel(filterLen, modelPublicFilters, modelStruct, decode) {
  var result = {};
  for (var i = 0; i < filterLen; i++) {
    publicAttribute = modelPublicFilters[i];
    if (undefined != modelStruct[publicAttribute]) {
      result[publicAttribute] = modelStruct[publicAttribute];
    }
  }

  if (decode) {
    return helper.naturalize(result);
  } else {
    return helper.pasteurize(result);
  }
}

/**
 * takes a result JSON struct and filters out whatever is not in a public
 * filter for the supplied model. Public filter means readable flag is 'true' in the
 * rest exposed model
 */
function publicFilter(modelName, modelStruct) {
  var result = {}, filterLen, modelLen,
  publicAttribute,
  context = modelStruct,
  modelPublicFilters;

  if (modelName) {
    modelPublicFilters = modelPublicFilter[modelName]['read'];
  } else {
    modelPublicFilters = [];
  }


  // always allow representations and meta data
  modelPublicFilters.push('_repr');
  modelPublicFilters.push('_href');
  modelPublicFilters.push('_renderers');
  modelPublicFilters.push('status');
  modelPublicFilters.push('message');
  modelPublicFilters.push('code');
  modelPublicFilters.push('errors');

  filterLen = modelPublicFilters.length;

  // if it looks like a collection, then filter into the collection
  if (undefined != modelStruct.data) {
    for (key in modelStruct) {
      if (key == 'data') {
        result['data'] = [];

        context = modelStruct.data;
        modelLen = context.length;

        // filter every model in the collection
        for (var i = 0; i < modelLen; i++) {
          result['data'].push(filterModel(filterLen, modelPublicFilters, context[i], true));
        }
      } else {
        result[key] = modelStruct[key];
      }
    }
  } else {
    result = filterModel(filterLen, modelPublicFilters, modelStruct, true);
  }

  return result;
}

/**
 * Wrapper for connect.basicAuth. Checks the session for an authed flag and
 * if fails, defers to http basic auth.
 */
function restAuthWrapper(req, res, cb) {
  return connect.basicAuth(function(user, pass, cb){
    if (req.session.account && req.session.account.username === user) {
      dao.getAccountStruct(req.session.account, function(err, accountInfo) {
        cb(err, accountInfo);
      });
    } else {
      dao.checkAuth(user, pass, 'token', cb);
    }

  })(req, res, cb);
}

/**
 * Normalizes response data, catches errors etc.
 */
var restResponse = function(res) {
  return function(error, modelName, results, code, options) {
    var contentType = DEFS.CONTENTTYPE_JSON;
    if (options) {
      if (options.content_type) {
        contentType = options.content_type;
      }
    }

    res.contentType(contentType);

    /**
         * Post filter. Don't expose attributes that aren't in the public filter
         * list.
         */
    if (null != modelName && results) {
      if (results instanceof Array) {
        realResult = [];
        for (key in results) {
          realResult.push(publicFilter(modelName, results[key]));
        }
      } else {
        realResult = publicFilter(modelName, results);
      }
    } else {
      realResult = results;
    }

    var payload = realResult;
    if (error) {
      if (!code) {
        code = 500;
        app.logmessage('Error response propogated without code', 'warning');
      }

      res.send(code, payload);
      return;
    } else {
      if (!results) {
        res.send(404);
        return;
      }
    }

    // results should contain a '_redirect' url
    if (code == 301) {
      res.redirect(results._redirect);
      return;
    }
    if (contentType == DEFS.CONTENTTYPE_JSON) {
      res.jsonp(!code ? '200' : code, payload);
    } else {
      res.send(!code ? '200' : code, payload);
    }
    return;
  }
}

function getReferer(req) {
  referer = req.query.referer;
  if (undefined == referer) {
    referer = req.header('Referer');
  }

  if (undefined == referer) {
    return null;
  } else {
    return helper.getDomainTokens(referer);
  }
}

function getClientInfo(req, txId) {
  return {
    'id' : txId || uuid.v4(),
    'host' : req.header('x-forwarded-for') || req.connection.remoteAddress,
    'date' : Math.floor(new Date().getTime() / 1000),
    'proto' : 'http',
    'reply_to' : '',
    'method' : req.method,
    'content_type' : utils.mime(req),
    'encoding' : req.encoding
  };
}

/**
 * Generic RESTful handler for restResources
 */
var restAction = function(req, res) {
  var rMethod = req.method,
  accountInfo = req.remoteUser,
  owner_id = accountInfo.getId(),
  resourceName = req.params.resource_name,
  resourceId = req.params.id,
  subResourceId = req.params.subresource_id,
  postSave;

  // User is authenticated and the requested model is marked as restful?
  if (undefined != owner_id && helper.indexOf(restResources, resourceName) != -1) {
    if (rMethod == 'POST' || rMethod == 'PUT') {
      // hack for bips, inject a referer note if no note has been sent
      if (resourceName == 'bip') {
        var referer = getReferer(req);
        if (null != referer) {
          if (undefined == req.body.note) {
            req.body.note = 'via ' + referer.url_tokens.hostname;
          }

          // inject the referer favico
          if (undefined == req.body.icon && -1 === referer.url_tokens.hostname.indexOf(CFG.domain_public) ) {
            postSave = function(err, modelName, retModel, code ) {
              if (!err && retModel.icon == '') {
                // @todo defer to out of band job
                iconUri = dao.getBipRefererIcon(retModel.id, 'http://' + referer.url_tokens.hostname, true);

                if (iconUri) {
                  dao.updateColumn('bip', retModel.id, {
                    icon : iconUri
                  });
                }
              }
            }
          }
        }
      }

      var model;

      if (rMethod == 'POST') {
        // populate our model with the request.  Set an owner_id to be the
        // authenticated user before doing anything else
        model = dao.modelFactory(resourceName, helper.pasteurize(req.body), accountInfo, true);
        dao.create(model, restResponse(res), accountInfo, postSave);
      } else if (rMethod == 'PUT') {
        // filter request body to public writable
        var writeFilters = modelPublicFilter[resourceName]['write'];
        if (undefined != req.body.id) {
          dao.update(
            resourceName,
            req.body.id,
            filterModel(writeFilters.length, writeFilters, req.body),
            restResponse(res),
            accountInfo
            );
        } else {
          res.send(404);
        }
      }
    } else if (rMethod == 'DELETE') {
      if (undefined != req.params.id) {
        dao.remove(resourceName, req.params.id, accountInfo, restResponse(res));
      } else {
        res.send(404);
      }
    } else if (rMethod == 'PATCH') {
      if (undefined != req.params.id) {
        var writeFilters = modelPublicFilter[resourceName]['write'];
        dao.patch(
          resourceName,
          req.params.id,
          filterModel(writeFilters.length, writeFilters, req.body),
          accountInfo,
          restResponse(res)
          );
      } else {
        res.send(404);
      }
    } else if (rMethod == 'GET') {
      var filter = {};

      // handle sub-collections
      if ('bip' === resourceName && 'logs' === subResourceId) {
        filter.bip_id = req.params.id;
        resourceName = 'bip_log';
        req.params.id = undefined;
      } else if ('channel' === resourceName && 'bips' === subResourceId) {
        filter._channel_idx = resourceId;
        resourceName = 'bip';
        req.params.id = undefined;
      } else if ('channel' === resourceName && 'logs' === subResourceId) {
        filter.channel_id = req.params.id;
        resourceName = 'channel_log';
        req.params.id = undefined;
      }

      if (undefined !== req.params.id) {
        if (resourceName == 'channel' && (req.params.id == 'actions' || req.params.id == 'emitters' )) {
          dao.listChannelActions(req.params.id, accountInfo, restResponse(res));
        } else {
          var model = dao.modelFactory(resourceName, {}, accountInfo);
          dao.get(model, req.params.id, accountInfo, restResponse(res));
        }
      } else {
        var page_size = 10,
        page = 1,
        order_by = 'recent';

        if (undefined != req.query.page_size) {
          page_size = parseInt(req.query.page_size);
        }

        if (undefined != req.query.page) {
          page = parseInt(req.query.page);
        }

        if (undefined != req.query.order_by &&
          (req.query.order_by == 'recent' ||
            req.query.order_by == 'active' ||
            req.query.order_by == 'alphabetical')
          ) {
          order_by = req.query.order_by;
        }

        // extract filters
        if (undefined != req.query.filter) {
          var tokens = req.query.filter.split(',');
          for (i in tokens) {
            var filterVars = tokens[i].split(':');
            if (undefined != filterVars[0] && undefined != filterVars[1]) {
              filter[filterVars[0]] = filterVars[1];
            }
          }
        }
        dao.list(resourceName, accountInfo, page_size, page, order_by, filter, restResponse(res));
      }
    }
  } else {
    res.send(404);
  }
  return;
}

function channelRender(ownerId, channelId, renderer, req, res) {
  var filter = {
    owner_id: ownerId,
    id : channelId
  };

  dao.find('channel', filter, function(err, result) {
    if (err || !result) {
      res.send(404);
    } else {
      dao.modelFactory('channel', result).rpc(
        renderer,
        req.query,
        getClientInfo(req),
        req,
        res
        );
    }
  });
}

// ---------------- BIP RPC --------------------------------------------------------

function bipBasicFail(req, res) {
  connect.basicAuth(function(username, password, cb){
    cb(false, false);
  })(req, res);
}

/*
 * Authenticate the bip before we pass it through.  If there's no bip found,
 * the bip has auth = token or the domain doesn't exist, then fall through
 * to an account level auth (although the account auth for nx domain
 * shouldn't ever succeed).
 *
 * We don't want to let people interrogate whether or not a HTTP exists based
 * on the auth response (or non-response).  Therefore, always prompt for
 * HTTP auth on this endpoint unless the bip is explicitly 'none'
 */
function bipAuthWrapper(req, res, cb) {
  (function(domain, req, res) {
    var bipName = req.params.bip_name;
    dao.domainAuth(domain, true, function(err, accountResult) {
      if (err || !accountResult) {
        // reject always
        bipBasicFail(req, res);
      } else {
        // attach user
        req.remoteUser = accountResult;
        var ownerId = accountResult.getId(),
        domainId = accountResult.getActiveDomain(),
        filter = {
          'name' : bipName,
          'type' : 'http',
          'paused' : false,
          'owner_id' : ownerId,
          'domain_id' : domainId
        };
        dao.find('bip', filter, function(err, result) {
          var username,password;
          if (!err && result) {
            if (result.config.auth == 'none') {
              cb(false, true);
            } else if (result.config.auth == 'token') {
              // account token auth
              connect.basicAuth(function(user, pass, cb){
                dao.checkAuth(user, pass, 'token', cb);
              })(req, res, cb);

            } else if (result.config.auth == 'basic') {
              connect.basicAuth(function(username, password, cb){
                cb(
                  false,
                  (result.config.username && result.config.username == username
                    &&
                    result.config.password && result.config.password == password) ?
                  accountResult : null
                  );
              })(req, res, cb);
            } else {
              // reject always
              bipBasicFail(req, res);
            }
          } else {
            // reject always
            restResponse(res)(true, null, 404);
          //error, modelName, results, code, options
          }
        });
      }
    });
  })(helper.getDomain(req.headers.host, true), req, res);
}


module.exports = {
  init : function(express, _dao) {
    dao = _dao;
    modelPublicFilter = _dao.getModelPublicFilters();

    express.post( '/rest/:resource_name', restAuthWrapper, restAction);
    express.get( '/rest/:resource_name/:id?', restAuthWrapper, restAction);
    express.get( '/rest/:resource_name/:id?/:subresource_id?', restAuthWrapper, restAction);
    express.put( '/rest/:resource_name/:id?', restAuthWrapper, restAction);
    express.del( '/rest/:resource_name/:id', restAuthWrapper, restAction);
    express.patch( '/rest/:resource_name/:id', restAuthWrapper, restAction);
    express.options('*', function(req, res) {
      res.send(200);
    });

    /**
     * Pass through HTTP Bips
     */
    express.all('/bip/http/:bip_name', bipAuthWrapper, function(req, res) {
      var txId = uuid.v4(),
      client = getClientInfo(req, txId),
      files = [],
      contentParts = {},
      contentType = utils.mime(req),
      encoding = req.encoding,
      statusMap = {
        'success' : 200,
        'fail' : 404
      },
      bipName = req.params.bip_name,
      domain = helper.getDomain(req.headers.host, true);

      if (req.files && Object.keys(req.files).length > 0) {
        // normalize file struct
        files = cdn.normedMeta('express', txId, req.files);
      }

      (function(req, res, bipName, domain, client, files) {
        GLOBAL.app.bastion.bipUnpack(
          'http',
          bipName,
          req.remoteUser,
          client,
          function(status, message, bip) {
            var exports = {
              'source' : {}
            };

            if (!message){
              message = '';
            }

            // setup source exports for this bip
            if (bip && bip.config.exports && bip.config.exports.length > 0) {
              var exportLen = bip.config.exports.length,
              key;

              for (var i = 0; i < exportLen; i++) {
                key = bip.config.exports[i];
                if (req.query[key]) {
                  exports.source[key] = req.query[key];
                }
              }
            } else {
              exports.source = ('GET' === req.method) ? req.query : req.body;
              
              //exports.source._body = /xml/.test(utils.mime(req)) ? req.rawBody : req.body;
              exports.source._body = req.rawBody;
            }

            var restReponse = true;
            // forward to bastion
            if (status == statusMap.success) {
              exports._client = client;
              exports._bip = bip;

              // Renderer Invoke, send a repsonse
              if (bip.config.renderer) {
                // get channel
                channelRender(
                  bip.owner_id,
                  bip.config.renderer.channel_id,
                  bip.config.renderer.renderer,
                  req,
                  res
                  );
                restReponse = false;
              }

              GLOBAL.app.bastion.bipFire(bip, exports, client, contentParts, files);
            }

            if (restReponse) {
              restResponse(res)( status === statusMap.fail, undefined, message, status);
            }
          },
          statusMap);
      })(req, res, bipName, domain, client, files);
    });

    express.get('/rpc/describe/:model/:model_subdomain?', restAuthWrapper, function(req, res) {
      var model = req.params.model,
      model_subdomain = req.params.model_subdomain;
      res.contentType(DEFS.CONTENTTYPE_JSON);

      dao.describe(model, model_subdomain, restResponse(res), req.remoteUser);
    });

    /**
     * DomainAuth channel renderer
     */
    express.get('/rpc/render/channel/:channel_id/:renderer', restAuthWrapper, function(req, res) {

      var domain = helper.getDomain(req.headers.host, true);
      (function(domain, req, res) {
        dao.domainAuth(domain, true, function(err, accountResult) {
          if (err || !accountResult) {
            app.logmessage(err, 'error');
            res.send(403);
          } else {
            var filter = {
              owner_id: accountResult.user.id,
              id : req.params.channel_id
            };

            dao.find('channel', filter, function(err, result) {
              if (err || !result) {
                app.logmessage(err, 'error');
                res.send(404);
              } else {
                req.remoteUser = accountResult;
                var channel = dao.modelFactory('channel', result);

                channel.rpc(
                  req.params.renderer,
                  req.query,
                  getClientInfo(req),
                  req,
                  res
                  );
              }
            });
          }
        });
      })(domain, req, res);
    });

    /**
     * Account Auth RPC, sets up oAuth for the selected pod, if the pod supports oAuth
     */
    express.all('/rpc/oauth/:pod/:auth_method', restAuthWrapper, function(req, res) {
      var podName = req.params.pod,
      pod = dao.pod(podName),
      method = req.params.auth_method;

      // check that authentication is supported/required by this pod
      if (pod) {
        if (!pod.oAuthRPC(podName, method, req, res)) {
          res.send(415);
        }
      } else {
        res.send(404);
      }
    });
    !

    /**
     * Account Auth RPC, sets up issuer_token (API keypair) for the selected pod, if the pod supports issuer_token
     */
    express.all('/rpc/issuer_token/:pod/:auth_method', restAuthWrapper, function(req, res) {
      var podName = req.params.pod,
      pod = dao.pod(podName),
      method = req.params.auth_method;

      // check that authentication is supported/required by this pod
      if (!pod.issuerTokenRPC(podName, method, req, res)) {
        res.send(415);
      }
    });

    express.get('/rpc/pod/:pod/render/:method', restAuthWrapper, function(req, res) {
      (function(req, res) {
        var method = req.params.method
        accountInfo = req.remoteUser,
        channel = dao.modelFactory('channel', {
          owner_id : accountInfo.user.id,
          action : req.params.pod + '.'
        }),
        pod = channel.getPods(req.params.pod);

        if (pod && method) {
          req.remoteUser = accountInfo;

          channel.rpc(
            method,
            req.query,
            getClientInfo(req),
            req,
            res
            );

        } else {
          res.send(404);
        }
      })(req, res);
    });

    /**
      * Pass through an RPC call to a pod
      */
    express.get('/rpc/pod/:pod/:action/:method/:channel_id?', restAuthWrapper, function(req, res) {
      (function(req, res) {
        var pod = dao.pod(req.params.pod);
        action = req.params.action,
        method = req.params.method,
        cid = req.params.channel_id,
        accountInfo = req.remoteUser;

        if (pod && action && method) {
          req.remoteUser = accountInfo;

          if (cid) {
            var filter = {
              owner_id: accountInfo.id,
              id : cid
            };

            dao.find('channel', filter, function(err, result) {
              if (err || !result) {
                app.logmessage(err, 'error');
                res.send(404);
              } else {
                var channel = dao.modelFactory('channel', result),
                podTokens = channel.getPodTokens(),
                pod = dao.pod(podTokens.pod);
                pod.rpc(podTokens.action, method, req, restResponse(res), channel);
              }
            });
          } else {
            var channel = dao.modelFactory('channel', {
              owner_id : accountInfo.user.id,
              action : pod.getName() + '.' + action
            });

            channel.rpc(
              method,
              req.query,
              getClientInfo(req),
              req,
              res
              );
          }
        } else {
          res.send(404);
        }
      })(req, res);
    });

    // ----------------------------------------------------------- CATCHALLS

    // RPC Catchall
    express.get('/rpc/:method_domain?/:method_name?/:resource_id?/:subresource_id?', restAuthWrapper, function(req, res) {

      res.contentType(DEFS.CONTENTTYPE_JSON);
      var response = {};
      var methodDomain = req.params.method_domain;
      var method = req.params.method_name;
      var resourceId = req.params.resource_id;
      var subResourceId = req.params.subresource_id;
      var accountInfo = req.remoteUser;

      if (methodDomain == 'get_referer_hint') {
        referer = req.query.referer;
        if (undefined == referer) {
          referer = req.header('Referer');
        }

        if (undefined == referer) {
          response = 400;
        } else {
          result = helper.getDomainTokens(referer);
          response.hint = (result.url_tokens.auth ? result.url_tokens.auth + '_' : '') + result.domain;
          response.referer = referer;
          response.scheme = result.url_tokens.protocol.replace(':', '');
        }
        res.send(response);

      // attempts to create a bip from the referer using default settings.
      } else if (methodDomain == 'bip') {
        if (method == 'create_from_referer') {
          result = getReferer(req);

          if (undefined == result) {
            response = 400;
            res.send(response);
          } else {
            // inject the bip POST handler
            req.method = 'POST';
            req.params.resource_name = 'bip';
            req.body = {
              'name' : (result.url_tokens.auth ? result.url_tokens.auth + '_' : '') + result.domain,
              'note' : 'via ' + result.url_tokens.hostname
            }
            restAction(req, res);
          }
        } else if (method == 'get_transform_hint') {
          var from = req.query.from,
          to = req.query.to;

          if (from && to) {
            dao.getTransformHint(accountInfo, from, to, restResponse(res));
          } else {
            response = 400;
            res.send(response);
          }
        } else if (method == 'share' && resourceId) {
          if (resourceId === 'list') {
            var page_size = 10,
            page = 1,
            order_by = 'recent',
            filter = {};

            if (undefined != req.query.page_size) {
              page_size = parseInt(req.query.page_size);
            }

            if (undefined != req.query.page) {
              page = parseInt(req.query.page);
            }

            dao.list('bip_share', undefined, page_size, page, order_by, {}, restResponse(res));
          } else {
            if (subResourceId && 'test' === subResourceId) {
              var filter = {
                'owner_id' : accountInfo.getId(),
                'bip_id' : resourceId
              }

              dao.find('bip_share', filter, function(err, result) {
                if (err || !result) {
                  res.send(404);
                } else {
                  res.send(200);
                }
              });

            } else {
              var filter = {
                'owner_id' : accountInfo.getId(),
                'id' : resourceId
              }

              dao.find('bip', filter, function(err, result) {
                if (err || !result) {
                  app.logmessage(err, 'error');
                  res.send(404);
                } else {
                  dao.shareBip(dao.modelFactory('bip', result, accountInfo, true), restResponse(res));
                }
              });
            }
          }
        } else if (method == 'unshare' && resourceId) {
          var accountInfo = req.remoteUser,
          filter = {
            'owner_id' : accountInfo.getId(),
            'id' : resourceId
          };

          dao.unshareBip(resourceId, accountInfo, restResponse(res));

        // alias into account options.  Returns RESTful account_options resource
        } else if (method == 'set_default' && resourceId) {
          var accountInfo = req.remoteUser,
          filter = {
            'owner_id' : accountInfo.getId()
          };

          dao.find('account_option', filter, function(err, result) {
            if (err || !result) {
              res.send(404);
            } else {
              dao.setDefaultBip(
                resourceId,
                dao.modelFactory('account_option', result, accountInfo),
                accountInfo,
                restResponse(res)
                );
            }
          });

        } else {
          res.send(400);
        }
      } else if (methodDomain == 'domain') {
        // confirms a domain has been properly configured.  If currently
        // set as !_available, then enables it.
        if (method == 'confirm') {
          var accountInfo = req.remoteUser;
          var filter = {
            'owner_id' : accountInfo.getId(),
            'id' : resourceId
          }

          dao.find('domain', filter, function(err, result) {
            if (err || !result) {
              res.send(404);
            } else {
              var domain = dao.modelFactory('domain', result, accountInfo, true);
              domain.verify(accountInfo, restResponse(res));
            }
          });

        } else {
          res.send(response);
        }
      } else {
        res.send(400);
      }
    });

    express.get('/login', function(req, res) {
      var authorization = req.headers.authorization;

      if (!authorization) {
        res.send(401);
        return;
      }

      var parts = authorization.split(' ');

      if (parts.length !== 2) {
        res.send(400);
        return;
      }

      var scheme = parts[0]
      , credentials = new Buffer(parts[1], 'base64').toString()
      , index = credentials.indexOf(':');

      if ('Basic' != scheme || index < 0) {
        res.send(400);
        return;
      }

      var user = credentials.slice(0, index),
      pass = credentials.slice(index + 1);

      dao.checkAuth(user, pass, 'token', function(err, result) {
        if (err) {
          res.send(401)
        } else {
          req.session.account = {
            owner_id : result.user.id,
            username : result.user.username,
            name : result.user.name,
            is_admin : result.user.is_admin
          }

          res.send(publicFilter('account_option', result.user.settings));
        }
      });
    });

    express.get('/logout', function(req, res) {
      req.session.destroy();
      res.send(200);
    });

    express.all('*', function(req, res, next) {
      if (req.method == 'OPTIONS') {
        res.send(200);

      // API has no default/catchall renderer
      } else if (req.headers.host === CFG.domain_public) {
        next();
      } else {
        // try to find a default renderer for this domain
        dao.domainAuth(
          helper.getDomain(req.headers.host, true),
          true,
          function(err, accountResult) {
            if (err) {
              res.send(500);
            } else if (!accountResult) {
              next();
            } else {

              // find default renderer
              var ownerId = accountResult.getId(),
              domain = accountResult.getActiveDomainObj(),
              filter;

              if (app.helper.isObject(domain.renderer) && '' !== domain.renderer.channel_id) {
                filter = {
                  id : domain.renderer.channel_id,
                  owner_id : ownerId
                }
                dao.find('channel', filter, function(err, result) {
                  if (err) {
                    res.send(500);

                  } else if (!result) {
                    res.send(404);

                  } else {
                    req.remoteUser = accountResult;
                    channelRender(result.owner_id, result.id, domain.renderer.renderer, req, res);
                  }
                });
              }
            }
          });
      }
    });
  }
}