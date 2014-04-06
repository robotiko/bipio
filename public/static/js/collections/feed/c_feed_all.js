define([
  'underscore',
  'backbone',
  'models/m_feed',
  'bipclient'
  ], function(_, Backbone, FeedModel, BipClient){
    FeedCollection = Backbone.Collection.extend({
      model: FeedModel,

      // pagination
      page : 1,
      page_size : 50,
      total : 0,
      num_pages : 1,
      sortBy : 'recent',
      searchBy : '',

      _filter : null,

      _searchType : 'any',
      
      lastPoll : 0,

      // always get all channels
      url: function() {
        var self = this;
        return BipClient.getResourceName(
          'pod/syndication/feed/json',
          self.page,
          self.page_size,
          this.sortBy,
          this.searchBy == '' ? undefined : {
            'name' : this.searchBy
          },
          'rpc'
          );
      },
      initialize : function() {
        _.bindAll(this,
          'nextPage',
          'prevPage',
          'pageInfo',
          'sort',
          'search'
          );
      },

      newModel : function(init) {
        return new this.model(init);
      },
      // pages are virtual
      parse: function(response) {
        var entities = response.entities;
        if (entities) {
          this.page = entities.page;
          this.page_size = this.page_size;
          this.total = entities.total;
          this.num_pages = Math.ceil(entities.total / this.page_size);
          return entities.data;
        }
        
      },

      setSearchType : function(searchType) {
        this._searchType = searchType || 'any';
      },

      updateFilter : function(filter) {
        this._filter = filter;
        return this;
      },

      resetPage : function() {
        this.page = 1;

      },

      nextPage : function() {
        var next = this.page + 1;
        this.page = (next > this.num_pages) ? this.page : next;
      //return this.fetch();
      },

      prevPage : function() {
        var prev = this.page - 1;
        this.page = (prev <= 1) ? 1 : prev;
      //return this.fetch();
      },

      pageInfo : function() {
        return {
          page_current : this.page,
          page_total : this.num_pages,
          page_size : this.page_size,
          page_displayed_total : (this.page * this.page_size) - this.total,
          result_total : this.total
        }
      },

      sort : function(sort) {
        this.sortBy = sort;
        return this.fetch();
      },

      search : function(search) {
        this.searchBy = search;
      //return this.fetch();
      }
    });
    return FeedCollection;
  });
