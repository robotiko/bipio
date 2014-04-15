/**
 * Handles the hub configuration gruntwork, modal/transforms and d3 rendering
 *
 */
define([
  'd3',
  'underscore',
  'backbone',
  'bipclient',
  'views/channel/v_channel_list'
  ], function(d3, _, Backbone, BipClient, ChannelListView){
    HubView = Backbone.View.extend({
      el: '#hub',
      tplModal : _.template($('#tpl-modal-hub-channel-config').html()),

      // modal contents
      tplChannelSelectModal : _.template($('#tpl-modal-channel-select').html()),
      tplTransformModal : _.template($('#tpl-modal-hub-transform-config').html()),

      // transform entity
      tplTransform : _.template($('#tpl-modal-hub-channel-transform').html()),

      _activeModal : null,
      _bipSource : null, // source bip type
      _actions : null,

      _currentExports : null,

      _layoutConfig : {
        width : 600,
        height : 400
      },
      _mouseState: {
        upNode : null,
        downNode : null,
        upLink : null,
        downLink : null
      },
      // node/link active selections
      _selectionState : {
        link : null, // d3 node
        node : null // d3 link
    },
      _svg : null,
      _forceLayout : null,
      _link : null,
      _node : null,
      _links : [],
      _nodes : [],
      _vis : null,
      _tooltip : null,
      _drag_line : null, // line drag vis when attaching new channels

      initialize:function (bipSource) {
        _.bindAll(this,
          'render',

          // d3
          '_redraw',
          '_rescale',
          '_displayScale',
          '_tick',
          '_getNodeStruct',
          '_removeSelectedNode',
          '_setSelectedNodeParams',
          '_spliceNodeLinks',
          '_clearMouseState',
          '_mouseCtl',
          '_keyCtl',
          '_getExports',
          '_buildExports',
          '_setExports',
          '_bindBipSource',
          '_addEdge',

          // modal, channel+transforms
          '_initModal',
          '_createModal',
          '_setupResize',
          '_hubChannelModal',
          '_renderTransforms',
          '_destroyModal',
          '_select2Templar'
          );

        this._bipSource = bipSource;
        this._actions = BipClient.getCollection('channel').getActions();

        pods = BipClient.getCollection('channel').getPods();
        // bip 'source' always available
        if (pods.indexOf('bipio') === -1) {
          pods.push('bipio');
        }

        // undefined node fill (config pending)
        pods.push('undefined');

        var fill = d3.scale.category20();

        // derive maximum svg width
        var el = $('<div class="' + $('#bip-setup').attr('class') + '"></div>');
        $('body').append(el);
        this._layoutConfig.width = el.width();
        el.remove();

        // init svg
        this._svg = d3.select(this.el)
        .append("svg:svg")
        .attr("width", this._layoutConfig.width)
        .attr("height", this._layoutConfig.height)
        .attr("pointer-events", "all");

        // setup channel fill definitions for available pods
        for (var i = 0; i < pods.length; i++) {
          var defs = this._svg.append('svg:defs');
          defs.append('svg:defs')
          .append('svg:pattern')
          .attr('id', pods[i] === 'undefined' ? pods[i] : 'image_' + pods[i] )
          .attr('patternUnits', 'objectBoundingBox')
          .attr('height', 32)
          .attr('width', 32)
          .append('svg:image')
          .attr('xlink:href', '/static/img/channels/32/color/' + pods[i] + '.png')
          .attr('x', 0)
          .attr('y', 0)
          .attr('width', 32)
          .attr('height', 32);
        }

        // define arrow markers for graph links
        this._svg.append('svg:defs')
        .append('svg:marker')
        .attr('id', 'end-arrow')
        .attr('viewBox', '0 -5 10 10')
        .attr('refX', 28)
        .attr('markerWidth', 3)
        .attr('markerHeight', 4)
        .attr('orient', 'auto')
        .append('svg:path')
        .attr('d', 'M0,-5L10,0L0,5')
        .attr('fill', 'inherit')
        .attr("class", "arrow");

        this._vis = this._svg
        .append('svg:g')
        .call(d3.behavior.zoom().on("zoom", this._rescale).scaleExtent([0.5, 2]))
        .on("dblclick.zoom", null)
        .append('svg:g')
        .on("mousemove", this._mouseCtl('move'))
        .on("mousedown", this._mouseCtl('down'))
        .on("mouseup", this._mouseCtl('up'));

        this._vis.append('svg:rect')
        .attr('width', this._layoutConfig.width)
        .attr('height', this._layoutConfig.height)
        .attr('fill', 'transparent');

        // line displayed when dragging new nodes
        this._drag_line = null;
        this._drag_line = this._vis.append("line")
        .attr("class", "drag_line")
        .attr("x1", 0)
        .attr("y1", 0)
        .attr("x2", 0)
        .attr("y2", 0)
        .attr("class", "drag_line_hidden");

        d3.select('#hub-focus').on("keydown", this._keyCtl);

        //Create tooltip element
        this._tooltip = d3.select(this.el)
        .append("div")
        //.attr("class", "hub-tooltip")
        .attr("id", "hub-tooltip")
        .style("position", "absolute")
        .style("z-index", "10")
        .style("opacity", 0);
      },

      render : function(hub) {
        // convert hub to a d3 graph struct
        var struct = this._hub2D3(hub);
        this._forceLayout = d3.layout.force()
        .nodes(struct.nodes)
        .links(struct.links)
        .size([this._layoutConfig.width, this._layoutConfig.height])
        .on("tick", this._tick);

        // get layout properties
        this._nodes = this._forceLayout.nodes();
        this._links = this._forceLayout.links();

        this._node = this._vis.selectAll(".node");
        this._link = this._vis.selectAll(".link");

        this._redraw();
      },

      _displayScale : function(newScale) {
        $('#svg-scale').html(Math.floor(newScale * 100) + '%');
      },

      // redraw force layout
      _redraw : function(debug) {
        var self = this;

        // LINK RENDER
        this._link = this._link.data(this._links,
          function(d) {
            return d.source.channel_id + "-" + d.target.channel_id;
          }
          );

        this._link
        .enter()
        .insert("line", ".node")
        .style('marker-end', function(d) {
          return 'url(#end-arrow)'
        })
        .attr("class", "link")
        .on("mousedown", function(d) {
          self._mouseState.downLink = d;
          if (self._mouseState.downLink == self._selectionState.link) {
            self._selectionState.link = null;
          } else {
            self._selectionState.link = self._mouseState.downLink;
            $('#hub-focus').focus();
          }
          self._selectionState.node = null;

          self._redraw();
        });

        this._link.exit().remove();

        this._link.classed("link_selected", function(d) {
          return d === self._selectionState.link;
        });

        // NODE RENDER
        this._node = this._node.data(this._nodes, function(d) {
          return d.channel_id
        });

        this._node
        .enter()
        .insert("circle")
        .attr("class", "node")
        .attr('fill', function(d) {
          return 'url(#' + d.fill + ')';
        })
        .attr("r", 40)
        // Double click on channel, transforms modal
        .on("dblclick", function(d) {
          // source channel (bip) is not configurable
          if (d.channel_id != 'source') {

            if (d._dirty) {
              BipClient.growl('Can not configure an orphaned channel', 'error');
              return;
            }

            self._mouseState.downNode = d;
            self._selectionState.node = self._mouseState.downNode;

            // kill drag line
            self._drag_line.attr("class", "drag_line_hidden")

            self._redraw();

            // modal needs to launch after _redraw, otherwise
            // the simulation will render off the canvas
            self._initModal(d.channel_id, 'transforms');
          }
        })
        .on("mousedown",
          function(d) {
            // disable zoom
            self._vis.call(d3.behavior.zoom().on("zoom"), null);

            self._mouseState.downNode = d;

            // can't select source node (bip source)
            if (d.channel_id && d.channel_id !== 'source') {

              // deselect
              if (self._mouseState.downNode == self._selectionState.node) {
                self._selectionState.node = null;
              } else {
                // select
                self._selectionState.node = self._mouseState.downNode;
                $('#hub-focus').focus();
              }
            }

            // deselect link
            self._selectionState.link = null;

            // reposition drag line
            self._drag_line
            .attr("class", "link")
            .attr("x1", self._mouseState.downNode.px)
            .attr("y1", self._mouseState.downNode.py)
            .attr("x2", self._mouseState.downNode.px)
            .attr("y2", self._mouseState.downNode.py);

            self._redraw();
          })
        .on('mousedrag', function(d) {
          self._redraw();
        })
        // detect loop and create new link + node if none
        .on('mouseup',
          function(d) {
            if (self._mouseState.downNode) {
              self._mouseState.upNode = d;
              if (self._mouseState.upNode == self._mouseState.downNode) {
                self._clearMouseState();
                return;
              }

              var targetIndegree = 0, link;
              for (var i = 0; i < self._links.length; i++) {
                link = self._links[i];
                if (link.target === self._mouseState.upNode) {
                  targetIndegree++;
                  break;
                }
              }

              if (targetIndegree === 0 && self._mouseState.upNode.channel_id !== 'source') {
                link = {
                  source: self._mouseState.downNode,
                  target: self._mouseState.upNode
                };
                self._links.push(link);
                // select new link
                self._selectionState.link = null;
                self._selectionState.node = self._mouseState.downNode;

                link.target._dirty = false;

              } else {
                BipClient.growl('No Loops Allowed', 'error');
                // select new link
                self._selectionState.link = null;
                self._selectionState.node = null;
              }

              // enable zoom
              self._vis.call(d3.behavior.zoom().on("zoom"), self._rescale);
              self._redraw();
            }
          })
        .on("mouseover", function(node) {
          if (node.channel_id === 'source') {
            return;
          }
          var pos = d3.mouse(this);

          self._tooltip.html(
            "<span><label>"
            + BipClient.getCollection('pod').getPod(node.action).get('description')
            + "</label> : "
            + node.label
            +"</span>")
          .style("top", (pos[1])+"px")
          .style("left",(pos[0])+"px")
          .style("z-index", 10)
          .style("opacity", .9);
        })
        .on("mousemove", function(node) {
          var pos = d3.mouse(this);
          self._tooltip
          .style("top", (d3.event.pageY - 10)+"px")
          .style("left",(d3.event.pageX - 10)+"px");
        })
        .on("mouseout", function(node) {
          self._tooltip
          .style("z-index",  -1)
          .style("opacity", 0);    //Make tooltip invisible
        })
        .transition()
        .duration(1000)
        .ease('bounce')
        .attr("r", 16);

        this._node.exit().transition()
        .attr("r", 0)
        .remove();

        this._node.classed("node_selected", function(d) {
          return d === self._selectionState.node;
        });

        this._node.classed("node_orphan", function(d) {
          return d._dirty;
        });

        if (d3.event) {
          // prevent browser's default behavior
          d3.event.preventDefault();
        }

        this._forceLayout
        .linkDistance(60)
        .charge(-800)
        .size([this._layoutConfig.width, this._layoutConfig.height]);

        this._forceLayout.start();
      },

      // ----------------------------------------------- GRAPH INTERACTION

      // maintain type and source channel (trigger bip) state for
      // the 'source' node as a means for tracking source transforms
      _bindBipSource : function(newSource) {
        this._bipSource = newSource;

        // find 'source' node and update type + exports
        for (var i = 0; i < this._nodes.length; i++) {
          if (this._nodes[i].channel_id == 'source') {
            this._nodes[i]._bipSource = this._bipSource;
            break;
          }
        }
      },


      // attaches an edge with transforms to the selected
      // nodees parent
      _addEdge : function() {
        var ptr,
        template,
        node = this._selectionState.node,
        hub = node._bipSource.get('hub'),
        parent = node._parent,
        transforms = {};

        $('div[id^=import]').each(function(idx, el) {
          el = $(el);
          el.templar('computeTemplate');
          //template = transforms[el.attr('data-template')];
          template = el.attr('data-template');
          if (template && '' !== template) {
            //transforms[el.attr('data-template')] = el.attr('id').replace(/^import-/, '');
            transforms[el.attr('id').replace(/^import-/, '')] = el.attr('data-template');
          }
        });

        //
        if (!hub[parent.channel_id]) {
          hub[parent.channel_id] = {};
        }

        if (!hub[parent.channel_id].edges) {
          hub[parent.channel_id].edges = [];
        }

        if (!hub[parent.channel_id].transforms) {
          hub[parent.channel_id].transforms = {};
        }

        ptr = hub[parent.channel_id];

        ptr.transforms[node.channel_id] = transforms;

        if ($.inArray(node.channel_id, ptr.edges) < 0) {
          ptr.edges.push(node.channel_id);
        }

        this._activeModal.modal('hide');
      },

      _removeSelectedNode : function() {
        var bip, n;

        // can't delete source nodes
        if (this._selectionState.node && this._selectionState.node.channel_id !== 'source') {

          // drop from hub
          n = this._selectionState.node;
          bip = n._bipSource;
          bip.removeEdge(n._parent.channel_id, n.channel_id);

          // mark children as dirty
          _.each(
            this._links,
            function(link) {
              if (link.source === n) {
                link.target._dirty = true
              }
            }
            );

          this._selectionState.node = null;
          this._nodes.splice(this._nodes.indexOf(n), 1);
          this._spliceNodeLinks(n);
          this._currentExports = null;
          n._parent = null;
        }
      },

      _spliceNodeLinks : function(node) {
        var self = this,
        toSplice = this._links.filter(
          function(linkNode) {
            return (linkNode.source === node) || (linkNode.target === node);
          });

        toSplice.map(
          function(node) {
            self._links.splice(self._links.indexOf(node), 1);
          });

      },

      /**
             * Updates the selected node with the given channel id's
             * parameters
             */
      _setSelectedNodeParams : function(cid) {
        if (this._selectionState.node) {
          if (cid) {
            if (!this._selectionState.node.oldChannelId && this._selectionState.node.channel_id) {
              this._selectionState.node.oldChannelId = this._selectionState.node.channel_id;
            }

            var channel = BipClient.getCollection('channel').get(cid);

            this._selectionState.node.channel_id = cid;
            this._selectionState.node.label = channel.get('name');

            this._selectionState.node.fill = 'image_' + channel.get('action').split('.')[0];
            this._selectionState.node.gone = false;
            this._selectionState.node.action = channel.get('action');

            // update svg
            $('.node_selected').attr('fill', 'url(#' + this._selectionState.node.fill + ')');

          } else {
            this._selectionState.node.channel_id = null;
            this._selectionState.node.fill = '';
            this._selectionState.node.gone = true;
          }
        }
      },

      /**
            * @param string cid Channel ID
            */
      _getNodeStruct : function(cid) {
        // don't break hubs where channels have been deleted
        // use the existence of a 'gone' edge to deny saving
        // the hub until resolved.
        var nStruct = {
          channel_id : cid,
          gone : false,
          fill : '',
          weight : 2,
          transforms : {}
        },
        fill,
        triggerId,
        bip = this._bipSource,
        channel = BipClient.getChannel(cid);

        if ('source' === cid) {
          triggerId = bip.get('config').channel_id;
          if (bip.get('type') === 'trigger' && triggerId ) {
            channel = BipClient.getChannel(triggerId);
            fill = 'image_' + channel.get('action').split('.')[0];
          } else {
            fill = 'image_bipio';
          }

          nStruct = {
            channel_id : 'source',
            label : this._bipSource.get('name') || this._bipSource.get('_repr'),
            gone : false,
            fill : fill,
            action : this._bipSource.get('action')
          };

        } else {
          if (channel) {
            nStruct.action = channel.get('action');
            nStruct.label = channel.get('name');
            nStruct.fill = 'image_' + channel.get('action').split('.')[0];
          } else {
            nStruct.gone = true;
            nStruct.label = 'GONE!';
          }
        }

        nStruct._bipSource = this._bipSource;

        return nStruct;
      },

      _hub2D3 : function(hub) {
        var cid,
        links = [],
        nodes = [],
        // maintain hash list of channel indices, these get fed
        // into links
        linkMap = {};

        // feed links forward
        for (var edge in hub) {

          if (!linkMap[edge]) {
            linkMap[edge] = this._getNodeStruct(edge, this._actions);
          }

          for (var i = 0; i < hub[edge].edges.length; i++) {
            cid = hub[edge].edges[i];

            if (!linkMap[cid]) {
              linkMap[cid] = this._getNodeStruct(cid, this._actions);
            }

            links.push({
              source : linkMap[edge],
              target : linkMap[cid],
              weight : 2
            });
          }
        }

        // bind parents
        for (var i = 0; i < links.length; i++) {
          links[i].target._parent = links[i].source;
        }

        // no duplicate channel id's allowed
        for (var idx in linkMap) {
          nodes.push(linkMap[idx]);
        }

        return {
          nodes : nodes,
          links : links
        }
      },

      _tick : function() {

        this._link.attr("x1", function(d) {
          return d.source.x;
        })
        .attr("y1", function(d) {
          return d.source.y;
        })
        .attr("x2", function(d) {
          return d.target.x;
        })
        .attr("y2", function(d) {
          return d.target.y;
        });

        this._node.attr("cx", function(d) {
          return d.x;
        })
        .attr("cy", function(d) {
          return d.y;
        });

      },

      _rescale : function() {
        this._displayScale(d3.event.scale);
        this._vis.attr("transform",
          "translate(" + d3.event.translate + ")"
          + " scale(" + d3.event.scale + ")");
      },

      // ---------------------------------- CHANNEL SELECT+TRANSFORM MODAL

      // initializes adjacent exports for the selected node
      _initModal : function(cid, type) {
        // sets current exports
        this._setExports(
          cid ?
          this._selectionState.node._parent :
          this._mouseState.downNode
          );

        if (type === 'transforms') {
          this._renderTransforms(cid);
        } else {
          this._hubChannelModal(cid);
        }
      },

      _setupResize : function($modal) {
        if ($modal.data('uiResizable')) {
          $modal.resizable('destroy');
        }

        $('.modal-body', $modal).css({
          position: 'absolute',
          bottom: '69px',
          top: '63px',
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

        $modal.css({
          'min-width' : 924,
          'min-height' : 608
        });
        //

        $modal.resizable();
      },

      // creates the channel/transform modal
      _createModal : function(initContent, transition, done) {
        var self = this;
        if (!this._activeModal) {
          $('#hubModal').html(this.tplModal());

          // modal content
          this._activeModal = $('#hubModal div:first-child').first();
        }

        $('.modal', this._activeModal).draggable({
          cancel : '.modal button, .modal input,.modal .templar'
        });

        var duration = transition ? 200 : 0,
        modalContent = $('.modal-content', this._activeModal);

        modalContent.fadeOut(duration, function() {
          modalContent.html(initContent);

          if (done) {
            done();
          }

          // save settings
          $('.modal-confirm', this).on('click', function(ev) {
            if (ev) {
              ev.preventDefault();
              var src = $(ev.currentTarget);
              if (src.hasClass('disabled')) {
                return;
              }
            }
            self._destroyModal(true);
          });

          $('.modal-close', this._activeModal).on('click', function(ev) {
            self._destroyModal();
          });

          modalContent.fadeIn(duration, function() {
            if (transition) {
              //self._activeModal.on('shown', function() {
              self._setupResize($('.modal', self._activeModal));
            //});
            }
          });
        });

        this._activeModal.on('shown', function() {
          self._setupResize($('.modal', this));
        }).modal({
          keyboard : false,
          backdrop : 'static'
        });
      },

      // destroys the channel/transform modal, prunes the selected node
      // if no channel was configured
      /**
             * @param bool store save settings to hub
             */
      _destroyModal : function(store) {
        var self = this,
        node = this._selectionState.node,
        parent = node._parent,
        cid = node.channel_id,
        hub = node._bipSource.get('hub'),
        prune = true;

        // restore original node channel info
        // when save - prune = false
        // when cancel - if !new and old!= new, then revert to old and prune =false
        // when cancel - if new then prune

        if (store) {
          // check if this node is in the hub.  If not, then detach
          if (cid) {
            /*
                        if (node._new || $.inArray(cid, hub[parent.channel_id].edges) !== -1) {
                            prune = false;
                        }
                        */
            self._addEdge()
          }
          prune = false;
        } else {
          if (!node._new) {
            if (node.oldChannelId && node.oldChannelId !== null) {
              cid = node.oldChannelId;
            }
            this._setSelectedNodeParams(cid);
            prune = false;
          }
        }

        node.oldChannelId = null;
        node._new = false;

        if (prune) {
          this._removeSelectedNode();
          this._redraw();
        }

        this._activeModal = null;
      },

      _hubChannelModal : function(selectedChannel, transition) {
        var self = this,
        actions = BipClient.getCollection('channel').updateFilter().getActions(),
        pods = BipClient.getCollection('pod'),
        // normalize actions + pods for the modal
        tpl = {
          selected : selectedChannel,
          channels : {},
          getChannel : function(id) {
            return this.channels[id] || null;
          },
          modal_title : 'Connect A Channel',
          modal_subtitle : 'Select a Channel below to add another action to this Bip'
        },
        model,
        tokens,
        action;

        // filter out channels already in use on the hub
        var channelFilter = [],
        hub = this._bipSource.get('hub');

        for (var cid in hub) {
          channelFilter.push(cid);
          for (var i = 0; i < hub[cid].edges.length; i++) {
            channelFilter.push(hub[cid].edges[i]);
          }
        }
        channelFilter = $.unique(channelFilter);

        // --- MODAL
        var channelExclusions = [];
        for (idx in actions) {
          model = actions[idx].toJSON();

          if ($.inArray(model.id, channelFilter) === -1 || model.id === selectedChannel) {
            tokens = model.action.split('.');
            action = pods.get(tokens[0]).get('actions')[tokens[1]];

            model._pod = {
              name : tokens[0],
              description : action.description,
              description_long : action.description_long || '',
              imports : action.imports.properties
            }
            tpl.channels[model.id] = model;
          }
        }

        if (Object.keys(tpl.channels).length === 0) {
          this._removeSelectedNode();
          this._redraw();
          BipClient.growl('No more Channels available', 'error');
          return;
        }

        // render modal
        this._createModal(this.tplChannelSelectModal(tpl), transition, function() {
          // render channel list into modal body
          var channelList = new ChannelListView(
            self._activeModal, // container
            null, // router
            '.ag-list-results', // target subcontainer
            false, // widgetised (manage channels)
            'actions', // search by type filter
            channelFilter, // exclusions
            (function(self) {
              return function(ev) {
                var cid = $(this).attr('data-channel-id');
                ev.preventDefault();
                ev.stopPropagation();

                self._setSelectedNodeParams(cid);
                self._renderTransforms(cid, true);
              }
            })(self)
            );

          channelList.render();

          $('#channel-search-form').focus();

          //
          if (self._modalEvTimer) {
            clearTimeout(self._modalEvTimer);
          }
          self._modalEvTimer = setTimeout(function() {
            var e = $.Event('hub-modal-channel');
            $(document).trigger(e);
          }, 300);

        });

      // ^^^ MODAL
      },

      _modalEvTimer : null,

      _getSelection : function() {
        var savedRange;
        if(window.getSelection && window.getSelection().rangeCount > 0) //FF,Chrome,Opera,Safari,IE9+
        {
          savedRange = window.getSelection().getRangeAt(0).cloneRange();
        }
        else if(document.selection)//IE 8 and lower
        {
          savedRange = document.selection.createRange();
        }
        return savedRange;
      },

      _updateFocus : function(target) {
        var range = document.createRange();
        var sel = window.getSelection();
        range.setStart(target, 0);
        range.collapse(true);
        sel.removeAllRanges();
        sel.addRange(range);
      },

      // renders transforms into the modal for the selected channel
      _renderTransforms : function(cid, transition) {
        var
        self = this,
        node = this._selectionState.node,
        el = $('#panel-channel-transforms'),
        txBody,
        action,
        props,
        txEl,
        templarExports = this._getExports(),
        //txFrom = this._selectionState.node._parent.action,
        txFrom = this._getValidExportParent(node).action,
        txTo;

        // trigger transforms are different, we inspect
        // the triggering channel id instead
        var trigger = false;
        if (txFrom === 'bip.trigger') {
          channel = BipClient.getChannel(node._bipSource.get('config').channel_id);
          txFrom = channel.get('action');
          trigger = true;
        }

        if (cid) {
          el.removeClass('hide');

          // get channel imports
          channel = BipClient.getChannel(cid);

          this._createModal(self.tplTransformModal(channel.toJSON()), transition, function() {
            var hubParent = node._bipSource.get('hub')[node._parent.channel_id];

            txBody = $('#panel-channel-transform-body', self._activeModal),
            txBody.empty();

            action = channel._action;

            txTo = channel.get('action');

            if (action) {

              props = action.imports.properties;
              buildTransforms = function(error, transforms) {
                var templateStr,
                // regex esca[e
                txFromRegExp = new RegExp(txFrom.replace('.', '\\.'), 'g');

                transforms = transforms || [];

                for (var key in transforms) {
                  transforms[key] = (trigger) ?
                  transforms[key].replace(txFromRegExp, 'source') :
                  transforms[key].replace(txFromRegExp, node._parent.channel_id )
                }

                for (key in props) {
                  if (props.hasOwnProperty(key)) {
                    txEl = $(self.tplTransform({
                      name : key,
                      description : props[key].description
                    }));

                    if (props[key].type === 'text') {
                      $('.templar', txEl).addClass('resize-vertical');
                    }

                    txBody.append(txEl);

                    // check hub for a template for this selected node
                    // hubParent = node._bipSource.get('hub')[node._parent.channel_id];

                    if (hubParent && hubParent.transforms &&
                      hubParent.transforms[node.channel_id] &&
                      hubParent.transforms[node.channel_id][key] &&
                      /(source|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/.test(key)
                      ) {
                      templateStr = hubParent.transforms[node.channel_id][key];
                    } else {
                      templateStr = transforms[key];
                    }


                    if (!templateStr) {
                      templateStr = '';
                    }

                    // attach export templater (templar)
                    $('.templar', txEl).templar({
                      delimiter : '#',
                      template : '[%value%]',
                      tags : templarExports,
                      data : '&nbsp;' + templateStr + '&nbsp;', // add buffer, trim on save
                      select2 : self._select2Templar()
                    });
                  }
                }
              };

              if (props) {
                if (!self._bipSource.isNew() && hubParent && hubParent.transforms && hubParent.transforms[cid]) {
                  buildTransforms(false, hubParent.transforms[cid]);
                } else {
                  BipClient.getTransformHint(txFrom, txTo, buildTransforms);
                }
              }
            }

            $('a.btn-reselect').click(function(ev) {
              ev.preventDefault();
              ev.stopPropagation();
              self._hubChannelModal(cid, true);
            });
          });

        } else {
          el.addClass('hide');
        }
      },

      _getImageFromSource : function(src) {
        var self = this, bip, type, imgSrc, channel;

        if ('source' === src) {
          bip = self._bipSource;
          type = bip.get('type');
          imgSrc = bip.get('icon');

          if ('trigger' === type) {
            channel = BipClient.getCollection('channel').get(bip.get('config').channel_id);
            if (channel && channel.get('config').icon) {
              imgSrc = channel.get('config').icon;
            }
          } else {
            imgSrc = '/static/img/channels/32/color/bip_' + type + '.png';
          }

        } else if ('_client' === src) {
          return '<i class="icon-user"></i> ';

        } else if ('_bip' === src) {
          imgSrc = '/static/img/channels/32/color/bipio.png';

        } else {
          channel = BipClient.getCollection('channel').get(src);
          if (channel) {
            imgSrc = '/static/img/channels/32/color/' + channel.getPod().get('name') + '.png';
          }
        }
        return imgSrc;
      },

      _select2Templar : function() {
        var that = this;

        return {
          formatResult : function(obj) {
            if (obj.children && obj.children.length) {
              var src = $(obj.element).attr('data-index'),
              imgSrc = that._getImageFromSource(src) || '';

              if (imgSrc) {
                if (-1 === imgSrc.indexOf('<')) {
                  imgSrc = '<img class="hub-icon hub-icon-16" src="' + imgSrc + '"> ';
                }
              }

              return imgSrc + obj.text;


            } else {
              return obj.text;
            }
          },
          formatSelection : function(obj) {
            var src = obj.id.split('#').shift(),
            imgSrc = that._getImageFromSource(src) || '';

            if (imgSrc) {
              if (-1 === imgSrc.indexOf('<')) {
                imgSrc = '<img class="hub-icon hub-icon-16" src="' + imgSrc + '"> ';
              }
            }

            return imgSrc + obj.text;
          },
          matcher : function(term, text, opt) {
            var $parent = $(opt).parent();
            return text.toUpperCase().indexOf(term.toUpperCase())>=0
            || ($parent.attr('label') + ' ' + $parent.attr('data-index')).toUpperCase().indexOf(term.toUpperCase())>=0;
          },
          escapeMarkup: function(m) {
            return m;
          },
          dropdownAutoWidth : true,
          placeholder: "Select an Attribute"
        }
      },

      _setExports : function(node) {
        var tagExports = {};
        this._buildExports(node, tagExports);
        this._currentExports = tagExports;
      },

      // recursively tries to find a valid parent with exports
      _getValidExportParent : function(node) {
        var p = node._parent;
        if (p && p._hasExports || p === p._bipSource) {
          return p;
        } else {
          return this._getValidExportParent(node._parent);
        }
      },

      _getExports : function() {
        return this._currentExports;
      },

      _buildExports : function(node, tagExports) {
        var exportFor,
        id = node.channel_id,
        exports,
        bip = node._bipSource,
        type = bip.get('type'),
        config = bip.get('config'),
        channel;

        // bip definitions
        if (node.channel_id === 'source') {
          exportFor = type;
          if (type === 'trigger') {
            id = config.channel_id;
          } else if (type === 'http') {
            // http export hints
            id = config;
          } else {
            id = '';
          }

        // action definition
        } else {
          exportFor = 'channel';
          id = node.channel_id;
        }

        exports = BipClient.getExports(exportFor, id);
        node._hasExports = (exports.properties ? Object.keys(exports.properties).length > 0 : false);

        channel = node.channel_id === 'source' ?
        BipClient.getCollection('channel').get(node._bipSource.get('config').channel_id)
        :
        BipClient.getCollection('channel').get(node.channel_id);

        // convert exports into something usable by templar
        if (node._hasExports) {

          tagExports[node.channel_id] = {
            'label' : node.label,
            //'image' : '<img src="/static/img/channels/32/color/' + (node.fill.replace('image_', '')) + '.png"/> ',
            //            'pod' : channel.getPod().get('name'),
            data : []
          };
          for (var key in exports.properties) {
            if (!/^_/.test(key)) {
              tagExports[node.channel_id].data.push(
              {
                label : exports.properties[key].description,
                value : key
              }
              );
            }
          }
        }

        if (node._parent) {
          this._buildExports(node._parent, tagExports);

        } else if (node.channel_id === 'source') {
          var props = BipClient.defEnumeratorUnpack(exports);
          for (var key in props) {
            tagExports[props[key].id] = {
              label : props[key].label,
              data : props[key].data
            }
          }
        }

        return tagExports;
      },

      // -------------------------------------------------- MOUSE&KEYBOARD
      _mouseCtl : function(type) {
        var self = this,
        state = this._mouseState;

        if (type == 'move') {
          return function() {
            if (!state.downNode) return;

            // update drag line
            self._drag_line
            .attr("x1", state.downNode.x)
            .attr("y1", state.downNode.y)
            .attr("x2", d3.mouse(this)[0])
            .attr("y2", d3.mouse(this)[1]);
          }
        } else if (type == 'up') {
          return function() {
            var modalLaunch = false;
            if (state.downNode) {
              // hide drag line
              self._drag_line.attr("class", "drag_line_hidden")

              if (!state.upNode) {
                // add node
                var point = d3.mouse(this),
                node = {
                  x: point[0],
                  y: point[1],
                  _parent : state.downNode, // where dragging from
                  _new : true, // node manually created
                  _bipSource : self._bipSource

                },
                n = self._nodes.push(node);

                // select new node
                self._selectionState.node = node;
                self._selectionState.link = null;

                // add link to mousedown node
                self._links.push({
                  source: state.downNode,
                  target: node
                });

                modalLaunch = true;
              }

              self._redraw();

              // modal needs to launch after _redraw, otherwise
              // the simulation will render off the canvas
              if (modalLaunch) {
                //self._hubChannelModal();
                self._initModal();
              }
            }
            // clear mouse event vars
            self._clearMouseState();
          }
        } else if (type == 'down') {
          return function() {

            if (!state.downNode && !state.downLink) {
              // allow panning if nothing is selected
              self._vis.call(d3.behavior.zoom().on("zoom"), self.rescale);
              return;
            }
          }
        }
      },

      _keyCtl : function() {
        var self = this;

        if (!this._selectionState.node && !this._selectionState.link) {
          return;
        }

        if (d3.event.target.id === 'hub-focus') {
          switch (d3.event.keyCode) {
            case 8: // backspace
            case 46: { // delete
              if (this._selectionState.node) {
                this._removeSelectedNode();
              } else if (this._selectionState.link) {
                this._selectionState.link.target._dirty = true;
                this._links.splice(this._links.indexOf(this._selectionState.link), 1);
              }

              this._selectionState.link = null;
              this._selectionState.node = null;
              this._redraw(true);
              break;
            }
          }
        }
      },

      _clearMouseState : function() {
        this._mouseState.upNode =
        this._mouseState.downNode =
        this._mouseState.upLink =
        this._mouseState.downLink = null;
      }


    });

    return HubView;
  });