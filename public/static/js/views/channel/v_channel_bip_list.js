define([
    'underscore',
    'backbone',
    'bipclient',
    'c_channel_bip_list',
    'moment'
    ], function(_, Backbone, BipClient, CChannelBipList){
        var VChannelBipList = Backbone.View.extend({
            //el: '#bip-setup',
            _router : null,
            tpl : _.template($('#tpl-link-list-entity').html()),

            events: {                
                'click a.prev' : 'previous',
                'click a.next' : 'next'
            },
            initialize:function (container, channelId, router) {
                var self = this;
                _.bindAll(
                    this,
                    'render',
                    'previous',
                    'next'                    
                );
                this.el = container;
                this.collection = new CChannelBipList(channelId);
                this.collection.fetch({
                    success : this.render
                });
                this._router = router;
            },

            render : function() {
                var models = this.collection.models,
                    el = $(this.el),
                    self = this,
                    m, d;
                    
               if (models.length > 0) {
                    for (var i = 0; i < models.length; i++) {
                        m = models[i];
                        d = m.get('description');
                        el.append(this.tpl({
                            _href : 'bips/' + m.get('id'),
                            img : '/static/img/channels/32/color/bip_' + m.get('type') + '.png',
                            type : m.get('type'),
                            description : m.get('name'),
                            description_long : m.get('note')
                        }));
                    }

                    $('li', el).click(function() {
                        self._router.navigate($(this).attr('data-link'), {trigger : true});
                        return false;
                    });
                } else {
                    $('#channel_bips').html('<div class="alert alert-warning"><i class="icon-exclamation-sign"> This Channel is Not In Use</div>');
                }                
            },

            previous: function(ev) {
                ev.preventDefault();
                if ($(ev.currentTarget).hasClass('disabled')) {
                    return;
                }
                this.collection.prevPage();
                return false;
            },

            next: function(ev) {
                ev.preventDefault();
                if ($(ev.currentTarget).hasClass('disabled')) {
                    return;
                }
                this.collection.nextPage();
                return false;
            }
          
        });

        return VChannelBipList;
    });