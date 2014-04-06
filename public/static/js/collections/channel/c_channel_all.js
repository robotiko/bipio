define([
  'underscore',
  'backbone',
  'models/m_channel',
  'bipclient'
  ], function(_, Backbone, ChannelModel, BipClient){
    // Channel Collection
    ChannelCollection = Backbone.Collection.extend({
      model: ChannelModel,

      // pagination
      page : 1,
      page_size : 10,
      total : 0,
      num_pages : 1,
      sortBy : 'recent',
      searchBy : '',

      _filter : null,
      _actionManifest : {},

      _searchType : 'any',
      _exclusions : null, // exclude id's from search results

      // always get all channels
      url: function() {
        return BipClient.getResourceName(
          'channel',
          1,
          0,
          this.sortBy
          );
      },
      initialize : function() {
        _.bindAll(this,
          'nextPage',
          'prevPage',
          'pageInfo',
          'sort',
          'search',
          'newModel',
          'getEmitters',
          'getActions',
          'setSearchExclusions'
          );
      },

      _decorateChannels : function() {
        var tokens;
        if (this._collections.pod && this._collections.channel) {
          this._collections.channel.each(function(channel) {
            channel.attributes._emitter = this._collections.pod.getActionSchema(channel.action).trigger;
          });
        }
      },

      getEmitters : function() {
        return this.where({
          _emitter : true
        });
      },

      getActions : function() {
        return this.where({
          _emitter : false
        });
      },

      getRenderable : function(toJSON) {
        var result = [], filtered, c;
        filtered = _.filter(this.models, function(m) {
          return Object.keys(m.get('_renderers')).length > 0;
        });

        if (toJSON) {
          _.each(filtered, function(channel) {
            c = channel.toJSON();
            c.pod = channel.getPod().toJSON();
            result.push(c);
          });
          return result;
        } else {
          return filtered;
        }
      },

      getChannelJSONAction : function(action) {
        return this._actionManifest[action];
      },

      getPods : function() {
        return _.uniq(_.map(this.pluck('action'), function(action) {
          var tokens = action.split('.');
          return tokens[0];

        }));
      },

      newModel : function(init) {
        return new this.model(init);
      },
      // pages are virtual
      parse: function(response) {
        this.page = response.page;
        this.page_size = this.page_size;
        this.total = response.total;
        this.num_pages = Math.ceil(response.total / this.page_size);
        for (var i = 0; i < response.data.length; i++) {
          this._actionManifest[response.data[i].action] = response.data[i].id;
        }
        return response.data;
      },

      setSearchType : function(searchType) {
        this._searchType = searchType || 'any';
      },

      setSearchExclusions : function(exclusions) {
        this._exclusions = exclusions;
      },

      getFilteredModels : function(searchBy) {
        var channels, 
          self = this,
          activeSearch = this.searchBy,
          tmpSearch = false;
          
        if (searchBy) {
          tmpSearch = true;
          this.searchBy = searchBy;          
        }

        if (!this._filter && this.searchBy === '') {
          if (this._searchType === 'actions') {
            channels = this.where({
              _emitter : false
            });

          } else if (this._searchType === 'emitters') {
            channels = this.where({
              _emitter : true
            });

          } else {
            channels = this.models;
          }
        } else {
          channels = this.models.filter(function(channel) {
            var match = false,
            searchStr,
            isEmitter = channel.get('_emitter');

            if ( (self._searchType === 'actions' && isEmitter) ||
              (self._searchType === 'emitters' && !isEmitter)) {
              return false;
            }

            if (self._filter) {
              match = self._filter.match.test(channel.get(self._filter.attr));
              if (!match) {
                return false;
              }
            }

            if (self.searchBy !== '') {
              searchStr = channel.get('_repr')
              + channel.get('action')
              + channel.get('name')
              + JSON.stringify(channel.get('config')).replace(/\W/g, '');

              match = (new RegExp(self.searchBy, 'gi')).test(searchStr);
            }

            return match;
          });
        }

        if (this._exclusions) {
          channels = _.filter(channels, function(channel) {
            return _.indexOf(self._exclusions, channel.id) === -1;
          });
        }

        this.total = channels.length;
        this.num_pages = Math.ceil(this.total / this.page_size);

        this.searchBy = activeSearch;

        return channels;
      },

      updateFilter : function(filter) {
        this.page = 1;
        this._filter = filter;
        return this;
      },

      resetSearch : function() {
        this.searchBy = '';
        return this;
      },

      resetPage : function() {
        this.page = 1;
      },

      nextPage : function() {
        var next = this.page + 1;
        this.page = (next > this.num_pages) ? this.page : next;
      },

      prevPage : function() {
        var prev = this.page - 1;
        this.page = (prev <= 1) ? 1 : prev;
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
        if (!this.searchBy || '' === this.searchBy && search && this.page != 1) {
          this.page = 1;
        }
        this.searchBy = search;
      }
    });
    return ChannelCollection;
  });
