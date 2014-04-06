define([
  'underscore',
  'backbone',
  'bipclient',
  'views/bip/v_bip_modal',
  'views/bip/v_bip_shared'
  ], function(_, Backbone, BipClient, BipModalView, BipSharedView){

    var BipListView = Backbone.View.extend({
      el: '#bip-list-widget', // render widget to this container
      tplWidget: _.template( $('#tpl-resource-list-bip').html() ), // widget container
      tplListEntity :  _.template( $('#tpl-list-bip-entity').html() ), // list entity
      tplPaginate :  _.template($('#tpl-pagination').html()), // paginator

      // tplBipSelect : _.template($('#tpl-bip-select').html()),
      _container : null,
      _router : null,

      modalView : null,

      initialize: function(container, router) {
        _.bindAll(
          this,
          'renderRows',
          'next',
          'previous',
          'sort',
          'search',
          '_bipModalRender',
          '_getModal'
          );

        this.collection = BipClient.getCollection('bip'); //new BipCollection();
        this.collection.bind('reset', this.renderRows);
        this._container = container;
        this._router = router;
      },

      events: {
        'click #bip-order li' : 'sort'
      },

      render: function(id, mode, childId) {
        var el = $(this.el),
        tpl = this.tplWidget(),
        self = this;

        el.html(tpl);

        $('#bip-search-form', this._container).on('keyup', self.search);

        $('.dropdown-toggle').dropdown();

        // passed an id? then load the bip config
        if (id && 'shared' !== mode) {
          self._bipModalRender(id, mode);

        } else if (id && 'shared' === mode && childId) {
          var shareView = new BipSharedView();
          shareView.setShare(childId);

          self._getModal().renderShared( shareView._unpackManifest() );

        } else {
          self._bipSharedRender();
        }
        self.renderRows(id);

        $('#bip-search-form').val(BipClient.getCollection('bip').searchBy);
      },

      // renders result rows and pagination
      renderRows: function(selectedBipId) {
        var listContainer,
        listBip,
        listPaginate,
        self = this,
        el = $(this.el),
        pods = BipClient.getCollection('pod'),
        channels = BipClient.getCollection('channel'),
        bips = this.collection.getFilteredModels(),
        podTokens,
        channel;

        listContainer = $('#list-bip-container', el); // list container

        // render list
        listBip = $('#bip-list', listContainer);
        listBip.empty();

        var start = (this.collection.page - 1) * this.collection.page_size,
        end = start + this.collection.page_size;

        bips.slice(start, end).forEach( function (item) {
          if (item.get('type') == 'trigger' && !item.get('icon')) {
            channel = channels.get(item.get('config').channel_id);
            if (channel) {
              podTokens = channel.get('action').split('.');
              item.set('icon', '/static/img/channels/32/color/' + pods.get(podTokens[0]).get('name') + '.png' );
            }
          }
          listBip.append( self.tplListEntity(item.toJSON()));
        });

        $('.bip-list-item').removeClass('defocused');

        if (selectedBipId && "[object Object]" !== selectedBipId.toString()) {
          $('#bip-list a:not([data-bip-id=' + selectedBipId + '])').addClass('defocused');
        }

        listPaginate = $('.bip-list-pagination', this._container);
        listPaginate.html(self.tplPaginate(self.collection.pageInfo()));

        $('a.prev', listPaginate).on('click', this.previous);
        $('a.next', listPaginate).on('click', this.next);
      },

      _activeModal : null,
      _activeShareList : null,

      _getModal : function() {
        var self = this;

        if (!this._activeModal) {
          this._activeModal = new BipModalView(self._router);

          this._activeModal.on('modal-destroy', function() {
            self._router.navigate('bips', {
              trigger : true
            } );
          });

          this._activeModal.on('modal-update', function(args) {
            self._router.navigate('bips/' + args.id, {
              trigger : true
            } );
          });
        }

        return this._activeModal;
      },

      // renders bip config
      _bipModalRender : function(id, mode) {
        this._getModal().render( id, mode );
      },

      _bipSharedRender : function() {
        var self = this;
        this._activeShareList = new BipSharedView(),

        this._activeShareList.render();
        this._activeShareList.on('shared-install', function(id) {
          self._router.navigate('bips/new/shared/' + id, {
            trigger : true
          });
        });

        this._activeShareList.on('shared-refresh', function(id) {
          BipClient.getCollection('shared').fetch();
        //self._activeShareList.render();
        });
      },

      previous: function(ev) {
        ev.preventDefault();
        if ($(ev.currentTarget).hasClass('disabled')) {
          return;
        }
        this.collection.prevPage();
        this.renderRows();
        return false;
      },

      next: function(ev) {
        ev.preventDefault();
        if ($(ev.currentTarget).hasClass('disabled')) {
          return;
        }
        this.collection.nextPage();
        this.renderRows();
        return false;
      },

      sort: function(ev) {
        var sortBy = ev.currentTarget.getAttribute('data-sort'),
        orderOptions;

        $('[data-toggle="dropdown"]').parent().removeClass('open');

        // update 'active'
        orderOptions = $('#bip-order').children('li');
        orderOptions.each(function() {
          var self = $(this);

          self.removeClass('active');

          if (self.attr('data-sort') == sortBy) {
            self.addClass('active');
          }

          $('#bip-order-by-label', this.el).html(
            $(ev.currentTarget).children('a').html()
            );

        });

        this.collection.sort(sortBy);
        return false;
      },

      modalOpen : function(ev) {
        ev.preventDefault();
        var src = $(ev.currentTarget),
        target = src.attr('data-modal'),
        bipType = src.attr('data-bip-type'),
        id = src.attr('data-model-id'),
        model;

        model = id ? this.collection.get(id) : new MBip( {
          type : bipType
        } );

        this.modalView.model = model;
        this.modalView.render();

        $('.dropdown-toggle').dropdown();
      },

      search : function(ev) {
        var searchStr = $(ev.currentTarget).val();
        this.collection.search(searchStr);
        this.renderRows();
      }

    });

    return BipListView;
  });