define([
  'underscore',
  'backbone',
  'bipclient',
  'c_channel_bip_list',
  'models/m_channel',
  'models/m_bip',
  'moment',
  'isotope'
  //   'masonry'
  ], function(_, Backbone, BipClient, CChannelBipList, ChannelModel, BipModel, moment) {


    $.Isotope.prototype._getMasonryGutterColumns = function() {
      var gutter = this.options.masonry && this.options.masonry.gutterWidth || 0;
      containerWidth = this.element.width();

      this.masonry.columnWidth = this.options.masonry && this.options.masonry.columnWidth ||
      // or use the size of the first item
      this.$filteredAtoms.outerWidth(true) ||
      // if there's no items, use size of container
      containerWidth;

      this.masonry.columnWidth += gutter;

      this.masonry.cols = Math.floor((containerWidth + gutter) / this.masonry.columnWidth);
      this.masonry.cols = Math.max(this.masonry.cols, 1);
    };

    $.Isotope.prototype._masonryReset = function() {
      // layout-specific props
      this.masonry = {};
      // FIXME shouldn't have to call this again
      this._getMasonryGutterColumns();
      var i = this.masonry.cols;
      this.masonry.colYs = [];
      while (i--) {
        this.masonry.colYs.push(0);
      }
    };

    $.Isotope.prototype._masonryResizeChanged = function() {
      var prevSegments = this.masonry.cols;
      // update cols/rows
      this._getMasonryGutterColumns();
      // return if updated cols/rows is not equal to previous
      return (this.masonry.cols !== prevSegments);
    };

    // change layout
    var isHorizontal = false;
    function changeLayoutMode( $link, options ) {
      var wasHorizontal = isHorizontal;
      isHorizontal = $link.hasClass('horizontal');

      if ( wasHorizontal !== isHorizontal ) {
        // orientation change
        // need to do some clean up for transitions and sizes
        var style = isHorizontal ?
        {
          height: '80%',
          width: $container.width()
        } :
{
          width: 'auto'
        };
        // stop any animation on container height / width
        $container.filter(':animated').stop();
        // disable transition, apply revised style
        $container.addClass('no-transition').css( style );
        setTimeout(function(){
          $container.removeClass('no-transition').isotope( options );
        }, 100 )
      } else {
        $container.isotope( options );
      }
    }

    // isotope manager
    var isoMgr = {
      _ctn : null,
      widthDefault : 1,
      activeFilter : '*',
      init : function($container) {
        var self = this;
        this._ctn = $container;
        this._ctn.isotope({
          itemSelector : '.item',
          masonry: {
            columnWidth : self.widthDefault,
          //gutterWidth:  1
          },
          animationEngine: 'css',
          getSortData : {
            created : function($el) {
              return $el.attr('data-created');
            }
          },
          sortBy : 'created',
          sortAscending : false
        });
      },
      prepend : function() {
        this._filterItems();
        this._ctn.isotope('reloadItems');
      },
      insert : function(newPage) {
        this._filterItems();
        this._ctn.isotope('appended', $('.item-page-' + newPage) );
      },
      remove : function($item) {
        $item.remove();
        this._ctn.isotope('reLayout');
      },
      _filterItems : function() {
        this._ctn.isotope({
          filter : this.activeFilter
        });
      },
      filter : function(selector) {
        this.activeFilter = selector;
        this._filterItems();
      },
      setLayout : function(mode) {
        var self = this;
        if ('list' === mode) {
          this._ctn.isotope({
            layoutMode : 'straightDown',
            columnWidth : this._ctn.width(),
            filter : self.activeFilter
          });
        } else if ('tile' === mode) {
          this._ctn.isotope({
            columnWidth : self.widthDefault,
            layoutMode : 'masonry',
            filter : self.activeFilter
          });
        }
      }
    }

    var _decodeEntities = function() {
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
    }();

    // List View
    var FeedListView = Backbone.View.extend({
      el: '#feed-list', // render widget to this container

      appID : 'feed_manager', // identify bips created with this app

      tplFeedEntity :  _.template( $('#tpl-feed-entity').html() ), // list entity
      tplSettings :  _.template( $('#tpl-feed-settings').html() ), // feed app settings
      tplContainer :  _.template( $('#tpl-feed-container-entity').html() ), // feed app settings
      tplSubscriber :  _.template( $('#tpl-feed-container-subscriber-entity').html() ), // feed app settings

      tplContainerModal : _.template($('#tpl-feed-container-modal').html()),
      tplViewModal : _.template($('#tpl-feed-view-modal').html()),

      
      tplProducerEntityModal : _.template($('#tpl-feed-producer-entity').html()),

      _container : null,
      _router : null,

      modalView : null,
      appendMode : false,

      active : false,
      proxyChannel : null,

      initialize: function(container, router) {
        var self = this;
        _.bindAll(
          this,
          'render',
          'renderRows',
          'fetchNext',

          '_createItem',
          '_setLayout',
          '_renderSettings',
          '_feedAddContainer',
          '_createBip',
          '_addProducer',
          '_removeProducer',
          '_containerModal',
          '_setupResize',
          'viewModal'
          );

        this.collection = BipClient.getCollection('feed');
        this.collection.page = 1;
        //this.collection.bind('reset', this.renderRows);
        this._container = container;
        this._router = router;

        $(window).scroll(function(ev) {
          var margin = 0 + $(document).height() - ( $(window).scrollTop() ) - $(window).height();
          if (0 === margin) {
            self.fetchNext(ev);
          }
        });

        // look for a proxy channel
        this.proxyChannel = BipClient.getCollection('channel').where({
          action : 'http.request'
        }).pop();

        // create proxy (for ssl encapsulation)
        if (!this.proxyChannel) {
          var c =  BipClient.getCollection('channel').newModel({
            action : 'http.request',
            name : 'Feed Proxy',
            app_id : this.appID
          });

          c.save(
          {},
          {
            silent  : false,
            sync    : false,
            success : function(model, res, xhr) {
              BipClient.getCollection('channel').fetch({
                success : function() {
                  BipClient.decorateChannels();
                  self.trigger('refresh');
                  self.proxyChannel = BipClient.getCollection('channel').where({
                    action : 'http.requests'
                  }).pop()
                }
              });
            },
            error: function(model, res) {
              BipClient.growl('Full articles may not be available', 'error');
            }
          });
        }
      },

      events: {
        'scroll' : 'fetchNext'
      },

      // render view
      render: function(id, mode, childId) {

        var self = this;

        $('#page-body .container').addClass('full-width');
        $('body').addClass('feed-cover');

        // usually there's no way of telling what source channel content
        // really came from after its traversed a graph, so we need
        // to stitch some promises and cross fingers
        this._renderSettings().then(function() {
          // just a little bump to make sure any animations have finished
          setTimeout(function() {
            self.renderRows(id);
          }, 1000);
        });

        $('a#feed-fetch-next').on('click', this.fetchNext);
        this.active = true;
      },

      // shutdown view
      shutdown : function() {
        // remove settings toggle
        $('#app-settings-container').removeClass('bounceInDown');
        $('body').removeClass('tray-open');

        $('#page-body .container').removeClass('full-width');
        $('body').removeClass('feed-cover');

        this.active = false;
      },

      _setLayout : function(ev) {
        isoMgr.setLayout($(ev.currentTarget).attr('data-mode'));
      },

      filterBipCID : function(cid) {
        var target = $('.ag-list-results a.subscriber-' + cid),
        targetActive = !target.hasClass('defocused'),
        haveInactive = $('.ag-list-results a:not(.subscriber-' + cid + ')').hasClass('defocused');

        $('.ag-list-results a').removeClass('defocused');

        if (targetActive && haveInactive) {
          isoMgr.filter('*');
        } else {
          $('.ag-list-results a:not(.subscriber-' + cid + ')').addClass('defocused');
          isoMgr.filter('.bip-cid-' + cid);
        }

      },

      //
      _createItem : function(page, item) {
        var self = this,
        channel = BipClient.getCollection('channel').get(item.get('_channel_id')),
        itemJSON = item.toJSON(),
        wRand =  Math.random() * 10,
        hRand = Math.random() * 10,
        wClass = 'item-w-small',
        hClass = 'item-h-small',
        img, icon, dim, defaultImg, $itemDOM;

        if (wRand > 7) {
          wClass = 'item-w-large';
        } else if (wRand > 4) {
          wClass = 'item-w-medium';
        }

        if (hRand > 7) {
          hClass = 'item-h-large';
        } else if (wRand > 4) {
          hClass = 'item-h-medium';
        }

        itemJSON.icon = itemJSON.icon || (channel ? channel.get('config').icon : '');
        itemJSON.page = page;
        itemJSON.srcBipID = self._bipCIDMap[itemJSON.src_bip_id];

        // push images in description via proxy

        var $description = $('<span>' + itemJSON.description + '<span>'),
        $dImgs = $('img', $description),
        imgSrc,
        proxyEndpoint = BipClient.getRendererURI(self.proxyChannel.get('id'), 'proxy');

        if ($dImgs.length) {
          for (var i = 0 ; i < $dImgs.length; i++) {
            imgSrc = $dImgs.attr('src');
            $dImgs.attr('src', proxyEndpoint + '?url=' + imgSrc);
          }
        }

        itemJSON.description = $description.html().toString();

        icon = (channel && channel.get('config').icon) || itemJSON.image

        $itemDOM = $(self.tplFeedEntity(itemJSON));

        if (itemJSON.image && '' !== itemJSON.image) {
          // use feed image if available
          img = $('<img src="' + itemJSON.image + '">');
          
          dim = itemJSON.image_dim;
          
          if (dim.width < 430) { // item-w-medium
            wClass = 'item-w-small';
          } else if (dim.width < 870) { // item-w-large
            wClass = 'item-w-medium';
          }
          
          if (dim.height < 430) { // item-w-medium
            hClass = 'item-h-small';
          } else if (dim.height < 870) { // item-w-large
            hClass = 'item-h-medium';
          }
          
        } else {
          // or try to extract from content
          img = $('img', $('<div>' + itemJSON.description + '</div>'));
        }

        $itemDOM.addClass(wClass + ' ' + hClass);

        if (img.length > 0 && !/buyselladds/i.test($(img[0].outerHTML).attr('src'))) {
          defaultImg = $(img[0].outerHTML).attr('src');
        } else {
          if (icon && '' !== icon && '[%source#image%]' !== icon) {
            defaultImg = icon;
          }
        }

        if (defaultImg) {
          $('.cover', $itemDOM).css(
          {
            "background-image": "url(" + defaultImg + ")",
            "background-size": "cover"
          });
        }

        return $itemDOM;

      },

      // renders result rows and pagination
      renderRows: function() {
        var self = this,
        append = this.appendMode,
        itemJSON,
        dom, img, items = [], itemDOM, iWidth, cover,
        channels = BipClient.getCollection('channel'),
        currentPage = this.collection.page,
        pageSize = this.collection.page_size,
        channel,
        icon,
        defaultImg = '';

        $container = this.$el;

        if (!append) {
          $container.empty();
        }

        this.collection.models.forEach( function (item) {
          $container.append(self._createItem(currentPage, item));
        });

        if (!append) {
          isoMgr.init($container);
        } else {
          isoMgr.insert(currentPage);
        }

        $('.item').on('mouseover', function() {
          $('.feed-entity-toolbar', this).addClass('shown');
        });

        $('.item').on('mouseout', function() {
          $('.feed-entity-toolbar', this).removeClass('shown');
        });

        $('.entity-delete').on('mouseover', function() {
          $(this).addClass('label-danger');
        });

        $('.entity-delete').on('mouseout', function() {
          $(this).removeClass('label-danger');
        });


        $('.entity-view').on('mouseover', function() {
          $(this).addClass('label-primary');
        });

        $('.entity-view').on('mouseout', function() {
          $(this).removeClass('label-primary');
        });
        
        // delete button
        $('.entity-delete').on('click', function() {
          var $item = $(this).parent().parent();
          var tokens = $item.attr('id').split('_'),
          cid = tokens[1],
          feedId = tokens[2],
          entityId = tokens[3],
          rpcUrl = BipClient.getCollection('channel').get(cid).get('_renderers').remove_entity._href
          + '?guid=' + entityId;

          BipClient._request(
            null,
            //rpcUrl.replace(".io/", '.io:5000/'),
            rpcUrl,
            'GET',
            function(resData, payload) {
              isoMgr.remove($item);
            },
            function(xhr_status, status, errText, payload) {
              BipClient.growl('Internal Error, could not remove', 'error');
            },
            true
            );
        });
        
        // launch preview modal
        $('.entity-view').on('click', function() {
          var $p = $(this).closest('.item');                    
          self.viewModal(
            self.collection.where({ guid : $(this).closest('.item').attr('data-guid') }).pop().toJSON()
          );
        });
        
      },

      _setupResize : function($modal) {
        
        $modal.draggable();
        
        if ($modal.data('uiResizable')) {
          $modal.resizable('destroy');
        }

        $('.modal-body', $modal).css({
          position: 'absolute',
          bottom: '69px',
          top: '52px',
          left: 0,
          right: 0,
          overflow: 'auto'
        });

        $('footer.modal-footer', $modal).css({
          position: 'absolute',
          bottom : 0,
          left: 0,
          right : 0
        });
        
        //

        $modal.resizable();
      },
      
      // container setup
      _containerModal : function(cid) {
        var $modal = $('#settingsModal'),
        self = this,
        channel = BipClient.getCollection('channel').get(cid),
        modelJSON = {
          channel : channel.toJSON()
        },
        $modalContent = $(this.tplContainerModal(modelJSON)),
        entities = _.map(self._containerProducerCache[cid], function(p) {
          return p.toJSON()
        }),
        $entityCnt = $('#producer-list', $modalContent);

        $entityCnt.empty();

        // add producers
        for (var i = 0; i < entities.length; i++) {
          $entityCnt.append(this.tplProducerEntityModal(entities[i]));
        }

        //
        $modalContent.appendTo($('body'));

        $modalContent.find('button#add-producer').on('click', function(ev) {
          var $url = $(this).siblings('input');
          ev.preventDefault();
          ev.stopPropagation();

          var url = $url.val(),
          containerId = $(this).parent().attr('data-cid'),
          $ctlGroup = $(this).parent().parent();

          if (!url) {
            $ctlGroup.addClass('error');
          } else {
            $ctlGroup.removeClass('error');

            //
            self._addProducer(containerId, url, $modalContent);
            $url.val('');
          }
        });

        // drop channel (+ subscriber bips where this channel is a trigger)
        $entityCnt.find('button.remove-channel').on('click', self._removeProducer);

        $('#new-producer-form input[type=text]').on('keyup', function(ev) {
          if (13 === ev.keyCode) {
            ev.stopPropagation();
            ev.preventDefault();
            $('#new-producer-form input[type=button]').find('button').click();
          }
        });

        $('.modal-footer a', $modalContent).on('click', function(ev) {
          var $el = $(this),
          channelName = $('#channel-name').val(),
          channel = BipClient.getCollection('channel')
          .get($('.modal.feed-container').attr('data-cid'));

          if (!$el.hasClass('modal-close')) {
            ev.stopPropagation();
            ev.preventDefault();
          }

          if ($el.attr('id') === 'save-container') {
            // update channel
            if (channelName !== channel.get('name')) {
              // check for collision
              if (BipClient.getCollection('channel').where({
                name : channelName
              }).length === 0) {
                channel.set('name', channelName);
                if (channel.isValid(true)) {
                  channel.save(
                  {},
                  {
                    success : function() {
                      $modalContent.modal('hide');
                      BipClient.growl('Renamed');
                    },
                    error : function() {

                    }
                  }
                  );
                } else {
                  BipClient.growl('Unknown Error', 'error');
                }

              //;
              } else {
                BipClient.growl(channelName + ' is in use', 'error');
              }
            }

          } else if ($el.attr('id') === 'delete-container') {
            var feedCid = $('.modal').attr('data-cid'),
            feedModel = BipClient.getCollection('channel').get(feedCid),
            bipDeletions = [],
            bipCollection = BipClient.getCollection('bip'),
            bipModel;

            // delete feed and any bips sending to it
            for (var i = 0; i < feedModel.bips.length; i++) {
              bipModel = bipCollection.factory({
                id : feedModel.bips[i]
                });
              bipDeletions = bipModel.destroy();
            }

            $.when.apply($, bipDeletions).then(function() {
              feedModel.destroy({
                success : function() {
                  isoMgr.remove($('.item.cid-' + feedCid));
                  $('#container-' + feedCid).remove();
                  BipClient.growl('Container Removed');
                },
                error : function() {
                  BipClient.growl('Unknown Error', 'error');
                }
              });
            });

            $modalContent.modal('hide');
          }
        });

        $modalContent.modal('show').on('hidden', function() {
          $(this).remove();
        }).on('shown', function() {
          $('#new-producer-form input[type=text]').focus();
        });
      },

      viewModal : function(entity) {
        var $modal = $('#previewModal'),
          self = this,
          dimWidth = entity.image_dim ? entity.image_dim.width : 0;

        //entity.description_decoded = $("<div/>").html(entity.description).text();
        
        //entity.description_decoded = _decodeEntities(entity.description);

        var $modalContent = $(this.tplViewModal(entity));
        $modalContent.on('hidden', function() {
          $(this).remove();
        })
        .on('show', function() {
          var $this = $(this);
          
          $this.css({
            top: '2%',
            'min-height' : '95%',
            'max-height' : $(window).height(),
            width: (dimWidth + 58) || '40%',
            'min-width': '20%'
          });        
          $('.modal-header h2', $this).css({
            width: '100%'
          });
        })
        .on('shown', function() {
          self._setupResize($(this));
        }).modal('show');
          
      },      

      _containerProducerCache : {
      },

      _bipCIDMap : {

      },

      _createBip : function(containerId, model, $modalContent) {
        var self = this;
        // create (bip) subscription
        var bipStruct = {
          name : model.get('name').substring(0, 64),
          type : 'trigger',
          app_id : self.appID,
          config : {
            channel_id : model.get('id')
          },
          hub : {
            source : {
              edges : [ containerId ],
              transforms : {
            }
            }
          },
          note : model.get('note')
        };

        bipStruct.hub.source.transforms[containerId] = {
          "category": "",
          "icon": "[%source#icon%]",
          "image": "[%source#image%]",
          "author": "[%source#author%]",
          "created_time": "[%source#pubdate%]",
          "url": "[%source#link%]",
          "summary": "[%source#summary%]",
          "description": "[%source#description%]",
          "title": "[%source#title%]"
        };

        var bModel = new BipModel(bipStruct);
        if (bModel.isValid(true)) {
          bModel.save(
          {},
          {
            silent : false,
            sync : true,
            success : function(bipModel, res, xhr) {
              BipClient.getCollection('channel').fetch({
                reset : true
              });
              BipClient.growl('Subscribed to <strong>' + model.get('name') + '</strong>');

              // add to modal entities
              var $entityCnt = $('#producer-list', $modalContent),
              $producer = self.tplProducerEntityModal(model.toJSON());
              $entityCnt.append($producer);

              $('button.remove-channel', $producer).on('click', self._removeProducer);
            },
            err : function() {
              BipClient.growl('Unknown Error', 'error');
            }
          }
          );
        }
      },

      _removeProducer : function(ev) {
        var self = this,
        cid = $(ev.currentTarget).parent().attr('data-cid'),
        containerCid = $('.modal').attr('data-cid'),
        rpcUrl = BipClient.getCollection('channel').get(containerCid).get('_renderers').remove_by_bip._href
        + '?id=';

        // delete entries from container
        for (var bipId in self._bipCIDMap) {
          if (self._bipCIDMap.hasOwnProperty(bipId) && cid === self._bipCIDMap[bipId]) {
            // remove entries by this bip id
            BipClient._request(
              null,
              //(rpcUrl + bipId).replace(".io/", '.io:5000/'),
              rpcUrl + bipId,
              'GET',
              function(resData, payload) {
                isoMgr.remove($('.item.bip-cid-' + cid));
              },
              function(xhr_status, status, errText, payload) {
                BipClient.growl('Internal Error, could not remove content', 'error');
              },
              true
              );

            // drop the bip.  subscriber channel still stays in the system
            // until they want to track it again.
            BipClient.getCollection('bip').factory({
              id : bipId
            } ).destroy({
              success : function(model, response) {
                BipClient.growl('Subscription Deleted');
                $('li[data-cid=' + cid + ']').remove();
              },
              error : function(model, response) {
                BipClient.growl('Could Not Remove Subscriber', 'error');
              }
            });
          }
        }

        ev.preventDefault();
        ev.stopPropagation();
      },

      // adds a syndication.subscribe channel and trigger bip for the
      // target container, then syncs to UI
      _addProducer : function(containerId, url, $modalContent) {
        var self = this,
        pods = BipClient.getCollection('pod'),
        channelStruct = {
          action : 'syndication.subscribe',
          config : {
            url : url
          },
          name : pods.get('syndication').get('actions').subscribe.description,
        }, channel;

        channel = BipClient.getCollection('channel').find(
          function(c) {
            return url === c.get('config').url
          });

        if (!channel) {
          channel = new ChannelModel(channelStruct);
          if (channel.isValid(true)) {
            channel.save(
              null,
              {
                silent  : false,
                sync    : true,
                success : function(model, res, xhr) {
                  self._createBip(containerId, model, $modalContent);
                },
                error: function(model, res, xhr) {
                  BipClient.growl('Unknown Error', 'error');
                }
              });
          }
        } else {
          this._createBip(containerId, channel, $modalContent);
        }
      },

      // adds a container (syndication.feed)
      _feedAddContainer : function($feedCnt, channel) {
        var self = this,
        promise = $.Deferred(),
        $containerHTML = $(this.tplContainer({
          channel : channel.toJSON()
        })),
        collection = new CChannelBipList(channel.get('id')),
        subscribeChannels = BipClient.getCollection('channel').where({
          action : 'syndication.subscribe'
        });

        channel.bips = [];


        $('button', $containerHTML).on('click', function() {
          var cid = $(this).attr('data-cid'),
          collection = new CChannelBipList(cid);
          self._containerModal($(this).attr('data-cid'));
        });

        // get bips for this feed
        collection.fetch({
          success : function(collection, results) {
            var subChannel,
            subscriberHTML,
            $innerContent = $('.accordion-inner ul.ag-list-results', $containerHTML);
            self._containerProducerCache[collection.channelId] = [],

            _.each(results.data, function(bip) {

              self._bipCIDMap[bip.id] = bip.config.channel_id;

              channel.bips.push(bip.id);

              subChannel = _.findWhere(subscribeChannels, {
                id : bip.config.channel_id
              });

              if ('trigger' === bip.type
                && bip.config
                && subChannel) {

                if (!self._containerProducerCache[collection.channelId]) {
                  self._containerProducerCache[collection.channelId] = [];
                }
                self._containerProducerCache[collection.channelId].push(subChannel)
                subscriberHTML = self.tplSubscriber(subChannel.toJSON());

                $innerContent.append(subscriberHTML);
              }
            });

            $('a', $innerContent).on('click', function(ev) {
              ev.stopPropagation();
              ev.preventDefault();
              self.filterBipCID($(this).attr('data-cid'));
            })

            promise.resolve();
            $feedCnt.append($containerHTML);
          },
          error : function() {
            promise.reject();
          }
        });

        // update container
        BipClient.getCollection('channel').bind('sync', function(collection, model, resp) {
          if (self.active) {
            self._renderSettings();
          }
        });

        return promise;

      },

      _renderSettings : function() {
        var self = this,
        promise = $.Deferred();

        // render settings container
        $('.settings').html(this.tplSettings());

        // get all feeds
        var feeds = BipClient.getCollection('channel').where({
          action : 'syndication.feed'
        }),
        $feedCnt = $('#feed-containers'),
        pods = BipClient.getCollection('pod');

        $feedCnt.empty();

        //
        $('#layout-select button').on('click', this._setLayout);

        // new feed create
        $('#new-feed button').on('click', function(ev) {
          var feedName = $(this).siblings('input[type=text]').val().trim(),
          $container = $(this).parent().parent(),
          $helpBlock = $(this).siblings('.help-block');

          if (!feedName) {
            $container.addClass('error');
            $helpBlock.html('Name Required');

          } else if (BipClient.getCollection('channel').where({
            name : feedName
          }).length ) {

            $container.addClass('error');
            $helpBlock.html('Already In Use');

          } else if (feedName) {
            $container.removeClass('error');
            $helpBlock.empty();

            // create channel
            var cStruct = {
              name : feedName,
              action : 'syndication.feed'
            },
            channel = new ChannelModel(cStruct);

            if (channel.isValid(true)) {
              channel.save(
              {},
              {
                silent  : false,
                sync    : true,
                success : function(model, res, xhr) {
                  BipClient.getCollection('channel').fetch({
                    reset : true
                  });

                  BipClient.growl('Container <strong>' + res.name + '</strong> Saved');

                  // update feed container
                  self._feedAddContainer($feedCnt, model);
                },
                error: function(model, res, xhr) {
                  BipClient.growl('Unknown Error', 'error');
                }
              }
              );
            }
          }
        });



        // append each available subscription/bip to container
        var promises = [];
        _.each(feeds, function(channel) {
          promises.push(self._feedAddContainer($feedCnt, channel))
        });

        $.when.apply($, promises).then(function() {
          promise.resolve();
        });

        $('#app-settings-container').addClass('bounceInDown');

        return promise;
      },

      fetchNext : function(ev) {
        if (this.collection.page < this.collection.num_pages) {
          var self = this;
          this.appendMode = true;
          this.collection.nextPage();
          // backbone needs a success now to emit the sync event?
          this.collection.fetch({
            success : function(collection, resp, options) {
              self.renderRows(collection, resp, options);
            //this.collection.bind('reset', this.renderRows);
            }
          });
        }

        ev.preventDefault();
        ev.stopPropagation();
      }

    });

    return FeedListView;
  });

